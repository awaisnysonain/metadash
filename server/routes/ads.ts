import { Router } from 'express';
import { getAllAds } from '../db/repository.js';
import { getTopAdsBySpend } from '../db/sync-repository.js';
import { isDatabaseConfigured } from '../db/pool.js';

export const adsRouter = Router();

adsRouter.get('/', async (_req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    res.json(await getAllAds());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

adsRouter.get('/top-by-spend', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    res.json(await getTopAdsBySpend(limit));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
