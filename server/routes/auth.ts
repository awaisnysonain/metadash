import { Router } from 'express';
import { signToken, ALL_PERMISSIONS } from '../lib/auth.js';
import {
  authenticateDbUser,
  updateUserProfile,
  sanitizeUser,
} from '../db/user-repository.js';
import {
  verifyEnvAdminLogin,
  updateEnvAdminProfile,
  isEnvAdminId,
  buildEnvAdmin,
} from '../lib/env-admin.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { isDatabaseConfigured } from '../db/pool.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const trimmed = username.trim();

    // 1. Admin is always validated from .env — never from the database
    const envAdmin = await verifyEnvAdminLogin(trimmed, password);
    if (envAdmin) {
      const token = signToken(envAdmin);
      return res.json({ token, user: sanitizeUser(envAdmin) });
    }

    // 2. All other users must exist in the database
    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        error: 'Database is not connected. Team member login requires PostgreSQL.',
      });
    }

    const dbUser = await authenticateDbUser(trimmed, password);
    if (!dbUser) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = signToken(dbUser);
    res.json({ token, user: sanitizeUser(dbUser) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  res.json({ user: sanitizeUser(req.user!) });
});

authRouter.patch('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, email, title, bio, avatarUrl } = req.body;

    if (isEnvAdminId(req.user!.id)) {
      const updated = updateEnvAdminProfile({ name, email, title, bio, avatarUrl });
      return res.json({ user: sanitizeUser(updated!) });
    }

    if (!isDatabaseConfigured()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const updated = await updateUserProfile(req.user!.id, { name, email, title, bio, avatarUrl });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

authRouter.get('/permissions', requireAuth, (_req: AuthenticatedRequest, res) => {
  res.json({ permissions: ALL_PERMISSIONS });
});
