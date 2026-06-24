import { isDatabaseConfigured, hasDatabaseUrl } from '../db/pool.js';
import { getAllAds, upsertComment, insertActivityLog, commentExistsByMetaId } from '../db/repository.js';
import { getPageAccessToken } from '../db/sync-repository.js';
import { getMetaConfig, isServerDemoMode, validateMetaSync, validateMetaAccessToken } from './meta.js';
import { getTokenForAccount, getConfiguredMetaAccounts } from './meta-accounts.js';
import { resolveAdStoryId, fetchStoryComments, enrichMetaCommentAuthor, pageIdFromStoryId, resolveCommenterInfo, type MetaComment } from './meta-graph.js';
import { MetaApiError } from './meta.js';
import { mapSyncedComment } from './webhook.js';
import { syncErrorMessage, syncPagesFromMeta, syncAdsFromMeta } from './meta-sync-service.js';
import { query } from '../db/pool.js';

export interface CommentSyncOutcome {
  ok: boolean;
  synced: number;
  message: string;
  adsProcessed?: number;
  adsSkipped?: number;
  adsWithStory?: number;
  details?: Record<string, unknown>;
}

export interface CommentSyncState {
  lastRunAt: string | null;
  lastRunOk: boolean;
  lastSynced: number;
  lastMessage: string;
  isRunning: boolean;
  nextRunAt: string | null;
  tokenValid: boolean;
  tokenMessage: string;
}

const BACKFILL_DAYS = 730;
const INCREMENTAL_HOURS = 26;
const AD_BATCH_DELAY_MS = 120;

