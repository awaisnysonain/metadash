import { isDatabaseConfigured, hasDatabaseUrl } from '../db/pool.js';
import { getAllAds } from '../db/repository.js';
import { upsertComment, insertActivityLog, commentExistsByMetaId } from '../db/repository.js';
import { getMetaConfig, isServerDemoMode, validateMetaSync } from './meta.js';
import { fetchAdEffectiveStoryId, fetchStoryComments, type MetaComment } from './meta-graph.js';
import { mapSyncedComment } from './webhook.js';
import { syncErrorMessage } from './meta-sync-service.js';

export interface CommentSyncOutcome {
  ok: boolean;
  synced: number;
  message: string;
  adsProcessed?: number;
  adsSkipped?: number;
  details?: Record<string, unknown>;
}

export interface CommentSyncState {
  lastRunAt: string | null;
  lastRunOk: boolean;
  lastSynced: number;
  lastMessage: string;
  isRunning: boolean;
  nextRunAt: string | null;
}

const BACKFILL_DAYS = 14;
const INCREMENTAL_HOURS = 26;
const AD_BATCH_DELAY_MS = 150;

let syncState: CommentSyncState = {
  lastRunAt: null,
  lastRunOk: false,
  lastSynced: 0,
  lastMessage: '',
  isRunning: false,
  nextRunAt: null,
};

