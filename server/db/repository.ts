import { query, isDatabaseConfigured } from '../db/pool.js';
import { isServerDemoMode } from '../lib/meta.js';
import {
  rowToComment,
  rowToNote,
  rowToLog,
  rowToTeam,
  rowToRule,
  rowToCampaign,
  rowToAd,
} from '../db/mappers.js';

const ACTIVE_AD_EXISTS = `EXISTS (
  SELECT 1 FROM ads a
  WHERE (
      a.ad_id = comments.ad_id
      OR a.id = comments.ad_id
      OR a.post_story_id = comments.ad_id
      OR a.instagram_media_id = comments.ad_id
    )
    AND a.effective_status = 'ACTIVE'
)`;

const ORGANIC_COMMENT_EXISTS = `(
  comments.ad_id IS NULL OR comments.ad_id = ''
  OR comments.campaign_name = 'Organic'
  OR comments.adset_name = 'Organic'
  OR comments.ad_name LIKE 'Organic%'
)`;

const NOT_ARCHIVED = `comments.archived_at IS NULL`;

const NOT_CONNECTED_ASSET_AUTHOR = `NOT EXISTS (
  SELECT 1 FROM connected_instagram_accounts cia
  WHERE LOWER(REGEXP_REPLACE(COALESCE(cia.username, ''), '[^a-zA-Z0-9]', '', 'g')) =
        LOWER(REGEXP_REPLACE(COALESCE(comments.commenter_name, ''), '[^a-zA-Z0-9]', '', 'g'))
) AND NOT EXISTS (
  SELECT 1 FROM connected_pages cp
  WHERE LOWER(REGEXP_REPLACE(COALESCE(cp.name, ''), '[^a-zA-Z0-9]', '', 'g')) =
        LOWER(REGEXP_REPLACE(COALESCE(comments.commenter_name, ''), '[^a-zA-Z0-9]', '', 'g'))
)`;

const VISIBLE_COMMENT_WHERE = `(${NOT_ARCHIVED} AND ${NOT_CONNECTED_ASSET_AUTHOR} AND (${ACTIVE_AD_EXISTS} OR ${ORGANIC_COMMENT_EXISTS}))`;

const ACTIVE_AD_WHERE = `effective_status = 'ACTIVE'`;

const TOP_SPEND_AD_EXISTS = `EXISTS (
  SELECT 1 FROM (
    SELECT id, ad_id, post_story_id, instagram_media_id,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(NULLIF(UPPER(account_label), ''), 'UNKNOWN')
             ORDER BY COALESCE(recent_spend, 0) DESC, COALESCE(spend, 0) DESC, synced_at DESC NULLS LAST, ad_name
           ) AS account_rank
    FROM ads
    WHERE effective_status = 'ACTIVE'
      AND COALESCE(recent_spend, spend, 0) > 0
  ) top_ads
  WHERE top_ads.account_rank <= 15
    AND (
      top_ads.ad_id = comments.ad_id
      OR top_ads.id = comments.ad_id
      OR top_ads.post_story_id = comments.ad_id
      OR top_ads.instagram_media_id = comments.ad_id
    )
)`;

const COMMENT_SELECT = `comments.*, COALESCE((
  SELECT json_agg(json_build_object(
    'userId', cv.user_id,
    'userName', cv.user_name,
    'viewedAt', cv.viewed_at
  ) ORDER BY cv.viewed_at DESC)
  FROM comment_views cv
  WHERE cv.comment_id = comments.id
), '[]'::json) AS views`;

export async function getAllComments() {
  const { rows } = await query(`SELECT ${COMMENT_SELECT} FROM comments WHERE ${VISIBLE_COMMENT_WHERE} ORDER BY created_at DESC LIMIT 1000`);
  return rows.map(rowToComment);
}

export interface CommentsQuery {
  limit?: number;
  offset?: number;
  platform?: string;
  status?: string;
  brand?: string;
  topSpend?: boolean;
}

