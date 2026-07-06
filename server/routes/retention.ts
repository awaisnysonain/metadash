import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getRetentionStatus,
  setRetentionDays,
  runRetentionSweep,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
} from '../lib/comment-retention.js';

export const retentionRouter = Router();

const OWNER_USERNAME = (process.env.RETENTION_OWNER_USERNAME || 'oh.awais').trim().toLowerCase();

function isOwner(req: AuthenticatedRequest): boolean {
  const user = req.user;
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.username ?? '').trim().toLowerCase() === OWNER_USERNAME;
}

/** Anyone authenticated can read the current status (used by the UI to know if the section shows). */
retentionRouter.get('/', async (_req, res) => {
  try {
    const status = await getRetentionStatus();
    res.json({ ...status, ownerUsername: OWNER_USERNAME });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Only the configured owner (or an admin) can change the retention window. */
retentionRouter.patch('/', async (req: AuthenticatedRequest, res) => {
  if (!isOwner(req)) {
    return res.status(403).json({ error: 'Only the retention owner can change this setting.' });
  }
  const raw = req.body?.days;
  const days = Number(raw);
  if (!Number.isFinite(days)) {
    return res.status(400).json({ error: '`days` must be a number.' });
  }
  if (days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
    return res.status(400).json({ error: `Retention must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS} days.` });
  }
  try {
    const applied = await setRetentionDays(days);
    const status = await getRetentionStatus();
    res.json({ ...status, ownerUsername: OWNER_USERNAME, applied });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Force a sweep now — owner/admin only. Handy after changing the window. */
retentionRouter.post('/run', async (req: AuthenticatedRequest, res) => {
  if (!isOwner(req)) {
    return res.status(403).json({ error: 'Only the retention owner can trigger the sweep.' });
  }
  try {
    const result = await runRetentionSweep();
    const status = await getRetentionStatus();
    res.json({ ...status, ownerUsername: OWNER_USERNAME, justRan: result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
