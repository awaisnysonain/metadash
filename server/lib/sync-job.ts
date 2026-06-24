import {
  syncPagesFromMeta,
  syncInstagramFromMeta,
  syncAdsFromMeta,
  syncErrorMessage,
} from './meta-sync-service.js';
import { syncCommentsIncremental } from './meta-comment-sync.js';

export interface FullSyncJobState {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  ok: boolean | null;
  message: string;
  synced: number;
  details?: Record<string, unknown>;
}

let jobState: FullSyncJobState = {
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  ok: null,
  message: '',
  synced: 0,
};

export function getFullSyncJobState(): FullSyncJobState {
  return { ...jobState };
}

export function startFullSyncJob(): { accepted: boolean; message: string } {
  if (jobState.isRunning) {
    return { accepted: false, message: 'Full sync already in progress. Check /api/meta/sync/all/status.' };
  }

  jobState = {
    isRunning: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: null,
    message: 'Full sync started in background…',
    synced: 0,
  };

  void runFullSyncJob();
  return { accepted: true, message: 'Full sync started in background.' };
}

async function runFullSyncJob(): Promise<void> {
  try {
    const pages = await syncPagesFromMeta();
    if (!pages.ok) {
      jobState = {
        ...jobState,
        isRunning: false,
        finishedAt: new Date().toISOString(),
        ok: false,
        message: pages.message,
        synced: pages.synced,
        details: { pages },
      };
      return;
    }

    const instagram = await syncInstagramFromMeta();
    if (!instagram.ok) {
      jobState = {
        ...jobState,
        isRunning: false,
        finishedAt: new Date().toISOString(),
        ok: false,
        message: instagram.message,
        synced: pages.synced + instagram.synced,
        details: { pages, instagram },
      };
      return;
    }

    const ads = await syncAdsFromMeta();
    if (!ads.ok) {
      jobState = {
        ...jobState,
        isRunning: false,
        finishedAt: new Date().toISOString(),
        ok: false,
        message: ads.message,
        synced: pages.synced + instagram.synced + ads.synced,
        details: { pages, instagram, ads },
      };
      return;
    }

    const comments = await syncCommentsIncremental();
    jobState = {
      isRunning: false,
      startedAt: jobState.startedAt,
      finishedAt: new Date().toISOString(),
      ok: comments.ok,
      message: `Full sync complete. ${pages.message} ${instagram.message} ${ads.message} ${comments.message}`,
      synced: pages.synced + instagram.synced + ads.synced + comments.synced,
      details: { pages, instagram, ads, comments },
    };
  } catch (err) {
    const { message } = syncErrorMessage(err);
    jobState = {
      ...jobState,
      isRunning: false,
      finishedAt: new Date().toISOString(),
      ok: false,
      message,
    };
  }
}