let syncState: CommentSyncState = {
  lastRunAt: null,
  lastRunOk: false,
  lastSynced: 0,
  lastMessage: '',
  isRunning: false,
  nextRunAt: null,
  tokenValid: true,
  tokenMessage: '',
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

async function saveAdStoryId(adDbId: string, storyId: string): Promise<void> {
  await query('UPDATE ads SET post_story_id = $1 WHERE id = $2 AND (post_story_id IS NULL OR post_story_id = \'\')', [
    storyId,
    adDbId,
  ]);
}

async function persistMetaComment(
  metaComment: MetaComment,
  ctx: {
    platform: 'facebook' | 'instagram';
    adId: string;
    adName: string;
    adsetName: string;
    campaignName: string;
    campaignMetaId?: string;
    storyId: string;
    since: number;
    pageAccessToken?: string | null;
  }
): Promise<boolean> {
  if (!metaComment.id || !metaComment.message?.trim()) return false;

  const createdIso = metaComment.created_time
    ? new Date(metaComment.created_time).toISOString()
    : new Date().toISOString();

  if (!commentInRange(createdIso, ctx.since)) return false;

  const exists = await commentExistsByMetaId(metaComment.id);

  const enriched = await enrichMetaCommentAuthor(metaComment, ctx.pageAccessToken);
  const author = resolveCommenterInfo(enriched.from, enriched.username);

  const row = mapSyncedComment({
    platform: ctx.platform,
    commentId: enriched.id,
    message: enriched.message || metaComment.message || '',
    fromName: author.name,
    fromId: author.id,
    profileUrl: author.profileUrl,
    createdTime: createdIso,
    permalinkUrl: enriched.permalink_url || metaComment.permalink_url,
    postId: ctx.storyId,
    adId: ctx.adId,
    adName: ctx.adName,
    adsetName: ctx.adsetName,
    campaignName: ctx.campaignName,
    campaignMetaId: ctx.campaignMetaId,
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

  const tokenStatus = await validateMetaAccessToken(
    getConfiguredMetaAccounts()[0]?.accessToken || getMetaConfig().accessToken
  );
  syncState.tokenValid = tokenStatus.valid;
  syncState.tokenMessage = tokenStatus.message;

  if (!tokenStatus.valid) {
    return {
      ok: false,
      synced: 0,
      message: `Meta access token is invalid or expired. ${tokenStatus.message} Generate a new token in Meta Graph API Explorer (app ${tokenStatus.appId ?? 'your app'}), then update META_ACCESS_TOKEN on the server and restart.`,
      details: { tokenStatus },
    };
  }

  if (!tokenStatus.hasPagesReadUserContent) {
    return {
      ok: false,
      synced: 0,
      message:
        'Missing pages_read_user_content permission. Ad comment sync requires this permission. In Meta App Dashboard → Permissions, add pages_read_user_content, then regenerate your access token in Graph API Explorer with ads_read, pages_show_list, pages_read_engagement, and pages_read_user_content.',
      details: { tokenStatus },
    };
  }

  const primaryToken = getConfiguredMetaAccounts()[0]?.accessToken || getMetaConfig().accessToken?.trim();
  if (!primaryToken) {
    return { ok: false, synced: 0, message: 'No Meta access token configured.' };
  }

  // Refresh page tokens for comment reads
  const pagesResult = await syncPagesFromMeta();
  if (!pagesResult.ok) {
    console.warn('[comment-sync] Page sync warning:', pagesResult.message);
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
  let adsWithStory = 0;
  const errors: string[] = [];
  const skipReasons: Record<string, number> = { no_story: 0, fetch_error: 0 };

  for (const ad of ads) {
    try {
      const adToken = ad.metaAccountId ? getTokenForAccount(ad.metaAccountId) : getMetaConfig().accessToken?.trim();
      const token = adToken ?? getMetaConfig().accessToken?.trim();
      if (!token) continue;

      let storyId = ad.postStoryId?.trim() || null;
      let pageId = pageIdFromStoryId(storyId);

      if (!storyId) {
        const resolved = await resolveAdStoryId(ad.adId, token);
        storyId = resolved.storyId;
        pageId = resolved.pageId;
        if (storyId) {
          await saveAdStoryId(ad.id, storyId);
        }
      }

      if (!storyId) {
        adsSkipped++;
        skipReasons.no_story++;
        continue;
      }

      adsWithStory++;
      const pageToken = pageId ? await getPageAccessToken(pageId) : null;

      const comments = await fetchStoryComments(storyId, token, {
        since,
        limit: 100,
        pageAccessToken: pageToken,
      });

      for (const c of comments) {
        const saved = await persistMetaComment(c, {
          platform: ad.platform,
          adId: ad.adId,
          adName: ad.adName,
          adsetName: ad.adsetName,
          campaignName: ad.campaignName,
          campaignMetaId: ad.campaignName,
          storyId,
          since,
          pageAccessToken: pageToken,
        });
        if (saved) synced++;
      }

      adsProcessed++;
      await sleep(AD_BATCH_DELAY_MS);
    } catch (err) {
      if (err instanceof MetaApiError && err.code === 190) {
        // Re-check if user token is globally invalid vs. a single ad/post permission issue
        const recheck = await validateMetaAccessToken();
        if (!recheck.valid) {
          syncState.tokenValid = false;
          syncState.tokenMessage = recheck.message;
          return {
            ok: false,
            synced,
            message: `Meta token expired during sync. ${recheck.message}`,
            adsProcessed,
            adsSkipped,
            adsWithStory,
          };
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${ad.adName}: ${msg}`);
      adsSkipped++;
      skipReasons.fetch_error++;
    }
  }

  const label = mode === 'backfill' ? `${BACKFILL_DAYS}-day backfill` : 'incremental';
  let message = `Comment ${label}: synced ${synced} comment(s) from ${adsProcessed} ad(s) (${adsWithStory} with post IDs).`;
  if (adsSkipped) {
    message += ` Skipped ${adsSkipped} ad(s)`;
    if (skipReasons.no_story) message += ` (${skipReasons.no_story} without post story ID)`;
    message += '.';
  }
  if (errors.length) message += ` ${errors.length} fetch error(s).`;

  return {
    ok: true,
    synced,
    adsProcessed,
    adsSkipped,
    adsWithStory,
    message,
    details: { mode, since, skipReasons, errors: errors.slice(0, 10), pagesSync: pagesResult.message },
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

  void validateMetaAccessToken().then(status => {
    syncState.tokenValid = status.valid;
    syncState.tokenMessage = status.message;
    if (!status.valid) {
      console.error(`[comment-sync] ${status.message}`);
    }
  });

  cronTimer = setInterval(async () => {
    syncState.nextRunAt = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();
    const status = await validateMetaAccessToken();
    syncState.tokenValid = status.valid;
    syncState.tokenMessage = status.message;
    if (!status.valid) {
      console.warn('[comment-sync] Cron skipped — invalid Meta token');
      return;
    }
    console.log('[comment-sync] Cron: starting incremental sync');
    await runCommentSync('incremental');
    syncState.nextRunAt = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();
  }, CRON_INTERVAL_MS);

  console.log(`[comment-sync] Cron scheduled every ${CRON_INTERVAL_MS / 60000} minutes`);

  setTimeout(async () => {
    try {
      const status = await validateMetaAccessToken();
      syncState.tokenValid = status.valid;
      syncState.tokenMessage = status.message;
      if (!status.valid) {
        console.error('[comment-sync] Startup skipped — Meta token invalid:', status.message);
        return;
      }

      let ads = await getAllAds();
      if (!ads.length) {
        console.log('[comment-sync] No ads in DB — syncing pages and ads first');
        await syncPagesFromMeta();
        await syncAdsFromMeta();
        ads = await getAllAds();
      }
      if (ads.length > 0) {
        console.log('[comment-sync] Startup: running 2-week comment backfill');
        await runCommentSync('backfill');
      } else {
        console.warn('[comment-sync] Still no ads after sync — check META_ACCESS_TOKEN permissions');
      }
    } catch (err) {
      console.error('[comment-sync] Startup bootstrap failed:', err);
    }
  }, 10000);
}

export function stopCommentSyncCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
}
