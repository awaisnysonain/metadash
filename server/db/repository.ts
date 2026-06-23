import { query, isDatabaseConfigured } from '../db/pool.js';
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
  const { rows } = await query('SELECT * FROM comments ORDER BY created_at DESC');
  return rows.map(rowToComment);
}

export async function getCommentById(id: string) {
  const { rows } = await query('SELECT * FROM comments WHERE id = $1', [id]);
  return rows[0] ? rowToComment(rows[0]) : null;
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
      comment_text = EXCLUDED.comment_text,
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
  const { rows } = await query('SELECT * FROM comment_notes ORDER BY created_at DESC');
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
  const { rows } = await query('SELECT * FROM activity_logs ORDER BY created_at DESC');
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
  const { rows } = await query('SELECT * FROM team_members ORDER BY name');
  return rows.map(rowToTeam);
}

export async function getAllCampaigns() {
  const { rows } = await query('SELECT * FROM campaigns ORDER BY campaign_name');
  return rows.map(rowToCampaign);
}

export async function getAllAds() {
  const { rows } = await query('SELECT * FROM ads ORDER BY ad_name');
  return rows.map(rowToAd);
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
