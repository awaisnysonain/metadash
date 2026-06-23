import { Router } from 'express';
import {
  syncAdsFromMeta,
  syncPagesFromMeta,
  syncInstagramFromMeta,
  syncCampaignsFromMeta,
  syncAllFromMeta,
  syncErrorMessage,
} from '../lib/meta-sync-service.js';

export const metaSyncRouter = Router();

function sendSyncResult(res: import('express').Response, result: Awaited<ReturnType<typeof syncAdsFromMeta>>) {
  const status = result.ok ? 200 : 400;
  res.status(status).json(result);
}

async function handleSync(
  res: import('express').Response,
  fn: () => Promise<Awaited<ReturnType<typeof syncAdsFromMeta>>>
) {
  try {
    const result = await fn();
    sendSyncResult(res, result);
  } catch (err) {
    const { message, status } = syncErrorMessage(err);
    res.status(status).json({ ok: false, synced: 0, message });
  }
}

metaSyncRouter.post('/ads', (_req, res) => handleSync(res, syncAdsFromMeta));

metaSyncRouter.post('/pages', (_req, res) => handleSync(res, syncPagesFromMeta));

metaSyncRouter.post('/instagram', (_req, res) => handleSync(res, syncInstagramFromMeta));

metaSyncRouter.post('/campaigns', (_req, res) => handleSync(res, syncCampaignsFromMeta));

metaSyncRouter.post('/all', (_req, res) => handleSync(res, syncAllFromMeta));

// Legacy alias
metaSyncRouter.post('/', (_req, res) => handleSync(res, syncAllFromMeta));
