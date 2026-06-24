import { isDatabaseConfigured, hasDatabaseUrl } from '../db/pool.js';
import { getAllAds, upsertComment, insertActivityLog, commentExistsByMetaId, getConfigValue, setConfigValue } from '../db/repository.js';
import { realignCommentPlatformsFromAds } from '../db/sync-repository.js';
import { getPageAccessToken } from '../db/sync-repository.js';
import { getMetaConfig, isServerDemoMode, validateMetaSync, validateMetaAccessToken, metaGraphGet } from './meta.js';
import { getTokenForAccount, getConfiguredMetaAccounts } from './meta-accounts.js';
import { resolveAdStoryId, fetchStoryComments, enrichMetaCommentAuthor, pageIdFromStoryId, resolveCommenterInfo, inferCommentPlatform, type MetaComment } from './meta-graph.js';
import { MetaApiError } from './meta.js';
import { mapSyncedComment } from './webhook.js';
import { syncErrorMessage, syncPagesFromMeta, syncAdsFromMeta } from './meta-sync-service.js';
import { query } from '../db/pool.js';
import { analyzeComment, fallbackAnalyzeComment, type CommentAnalysis } from './ai-analysis.js';
import { sendSlackCommentAlert } from './slack-alerts.js';

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
const INCREMENTAL_FALLBACK_HOURS = 24;
const AD_BATCH_DELAY_MS = 120;
const STUCK_SYNC_MS = 45 * 60 * 1000;
const INCREMENTAL_AD_LIMIT = Math.max(Number(process.env.MAX_COMMENT_SYNC_ADS_PER_RUN || 50), 1);
const AD_CURSOR_CONFIG_KEY = 'comment_sync_ad_cursor';
let syncRunStartedAt: number | null = null;

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

/** Pick a token that can sync comments — tolerates debug_token app-id mismatch for NOBL/FLO tokens. */
async function resolveCommentSyncToken(): Promise<{ token: string; status: Awaited<ReturnType<typeof validateMetaAccessToken>> } | null> {
  const candidates = [
    ...getConfiguredMetaAccounts().map(a => a.accessToken),
    getMetaConfig().accessToken?.trim(),
  ].filter((t): t is string => Boolean(t));

  const unique = [...new Set(candidates)];
  let lastStatus: Awaited<ReturnType<typeof validateMetaAccessToken>> | null = null;

  for (const token of unique) {
    const status = await validateMetaAccessToken(token);
    lastStatus = status;
    if (status.valid && status.canSyncComments) {
      return { token, status };
    }

    if (!status.valid && status.message.includes('App_id')) {
      try {
        await metaGraphGet<{ id?: string }>('/me?fields=id', token);
        const perms = await metaGraphGet<{ data?: Array<{ permission: string; status: string }> }>(
          '/me/permissions',
          token
        );
        const granted = (perms.data ?? []).filter(p => p.status === 'granted').map(p => p.permission);
        const hasPagesReadUserContent = granted.includes('pages_read_user_content');
        if (hasPagesReadUserContent) {
          return {
            token,
            status: {
              ...status,
              valid: true,
              canSyncComments: true,
              hasPagesReadUserContent: true,
              message: 'Token valid for comment sync (account token)',
            },
          };
        }
        lastStatus = {
          ...status,
          message: 'Token works but missing pages_read_user_content permission.',
          hasPagesReadUserContent: false,
          canSyncComments: false,
        };
      } catch {
        /* try next token */
      }
    }
  }

  if (lastStatus) {
    syncState.tokenValid = lastStatus.valid;
    syncState.tokenMessage = lastStatus.message;
  }
  return null;
}

async function sinceTimestamp(mode: 'incremental' | 'backfill'): Promise<number> {
  const now = Date.now();
  if (mode === 'backfill') {
    return Math.floor((now - BACKFILL_DAYS * 24 * 60 * 60 * 1000) / 1000);
  }

  const { rows } = await query<{ last_comment_at: string | null }>(
    `SELECT MAX(created_at)::text AS last_comment_at FROM comments`
  );
  const lastCommentAt = rows[0]?.last_comment_at;
  if (lastCommentAt) {
    // Use a small overlap so delayed Meta comments are not missed between runs.
    return Math.floor((new Date(lastCommentAt).getTime() - 60 * 60 * 1000) / 1000);
  }
  return Math.floor((now - INCREMENTAL_FALLBACK_HOURS * 60 * 60 * 1000) / 1000);
}

