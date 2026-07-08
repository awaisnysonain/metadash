import { Router } from 'express';
import {
  syncAdsFromMeta,
  syncPagesFromMeta,
  syncInstagramFromMeta,
  syncCampaignsFromMeta,
  syncErrorMessage,
} from '../lib/meta-sync-service.js';
import {
  syncCommentsIncremental,
  syncCommentsBackfill,
  syncHighSpendCommentsIncremental,
  getCommentSyncState,
} from '../lib/meta-comment-sync.js';
import { getFullSyncJobState, startFullSyncJob } from '../lib/sync-job.js';

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

metaSyncRouter.post('/comments', (_req, res) => handleSync(res, syncCommentsIncremental));

metaSyncRouter.post('/comments/backfill', (_req, res) => handleSync(res, syncCommentsBackfill));

metaSyncRouter.post('/comments/high-spend', (_req, res) => handleSync(res, syncHighSpendCommentsIncremental));

metaSyncRouter.get('/comments/status', (_req, res) => {
  res.json(getCommentSyncState());
});

metaSyncRouter.get('/all/status', (_req, res) => {
  res.json(getFullSyncJobState());
});

metaSyncRouter.post('/all', (req, res) => {
  const asyncMode = req.query.async !== '0' && req.body?.async !== false;
  if (asyncMode) {
    const { accepted, message } = startFullSyncJob();
    if (!accepted) {
      return res.status(409).json({ ok: false, synced: 0, message, job: getFullSyncJobState() });
    }
    return res.status(202).json({
      ok: true,
      synced: 0,
      message,
      job: getFullSyncJobState(),
    });
  }

  void runBlockingFullSync(res);
});

metaSyncRouter.post('/', (req, res) => {
  const asyncMode = req.query.async !== '0' && req.body?.async !== false;
  if (asyncMode) {
    const { accepted, message } = startFullSyncJob();
    if (!accepted) {
      return res.status(409).json({ ok: false, synced: 0, message, job: getFullSyncJobState() });
    }
    return res.status(202).json({
      ok: true,
      synced: 0,
      message,
      job: getFullSyncJobState(),
    });
  }

  void runBlockingFullSync(res);
});

async function runBlockingFullSync(res: import('express').Response): Promise<void> {
  try {
    const pages = await syncPagesFromMeta();
    if (!pages.ok) return sendSyncResult(res, pages);

    const instagram = await syncInstagramFromMeta();
    if (!instagram.ok) return sendSyncResult(res, instagram);

    const ads = await syncAdsFromMeta();
    if (!ads.ok) return sendSyncResult(res, ads);

    const comments = await syncCommentsIncremental();

    sendSyncResult(res, {
      ok: true,
      synced: pages.synced + instagram.synced + ads.synced + comments.synced,
      message: `Full sync complete. ${pages.message} ${instagram.message} ${ads.message} ${comments.message}`,
      details: { pages, instagram, ads, comments },
    });
  } catch (err) {
    const { message, status } = syncErrorMessage(err);
    res.status(status).json({ ok: false, synced: 0, message });
  }
}
