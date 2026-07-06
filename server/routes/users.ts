import { Router } from 'express';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  getAllUsers,
  createUser,
  updateUserByAdmin,
  deleteUserByAdmin,
  getUserById,
  sanitizeUser,
} from '../db/user-repository.js';
import { isEnvAdminUsername } from '../lib/env-admin.js';
import type { Permission } from '../lib/auth.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { sendSlackDirectMessage } from '../lib/slack-alerts.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/', requireAdmin, async (_req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users.map(sanitizeUser));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

usersRouter.post('/', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });

    const { username, password, name, email, title, bio, avatarUrl, permissions, slackUserId } = req.body as {
      username?: string;
      password?: string;
      name?: string;
      email?: string;
      title?: string;
      bio?: string;
      avatarUrl?: string;
      permissions?: Permission[];
      slackUserId?: string;
    };

    if (!username?.trim() || !password || !name?.trim()) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }

    if (isEnvAdminUsername(username.trim())) {
      return res.status(409).json({ error: 'This username is reserved for the system administrator' });
    }

    const user = await createUser({
      id: `user-${Date.now()}`,
      username: username.trim(),
      password,
      name: name.trim(),
      email,
      title,
      bio,
      avatarUrl,
      permissions,
    });

    let invite: { sent: boolean; reason?: string } | undefined;
    if (slackUserId?.trim()) {
      invite = await sendSlackDirectMessage({
        slackUserId: slackUserId.trim(),
        text: `MetaDash account created for ${name.trim()}. Username: ${username.trim()}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'MetaDash account created', emoji: true } },
          { type: 'section', text: { type: 'mrkdwn', text: `You can now sign in to MetaDash.\n*Username:* \`${username.trim()}\`\n*Temporary password:* \`${password}\`` } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: 'Change this password after signing in if your admin asks you to rotate credentials.' }] },
        ],
      });
    }

    res.status(201).json({ ...sanitizeUser(user), inviteSent: invite?.sent, inviteError: invite?.reason });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: msg });
  }
});

usersRouter.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await getUserById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const updated = await updateUserByAdmin(req.params.id, req.body);
    res.json(sanitizeUser(updated!));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

usersRouter.delete('/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.id === req.params.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    const existing = await getUserById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    await deleteUserByAdmin(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

usersRouter.get('/:id', requireAdmin, async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeUser(user));
});