export function getCommentSyncState(): CommentSyncState {
  return { ...syncState };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sinceTimestamp(mode: 'incremental' | 'backfill'): number {
  const now = Date.now();
  if (mode === 'backfill') {
    return Math.floor((now - BACKFILL_DAYS * 24 * 60 * 60 * 1000) / 1000);
  }
  return Math.floor((now - INCREMENTAL_HOURS * 60 * 60 * 1000) / 1000);
}

function commentInRange(createdTime: string | undefined, since: number): boolean {
  if (!createdTime) return true;
  const ts = Math.floor(new Date(createdTime).getTime() / 1000);
  return ts >= since;
}

async function persistMetaComment(
  metaComment: MetaComment,
  ctx: {
    platform: 'facebook' | 'instagram';
    adId: string;
    adName: string;
    adsetName: string;
    campaignName: string;
    storyId: string;
    since: number;
  }
): Promise<boolean> {
  if (!metaComment.id || !metaComment.message?.trim()) return false;

  const createdIso = metaComment.created_time
    ? new Date(metaComment.created_time).toISOString()
    : new Date().toISOString();

  if (!commentInRange(createdIso, ctx.since)) return false;

  const exists = await commentExistsByMetaId(metaComment.id);

  const row = mapSyncedComment({
    platform: ctx.platform,
    commentId: metaComment.id,
    message: metaComment.message,
    fromName: metaComment.from?.name || 'Unknown User',
    fromId: metaComment.from?.id,
    createdTime: createdIso,
    permalinkUrl: metaComment.permalink_url,
    postId: ctx.storyId,
    adId: ctx.adId,
    adName: ctx.adName,
    adsetName: ctx.adsetName,
    campaignName: ctx.campaignName,
  });

  await upsertComment(row);

  if (!exists) {
    await insertActivityLog({
      id: `log-sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      comment_id: row.id,
      user_id: 'system',
      user_name: 'Sync',
      action: 'Comment Synced',
      old_value: '',
      new_value: `Imported from Meta ad ${ctx.adId}`,
      created_at: new Date().toISOString(),
    });
  }

  return true;
}

async function syncCommentsFromMeta(mode: 'incremental' | 'backfill'): Promise<CommentSyncOutcome> {
  if (isServerDemoMode()) {
    return { ok: true, synced: 0, message: 'Demo mode — comment sync skipped' };
  }

  if (!isDatabaseConfigured()) {
    const msg = hasDatabaseUrl()
      ? 'PostgreSQL is not reachable. Start the database or fix DATABASE_URL.'
      : 'DATABASE_URL is not set.';
    return { ok: false, synced: 0, message: msg };
  }

  const check = validateMetaSync();
  if (!check.ok) {
    return { ok: false, synced: 0, message: check.message! };
  }

  const token = getMetaConfig().accessToken?.trim();
  if (!token) {
    return { ok: false, synced: 0, message: 'META_ACCESS_TOKEN is not set.' };
  }

  const ads = await getAllAds();
  if (!ads.length) {
    return {
      ok: true,
      synced: 0,
      message: 'No ads in database. Run Sync Ads first, then sync comments.',
    };
  }

  const since = sinceTimestamp(mode);
  let synced = 0;
  let adsProcessed = 0;
  let adsSkipped = 0;
  const errors: string[] = [];

  for (const ad of ads) {
    try {
      const storyId = await fetchAdEffectiveStoryId(ad.adId, token);
      if (!storyId) {
        adsSkipped++;
        continue;
      }

      const comments = await fetchStoryComments(storyId, token, { since, limit: 100 });

      for (const c of comments) {
        const saved = await persistMetaComment(c, {
          platform: ad.platform,
          adId: ad.adId,
          adName: ad.adName,
          adsetName: ad.adsetName,
          campaignName: ad.campaignName,
          storyId,
          since,
        });
        if (saved) synced++;
      }

      adsProcessed++;
      await sleep(AD_BATCH_DELAY_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${ad.adName}: ${msg}`);
      adsSkipped++;
    }
  }

  const label = mode === 'backfill' ? `${BACKFILL_DAYS}-day backfill` : 'incremental';
  let message = `Comment ${label}: synced ${synced} comment(s) from ${adsProcessed} ad(s).`;
  if (adsSkipped) message += ` Skipped ${adsSkipped} ad(s).`;
  if (errors.length) message += ` ${errors.length} error(s).`;

  return {
    ok: true,
    synced,
    adsProcessed,
    adsSkipped,
    message,
    details: { mode, since, errors: errors.slice(0, 10) },
  };
}

export async function runCommentSync(mode: 'incremental' | 'backfill' = 'incremental'): Promise<CommentSyncOutcome> {
  if (syncState.isRunning) {
    return {
      ok: false,
      synced: 0,
      message: 'Comment sync already in progress. Try again shortly.',
    };
  }

  syncState.isRunning = true;
  syncState.lastMessage = `Running ${mode} comment sync…`;

  try {
    const result = await syncCommentsFromMeta(mode);
    syncState.lastRunAt = new Date().toISOString();
    syncState.lastRunOk = result.ok;
    syncState.lastSynced = result.synced;
    syncState.lastMessage = result.message;
    console.log(`[comment-sync] ${result.message}`);
    return result;
  } catch (err) {
    const { message } = syncErrorMessage(err);
    syncState.lastRunAt = new Date().toISOString();
    syncState.lastRunOk = false;
    syncState.lastSynced = 0;
    syncState.lastMessage = message;
    console.error('[comment-sync] failed:', message);
    return { ok: false, synced: 0, message };
  } finally {
    syncState.isRunning = false;
  }
}

export async function syncCommentsIncremental(): Promise<CommentSyncOutcome> {
  return runCommentSync('incremental');
}

export async function syncCommentsBackfill(): Promise<CommentSyncOutcome> {
  return runCommentSync('backfill');
}

const CRON_INTERVAL_MS = 10 * 60 * 1000;
let cronTimer: ReturnType<typeof setInterval> | null = null;

export function startCommentSyncCron(): void {
  if (isServerDemoMode() || cronTimer) return;

  syncState.nextRunAt = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();

  cronTimer = setInterval(async () => {
    syncState.nextRunAt = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();
    console.log('[comment-sync] Cron: starting incremental sync');
    await runCommentSync('incremental');
    syncState.nextRunAt = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();
  }, CRON_INTERVAL_MS);

  console.log(`[comment-sync] Cron scheduled every ${CRON_INTERVAL_MS / 60000} minutes`);

  // Initial sync shortly after startup (pages + ads first if empty)
  setTimeout(async () => {
    const ads = await getAllAds();
    if (ads.length > 0) {
      console.log('[comment-sync] Startup: running backfill for past 2 weeks');
      await runCommentSync('backfill');
    }
  }, 5000);
}

export function stopCommentSyncCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
}
