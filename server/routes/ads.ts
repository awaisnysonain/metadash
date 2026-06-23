import { Router } from 'express';
import { getAllAds } from '../db/repository.js';
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
