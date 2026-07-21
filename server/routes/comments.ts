import { Router } from 'express';
import {
  getAllComments,
  getCommentsPaginated,
  getCommentById,
  updateCommentStatus,
  updateCommentAssign,
  updateCommentFields,
  insertNote,
  insertActivityLog,
  upsertComment,
  getAllNotes,
  getAllActivityLogs,
  getAllTeam,
  getCampaignsWithAds,
  getAdById,
  getAllRules,
  upsertRules,
  deleteRule,
  getConfigValue,
  setConfigValue,
} from '../db/repository.js';
import { clearCommentViews, getCommentViews } from '../db/user-repository.js';
import { markCommentSeenForTeam } from '../lib/comment-seen.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { query } from '../db/pool.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { metaGraphDelete, metaGraphGet, metaGraphPaginate, metaGraphPost, getMetaConfig, MetaApiError } from '../lib/meta.js';
import { getTokensForAccount } from '../lib/meta-accounts.js';
import { getPageAccessToken, getConnectedInstagramInfo, getConnectedPageInfo } from '../db/sync-repository.js';
import { suggestCommentReplies } from '../lib/ai-analysis.js';

export const commentsRouter = Router();

type CommentRecord = NonNullable<Awaited<ReturnType<typeof getCommentById>>>;

interface CachedReplySuggestion {
  suggestion: string;
  confidence: number;
  generatedAt: string;
}

interface MetaThreadItem {
  id: string;
  text: string;
  author: string;
  username?: string;
  createdAt?: string;
  hidden?: boolean;
  permalinkUrl?: string;
}

function friendlyMetaActionError(err: unknown, action: string, platform?: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('does not exist') || lower.includes('unsupported') || lower.includes('cannot be loaded')) {
    return `Meta cannot ${action} this ${platform === 'instagram' ? 'Instagram' : 'Facebook'} comment. It may have been deleted, hidden, restricted, or unavailable through the Meta API.`;
  }
  if (lower.includes('missing permissions') || lower.includes('permission')) {
    return `Meta blocked ${action} because this token does not have permission for this asset/comment. Creator or whitelisted ads may require the owner account.`;
  }
  if (lower.includes('invalid or expired') || lower.includes('application has been deleted')) {
    return `Meta blocked ${action} because the selected token is invalid for this asset. Reconnect or replace the token for this account.`;
  }
  return raw;
}

function isUnsupportedRepliesEdgeError(err: unknown): boolean {
  if (!(err instanceof MetaApiError)) return false;
  const message = err.message.toLowerCase();
  return err.code === 100 && message.includes('nonexisting field') && message.includes('replies');
}

function mentionFrom(value?: string | null): string {
  const cleaned = String(value || '').trim().replace(/^@+/, '').replace(/\s+/g, '');
  return cleaned ? `@${cleaned}` : '';
}

function withMention(message: string, mention?: string | null): string {
  const prefix = mentionFrom(mention);
  if (!prefix) return message;
  if (message.trim().toLowerCase().startsWith(prefix.toLowerCase())) return message.trim();
  return `${prefix} ${message.trim()}`;
}

async function getMetaTokensForComment(comment: CommentRecord): Promise<string[]> {
  const { rows } = await query<{
    meta_account_id: string | null;
    account_label: string | null;
    post_story_id: string | null;
    instagram_media_id: string | null;
  }>(
    `SELECT meta_account_id, account_label, post_story_id, instagram_media_id
     FROM ads
     WHERE ad_id = $1 OR id = $1
     LIMIT 1`,
    [comment.adId]
  );
  const ad = rows[0];
  const fbPageId = comment.pageId || (ad?.post_story_id?.split('_')[0] ?? null);
  const fbPageToken = fbPageId ? await getPageAccessToken(fbPageId) : null;

  // Meta requires a Page Access Token (or the linked-Page-owned token) to reply
  // to an Instagram comment — a user token or a different account's token
  // returns "missing permissions" (which is why FLO IG replies used to fail).
  // Resolve the IG-owning Page via connected_instagram_accounts.linked_page_id
  // and prefer THAT page's access_token first for IG comments.
  let igPageToken: string | null = null;
  let igLinkedPageId: string | null = null;
  if (comment.platform === 'instagram' && comment.instagramAccountId) {
    const igInfo = await getConnectedInstagramInfo(comment.instagramAccountId);
    if (igInfo?.accessToken?.trim()) igPageToken = igInfo.accessToken.trim();
    if (!igPageToken && igInfo?.linkedPageId) {
      igLinkedPageId = igInfo.linkedPageId;
      const linkedPage = await getConnectedPageInfo(igInfo.linkedPageId);
      igPageToken = linkedPage?.accessToken?.trim() ?? null;
    }
  }

  const accountTokens = ad?.meta_account_id ? getTokensForAccount(ad.meta_account_id, ad.account_label ?? undefined) : [];
  const fallbackToken = getMetaConfig().accessToken?.trim();

  const candidates = comment.platform === 'facebook'
    ? [fbPageToken, ...accountTokens, fallbackToken]
    // For IG replies: IG-page token first (only one that consistently works),
    // then FB page token (some IG business accounts share one), then account tokens.
    : [igPageToken, fbPageToken, ...accountTokens, fallbackToken];
  const uniqueTokens = [...new Set(candidates.filter((token): token is string => Boolean(token?.trim())))];
  if (process.env.META_REPLY_DEBUG === 'true') {
    console.log(
      `[reply-tokens] comment=${comment.id} platform=${comment.platform} ` +
      `igPageToken=${Boolean(igPageToken)} fbPageToken=${Boolean(fbPageToken)} ` +
      `igLinkedPage=${igLinkedPageId ?? 'none'} accountTokens=${accountTokens.length} total=${uniqueTokens.length}`
    );
  }
  return uniqueTokens;
}

