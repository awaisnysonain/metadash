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

export async function getAllComments() {
  const { rows } = await query('SELECT * FROM comments ORDER BY created_at DESC LIMIT 1000');
  return rows.map(rowToComment);
}

export interface CommentsQuery {
  limit?: number;
  offset?: number;
  platform?: string;
  status?: string;
}

export async function getCommentsPaginated(opts: CommentsQuery = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 2000);
  const offset = Math.max(opts.offset ?? 0, 0);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.platform && opts.platform !== 'all') {
    params.push(opts.platform);
    conditions.push(`platform = $${params.length}`);
  }
  if (opts.status && opts.status !== 'All' && opts.status !== 'Unreplied') {
    params.push(opts.status);
    conditions.push(`status = $${params.length}`);
  }
  if (opts.status === 'Unreplied') {
    conditions.push(`status IN ('Unseen', 'Seen')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM comments ${where}`,
    params
  );

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT * FROM comments ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
  const { rows } = await query('SELECT * FROM comments WHERE id = $1', [id]);
  return rows[0] ? rowToComment(rows[0]) : null;
}

export async function commentExistsByMetaId(commentId: string): Promise<boolean> {
  const { rows } = await query('SELECT 1 FROM comments WHERE comment_id = $1 LIMIT 1', [commentId]);
  return rows.length > 0;
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
     seen_at = COALESCE($3, seen_at), replied_at = COALESCE($4, replied_at)
     WHERE id = $5`,
    [status, now, timestamps.seenAt ?? null, timestamps.repliedAt ?? null, id]
  );
  return getCommentById(id);
}

export async function updateCommentAssign(id: string, assignedTo: string | null) {
  const now = new Date().toISOString();
  await query(
    `UPDATE comments SET assigned_to = $1, status = CASE WHEN status = 'Unseen' THEN 'Seen' ELSE status END, updated_at = $2 WHERE id = $3`,
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
  const campaigns = await getAllCampaigns();
  const { rows: adRows } = await query('SELECT * FROM ads ORDER BY ad_name');
  const ads = adRows.map(rowToAd);
  return campaigns.map(camp => ({
    ...camp,
    ads: ads.filter(ad => ad.campaignName === camp.campaignName),
  }));
}

export async function getAllAds() {
  const { rows } = await query('SELECT * FROM ads ORDER BY ad_name');
  return rows.map(rowToAd);
}

/** Lightweight ads for inbox/campaign views — omits large copy/media fields. */
export async function getAdsSummaries() {
  const { rows } = await query(`
    SELECT id, platform, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, original_ad_url,
           media_type, thumbnail_url, comments_count, spend, account_label,
           meta_account_id, post_story_id, headline, cta
    FROM ads ORDER BY ad_name
  `);
  return rows.map(row => ({
    ...rowToAd(row),
    mediaUrl: undefined,
    adCopy: '',
    description: undefined,
  }));
}

export async function getAdById(id: string) {
  const { rows } = await query('SELECT * FROM ads WHERE id = $1 OR ad_id = $1 LIMIT 1', [id]);
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
