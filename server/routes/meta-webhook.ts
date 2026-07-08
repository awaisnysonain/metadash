import { Router } from 'express';
import { getMetaConfig } from '../lib/meta.js';
import { isDatabaseConfigured, query } from '../db/pool.js';
import { upsertComment, insertActivityLog, commentExistsByMetaId, getCommentByMetaId, updateCommentStatus, getConfigValue, setConfigValue } from '../db/repository.js';
import { mapWebhookComment } from '../lib/webhook.js';
import { fallbackAnalyzeComment } from '../lib/ai-analysis.js';
import { enqueueCommentEnrichment } from '../lib/comment-enrichment-queue.js';
import { fetchInstagramMediaPermalink } from '../lib/meta-graph.js';

export const metaWebhookRouter = Router();

function parseWebhookCreatedTime(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return parseWebhookCreatedTime(numeric);
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function isCommentWebhookChange(field: string, value: Record<string, unknown>): boolean {
  if (field !== 'feed' && field !== 'comments' && field !== 'feed_comments' && field !== 'live_comments') return false;
  if (field === 'feed' && value.item && value.item !== 'comment') return false;
  return Boolean(value.comment_id || value.id) && Boolean(String(value.message || value.text || '').trim());
}

async function incrementWebhookMetric(key: string, amount = 1): Promise<void> {
  const count = await getConfigValue<number>(key, 0);
  await setConfigValue(key, count + amount);
}

async function resolveAdContext(input: {
  platform: 'facebook' | 'instagram';
  postId?: string;
  mediaId?: string;
}): Promise<{
  adId?: string;
  adName?: string;
  campaignName?: string;
  adsetName?: string;
  campaignMetaId?: string;
  adsetMetaId?: string;
  pageId?: string;
} | null> {
  if (!isDatabaseConfigured()) return null;

  if (input.platform === 'facebook' && input.postId) {
    const { rows } = await query<{
      ad_id: string;
      ad_name: string;
      campaign_name: string | null;
      adset_name: string | null;
      campaign_id: string | null;
      adset_id: string | null;
      post_story_id: string | null;
    }>(
      `SELECT ad_id, ad_name, campaign_name, adset_name, campaign_id, adset_id, post_story_id
       FROM ads
       WHERE effective_status = 'ACTIVE' AND post_story_id = $1
       ORDER BY COALESCE(recent_spend, 0) DESC, COALESCE(spend, 0) DESC
       LIMIT 1`,
      [input.postId]
    );
    const ad = rows[0];
    if (!ad) return null;
    return {
      adId: ad.ad_id,
      adName: ad.ad_name,
      campaignName: ad.campaign_name ?? undefined,
      adsetName: ad.adset_name ?? undefined,
      campaignMetaId: ad.campaign_id ?? undefined,
      adsetMetaId: ad.adset_id ?? undefined,
      pageId: ad.post_story_id?.split('_')[0],
    };
  }

  if (input.platform === 'instagram' && input.mediaId) {
    const { rows } = await query<{
      ad_id: string;
      ad_name: string;
      campaign_name: string | null;
      adset_name: string | null;
      campaign_id: string | null;
      adset_id: string | null;
    }>(
      `SELECT ad_id, ad_name, campaign_name, adset_name, campaign_id, adset_id
       FROM ads
       WHERE effective_status = 'ACTIVE' AND instagram_media_id = $1
       ORDER BY COALESCE(recent_spend, 0) DESC, COALESCE(spend, 0) DESC
       LIMIT 1`,
      [input.mediaId]
    );
    const ad = rows[0];
    if (!ad) return null;
    return {
      adId: ad.ad_id,
      adName: ad.ad_name,
      campaignName: ad.campaign_name ?? undefined,
      adsetName: ad.adset_name ?? undefined,
      campaignMetaId: ad.campaign_id ?? undefined,
      adsetMetaId: ad.adset_id ?? undefined,
    };
  }

  return null;
}

function normalizeAuthorKey(value?: string | null): string {
  return String(value || '').trim().replace(/^@+/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

async function isConnectedAssetAuthor(authorName?: string | null, authorId?: string | null): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const key = normalizeAuthorKey(authorName);
  const id = String(authorId || '').trim();
  if (!key && !id) return false;

  const { rows } = await query<{ exists: number }>(
    `SELECT 1 AS exists
     FROM connected_instagram_accounts
     WHERE ($2 <> '' AND account_id = $2)
        OR ($1 <> '' AND LOWER(REGEXP_REPLACE(COALESCE(username, ''), '[^a-zA-Z0-9]', '', 'g')) = $1)
     UNION ALL
     SELECT 1 AS exists
     FROM connected_pages
     WHERE ($2 <> '' AND page_id = $2)
        OR ($1 <> '' AND LOWER(REGEXP_REPLACE(COALESCE(name, ''), '[^a-zA-Z0-9]', '', 'g')) = $1)
     LIMIT 1`,
    [key, id]
  );

  return rows.length > 0;
}

async function applyBrandReplyToParent(parentCommentId: string, authorName: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const parent = await getCommentByMetaId(parentCommentId);
  if (!parent) return false;

  const now = new Date().toISOString();
  if (parent.status !== 'Replied') {
    await updateCommentStatus(parent.id, 'Replied', { repliedAt: now });
    await insertActivityLog({
      id: `log-wh-reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      comment_id: parent.id,
      user_id: 'system',
      user_name: 'Webhook',
      action: 'Meta Reply Detected',
      old_value: parent.status,
      new_value: `Reply by ${authorName || 'connected asset'} on Meta`,
      created_at: now,
    });
  }

  return true;
}

/** GET /api/meta/webhook — Meta verification */
metaWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const cfg = getMetaConfig();

  console.log('[webhook] GET verify', { mode, tokenMatch: token === cfg.verifyToken });

  if (mode === 'subscribe' && token === cfg.verifyToken) {
    return res.status(200).send(String(challenge ?? ''));
  }

  return res.sendStatus(403);
});

/** POST /api/meta/webhook — receive Meta events */
metaWebhookRouter.post('/', (req, res) => {
  // Respond immediately per Meta requirements
  res.sendStatus(200);

  const body = req.body;
  if (process.env.WEBHOOK_DEBUG === 'true') {
    console.log('[webhook] POST raw payload:', JSON.stringify(body));
  }

  setImmediate(async () => {
    try {
      if (!body?.object || !Array.isArray(body.entry)) return;

      if (isDatabaseConfigured()) {
        const fields = body.entry.flatMap((entry: Record<string, unknown>) => {
          const changes = Array.isArray(entry.changes) ? entry.changes : [];
          return changes.map((change: Record<string, unknown>) => String(change.field || 'unknown'));
        });
        const count = await getConfigValue<number>('webhook_received_count', 0);
        await setConfigValue('webhook_received_count', count + 1);
        await setConfigValue('webhook_last_received', {
          receivedAt: new Date().toISOString(),
          object: body.object,
          entries: body.entry.length,
          fields,
        });
      }

      for (const entry of body.entry) {
        const pageId = entry.id;
        const changes = entry.changes ?? [];

        for (const change of changes) {
          const field = change.field;
          const value = change.value;
          if (!value) continue;

          const platform: 'facebook' | 'instagram' =
            body.object === 'instagram' ? 'instagram' : 'facebook';

          if (isCommentWebhookChange(field, value)) {
            const commentId = String(value.comment_id || value.id);
            const message = value.message || value.text || '';
            const fromName = value.from?.name || value.username || 'Commenter';
            const fromId = value.from?.id ? String(value.from.id) : '';
            const parentCommentId = value.parent_id || value.parent?.id;
            const isConnectedAuthor = await isConnectedAssetAuthor(String(fromName), fromId);
            if (parentCommentId) {
              if (isConnectedAuthor) await applyBrandReplyToParent(String(parentCommentId), String(fromName));
              if (isDatabaseConfigured()) await incrementWebhookMetric('webhook_non_comment_count');
              continue;
            }
            if (isConnectedAuthor) {
              if (isDatabaseConfigured()) await incrementWebhookMetric('webhook_non_comment_count');
              continue;
            }
            const exists = isDatabaseConfigured() ? await commentExistsByMetaId(commentId) : false;
            const postId = String(value.post_id || value.media?.id || '');
            const permalinkUrl = String(value.permalink_url || value.permalink || '') || (
              platform === 'instagram' && postId
                ? await fetchInstagramMediaPermalink(postId)
                : null
            );
            const adContext = await resolveAdContext({
              platform,
              postId: platform === 'facebook' ? postId : undefined,
              mediaId: platform === 'instagram' ? postId : undefined,
            });
            const analysis = fallbackAnalyzeComment({
              text: message,
              campaignName: value.ad_metadata?.campaign_name || adContext?.campaignName,
              adName: value.ad_metadata?.ad_name || adContext?.adName,
              pageName: value.page_name,
            });
            const row = mapWebhookComment({
              platform,
              commentId,
              message,
              fromName,
              fromId,
              profileUrl: value.from?.picture?.data?.url || (value.from?.id ? `https://graph.facebook.com/${encodeURIComponent(String(value.from.id))}/picture?type=large` : undefined),
              createdTime: parseWebhookCreatedTime(value.created_time),
              postId,
              permalinkUrl: permalinkUrl || undefined,
              pageId: adContext?.pageId || pageId,
              pageName: value.page_name,
              instagramAccountId: platform === 'instagram' ? pageId : undefined,
              instagramAccountName: value.username,
              campaignName: value.ad_metadata?.campaign_name || adContext?.campaignName,
              adsetName: value.ad_metadata?.adset_name || adContext?.adsetName,
              adId: value.ad_metadata?.ad_id || adContext?.adId,
              adName: value.ad_metadata?.ad_name || adContext?.adName,
              campaignMetaId: adContext?.campaignMetaId,
              adsetMetaId: adContext?.adsetMetaId,
            });
            row.priority = analysis.priority;
            row.sentiment = analysis.sentiment;
            row.tags = analysis.tags;

            if (isDatabaseConfigured()) {
              await upsertComment(row);
              await incrementWebhookMetric('webhook_saved_count');
              await insertActivityLog({
                id: `log-wh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                comment_id: row.id,
                user_id: 'system',
                user_name: 'Webhook',
                action: 'Webhook Received',
                old_value: '',
                new_value: 'New comment received from webhook',
                created_at: new Date().toISOString(),
              });
              if (!exists) {
                enqueueCommentEnrichment({
                  commentId: row.id,
                  platform: row.platform,
                  author: fromName,
                  text: message,
                  createdAt: row.created_at,
                  commentUrl: row.original_comment_url,
                  adName: row.ad_name,
                  adId: row.ad_id,
                  campaignName: row.campaign_name,
                  alertNewComment: true,
                });
              }
              console.log('[webhook] Saved comment', row.comment_id);
            } else {
              console.warn('[webhook] DATABASE_URL not set — comment not persisted');
            }
          } else if (isDatabaseConfigured()) {
            await incrementWebhookMetric('webhook_non_comment_count');
          }
        }
      }
    } catch (err) {
      console.error('[webhook] async processing error', err);
    }
  });
});