async function postMetaWithFallback<T>(path: string, params: Record<string, string>, tokens: string[]): Promise<T> {
  const attemptErrors: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    try {
      return await metaGraphPost<T>(path, params, tokens[i]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attemptErrors.push(`token#${i + 1}: ${msg}`);
      // Non-recoverable errors — permission/token issues — try the next token.
      // Everything else (transient / rate-limit) still tries next; the collected
      // error trail surfaces via META_REPLY_DEBUG or by re-throwing the final one.
    }
  }
  if (process.env.META_REPLY_DEBUG === 'true' && attemptErrors.length) {
    console.warn(`[reply-post] all ${tokens.length} token(s) failed for ${path}: ${attemptErrors.join(' | ')}`);
  }
  throw new Error(
    attemptErrors[attemptErrors.length - 1] || 'No Meta token available for this comment.'
  );
}

async function getMetaWithFallback<T>(path: string, tokens: string[]): Promise<T> {
  let lastError: unknown;
  for (const token of tokens) {
    try {
      return await metaGraphGet<T>(path, token);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('No Meta token available for this comment.');
}

async function paginateMetaWithFallback<T>(path: string, tokens: string[]): Promise<T[]> {
  let lastError: unknown;
  for (const token of tokens) {
    try {
      return await metaGraphPaginate<T>(path, token);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('No Meta token available for this comment.');
}

async function deleteMetaWithFallback<T>(path: string, tokens: string[]): Promise<T> {
  let lastError: unknown;
  for (const token of tokens) {
    try {
      return await metaGraphDelete<T>(path, token);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('No Meta token available for this comment.');
}

function mapMetaReply(platform: 'facebook' | 'instagram', row: Record<string, unknown>): MetaThreadItem {
  const from = row.from as { name?: string; id?: string } | undefined;
  const username = typeof row.username === 'string' ? row.username : undefined;
  return {
    id: String(row.id || ''),
    text: String(row.text || row.message || ''),
    author: username || from?.name || 'Commenter',
    username,
    createdAt: String(row.timestamp || row.created_time || ''),
    hidden: typeof row.hidden === 'boolean' ? row.hidden : undefined,
    permalinkUrl: typeof row.permalink === 'string' ? row.permalink : typeof row.permalink_url === 'string' ? row.permalink_url : undefined,
  };
}

commentsRouter.get('/', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });

    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const platform = typeof req.query.platform === 'string' ? req.query.platform : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
    const topSpend = req.query.topSpend === '1' || req.query.topSpend === 'true';

    if (limit != null || offset != null || platform || status || brand || topSpend) {
      const page = await getCommentsPaginated({ limit, offset, platform, status, brand, topSpend });
      return res.json(page);
    }

    const comments = await getAllComments();
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

commentsRouter.post('/', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const c = req.body;
    const row = {
      id: c.id,
      platform: c.platform,
      comment_id: c.commentId,
      comment_text: c.commentText,
      commenter_name: c.commenterName,
      commenter_profile_url: c.commenterProfileUrl,
      original_comment_url: c.originalCommentUrl,
      campaign_id: c.campaignId,
      campaign_name: c.campaignName,
      adset_id: c.adsetId,
      adset_name: c.adsetName,
      ad_id: c.adId,
      ad_name: c.adName,
      page_id: c.pageId,
      page_name: c.pageName,
      instagram_account_id: c.instagramAccountId,
      instagram_account_name: c.instagramAccountName,
      status: c.status ?? 'Unseen',
      priority: c.priority ?? 'Medium',
      sentiment: c.sentiment ?? 'Neutral',
      assigned_to: c.assignedTo ?? null,
      tags: c.tags ?? [],
      created_at: c.createdAt ?? new Date().toISOString(),
      updated_at: c.updatedAt ?? new Date().toISOString(),
      replied_at: c.repliedAt ?? null,
      seen_at: c.seenAt ?? null,
    };
    await upsertComment(row);
    res.status(201).json(await getCommentById(c.id));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

commentsRouter.patch('/:id/status', async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.body;
    const now = new Date().toISOString();
    const user = req.user!;
    const timestamps: { seenAt?: string; repliedAt?: string } = {};
    if (status === 'Seen') timestamps.seenAt = now;
    if (status === 'Replied') timestamps.repliedAt = now;

    let comment = await updateCommentStatus(req.params.id, status, timestamps);

    if (status === 'Seen') {
      await markCommentSeenForTeam(req.params.id, user);
    } else if (status === 'Unseen') {
      await clearCommentViews(req.params.id);
    }
    comment = await getCommentById(req.params.id);

    await insertActivityLog({
      id: `log-${Date.now()}`,
      comment_id: req.params.id,
      user_id: user.id,
      user_name: user.name,
      action: 'Status Change',
      old_value: req.body.oldStatus ?? '',
      new_value: status,
      created_at: now,
    });

    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

commentsRouter.post('/:id/reply', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const user = req.user!;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Reply message is required' });
    const targetCommentId = String(req.body?.targetCommentId || '').trim();
    const mention = String(req.body?.mention || '').trim();
    const includeMention = req.body?.includeMention !== false;

    const comment = await getCommentById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const tokens = await getMetaTokensForComment(comment);
    if (!tokens.length) return res.status(400).json({ error: 'No Meta token available for this comment.' });

    const replyTargetId = targetCommentId || comment.commentId;
    const replyMessage = includeMention ? withMention(message, mention || comment.commenterName) : message;
    const path = comment.platform === 'instagram'
      ? `/${replyTargetId}/replies`
      : `/${replyTargetId}/comments`;
    const postResult = await postMetaWithFallback<{ id?: string }>(path, { message: replyMessage }, tokens);

    // Meta returns { id: "<page>_<comment>" } on success. If we don't get an id
    // back the POST silently succeeded on a token that doesn't own the asset —
    // the reply won't actually appear in Business Suite. Treat that as failure.
    if (!postResult?.id) {
      return res.status(502).json({
        error: `Meta accepted the reply but returned no comment id — the reply likely didn't post. Check that this ${comment.platform === 'instagram' ? 'IG business account' : 'Page'} is connected with a Page Access Token (see Connected Accounts).`,
      });
    }

    const now = new Date().toISOString();
    await markCommentSeenForTeam(req.params.id, user);
    const updated = await updateCommentStatus(req.params.id, 'Replied', { repliedAt: now, seenAt: now });
    await insertActivityLog({
      id: `log-reply-${Date.now()}`,
      comment_id: req.params.id,
      user_id: user.id,
      user_name: user.name,
      action: 'Meta Reply',
      old_value: comment.status,
      new_value: targetCommentId
        ? `Replied to ${targetCommentId} on Meta (${postResult.id})`
        : `Replied on Meta (${postResult.id})`,
      created_at: now,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: friendlyMetaActionError(err, 'reply to', undefined) });
  }
});

commentsRouter.post('/:id/reply-suggestions', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const comment = await getCommentById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const cacheKey = `reply_suggestion:${comment.id}`;
    const refresh = req.body?.refresh === true;
    const cached = await getConfigValue<CachedReplySuggestion | null>(cacheKey, null);
    if (!refresh && cached?.suggestion) {
      return res.json({ suggestion: cached.suggestion, suggestions: [cached.suggestion], confidence: cached.confidence, generatedAt: cached.generatedAt, cached: true });
    }

    const ad = comment.adId ? await getAdById(comment.adId) : null;
    const existingReplies = Array.isArray(req.body?.replies) ? req.body.replies : [];
    const result = await suggestCommentReplies({
      text: comment.commentText,
      platform: comment.platform,
      commenterName: comment.commenterName,
      brand: req.body?.brand,
      campaignName: comment.campaignName,
      adName: comment.adName,
      ad: ad ? {
        adName: ad.adName,
        campaignName: ad.campaignName,
        adsetName: ad.adsetName,
        accountLabel: ad.accountLabel,
        headline: ad.headline,
        description: ad.description,
        adCopy: ad.adCopy,
        cta: ad.cta,
        originalAdUrl: ad.originalAdUrl,
      } : null,
      existingReplies: existingReplies.map((reply: Record<string, unknown>) => ({
        author: String(reply.author || ''),
        text: String(reply.text || ''),
      })),
    });
    const generatedAt = new Date().toISOString();
    await setConfigValue(cacheKey, { suggestion: result.suggestion, confidence: result.confidence, generatedAt });
    res.json({ suggestion: result.suggestion, suggestions: [result.suggestion], confidence: result.confidence, generatedAt, cached: false });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

commentsRouter.get('/:id/replies', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const comment = await getCommentById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const tokens = await getMetaTokensForComment(comment);
    if (!tokens.length) return res.status(400).json({ error: 'No Meta token available for this comment.' });

    const fields = comment.platform === 'instagram'
      ? 'id,text,timestamp,username,hidden'
      : 'id,message,created_time,from{id,name},permalink_url,is_hidden';
    const path = comment.platform === 'instagram'
      ? `/${comment.commentId}/replies?fields=${fields}&limit=100`
      : `/${comment.commentId}/comments?fields=${fields}&limit=100`;
    const rows = await paginateMetaWithFallback<Record<string, unknown>>(path, tokens);
    res.json({ items: rows.map(row => mapMetaReply(comment.platform, row)).filter(item => item.id) });
  } catch (err) {
    if (isUnsupportedRepliesEdgeError(err)) {
      return res.json({ items: [], unavailableReason: 'Meta does not expose replies for this comment.' });
    }
    res.status(500).json({ error: friendlyMetaActionError(err, 'load replies for', undefined) });
  }
});

commentsRouter.post('/:id/meta-comment/:metaCommentId/edit', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const user = req.user!;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Edited message is required' });

    const comment = await getCommentById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const tokens = await getMetaTokensForComment(comment);
    if (!tokens.length) return res.status(400).json({ error: 'No Meta token available for this comment.' });

    await postMetaWithFallback(`/${req.params.metaCommentId}`, { message }, tokens);
    await insertActivityLog({
      id: `log-edit-${Date.now()}`,
      comment_id: req.params.id,
      user_id: user.id,
      user_name: user.name,
      action: 'Meta Edit',
      old_value: req.params.metaCommentId,
      new_value: 'Edited reply/comment on Meta',
      created_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: friendlyMetaActionError(err, 'edit', undefined) });
  }
});

commentsRouter.delete('/:id/meta-comment/:metaCommentId', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const user = req.user!;
    const comment = await getCommentById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const tokens = await getMetaTokensForComment(comment);
    if (!tokens.length) return res.status(400).json({ error: 'No Meta token available for this comment.' });

    await deleteMetaWithFallback(`/${req.params.metaCommentId}`, tokens);
    await insertActivityLog({
      id: `log-delete-${Date.now()}`,
      comment_id: req.params.id,
      user_id: user.id,
      user_name: user.name,
      action: 'Meta Delete',
      old_value: req.params.metaCommentId,
      new_value: 'Deleted comment/reply on Meta',
      created_at: new Date().toISOString(),
    });
    if (req.params.metaCommentId === comment.commentId) {
      // Add a 'Deleted on Meta' tag alongside the status change so the inbox card
      // clearly indicates the comment no longer exists upstream. Kept as Ignored
      // (not hard-deleted) so activity history / notes are preserved.
      const existingTags = Array.isArray(comment.tags) ? comment.tags.filter(Boolean) : [];
      const nextTags = existingTags.includes('Deleted on Meta')
        ? existingTags
        : [...existingTags, 'Deleted on Meta'];
      await updateCommentFields(req.params.id, { tags: nextTags });
      const updated = await updateCommentStatus(req.params.id, 'Ignored', {});
      return res.json({ ok: true, comment: updated, deletedOnMeta: true });
    }
    res.json({ ok: true, deletedOnMeta: true });
  } catch (err) {
    res.status(500).json({ error: friendlyMetaActionError(err, 'delete', undefined) });
  }
});

