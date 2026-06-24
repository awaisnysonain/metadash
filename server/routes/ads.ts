import { Router } from 'express';
import { getAllAds, getAdsSummaries, getAdById } from '../db/repository.js';
import { getTopAdsBySpend } from '../db/sync-repository.js';
import { isDatabaseConfigured } from '../db/pool.js';

export const adsRouter = Router();

adsRouter.get('/', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const summary = req.query.summary === '1' || req.query.summary === 'true';
    res.json(summary ? await getAdsSummaries() : await getAllAds());
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

adsRouter.get('/:id', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const ad = await getAdById(req.params.id);
    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