export async function getCommentsPaginated(opts: CommentsQuery = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 2000);
  const offset = Math.max(opts.offset ?? 0, 0);
  const conditions: string[] = [];
  const params: unknown[] = [];

  conditions.push(VISIBLE_COMMENT_WHERE);

  if (opts.platform && opts.platform !== 'all') {
    params.push(opts.platform);
    conditions.push(`comments.platform = $${params.length}`);
  }
  if (opts.status && opts.status !== 'All' && opts.status !== 'Unreplied') {
    params.push(opts.status);
    conditions.push(`comments.status = $${params.length}`);
  }
  if (opts.status === 'Unreplied') {
    conditions.push(`comments.status IN ('Unseen', 'Seen')`);
  }
  if (opts.brand && opts.brand !== 'All') {
    params.push(opts.brand.toUpperCase());
    conditions.push(`EXISTS (
      SELECT 1 FROM ads a
      WHERE (
          a.ad_id = comments.ad_id
          OR a.id = comments.ad_id
          OR a.post_story_id = comments.ad_id
          OR a.instagram_media_id = comments.ad_id
        )
        AND UPPER(COALESCE(a.account_label, '')) = $${params.length}
    )`);
  }
  if (opts.topSpend) {
    conditions.push(TOP_SPEND_AD_EXISTS);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM comments ${where}`,
    params
  );

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${COMMENT_SELECT} FROM comments ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    items: rows.map(rowToComment),
    total: Number(countRes.rows[0]?.count ?? 0),
    limit,
    offset,
  };
}

export async function getCommentById(id: string) {
  const { rows } = await query(`SELECT ${COMMENT_SELECT} FROM comments WHERE id = $1`, [id]);
  return rows[0] ? rowToComment(rows[0]) : null;
}

export async function getCommentByMetaId(commentId: string) {
  const { rows } = await query(`SELECT ${COMMENT_SELECT} FROM comments WHERE comment_id = $1 LIMIT 1`, [commentId]);
  return rows[0] ? rowToComment(rows[0]) : null;
}

export async function commentExistsByMetaId(commentId: string): Promise<boolean> {
  const { rows } = await query('SELECT 1 FROM comments WHERE comment_id = $1 LIMIT 1', [commentId]);
  return rows.length > 0;
}

/**
 * Permanently delete comments older than `retentionDays` (by created_at).
 * Applies to all comments regardless of status, seen/replied state, or archive flag.
 * Related notes and activity logs cascade via FK.
 */
export async function deleteOldComments(retentionDays: number): Promise<number> {
  const days = Math.max(Math.floor(retentionDays), 1);
  const { rowCount } = await query(
    `DELETE FROM comments
     WHERE created_at < NOW() - ($1 || ' days')::INTERVAL`,
    [String(days)]
  );
  return rowCount ?? 0;
}

/** @deprecated Use deleteOldComments — kept as alias for callers not yet updated */
export async function archiveOldComments(retentionDays: number): Promise<number> {
  return deleteOldComments(retentionDays);
}

export async function getArchivedCommentStats(): Promise<{ total: number; latest: string | null }> {
  const { rows } = await query<{ total: string; latest: string | null }>(
    `SELECT COUNT(*)::text AS total, MAX(archived_at)::text AS latest
     FROM comments WHERE archived_at IS NOT NULL`
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    latest: rows[0]?.latest ?? null,
  };
}

export async function upsertComment(row: Record<string, unknown>) {
  await query(
    `INSERT INTO comments (
      id, platform, comment_id, comment_text, commenter_name, commenter_profile_url,
      original_comment_url, campaign_id, campaign_name, adset_id, adset_name,
      ad_id, ad_name, page_id, page_name, instagram_account_id, instagram_account_name,
      status, priority, sentiment, assigned_to, tags, created_at, updated_at, replied_at, seen_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
    ) ON CONFLICT (comment_id) DO UPDATE SET
      platform = EXCLUDED.platform,
      comment_text = EXCLUDED.comment_text,
      commenter_name = CASE
        WHEN EXCLUDED.commenter_name NOT IN ('Unknown User', 'Commenter', 'Facebook commenter')
        THEN EXCLUDED.commenter_name
        ELSE comments.commenter_name
      END,
      commenter_profile_url = CASE
        WHEN EXCLUDED.commenter_profile_url IS NOT NULL AND EXCLUDED.commenter_profile_url <> ''
        THEN EXCLUDED.commenter_profile_url
        ELSE comments.commenter_profile_url
      END,
      original_comment_url = CASE
        WHEN EXCLUDED.original_comment_url IS NOT NULL AND EXCLUDED.original_comment_url <> ''
        THEN EXCLUDED.original_comment_url
        ELSE comments.original_comment_url
      END,
      campaign_id = COALESCE(NULLIF(EXCLUDED.campaign_id, ''), comments.campaign_id),
      campaign_name = CASE
        WHEN EXCLUDED.campaign_name IS NOT NULL AND EXCLUDED.campaign_name NOT IN ('', 'Unknown Campaign')
        THEN EXCLUDED.campaign_name
        ELSE comments.campaign_name
      END,
      adset_id = COALESCE(NULLIF(EXCLUDED.adset_id, ''), comments.adset_id),
      adset_name = CASE
        WHEN EXCLUDED.adset_name IS NOT NULL AND EXCLUDED.adset_name NOT IN ('', 'Unknown Ad Set')
        THEN EXCLUDED.adset_name
        ELSE comments.adset_name
      END,
      ad_id = COALESCE(NULLIF(EXCLUDED.ad_id, ''), comments.ad_id),
      ad_name = CASE
        WHEN EXCLUDED.ad_name IS NOT NULL AND EXCLUDED.ad_name NOT IN ('', 'Unknown Ad')
        THEN EXCLUDED.ad_name
        ELSE comments.ad_name
      END,
      page_id = COALESCE(NULLIF(EXCLUDED.page_id, ''), comments.page_id),
      page_name = COALESCE(NULLIF(EXCLUDED.page_name, ''), comments.page_name),
      instagram_account_id = COALESCE(NULLIF(EXCLUDED.instagram_account_id, ''), comments.instagram_account_id),
      instagram_account_name = COALESCE(NULLIF(EXCLUDED.instagram_account_name, ''), comments.instagram_account_name),
      updated_at = EXCLUDED.updated_at`,
    [
      row.id, row.platform, row.comment_id, row.comment_text, row.commenter_name,
      row.commenter_profile_url, row.original_comment_url, row.campaign_id, row.campaign_name,
      row.adset_id, row.adset_name, row.ad_id, row.ad_name, row.page_id, row.page_name,
      row.instagram_account_id, row.instagram_account_name, row.status, row.priority,
      row.sentiment, row.assigned_to, JSON.stringify(row.tags ?? []),
      row.created_at, row.updated_at, row.replied_at, row.seen_at,
    ]
  );
}

export async function updateCommentStatus(id: string, status: string, timestamps: { seenAt?: string; repliedAt?: string }) {
  const now = new Date().toISOString();
  await query(
    `UPDATE comments SET status = $1, updated_at = $2,
     seen_at = CASE
       WHEN $1 = 'Unseen' THEN NULL
       WHEN $1 IN ('Seen', 'Replied', 'Ignored') THEN COALESCE($3, seen_at, $2::timestamptz)
       ELSE COALESCE($3, seen_at)
     END,
     replied_at = COALESCE($4, replied_at)
     WHERE id = $5`,
    [status, now, timestamps.seenAt ?? null, timestamps.repliedAt ?? null, id]
  );
  return getCommentById(id);
}

export async function updateCommentAssign(id: string, assignedTo: string | null) {
  const now = new Date().toISOString();
  await query(
    `UPDATE comments SET
       assigned_to = $1,
       status = CASE WHEN status = 'Unseen' THEN 'Seen' ELSE status END,
       seen_at = CASE WHEN status = 'Unseen' THEN $2::timestamptz ELSE seen_at END,
       updated_at = $2
     WHERE id = $3`,
    [assignedTo, now, id]
  );
  return getCommentById(id);
}

export async function updateCommentFields(id: string, fields: Record<string, unknown>) {
  const sets: string[] = ['updated_at = $1'];
  const vals: unknown[] = [new Date().toISOString()];
  let i = 2;
  if (fields.priority !== undefined) { sets.push(`priority = $${i++}`); vals.push(fields.priority); }
  if (fields.tags !== undefined) { sets.push(`tags = $${i++}`); vals.push(JSON.stringify(fields.tags)); }
  vals.push(id);
  await query(`UPDATE comments SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  return getCommentById(id);
}

