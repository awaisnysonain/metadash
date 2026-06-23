import { Router } from 'express';
import {
  getAllComments,
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
  getAllRules,
  upsertRules,
  deleteRule,
} from '../db/repository.js';
import { isDatabaseConfigured } from '../db/pool.js';

export const commentsRouter = Router();

commentsRouter.get('/', async (_req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
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

commentsRouter.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const now = new Date().toISOString();
    const timestamps: { seenAt?: string; repliedAt?: string } = {};
    if (status === 'Seen') timestamps.seenAt = now;
    if (status === 'Replied') timestamps.repliedAt = now;

    const comment = await updateCommentStatus(req.params.id, status, timestamps);

    await insertActivityLog({
      id: `log-${Date.now()}`,
      comment_id: req.params.id,
      user_id: req.body.userId ?? 'team-1',
      user_name: req.body.userName ?? 'Sarah Jenkins',
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

commentsRouter.patch('/:id/assign', async (req, res) => {
  try {
    const { assignedTo, userId, userName, oldAssignee } = req.body;
    const comment = await updateCommentAssign(req.params.id, assignedTo ?? null);
    await insertActivityLog({
      id: `log-${Date.now()}`,
      comment_id: req.params.id,
      user_id: userId ?? 'team-1',
      user_name: userName ?? 'Sarah Jenkins',
      action: 'Assignment',
      old_value: oldAssignee ?? 'Unassigned',
      new_value: assignedTo ? (req.body.assigneeName ?? assignedTo) : 'Unassigned',
      created_at: new Date().toISOString(),
    });
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

commentsRouter.patch('/:id/priority', async (req, res) => {
  try {
    const comment = await updateCommentFields(req.params.id, { priority: req.body.priority });
    await insertActivityLog({
      id: `log-${Date.now()}`,
      comment_id: req.params.id,
      user_id: req.body.userId ?? 'team-1',
      user_name: req.body.userName ?? 'Sarah Jenkins',
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

commentsRouter.post('/:id/notes', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const note = {
      id: req.body.id ?? `note-${Date.now()}`,
      comment_id: req.params.id,
      user_id: req.body.userId ?? 'team-1',
      user_name: req.body.userName ?? 'Sarah Jenkins',
      user_avatar: req.body.userAvatar ?? '',
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
