import { Router } from 'express';
import {
  getAllConnectedAdAccounts,
  getAllConnectedPages,
  getAllInstagramAccounts,
  getTopAdsBySpend,
} from '../db/sync-repository.js';
import { isDatabaseConfigured } from '../db/pool.js';

export const accountsRouter = Router();

accountsRouter.get('/', async (_req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });

    const [adAccounts, pages, instagram, topAds] = await Promise.all([
      getAllConnectedAdAccounts(),
      getAllConnectedPages(),
      getAllInstagramAccounts(),
      getTopAdsBySpend(15),
    ]);

    res.json({ adAccounts, pages, instagram, topAds });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

accountsRouter.get('/top-ads', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    res.json(await getTopAdsBySpend(limit));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