export async function getAllNotes() {
  const { rows } = await query('SELECT * FROM comment_notes ORDER BY created_at DESC LIMIT 1000');
  return rows.map(rowToNote);
}

export async function insertNote(note: Record<string, unknown>) {
  await query(
    `INSERT INTO comment_notes (id, comment_id, user_id, user_name, user_avatar, note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [note.id, note.comment_id, note.user_id, note.user_name, note.user_avatar, note.note, note.created_at]
  );
  return rowToNote(note);
}

export async function getAllActivityLogs() {
  const { rows } = await query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 1000');
  return rows.map(rowToLog);
}

export async function insertActivityLog(log: Record<string, unknown>) {
  await query(
    `INSERT INTO activity_logs (id, comment_id, user_id, user_name, action, old_value, new_value, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [log.id, log.comment_id, log.user_id, log.user_name, log.action, log.old_value, log.new_value, log.created_at]
  );
}

export async function getAllTeam() {
  try {
    const { rows } = await query(
      `SELECT id, name, email, COALESCE(NULLIF(title, ''), role) AS role, avatar_url
       FROM app_users WHERE is_active = TRUE ORDER BY name`
    );
    if (rows.length > 0) return rows.map(rowToTeam);
  } catch {
    /* app_users table may not exist yet */
  }
  const fallback = await query('SELECT * FROM team_members ORDER BY name');
  return fallback.rows.map(rowToTeam);
}

export async function getAllCampaigns() {
  const { rows } = await query('SELECT * FROM campaigns ORDER BY campaign_name');
  return rows.map(rowToCampaign);
}

export async function getCampaignsWithAds() {
  const { rows } = await query(`
    SELECT c.*,
           COALESCE(json_agg(to_jsonb(a) ORDER BY a.ad_name) FILTER (WHERE a.id IS NOT NULL), '[]'::json) AS ads_json
    FROM campaigns c
    LEFT JOIN ads a ON a.campaign_name = c.campaign_name AND a.effective_status = 'ACTIVE'
    GROUP BY c.id
    ORDER BY c.campaign_name
  `);
  return rows.map(row => ({
    ...rowToCampaign(row),
    ads: (Array.isArray(row.ads_json) ? row.ads_json : []).map(rowToAd),
  }));
}

export async function getAllAds() {
  const { rows } = await query(`SELECT * FROM ads WHERE ${ACTIVE_AD_WHERE} ORDER BY ad_name`);
  return rows.map(rowToAd);
}

export async function getAdsForCommentSync() {
  const { rows } = await query(`
    SELECT * FROM ads
    WHERE ${ACTIVE_AD_WHERE}
    ORDER BY COALESCE(recent_spend, 0) DESC, COALESCE(spend, 0) DESC, COALESCE(account_label, ''), ad_name
  `);
  return rows.map(rowToAd);
}

/** Lightweight ads for inbox/campaign views — omits large copy/media fields. */
export async function getAdsSummaries() {
  const { rows } = await query(`
    SELECT id, platform, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, original_ad_url,
           media_type, thumbnail_url, comments_count, spend, recent_spend, account_label,
           meta_account_id, post_story_id, instagram_media_id, headline, cta
    FROM ads WHERE ${ACTIVE_AD_WHERE} ORDER BY ad_name
  `);
  return rows.map(row => ({
    ...rowToAd(row),
    mediaUrl: undefined,
    adCopy: '',
    description: undefined,
  }));
}

export async function getAdById(id: string) {
  const { rows } = await query(`SELECT * FROM ads WHERE (${ACTIVE_AD_WHERE}) AND (id = $1 OR ad_id = $1) LIMIT 1`, [id]);
  return rows[0] ? rowToAd(rows[0]) : null;
}

export async function getAllRules() {
  const { rows } = await query('SELECT * FROM auto_tagging_rules ORDER BY keyword');
  return rows.map(rowToRule);
}

export async function upsertRules(rules: Record<string, unknown>[]) {
  for (const r of rules) {
    await query(
      `INSERT INTO auto_tagging_rules (id, keyword, tag, priority, is_active)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET keyword=$2, tag=$3, priority=$4, is_active=$5`,
      [r.id, r.keyword, r.tag, r.priority, r.is_active ?? true]
    );
  }
}

export async function deleteRule(id: string) {
  await query('DELETE FROM auto_tagging_rules WHERE id = $1', [id]);
}

export async function getConfigValue<T>(key: string, fallback: T): Promise<T> {
  const { rows } = await query<{ value: T }>('SELECT value FROM app_config WHERE key = $1 LIMIT 1', [key]);
  return rows[0]?.value ?? fallback;
}

export async function setConfigValue(key: string, value: unknown): Promise<void> {
  await query(
    `INSERT INTO app_config (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

export async function getReportsSummary() {
  const { rows: stats } = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'Unseen')::int AS unseen,
      COUNT(*) FILTER (WHERE status = 'Replied')::int AS replied,
      COUNT(*) FILTER (WHERE status IN ('Unseen','Seen'))::int AS unreplied,
      COUNT(*) FILTER (WHERE priority = 'Urgent')::int AS urgent,
      COUNT(*) FILTER (WHERE platform = 'facebook')::int AS facebook,
      COUNT(*) FILTER (WHERE platform = 'instagram')::int AS instagram
    FROM comments
  `);
  return stats[0];
}

export async function seedIfEmpty() {
  if (!isDatabaseConfigured()) return;
  if (!isServerDemoMode()) {
    console.log('[db] Production mode — skipping demo seed data');
    return;
  }
  const { rows } = await query('SELECT COUNT(*)::int AS c FROM comments');
  if (rows[0].c > 0) return;

  const { initialComments, preMadeNotes, initialActivityLogs, mockAutoTaggingRules, teamMembers, mockCampaigns, mockAds } =
    await import('../../src/data.js');

  for (const m of teamMembers) {
    await query('INSERT INTO team_members (id,name,email,role,avatar_url) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [m.id, m.name, m.email, m.role, m.avatarUrl]);
  }
  for (const c of mockCampaigns) {
    await query('INSERT INTO campaigns (id,platform,campaign_id,campaign_name,status,budget,comments_count) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
      [c.id, c.platform, c.campaignId, c.campaignName, c.status, c.budget, c.commentsCount]);
  }
  for (const a of mockAds) {
    await query(`INSERT INTO ads (id,platform,ad_id,ad_name,adset_name,campaign_name,original_ad_url,media_type,media_url,thumbnail_url,ad_copy,headline,description,cta,likes_count,shares_count,comments_count)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT DO NOTHING`,
      [a.id, a.platform, a.adId, a.adName, a.adsetName, a.campaignName, a.originalAdUrl, a.mediaType, a.mediaUrl, a.thumbnailUrl, a.adCopy, a.headline, a.description, a.cta, a.likesCount, a.sharesCount, a.commentsCount]);
  }
  for (const c of initialComments) {
    await upsertComment({
      id: c.id, platform: c.platform, comment_id: c.commentId, comment_text: c.commentText,
      commenter_name: c.commenterName, commenter_profile_url: c.commenterProfileUrl,
      original_comment_url: c.originalCommentUrl, campaign_id: c.campaignId, campaign_name: c.campaignName,
      adset_id: c.adsetId, adset_name: c.adsetName, ad_id: c.adId, ad_name: c.adName,
      page_id: c.pageId, page_name: c.pageName, instagram_account_id: c.instagramAccountId,
      instagram_account_name: c.instagramAccountName, status: c.status, priority: c.priority,
      sentiment: c.sentiment, assigned_to: c.assignedTo, tags: c.tags,
      created_at: c.createdAt, updated_at: c.updatedAt, replied_at: c.repliedAt, seen_at: c.seenAt,
    });
  }
  for (const n of preMadeNotes) {
    await insertNote({ id: n.id, comment_id: n.commentId, user_id: n.userId, user_name: n.userName, user_avatar: n.userAvatar, note: n.note, created_at: n.createdAt });
  }
  for (const l of initialActivityLogs) {
    await insertActivityLog({ id: l.id, comment_id: l.commentId, user_id: l.userId, user_name: l.userName, action: l.action, old_value: l.oldValue, new_value: l.newValue, created_at: l.createdAt });
  }
  for (const r of mockAutoTaggingRules) {
    await query('INSERT INTO auto_tagging_rules (id,keyword,tag,priority,is_active) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [r.id, r.keyword, r.tag, r.priority, r.isActive]);
  }
  console.log('[db] Seeded initial demo data');
}
