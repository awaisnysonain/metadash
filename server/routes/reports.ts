import { Router } from 'express';
import { getReportsSummary } from '../db/repository.js';

export const reportsRouter = Router();

reportsRouter.get('/summary', async (_req, res) => {
  try {
    const summary = await getReportsSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