async function selectAdsForMode<T>(ads: T[], mode: 'incremental' | 'backfill'): Promise<{ selected: T[]; cursor: number | null }> {
  if (mode === 'backfill' || ads.length <= INCREMENTAL_AD_LIMIT) return { selected: ads, cursor: null };

  const cursor = Math.min(Math.max(await getConfigValue<number>(AD_CURSOR_CONFIG_KEY, 0), 0), ads.length - 1);
  const selected = [...ads.slice(cursor, cursor + INCREMENTAL_AD_LIMIT)];
  if (selected.length < INCREMENTAL_AD_LIMIT) {
    selected.push(...ads.slice(0, INCREMENTAL_AD_LIMIT - selected.length));
  }
  return { selected, cursor: (cursor + selected.length) % ads.length };
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
    adsetMetaId?: string;
    storyId: string;
    since: number;
    pageAccessToken?: string | null;
    accountLabel?: string | null;
    analyzeWithAi: boolean;
    alertNewComment: boolean;
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

  const platform = inferCommentPlatform(ctx.platform, enriched);
  const text = enriched.message || metaComment.message || '';
  const analysis: CommentAnalysis = !exists && ctx.analyzeWithAi
    ? await analyzeComment({
        text,
        platform,
        author: author.name,
        campaignName: ctx.campaignName,
        adName: ctx.adName,
        accountLabel: ctx.accountLabel,
      })
    : fallbackAnalyzeComment({ text, campaignName: ctx.campaignName, adName: ctx.adName, accountLabel: ctx.accountLabel });

  const row = mapSyncedComment({
    platform,
    commentId: enriched.id,
    message: text,
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
    adsetMetaId: ctx.adsetMetaId,
  });
  row.priority = analysis.priority;
  row.sentiment = analysis.sentiment;
  row.tags = analysis.tags;

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

    if (ctx.alertNewComment) {
      const slack = await sendSlackCommentAlert({
        commentId: row.id,
        platform: row.platform,
        author: author.name,
        text,
        createdAt: createdIso,
        commentUrl: row.original_comment_url,
        adName: ctx.adName,
        adId: ctx.adId,
        campaignName: ctx.campaignName,
        analysis,
      });
      if (!slack.sent) console.warn('[slack] comment alert skipped:', slack.reason);
    }
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

  const resolved = await resolveCommentSyncToken();
  if (!resolved) {
    const msg = syncState.tokenMessage || 'No valid Meta token available for comment sync.';
    return {
      ok: false,
      synced: 0,
      message: `Meta access token is invalid or expired. ${msg} Update NOBL_META_ACCESS_TOKEN / FLO_META_ACCESS_TOKEN or META_ACCESS_TOKEN on the server and restart.`,
    };
  }

  const { token: primaryToken, status: tokenStatus } = resolved;
  syncState.tokenValid = tokenStatus.valid;
  syncState.tokenMessage = tokenStatus.message;

  if (!tokenStatus.canSyncComments) {
    return {
      ok: false,
      synced: 0,
      message:
        'Missing pages_read_user_content permission. Ad comment sync requires this permission. In Meta App Dashboard → Permissions, add pages_read_user_content, then regenerate your access token in Graph API Explorer with ads_read, pages_show_list, pages_read_engagement, and pages_read_user_content.',
      details: { tokenStatus },
    };
  }

  // Refresh page tokens only when needed (not on every incremental run — avoids slow/no-op page fetches).
  const pagesResult = mode === 'backfill' ? await syncPagesFromMeta() : null;
  if (pagesResult && !pagesResult.ok) {
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

  const since = await sinceTimestamp(mode);
  let synced = 0;
  let adsProcessed = 0;
  let adsSkipped = 0;
  let adsWithStory = 0;
  const errors: string[] = [];
  const skipReasons: Record<string, number> = { no_story: 0, fetch_error: 0 };

  const { selected: adsToProcess, cursor } = await selectAdsForMode(ads, mode);

  for (const ad of adsToProcess) {
    try {
      if (adsProcessed > 0 && adsProcessed % 25 === 0) {
        syncState.lastMessage = `Comment ${mode}: ${adsProcessed}/${adsToProcess.length} ads processed this run, ${synced} comment(s) synced…`;
      }
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
          campaignMetaId: ad.campaignId,
          adsetMetaId: ad.adsetId,
          storyId,
          since,
          pageAccessToken: pageToken,
          accountLabel: ad.accountLabel,
          analyzeWithAi: mode === 'incremental',
          alertNewComment: mode === 'incremental',
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

  if (cursor != null) {
    await setConfigValue(AD_CURSOR_CONFIG_KEY, cursor);
  }

  const label = mode === 'backfill' ? `${BACKFILL_DAYS}-day backfill` : 'incremental';
  let message = `Comment ${label}: synced ${synced} comment(s) from ${adsProcessed}/${adsToProcess.length} ad(s) in this run (${adsWithStory} with post IDs).`;
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
    details: { mode, since, adBatchSize: adsToProcess.length, totalAds: ads.length, nextCursor: cursor, skipReasons, errors: errors.slice(0, 10), pagesSync: pagesResult?.message },
  };
}

export async function runCommentSync(mode: 'incremental' | 'backfill' = 'incremental'): Promise<CommentSyncOutcome> {
  if (syncState.isRunning) {
    if (syncRunStartedAt && Date.now() - syncRunStartedAt > STUCK_SYNC_MS) {
      console.warn('[comment-sync] Resetting stuck sync flag after timeout');
      syncState.isRunning = false;
      syncRunStartedAt = null;
    } else {
      return {
        ok: false,
        synced: 0,
        message: 'Comment sync already in progress. Try again shortly.',
      };
    }
  }

  syncState.isRunning = true;
  syncRunStartedAt = Date.now();
  syncState.lastMessage = `Running ${mode} comment sync…`;

  try {
    const result = await syncCommentsFromMeta(mode);
    syncState.lastRunAt = new Date().toISOString();
    syncState.lastRunOk = result.ok;
    syncState.lastSynced = result.synced;
    syncState.lastMessage = result.message;
    console.log(`[comment-sync] ${result.message}`);
    if (result.ok) {
      const realigned = await realignCommentPlatformsFromAds();
      if (realigned > 0) {
        console.log(`[comment-sync] Reclassified ${realigned} comment(s) as Instagram`);
      }
    }
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
    syncRunStartedAt = null;
  }
}

export async function syncCommentsIncremental(): Promise<CommentSyncOutcome> {
  return runCommentSync('incremental');
}

export async function syncCommentsBackfill(): Promise<CommentSyncOutcome> {
  return runCommentSync('backfill');
}

const CRON_INTERVAL_MS = 15 * 60 * 1000;
let cronTimer: ReturnType<typeof setInterval> | null = null;

export function startCommentSyncCron(): void {
  if (isServerDemoMode() || cronTimer) return;

  syncState.nextRunAt = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();

  void resolveCommentSyncToken().then(resolved => {
    if (!resolved) {
      console.error(`[comment-sync] ${syncState.tokenMessage || 'No valid token'}`);
      return;
    }
    syncState.tokenValid = resolved.status.valid;
    syncState.tokenMessage = resolved.status.message;
  });

  cronTimer = setInterval(async () => {
    syncState.nextRunAt = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();
    const resolved = await resolveCommentSyncToken();
    if (!resolved?.status.canSyncComments) {
      console.warn('[comment-sync] Cron skipped — no valid token for comment sync');
      return;
    }
    syncState.tokenValid = resolved.status.valid;
    syncState.tokenMessage = resolved.status.message;
    console.log('[comment-sync] Cron: starting incremental sync');
    await runCommentSync('incremental');
    syncState.nextRunAt = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();
  }, CRON_INTERVAL_MS);

  console.log(`[comment-sync] Cron scheduled every ${CRON_INTERVAL_MS / 60000} minutes`);

  console.log('[comment-sync] Startup sync disabled; cron will run the next safe incremental batch.');
}

export function stopCommentSyncCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
}
