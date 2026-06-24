import { Router } from 'express';
import { getMetaConfig } from '../lib/meta.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { upsertComment, insertActivityLog } from '../db/repository.js';
import { mapWebhookComment } from '../lib/webhook.js';

export const metaWebhookRouter = Router();

function isCommentWebhookChange(field: string, value: Record<string, unknown>): boolean {
  if (field !== 'feed' && field !== 'comments' && field !== 'feed_comments') return false;
  if (field === 'feed' && value.item && value.item !== 'comment') return false;
  return Boolean(value.comment_id || value.id) && Boolean(String(value.message || value.text || '').trim());
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
  console.log('[webhook] POST raw payload:', JSON.stringify(body, null, 2));

  setImmediate(async () => {
    try {
      if (!body?.object || !Array.isArray(body.entry)) return;

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
            const row = mapWebhookComment({
              platform,
              commentId: String(value.comment_id || value.id),
              message: value.message || value.text || '',
              fromName: value.from?.name || value.username || 'Commenter',
              fromId: value.from?.id,
              createdTime: value.created_time
                ? new Date(value.created_time * 1000).toISOString()
                : undefined,
              postId: value.post_id || value.media?.id,
              pageId,
              pageName: value.page_name,
              instagramAccountId: platform === 'instagram' ? pageId : undefined,
              instagramAccountName: value.username,
              campaignName: value.ad_metadata?.campaign_name,
              adsetName: value.ad_metadata?.adset_name,
              adId: value.ad_metadata?.ad_id,
              adName: value.ad_metadata?.ad_name,
            });

            if (isDatabaseConfigured()) {
              await upsertComment(row);
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
              console.log('[webhook] Saved comment', row.comment_id);
            } else {
              console.warn('[webhook] DATABASE_URL not set — comment not persisted');
            }
          }
        }
      }
    } catch (err) {
      console.error('[webhook] async processing error', err);
    }
  });
});