commentsRouter.post('/:id/moderate', async (req: AuthenticatedRequest, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const user = req.user!;
    const hidden = Boolean(req.body?.hidden);

    const comment = await getCommentById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const tokens = await getMetaTokensForComment(comment);
    if (!tokens.length) return res.status(400).json({ error: 'No Meta token available for this comment.' });

    const params = comment.platform === 'instagram'
      ? { hide: String(hidden) }
      : { is_hidden: String(hidden) };
    await postMetaWithFallback(`/${comment.commentId}`, params, tokens);

    const now = new Date().toISOString();
    const updated = await updateCommentStatus(req.params.id, hidden ? 'Ignored' : 'Seen', hidden ? {} : { seenAt: now });
    await insertActivityLog({
      id: `log-moderate-${Date.now()}`,
      comment_id: req.params.id,
      user_id: user.id,
      user_name: user.name,
      action: hidden ? 'Meta Hide' : 'Meta Unhide',
      old_value: comment.status,
      new_value: hidden ? 'Hidden on Meta' : 'Visible on Meta',
      created_at: now,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: friendlyMetaActionError(err, 'moderate', undefined) });
  }
});

commentsRouter.post('/:id/view', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const commentId = req.params.id;
    const { comment, views } = await markCommentSeenForTeam(commentId, user, { logActivity: true });
    res.json({ comment, views });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

commentsRouter.get('/:id/views', async (req, res) => {
  try {
    const views = await getCommentViews(req.params.id);
    res.json(views);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

commentsRouter.patch('/:id/assign', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { assignedTo } = req.body;
    await markCommentSeenForTeam(req.params.id, user);
    const comment = await updateCommentAssign(req.params.id, assignedTo ?? null);
    await insertActivityLog({
      id: `log-${Date.now()}`,
      comment_id: req.params.id,
      user_id: user.id,
      user_name: user.name,
      action: 'Assignment',
      old_value: req.body.oldAssignee ?? 'Unassigned',
      new_value: assignedTo ? (req.body.assigneeName ?? assignedTo) : 'Unassigned',
      created_at: new Date().toISOString(),
    });
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

commentsRouter.patch('/:id/priority', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const comment = await updateCommentFields(req.params.id, { priority: req.body.priority });
    await insertActivityLog({
      id: `log-${Date.now()}`,
      comment_id: req.params.id,
      user_id: user.id,
      user_name: user.name,
      action: 'Priority Change',
      old_value: req.body.oldPriority ?? '',
      new_value: req.body.priority,
      created_at: new Date().toISOString(),
    });
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

commentsRouter.patch('/:id/tags', async (req, res) => {
  try {
    const comment = await updateCommentFields(req.params.id, { tags: req.body.tags });
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

commentsRouter.post('/:id/notes', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const now = new Date().toISOString();
    await markCommentSeenForTeam(req.params.id, user);
    const note = {
      id: req.body.id ?? `note-${Date.now()}`,
      comment_id: req.params.id,
      user_id: user.id,
      user_name: user.name,
      user_avatar: user.avatarUrl || req.body.userAvatar || '',
      note: req.body.note,
      created_at: now,
    };
    await insertNote(note);
    await insertActivityLog({
      id: `log-${Date.now()}`,
      comment_id: req.params.id,
      user_id: note.user_id,
      user_name: note.user_name,
      action: 'Context Note Addition',
      old_value: '',
      new_value: 'Note logged',
      created_at: now,
    });
    res.status(201).json({
      id: note.id,
      commentId: note.comment_id,
      userId: note.user_id,
      userName: note.user_name,
      userAvatar: note.user_avatar,
      note: note.note,
      createdAt: note.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


export const bootstrapRouter = Router();

bootstrapRouter.get('/notes', async (_req, res) => {
  try {
    res.json(await getAllNotes());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

bootstrapRouter.get('/activity-logs', async (_req, res) => {
  try {
    res.json(await getAllActivityLogs());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

bootstrapRouter.get('/team', async (_req, res) => {
  try {
    res.json(await getAllTeam());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

bootstrapRouter.get('/campaigns', async (_req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    res.json(await getCampaignsWithAds());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

bootstrapRouter.get('/auto-tagging-rules', async (_req, res) => {
  try {
    res.json(await getAllRules());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

bootstrapRouter.post('/auto-tagging-rules', async (req, res) => {
  try {
    const rules = req.body.rules ?? [req.body];
    await upsertRules(rules.map((r: { id: string; keyword: string; tag: string; priority: string; isActive?: boolean }) => ({
      id: r.id, keyword: r.keyword, tag: r.tag, priority: r.priority, is_active: r.isActive ?? true,
    })));
    res.json(await getAllRules());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

bootstrapRouter.delete('/auto-tagging-rules/:id', async (req, res) => {
  try {
    await deleteRule(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

bootstrapRouter.post('/team', async (req, res) => {
  try {
    const m = req.body;
    const { query } = await import('../db/pool.js');
    await query(
      'INSERT INTO team_members (id,name,email,role,avatar_url) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=$2,email=$3,role=$4,avatar_url=$5',
      [m.id, m.name, m.email, m.role, m.avatarUrl]
    );
    res.status(201).json(m);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
