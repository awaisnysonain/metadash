import { Router } from 'express';
import { getAllConnectedPages } from '../db/sync-repository.js';
import { isDatabaseConfigured } from '../db/pool.js';

export const pagesRouter = Router();

pagesRouter.get('/', async (_req, res) => {
  try {
    if (!isDatabaseConfigured()) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const pages = await getAllConnectedPages();
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
