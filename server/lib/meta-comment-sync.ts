import { isDatabaseConfigured, hasDatabaseUrl } from '../db/pool.js';
import { getAdsForCommentSync, upsertComment, insertActivityLog, commentExistsByMetaId, getCommentByMetaId, updateCommentStatus, getConfigValue, setConfigValue } from '../db/repository.js';
import {
  realignCommentPlatformsFromAds,
  getPageAccessToken,
  getConnectedPageInfo,
  getConnectedInstagramInfo,
  findAdByInstagramMediaId,
  findAdByPostStoryId,
  getConnectedInstagramAccountsForSync,
  getConnectedPagesForOrganicSync,
  type AdLookupRow,
} from '../db/sync-repository.js';
import { getMetaConfig, isServerDemoMode, validateMetaSync, validateMetaAccessToken, metaGraphGet } from './meta.js';
import { getTokensForAccount, getConfiguredMetaAccounts } from './meta-accounts.js';
import { resolveAdStoryId, resolveAdInstagramMediaId, fetchInstagramMediaDetails, fetchInstagramMediaPermalink, fetchStoryComments, fetchInstagramMediaComments, fetchInstagramAccountRecentMedia, fetchPageRecentPosts, enrichMetaCommentAuthor, pageIdFromStoryId, resolveCommenterInfo, inferCommentPlatform, type MetaComment } from './meta-graph.js';
import { isIgnoredPageId } from './ignore-list.js';
import { MetaApiError } from './meta.js';
import { mapSyncedComment } from './webhook.js';
import { syncErrorMessage, syncPagesFromMeta, syncAdsFromMeta } from './meta-sync-service.js';
import { query } from '../db/pool.js';
import { fallbackAnalyzeComment, type CommentAnalysis } from './ai-analysis.js';
import { resolveBrandCode } from './brand.js';
import { enqueueCommentEnrichment } from './comment-enrichment-queue.js';
import { getBrandIgUsernames, isBrandIgUsername, isOrganicIgBrandOnly } from './brand-ig.js';

type SyncAd = Awaited<ReturnType<typeof getAdsForCommentSync>>[number];

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
  highSpendPoll: {
    enabled: boolean;
    intervalMinutes: number;
    adsPerBrand: number;
    lastRunAt: string | null;
    lastRunOk: boolean;
    lastSynced: number;
    lastMessage: string;
    isRunning: boolean;
    nextRunAt: string | null;
  };
}

export interface TargetedCommentSyncOptions {
  accountLabel?: string;
  adIds?: string[];
  limit?: number;
  sinceDays?: number;
  analyzeWithAi?: boolean;
  alertNewComment?: boolean;
}

interface ProcessAdsContext {
  modeLabel: string;
  since: number;
  until?: number;
  adWatermarks?: Record<string, string>;
  analyzeWithAi: boolean;
  alertNewComment: boolean;
  updateProgress?: boolean;
  adConcurrency?: number;
}

interface ProcessAdsResult {
  synced: number;
  adsProcessed: number;
  adsSkipped: number;
  adsWithStory: number;
  adsChecked: number;
  skipReasons: Record<string, number>;
  errors: string[];
  /** Ads that hit fetch errors — eligible for a same-run retry without advancing watermarks. */
  failedAds: SyncAd[];
}

interface ParallelProcessAdsResult extends ProcessAdsResult {
  laneCount: number;
  laneSizes: number[];
}

interface TokenLane {
  key: string;
  ads: SyncAd[];
}

interface AdsSelection {
  selected: SyncAd[];
  cursor: number | null;
  tokenLaneCursors?: Record<string, number>;
  laneSizes?: number[];
  pinnedHighSpendCount?: number;
}

const BACKFILL_DAYS = 730;
const INCREMENTAL_FALLBACK_HOURS = Math.max(Number(process.env.COMMENT_SYNC_INCREMENTAL_LOOKBACK_HOURS || 168), 1);
const CRON_ALERT_MAX_AGE_HOURS = Math.max(Number(process.env.COMMENT_SYNC_ALERT_MAX_AGE_HOURS || 2), 0);
const AD_BATCH_DELAY_MS = Math.max(Number(process.env.COMMENT_SYNC_AD_DELAY_MS || 60), 0);
const PARALLEL_TOKEN_LANES = process.env.COMMENT_SYNC_PARALLEL_TOKEN_LANES !== 'false';
const PER_TOKEN_AD_LIMIT = Math.max(Number(process.env.MAX_COMMENT_SYNC_ADS_PER_TOKEN_PER_RUN || process.env.MAX_COMMENT_SYNC_ADS_PER_RUN || 75), 1);
const AD_CONCURRENCY_PER_TOKEN = Math.min(Math.max(Number(process.env.COMMENT_SYNC_AD_CONCURRENCY_PER_TOKEN || 3), 1), 8);
const INSTAGRAM_PRIORITY_AD_LIMIT = Math.max(Number(process.env.COMMENT_SYNC_INSTAGRAM_PRIORITY_ADS_PER_TOKEN_PER_RUN || PER_TOKEN_AD_LIMIT), 0);
const REGULAR_ADS_PER_TOKEN_RESERVE = Math.min(Math.max(Number(process.env.COMMENT_SYNC_REGULAR_ADS_PER_TOKEN_RESERVE || 10), 0), PER_TOKEN_AD_LIMIT);
const HIGH_SPEND_PINNED_ADS_PER_BRAND = Math.max(Number(process.env.COMMENT_SYNC_HIGH_SPEND_ADS_PER_BRAND || 10), 0);
const HIGH_SPEND_POLL_ENABLED = process.env.COMMENT_SYNC_HIGH_SPEND_POLL !== 'false';
const HIGH_SPEND_POLL_INTERVAL_MS = Math.max(Number(process.env.COMMENT_SYNC_HIGH_SPEND_INTERVAL_MINUTES || 3), 1) * 60 * 1000;
const HIGH_SPEND_SKIP_DURING_FULL = process.env.COMMENT_SYNC_HIGH_SPEND_SKIP_DURING_FULL !== 'false';
const HIGH_SPEND_AD_CONCURRENCY = Math.min(Math.max(Number(process.env.COMMENT_SYNC_HIGH_SPEND_AD_CONCURRENCY || 2), 1), 8);
const FACEBOOK_WATERMARK_OVERLAP_SECONDS = Math.max(Number(process.env.COMMENT_SYNC_WATERMARK_OVERLAP_MINUTES || 60), 0) * 60;
const INSTAGRAM_WATERMARK_OVERLAP_SECONDS = Math.max(Number(process.env.COMMENT_SYNC_INSTAGRAM_WATERMARK_OVERLAP_HOURS || 24), 0) * 60 * 60;
const INSTAGRAM_INITIAL_LOOKBACK_SECONDS = Math.max(Number(process.env.COMMENT_SYNC_INSTAGRAM_LOOKBACK_HOURS || 168), 1) * 60 * 60;
const STUCK_SYNC_MS = 45 * 60 * 1000;
const INCREMENTAL_AD_LIMIT = Math.max(Number(process.env.MAX_COMMENT_SYNC_ADS_PER_RUN || 75), 1);
// When true, every FB-classified ad also gets a one-shot IG media probe so we discover
// mixed-placement ads and Reels ads that carry IG comments even though the ad row says facebook.
const IG_DISCOVERY_FOR_FB_ADS = process.env.COMMENT_SYNC_IG_DISCOVERY !== 'false';

// --- Organic sync tuning ------------------------------------------------------
// Comments on organic (non-ad) posts published by connected IG accounts / FB pages.
// Without this, spark-ads, whitelisted posts, and plain organic posts never make it
// into the inbox because the ad-driven sync only visits post IDs that exist in `ads`.
const ORGANIC_SYNC_ENABLED = process.env.COMMENT_SYNC_ORGANIC !== 'false';
const ORGANIC_LOOKBACK_HOURS = Math.max(Number(process.env.COMMENT_SYNC_ORGANIC_LOOKBACK_HOURS || 72), 1);
const ORGANIC_MEDIA_PER_ACCOUNT = Math.min(Math.max(Number(process.env.COMMENT_SYNC_ORGANIC_MEDIA_PER_ACCOUNT || 25), 1), 100);
const ORGANIC_ACCOUNT_CONCURRENCY = Math.min(Math.max(Number(process.env.COMMENT_SYNC_ORGANIC_CONCURRENCY || 3), 1), 8);
const ORGANIC_IG_BRAND_ONLY = isOrganicIgBrandOnly();
const FULL_COVERAGE_AD_LIMIT = Math.max(Number(process.env.COMMENT_SYNC_FULL_COVERAGE_AD_LIMIT || 5000), 1);
const FULL_COVERAGE_MODE = process.env.COMMENT_SYNC_FULL_COVERAGE !== 'false';
const AD_CURSOR_CONFIG_KEY = 'comment_sync_ad_cursor';
const TOKEN_CURSOR_CONFIG_KEY = 'comment_sync_token_lane_cursors';
const AD_WATERMARKS_CONFIG_KEY = 'comment_sync_ad_watermarks';
let syncRunStartedAt: number | null = null;
let highSpendSyncRunning = false;
let highSpendRunStartedAt: number | null = null;
let highSpendCronTimer: ReturnType<typeof setInterval> | null = null;

const highSpendPollState = {
  lastRunAt: null as string | null,
  lastRunOk: false,
  lastSynced: 0,
  lastMessage: '',
  nextRunAt: null as string | null,
};

let syncState: CommentSyncState = {
  lastRunAt: null,
  lastRunOk: false,
  lastSynced: 0,
  lastMessage: '',
  isRunning: false,
  nextRunAt: null,
  tokenValid: true,
  tokenMessage: '',
  highSpendPoll: {
    enabled: HIGH_SPEND_POLL_ENABLED,
    intervalMinutes: HIGH_SPEND_POLL_INTERVAL_MS / 60000,
    adsPerBrand: HIGH_SPEND_PINNED_ADS_PER_BRAND,
    lastRunAt: null,
    lastRunOk: false,
    lastSynced: 0,
    lastMessage: '',
    isRunning: false,
    nextRunAt: null,
  },
};

export function getCommentSyncState(): CommentSyncState {
  return {
    ...syncState,
    highSpendPoll: {
      ...syncState.highSpendPoll,
      isRunning: highSpendSyncRunning,
      lastRunAt: highSpendPollState.lastRunAt,
      lastRunOk: highSpendPollState.lastRunOk,
      lastSynced: highSpendPollState.lastSynced,
      lastMessage: highSpendPollState.lastMessage,
      nextRunAt: highSpendPollState.nextRunAt,
    },
  };
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

function normalizedBrandLabel(ad: SyncAd): 'NOBL' | 'FLO' | null {
  return resolveBrandCode({
    accountLabel: ad.accountLabel,
    campaignName: ad.campaignName,
    adName: ad.adName,
  });
}

function highSpendScore(ad: SyncAd): number {
  return Number(ad.recentSpend ?? 0) || Number(ad.spend ?? 0) || 0;
}

function getPinnedHighSpendAds(ads: SyncAd[]): SyncAd[] {
  if (HIGH_SPEND_PINNED_ADS_PER_BRAND <= 0) return [];

  const pinned: SyncAd[] = [];
  for (const brand of ['NOBL', 'FLO'] as const) {
    pinned.push(
      ...ads
        .filter(ad => normalizedBrandLabel(ad) === brand && highSpendScore(ad) > 0)
        .sort((a, b) => highSpendScore(b) - highSpendScore(a))
        .slice(0, HIGH_SPEND_PINNED_ADS_PER_BRAND)
    );
  }

  const seen = new Set<string>();
  return pinned.filter(ad => {
    const key = ad.id || ad.adId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueAds(ads: SyncAd[]): SyncAd[] {
  const seen = new Set<string>();
  return ads.filter(ad => {
    const key = ad.id || ad.adId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function selectAdsForMode(ads: SyncAd[], mode: 'incremental' | 'backfill'): Promise<AdsSelection> {
  if (mode === 'backfill' || ads.length <= INCREMENTAL_AD_LIMIT) return { selected: ads, cursor: null, pinnedHighSpendCount: 0 };

  const pinnedHighSpendAds = getPinnedHighSpendAds(ads);
  const pinnedIds = new Set(pinnedHighSpendAds.map(ad => ad.id || ad.adId));
  const rotatingAds = ads.filter(ad => !pinnedIds.has(ad.id || ad.adId));
  if (rotatingAds.length === 0) return { selected: pinnedHighSpendAds, cursor: null, pinnedHighSpendCount: pinnedHighSpendAds.length };

  const cursor = Math.min(Math.max(await getConfigValue<number>(AD_CURSOR_CONFIG_KEY, 0), 0), rotatingAds.length - 1);
  const selected = [...rotatingAds.slice(cursor, cursor + INCREMENTAL_AD_LIMIT)];
  if (selected.length < INCREMENTAL_AD_LIMIT) {
    selected.push(...rotatingAds.slice(0, INCREMENTAL_AD_LIMIT - selected.length));
  }
  return {
    selected: uniqueAds([...pinnedHighSpendAds, ...selected]),
    cursor: (cursor + selected.length) % rotatingAds.length,
    pinnedHighSpendCount: pinnedHighSpendAds.length,
  };
}

function selectFromCursor<T>(items: T[], limit: number, cursor: number): T[] {
  const selected = [...items.slice(cursor, cursor + limit)];
  if (selected.length < limit) selected.push(...items.slice(0, limit - selected.length));
  return selected;
}

function isRecentEnoughForAlert(createdTime: string): boolean {
  if (CRON_ALERT_MAX_AGE_HOURS <= 0) return true;
  const createdMs = new Date(createdTime).getTime();
  if (Number.isNaN(createdMs)) return false;
  return Date.now() - createdMs <= CRON_ALERT_MAX_AGE_HOURS * 60 * 60 * 1000;
}

function watermarkToSince(value: string | undefined, fallback: number, overlapSeconds = 0): number {
  if (!value) return fallback;
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return fallback;
  return Math.max(0, Math.floor(ms / 1000) - overlapSeconds);
}

function watermarkKey(ad: SyncAd, platform: 'facebook' | 'instagram'): string {
  return `${ad.id}:${platform}`;
}

function shouldPrioritizeInstagramAd(ad: SyncAd): boolean {
  return ad.platform === 'instagram' || Boolean(ad.instagramMediaId?.trim());
}

// Whether to attempt an IG comment fetch even for ads we currently believe are FB-only.
// Cheap one-shot probe: resolveAdInstagramMediaId returns null quickly for non-IG creatives,
// so the extra work only pays off on the first successful probe (media ID gets persisted).
function shouldProbeInstagramAd(ad: SyncAd): boolean {
  if (shouldPrioritizeInstagramAd(ad)) return true;
  return IG_DISCOVERY_FOR_FB_ADS;
}

function normalizeAuthorKey(value?: string | null): string {
  return String(value || '').trim().replace(/^@+/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

async function isConnectedAssetAuthor(authorName?: string | null, authorId?: string | null): Promise<boolean> {
  const key = normalizeAuthorKey(authorName);
  const id = String(authorId || '').trim();
  if (!key && !id) return false;

  const { rows } = await query<{ exists: number }>(
    `SELECT 1 AS exists
     FROM connected_instagram_accounts
     WHERE ($2 <> '' AND account_id = $2)
        OR ($1 <> '' AND LOWER(REGEXP_REPLACE(COALESCE(username, ''), '[^a-zA-Z0-9]', '', 'g')) = $1)
     UNION ALL
     SELECT 1 AS exists
     FROM connected_pages
     WHERE ($2 <> '' AND page_id = $2)
        OR ($1 <> '' AND LOWER(REGEXP_REPLACE(COALESCE(name, ''), '[^a-zA-Z0-9]', '', 'g')) = $1)
     LIMIT 1`,
    [key, id]
  );

  return rows.length > 0;
}

async function applyBrandReplyToParent(parentCommentId: string, authorName: string): Promise<boolean> {
  const parent = await getCommentByMetaId(parentCommentId);
  if (!parent) return false;

  const now = new Date().toISOString();
  if (parent.status !== 'Replied') {
    await updateCommentStatus(parent.id, 'Replied', { repliedAt: now });
    await insertActivityLog({
      id: `log-sync-reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      comment_id: parent.id,
      user_id: 'system',
      user_name: 'Sync',
      action: 'Meta Reply Detected',
      old_value: parent.status,
      new_value: `Reply by ${authorName || 'connected asset'} on Meta`,
      created_at: now,
    });
  }

  return true;
}

function platformSince(
  ctx: ProcessAdsContext,
  ad: SyncAd,
  platform: 'facebook' | 'instagram'
): number {
  if (!ctx.adWatermarks) return ctx.since;

  const key = watermarkKey(ad, platform);
  const fallback = platform === 'instagram' && ctx.until
    ? Math.min(ctx.since, ctx.until - INSTAGRAM_INITIAL_LOOKBACK_SECONDS)
    : ctx.since;
  const legacy = platform === 'facebook'
    ? ctx.adWatermarks[key] || ctx.adWatermarks[ad.id] || ctx.adWatermarks[ad.adId]
    : ctx.adWatermarks[key];
  const overlap = platform === 'instagram' ? INSTAGRAM_WATERMARK_OVERLAP_SECONDS : FACEBOOK_WATERMARK_OVERLAP_SECONDS;
  return watermarkToSince(legacy, fallback, overlap);
}

function isMetaRateLimitError(err: unknown): boolean {
  if (!(err instanceof MetaApiError)) return false;
  const message = err.message.toLowerCase();
  return err.code === 4 || err.code === 17 || message.includes('application request limit') || message.includes('too many calls');
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function tokensForAd(ad: SyncAd): string[] {
  const tokens = ad.metaAccountId
    ? getTokensForAccount(ad.metaAccountId, ad.accountLabel)
    : getTokensForAccount(ad.accountLabel || '');
  const fallback = getMetaConfig().accessToken?.trim();
  const unique = [...new Set([...tokens, fallback].filter((token): token is string => Boolean(token?.trim())))];
  if (unique.length <= 1) return unique;
  const primaryIndex = hashString(ad.adId || ad.id) % unique.length;
  return [...unique.slice(primaryIndex), ...unique.slice(0, primaryIndex)];
}

function selectTokenForAd(ad: SyncAd): string | null {
  return tokensForAd(ad)[0] ?? null;
}

function getTokenLaneKey(ad: SyncAd): string {
  const token = selectTokenForAd(ad) ?? 'default';
  return hashString(token).toString(36);
}

function shouldTryNextToken(err: unknown): boolean {
  if (!(err instanceof MetaApiError)) return false;
  const message = err.message.toLowerCase();
  return err.code === 4
    || err.code === 10
    || err.code === 17
    || err.code === 190
    || err.code === 200
    || message.includes('application request limit')
    || message.includes('too many calls')
    || message.includes('rate limit')
    || message.includes('permission')
    || message.includes('invalid or expired');
}

async function withTokenFallback<T>(tokens: string[], operation: (token: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const token of tokens) {
    try {
      return await operation(token);
    } catch (err) {
      lastError = err;
      if (!shouldTryNextToken(err)) throw err;
    }
  }
  throw lastError ?? new MetaApiError('No Meta token available for this ad', { status: 400 });
}

function groupAdsByTokenLane(ads: SyncAd[]): TokenLane[] {
  const lanes = new Map<string, SyncAd[]>();
  for (const ad of ads) {
    const key = getTokenLaneKey(ad);
    const lane = lanes.get(key) ?? [];
    lane.push(ad);
    lanes.set(key, lane);
  }
  return [...lanes.entries()].map(([key, laneAds]) => ({ key, ads: laneAds })).filter(lane => lane.ads.length > 0);
}

async function selectAdsForCommentRun(ads: SyncAd[], mode: 'incremental' | 'backfill'): Promise<AdsSelection> {
  // Process every active ad each cycle when under the coverage cap (production default).
  if (FULL_COVERAGE_MODE && mode === 'incremental' && ads.length > 0 && ads.length <= FULL_COVERAGE_AD_LIMIT) {
    return {
      selected: uniqueAds(ads),
      cursor: null,
      pinnedHighSpendCount: getPinnedHighSpendAds(ads).length,
    };
  }

  if (mode !== 'incremental' || !PARALLEL_TOKEN_LANES) {
    return selectAdsForMode(ads, mode);
  }

  const lanes = groupAdsByTokenLane(ads);
  const pinnedHighSpendAds = getPinnedHighSpendAds(ads);
  const pinnedHighSpendIds = new Set(pinnedHighSpendAds.map(ad => ad.id || ad.adId));
  const laneCursors = await getConfigValue<Record<string, number>>(TOKEN_CURSOR_CONFIG_KEY, {});
  const nextCursors: Record<string, number> = { ...laneCursors };
  const selected: SyncAd[] = [];
  const laneSizes: number[] = [];

  for (const lane of lanes) {
    const lanePinnedAds = lane.ads.filter(ad => pinnedHighSpendIds.has(ad.id || ad.adId));
    const regularCandidateCount = lane.ads.filter(ad => !pinnedHighSpendIds.has(ad.id || ad.adId) && !shouldPrioritizeInstagramAd(ad)).length;
    const regularReserve = regularCandidateCount > 0 ? REGULAR_ADS_PER_TOKEN_RESERVE : 0;
    const priorityLimit = Math.min(INSTAGRAM_PRIORITY_AD_LIMIT, Math.max(PER_TOKEN_AD_LIMIT - regularReserve, 0));
    const priorityAds = priorityLimit > 0 ? lane.ads.filter(ad => !pinnedHighSpendIds.has(ad.id || ad.adId) && shouldPrioritizeInstagramAd(ad)) : [];
    const priorityCursorKey = `${lane.key}:instagram`;
    const priorityCursor = priorityAds.length > 0
      ? Math.min(Math.max(Number(laneCursors[priorityCursorKey] ?? 0), 0), priorityAds.length - 1)
      : 0;
    const prioritySelected = priorityAds.length <= priorityLimit
      ? priorityAds
        : selectFromCursor(priorityAds, priorityLimit, priorityCursor);
    const priorityIds = new Set(prioritySelected.map(ad => ad.id));
    const regularAds = lane.ads.filter(ad => !pinnedHighSpendIds.has(ad.id || ad.adId) && !priorityIds.has(ad.id) && !shouldPrioritizeInstagramAd(ad));
    const regularLimit = Math.max(PER_TOKEN_AD_LIMIT - prioritySelected.length, 0);
    const regularCursorKey = `${lane.key}:regular`;
    const regularCursor = regularAds.length > 0
      ? Math.min(Math.max(Number(laneCursors[regularCursorKey] ?? laneCursors[lane.key] ?? 0), 0), regularAds.length - 1)
      : 0;
    const regularSelected = regularLimit <= 0
      ? []
      : regularAds.length <= regularLimit
        ? regularAds
        : selectFromCursor(regularAds, regularLimit, regularCursor);
    const laneSelected = uniqueAds([...lanePinnedAds, ...prioritySelected, ...regularSelected]);
    selected.push(...laneSelected);
    laneSizes.push(laneSelected.length);
    nextCursors[priorityCursorKey] = priorityAds.length > 0 ? (priorityCursor + prioritySelected.length) % priorityAds.length : 0;
    nextCursors[regularCursorKey] = regularAds.length > 0 ? (regularCursor + regularSelected.length) % regularAds.length : 0;
    nextCursors[lane.key] = lane.ads.length > 0 ? ((laneCursors[lane.key] ?? 0) + laneSelected.length) % lane.ads.length : 0;
  }

  return { selected: uniqueAds(selected), cursor: null, tokenLaneCursors: nextCursors, laneSizes, pinnedHighSpendCount: pinnedHighSpendAds.length };
}

function mergeProcessAdsResults(results: ProcessAdsResult[]): ProcessAdsResult {
  const merged: ProcessAdsResult = {
    synced: 0,
    adsProcessed: 0,
    adsSkipped: 0,
    adsWithStory: 0,
    adsChecked: 0,
    skipReasons: { no_story: 0, fetch_error: 0, ignored_page: 0 },
    errors: [],
    failedAds: [],
  };
  const failedIds = new Set<string>();
  for (const result of results) {
    merged.synced += result.synced;
    merged.adsProcessed += result.adsProcessed;
    merged.adsSkipped += result.adsSkipped;
    merged.adsWithStory += result.adsWithStory;
    merged.adsChecked += result.adsChecked;
    merged.errors.push(...result.errors);
    for (const ad of result.failedAds) {
      const key = ad.id || ad.adId;
      if (!failedIds.has(key)) {
        failedIds.add(key);
        merged.failedAds.push(ad);
      }
    }
    for (const [reason, count] of Object.entries(result.skipReasons)) {
      merged.skipReasons[reason] = (merged.skipReasons[reason] ?? 0) + count;
    }
  }
  return merged;
}

async function saveAdStoryId(adDbId: string, storyId: string): Promise<void> {
  await query('UPDATE ads SET post_story_id = $1 WHERE id = $2 AND (post_story_id IS NULL OR post_story_id = \'\')', [
    storyId,
    adDbId,
  ]);
}

async function saveAdInstagramMediaId(adDbId: string, instagramMediaId: string): Promise<void> {
  await query('UPDATE ads SET instagram_media_id = $1 WHERE id = $2 AND (instagram_media_id IS NULL OR instagram_media_id = \'\')', [
    instagramMediaId,
    adDbId,
  ]);
}

async function saveAdInstagramMediaPreview(
  adDbId: string,
  media: { media_type?: string; media_url?: string; thumbnail_url?: string }
): Promise<void> {
  const mediaType = media.media_type?.toUpperCase() === 'VIDEO' ? 'video' : 'image';
  const mediaUrl = media.media_url?.trim() || null;
  const thumbnailUrl = media.thumbnail_url?.trim() || mediaUrl;
  if (!mediaUrl && !thumbnailUrl) return;

  await query(
    `UPDATE ads
     SET media_type = COALESCE(NULLIF($2, ''), media_type),
         media_url = COALESCE(NULLIF($3, ''), media_url),
         thumbnail_url = COALESCE(NULLIF($4, ''), thumbnail_url)
     WHERE id = $1`,
    [adDbId, mediaType, mediaUrl, thumbnailUrl]
  );
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
    pageId?: string | null;
    pageName?: string | null;
    instagramAccountId?: string | null;
    instagramAccountName?: string | null;
    analyzeWithAi: boolean;
    alertNewComment: boolean;
  }
): Promise<boolean> {
  if (!metaComment.id || !metaComment.message?.trim()) return false;

  const createdIso = metaComment.created_time
    ? new Date(metaComment.created_time).toISOString()
    : new Date().toISOString();

  // Deliberately NOT dropping comments older than ctx.since here. IG frequently
  // delivers late arrivals. The DB has UNIQUE(comment_id), so re-persisting an
  // old root comment is a no-op, while watermarks keep the Meta query incremental.
  const exists = await commentExistsByMetaId(metaComment.id);

  const enriched = await enrichMetaCommentAuthor(metaComment, ctx.pageAccessToken);
  const author = resolveCommenterInfo(enriched.from, enriched.username);
  const isConnectedAuthor = await isConnectedAssetAuthor(author.name, author.id);
  const parentCommentId = enriched.parent?.id || metaComment.parent?.id;

  // Brand replies (from our own connected page/IG account) flip the parent
  // comment's status to Replied but are not stored as inbox rows themselves.
  if (isConnectedAuthor) {
    if (parentCommentId) return applyBrandReplyToParent(parentCommentId, author.name);
    return false;
  }

  const platform = inferCommentPlatform(ctx.platform, enriched);
  const text = enriched.message || metaComment.message || '';
  const analysis: CommentAnalysis = fallbackAnalyzeComment({ text, campaignName: ctx.campaignName, adName: ctx.adName, accountLabel: ctx.accountLabel });

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
    pageId: ctx.pageId ?? undefined,
    pageName: ctx.pageName ?? undefined,
    instagramAccountId: ctx.instagramAccountId ?? undefined,
    instagramAccountName: ctx.instagramAccountName ?? undefined,
    parentCommentId: parentCommentId ?? undefined,
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

    if (ctx.analyzeWithAi || ctx.alertNewComment) {
      enqueueCommentEnrichment({
        commentId: row.id,
        platform: row.platform,
        author: author.name,
        text,
        createdAt: createdIso,
        commentUrl: row.original_comment_url,
        adName: ctx.adName,
        adId: ctx.adId,
        campaignName: ctx.campaignName,
        accountLabel: ctx.accountLabel,
        alertNewComment: ctx.alertNewComment && isRecentEnoughForAlert(createdIso),
      });
    }
  }

  return true;
}

async function processAdsForComments(adsToProcess: SyncAd[], ctx: ProcessAdsContext): Promise<ProcessAdsResult> {
  let synced = 0;
  let adsProcessed = 0;
  let adsSkipped = 0;
  let adsWithStory = 0;
  let adsChecked = 0;
  const errors: string[] = [];
  const failedAds: SyncAd[] = [];
  const failedAdIds = new Set<string>();
  const skipReasons: Record<string, number> = { no_story: 0, fetch_error: 0, ignored_page: 0 };
  const checkedAdIds = new Set<string>();

  const markAdFailed = (ad: SyncAd) => {
    const key = ad.id || ad.adId;
    if (failedAdIds.has(key)) return;
    failedAdIds.add(key);
    failedAds.push(ad);
  };
  let nextAdIndex = 0;
  let stopLane = false;

  const processOneAd = async (ad: SyncAd): Promise<void> => {
    try {
      if (ctx.updateProgress && adsProcessed > 0 && adsProcessed % 25 === 0) {
        syncState.lastMessage = `Comment ${ctx.modeLabel}: ${adsProcessed}/${adsToProcess.length} ads processed this run, ${synced} comment(s) synced…`;
      }
      const adTokens = tokensForAd(ad);
      if (!adTokens.length) return;
      const markPlatformSynced = async (platform: 'facebook' | 'instagram') => {
        if (!ctx.adWatermarks || !ctx.until) return;
        const iso = new Date(ctx.until * 1000).toISOString();
        ctx.adWatermarks[watermarkKey(ad, platform)] = iso;
        if (platform === 'facebook') {
          ctx.adWatermarks[ad.id] = iso;
          ctx.adWatermarks[ad.adId] = iso;
        }
        if (!checkedAdIds.has(ad.id)) {
          checkedAdIds.add(ad.id);
          adsChecked++;
        }
        if (adsChecked > 0 && adsChecked % 25 === 0) {
          await setConfigValue(AD_WATERMARKS_CONFIG_KEY, ctx.adWatermarks);
        }
      };

      let storyId = ad.postStoryId?.trim() || null;
      let pageId = pageIdFromStoryId(storyId);

      if (!storyId) {
        const resolved = await withTokenFallback(adTokens, fallbackToken => resolveAdStoryId(ad.adId, fallbackToken));
        storyId = resolved.storyId;
        pageId = resolved.pageId;
        if (storyId) {
          await saveAdStoryId(ad.id, storyId);
        }
      }

      const pageInfo = pageId ? await getConnectedPageInfo(pageId) : null;
      const pageToken = pageInfo?.accessToken ?? (pageId ? await getPageAccessToken(pageId) : null);
      const pageName = pageInfo?.name ?? null;
      const facebookSince = platformSince(ctx, ad, 'facebook');
      const instagramSince = platformSince(ctx, ad, 'instagram');

      const runFacebook = async (): Promise<{ synced: number; skipped: boolean; skipReason?: string; error?: string }> => {
        if (!storyId) return { synced: 0, skipped: true, skipReason: 'no_story' };
        if (pageId && isIgnoredPageId(pageId)) return { synced: 0, skipped: true, skipReason: 'ignored_page' };
        try {
          return await withTokenFallback(adTokens, async fallbackToken => {
            const comments = await fetchStoryComments(storyId, fallbackToken, {
              since: facebookSince,
              until: ctx.until,
              limit: 100,
              pageAccessToken: pageToken,
            });
            let laneSynced = 0;
            for (const c of comments) {
              const saved = await persistMetaComment(c, {
                // Pin to 'facebook' on the FB Graph edge so IG comments returned
                // via /{storyId}/comments don't inherit the ad row's platform.
                // inferCommentPlatform will still upgrade to 'instagram' when
                // the comment carries a strong IG signal (username/permalink).
                platform: 'facebook',
                adId: ad.adId,
                adName: ad.adName,
                adsetName: ad.adsetName,
                campaignName: ad.campaignName,
                campaignMetaId: ad.campaignId,
                adsetMetaId: ad.adsetId,
                storyId,
                since: facebookSince,
                pageAccessToken: pageToken,
                accountLabel: ad.accountLabel,
                pageId: pageId ?? undefined,
                pageName: pageName ?? undefined,
                analyzeWithAi: ctx.analyzeWithAi,
                alertNewComment: ctx.alertNewComment,
              });
              if (saved) laneSynced++;
            }
            return { synced: laneSynced, skipped: false };
          });
        } catch (err) {
          if (isMetaRateLimitError(err) || (err instanceof MetaApiError && err.code === 190)) throw err;
          return { synced: 0, skipped: false, error: err instanceof Error ? err.message : String(err) };
        }
      };

      const runInstagram = async (): Promise<{ synced: number; probed: boolean; error?: string }> => {
        if (!shouldProbeInstagramAd(ad)) return { synced: 0, probed: false };
        try {
          return await withTokenFallback(adTokens, async fallbackToken => {
            let instagramMediaId = ad.instagramMediaId?.trim() || null;
            if (!instagramMediaId) {
              instagramMediaId = await resolveAdInstagramMediaId(ad.adId, fallbackToken);
              if (instagramMediaId) await saveAdInstagramMediaId(ad.id, instagramMediaId);
            }
            if (!instagramMediaId) return { synced: 0, probed: true };
            const needsMediaPreview = !ad.mediaUrl?.trim() && !ad.thumbnailUrl?.trim();
            const mediaDetails = needsMediaPreview ? await fetchInstagramMediaDetails(instagramMediaId, fallbackToken) : null;
            if (mediaDetails) await saveAdInstagramMediaPreview(ad.id, mediaDetails);
            const mediaPermalink = mediaDetails?.permalink || await fetchInstagramMediaPermalink(instagramMediaId, fallbackToken);
            const instagramComments = await fetchInstagramMediaComments(instagramMediaId, fallbackToken, {
              since: instagramSince,
              until: ctx.until,
              limit: 100,
              mediaPermalink,
            });
            let laneSynced = 0;
            for (const c of instagramComments) {
              const saved = await persistMetaComment(c, {
                platform: 'instagram',
                adId: ad.adId,
                adName: ad.adName,
                adsetName: ad.adsetName,
                campaignName: ad.campaignName,
                campaignMetaId: ad.campaignId,
                adsetMetaId: ad.adsetId,
                storyId: instagramMediaId,
                since: instagramSince,
                pageAccessToken: null,
                accountLabel: ad.accountLabel,
                analyzeWithAi: ctx.analyzeWithAi,
                alertNewComment: ctx.alertNewComment,
              });
              if (saved) laneSynced++;
            }
            return { synced: laneSynced, probed: true };
          });
        } catch (err) {
          if (isMetaRateLimitError(err) || (err instanceof MetaApiError && err.code === 190)) throw err;
          return { synced: 0, probed: true, error: err instanceof Error ? err.message : String(err) };
        }
      };

      // Run FB + IG fetches in parallel per ad — they hit different Meta edges
      // and typically use different token/permission paths, so no coordination is needed.
      const [fb, ig] = await Promise.all([runFacebook(), runInstagram()]);

      if (fb.skipped) {
        adsSkipped++;
        if (fb.skipReason) skipReasons[fb.skipReason] = (skipReasons[fb.skipReason] ?? 0) + 1;
      } else {
        if (storyId) adsWithStory++;
        if (fb.error) {
          errors.push(`${ad.adName}: ${fb.error}`);
          skipReasons.fetch_error++;
          markAdFailed(ad);
        } else {
          synced += fb.synced;
          await markPlatformSynced('facebook');
        }
      }

      if (ig.probed) {
        if (ig.error) {
          errors.push(`${ad.adName} (IG): ${ig.error}`);
          skipReasons.fetch_error++;
          markAdFailed(ad);
        } else {
          synced += ig.synced;
          await markPlatformSynced('instagram');
        }
      }

      adsProcessed++;
      const skipDelay = FULL_COVERAGE_MODE && adsToProcess.length >= 200;
      if (!skipDelay && AD_BATCH_DELAY_MS > 0) await sleep(AD_BATCH_DELAY_MS);
    } catch (err) {
      if (isMetaRateLimitError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Meta rate limit during sync. ${msg}`);
        stopLane = true;
        return;
      }
      if (err instanceof MetaApiError && err.code === 190) {
        const recheck = await validateMetaAccessToken();
        if (!recheck.valid) {
          syncState.tokenValid = false;
          syncState.tokenMessage = recheck.message;
          errors.push(`Meta token expired during sync. ${recheck.message}`);
          stopLane = true;
          return;
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${ad.adName}: ${msg}`);
      adsSkipped++;
      skipReasons.fetch_error++;
      markAdFailed(ad);
    }
  };

  const workerCount = Math.min(ctx.adConcurrency ?? AD_CONCURRENCY_PER_TOKEN, adsToProcess.length || 1);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (!stopLane) {
      const index = nextAdIndex++;
      if (index >= adsToProcess.length) return;
      await processOneAd(adsToProcess[index]);
    }
  }));

  return { synced, adsProcessed, adsSkipped, adsWithStory, adsChecked, skipReasons, errors, failedAds };
}

async function processAdsForCommentsParallel(adsToProcess: SyncAd[], ctx: ProcessAdsContext): Promise<ParallelProcessAdsResult> {
  const lanes = PARALLEL_TOKEN_LANES ? groupAdsByTokenLane(adsToProcess) : [adsToProcess];
  const laneAds = lanes.map(lane => Array.isArray(lane) ? lane : lane.ads);
  const results = await Promise.all(laneAds.map((lane, index) => processAdsForComments(lane, {
    ...ctx,
    modeLabel: laneAds.length > 1 ? `${ctx.modeLabel}/lane-${index + 1}` : ctx.modeLabel,
  })));
  return {
    ...mergeProcessAdsResults(results),
    laneCount: laneAds.length,
    laneSizes: laneAds.map(lane => lane.length),
  };
}

async function assertCanRunCommentSync(): Promise<CommentSyncOutcome | null> {
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

  const { status: tokenStatus } = resolved;
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

  return null;
}

interface OrganicSyncResult {
  synced: number;
  mediaChecked: number;
  postsChecked: number;
  accountsProcessed: number;
  pagesProcessed: number;
  errors: string[];
}

async function runInPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length || 1) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        await worker(items[i]);
      } catch (err) {
        console.warn('[organic-sync] worker error:', err instanceof Error ? err.message : err);
      }
    }
  });
  await Promise.all(workers);
}

async function persistOrganicIgComment(
  mediaId: string,
  metaComment: MetaComment,
  ctx: {
    accountId: string;
    username: string;
    accountLabel: string | null;
    mediaPermalink?: string | null;
    matchedAd: AdLookupRow | null;
    analyzeWithAi: boolean;
    alertNewComment: boolean;
  }
): Promise<boolean> {
  const handle = ctx.username.trim().replace(/^@+/, '');
  return persistMetaComment(metaComment, {
    platform: 'instagram',
    adId: ctx.matchedAd?.adId ?? mediaId,
    adName: ctx.matchedAd?.adName ?? `Organic · @${handle || ctx.username}`,
    adsetName: ctx.matchedAd?.adsetName ?? 'Organic',
    campaignName: ctx.matchedAd?.campaignName ?? 'Organic',
    campaignMetaId: ctx.matchedAd?.campaignId ?? undefined,
    adsetMetaId: ctx.matchedAd?.adsetId ?? undefined,
    storyId: mediaId,
    since: 0,
    pageAccessToken: null,
    accountLabel: ctx.matchedAd?.accountLabel ?? ctx.accountLabel,
    instagramAccountId: ctx.accountId,
    instagramAccountName: handle ? `@${handle}` : ctx.username,
    analyzeWithAi: ctx.analyzeWithAi,
    alertNewComment: ctx.alertNewComment,
  });
}

async function persistOrganicFbComment(
  storyId: string,
  metaComment: MetaComment,
  ctx: {
    pageId: string;
    pageName: string;
    pageAccessToken: string | null;
    matchedAd: AdLookupRow | null;
    analyzeWithAi: boolean;
    alertNewComment: boolean;
  }
): Promise<boolean> {
  return persistMetaComment(metaComment, {
    platform: 'facebook',
    adId: ctx.matchedAd?.adId ?? storyId,
    adName: ctx.matchedAd?.adName ?? `Organic · ${ctx.pageName}`,
    adsetName: ctx.matchedAd?.adsetName ?? 'Organic',
    campaignName: ctx.matchedAd?.campaignName ?? 'Organic',
    campaignMetaId: ctx.matchedAd?.campaignId ?? undefined,
    adsetMetaId: ctx.matchedAd?.adsetId ?? undefined,
    storyId,
    since: 0,
    pageAccessToken: ctx.pageAccessToken,
    accountLabel: ctx.matchedAd?.accountLabel ?? null,
    pageId: ctx.pageId,
    pageName: ctx.pageName,
    analyzeWithAi: ctx.analyzeWithAi,
    alertNewComment: ctx.alertNewComment,
  });
}

async function pickTokenForIgAccount(pageToken: string | null): Promise<string | null> {
  if (pageToken?.trim()) return pageToken.trim();
  const fallback = getMetaConfig().accessToken?.trim();
  if (fallback) return fallback;
  const [first] = getConfiguredMetaAccounts();
  return first?.accessToken?.trim() || null;
}

async function syncOrganicComments(opts: {
  sinceUnix: number;
  analyzeWithAi: boolean;
  alertNewComment: boolean;
}): Promise<OrganicSyncResult> {
  const result: OrganicSyncResult = {
    synced: 0,
    mediaChecked: 0,
    postsChecked: 0,
    accountsProcessed: 0,
    pagesProcessed: 0,
    errors: [],
  };
  if (!ORGANIC_SYNC_ENABLED) return result;

  // Incremental runs pass a since ≈ last-comment-time; backfill passes 730d ago.
  // Previously we clamped to `max(sinceUnix, now - 72h)`, which silently dropped
  // any post older than 72 hours EVEN IN BACKFILL — losing organic posts moderators
  // report as missing. Now: honor the caller in backfill, only apply the 72h floor
  // in incremental mode (where sinceUnix is already recent).
  const now = Math.floor(Date.now() / 1000);
  const incrementalFloor = now - ORGANIC_LOOKBACK_HOURS * 3600;
  const cutoff = opts.sinceUnix < incrementalFloor - 24 * 3600
    ? opts.sinceUnix
    : Math.max(opts.sinceUnix, incrementalFloor);

  // --- Instagram organic (brand pages only by default) ------------------------
  const igAccountsAll = await getConnectedInstagramAccountsForSync();
  const igAccounts = ORGANIC_IG_BRAND_ONLY
    ? igAccountsAll.filter(account => isBrandIgUsername(account.username))
    : igAccountsAll;

  if (ORGANIC_IG_BRAND_ONLY && igAccountsAll.length > igAccounts.length) {
    console.log(
      `[organic-sync] IG brand-only: syncing ${igAccounts.length}/${igAccountsAll.length} accounts ` +
      `(${getBrandIgUsernames().join(', ')})`
    );
  }

  await runInPool(igAccounts, ORGANIC_ACCOUNT_CONCURRENCY, async account => {
    const token = await pickTokenForIgAccount(account.pageAccessToken);
    if (!token) {
      result.errors.push(`IG @${account.username}: no usable access token`);
      return;
    }
    const mediaList = await fetchInstagramAccountRecentMedia(account.accountId, token, {
      limit: ORGANIC_MEDIA_PER_ACCOUNT,
      sinceUnix: cutoff,
    });
    result.accountsProcessed++;

    for (const media of mediaList) {
      try {
        const matchedAd = await findAdByInstagramMediaId(media.id);
        const comments = await fetchInstagramMediaComments(media.id, token, {
          limit: 100,
          mediaPermalink: media.permalink ?? null,
        });
        for (const c of comments) {
          const saved = await persistOrganicIgComment(media.id, c, {
            accountId: account.accountId,
            username: account.username,
            accountLabel: matchedAd?.accountLabel ?? null,
            mediaPermalink: media.permalink,
            matchedAd,
            analyzeWithAi: opts.analyzeWithAi,
            alertNewComment: opts.alertNewComment,
          });
          if (saved) result.synced++;
        }
        result.mediaChecked++;
      } catch (err) {
        if (isMetaRateLimitError(err) || (err instanceof MetaApiError && err.code === 190)) {
          result.errors.push(`IG @${account.username} rate/token: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        result.errors.push(`IG @${account.username} media ${media.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });

  // --- Facebook organic -------------------------------------------------------
  const pages = await getConnectedPagesForOrganicSync();
  await runInPool(pages, ORGANIC_ACCOUNT_CONCURRENCY, async page => {
    const token = page.pageAccessToken?.trim();
    if (!token) {
      result.errors.push(`FB page ${page.pageName}: no page access token`);
      return;
    }
    const posts = await fetchPageRecentPosts(page.pageId, token, {
      limit: ORGANIC_MEDIA_PER_ACCOUNT,
      sinceUnix: cutoff,
    });
    result.pagesProcessed++;

    for (const post of posts) {
      try {
        const matchedAd = await findAdByPostStoryId(post.id);
        const comments = await fetchStoryComments(post.id, token, {
          limit: 100,
          pageAccessToken: token,
        });
        for (const c of comments) {
          const saved = await persistOrganicFbComment(post.id, c, {
            pageId: page.pageId,
            pageName: page.pageName,
            pageAccessToken: token,
            matchedAd,
            analyzeWithAi: opts.analyzeWithAi,
            alertNewComment: opts.alertNewComment,
          });
          if (saved) result.synced++;
        }
        result.postsChecked++;
      } catch (err) {
        if (isMetaRateLimitError(err) || (err instanceof MetaApiError && err.code === 190)) {
          result.errors.push(`FB ${page.pageName} rate/token: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        result.errors.push(`FB ${page.pageName} post ${post.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });

  return result;
}

async function syncCommentsFromMeta(mode: 'incremental' | 'backfill'): Promise<CommentSyncOutcome> {
  const blocked = await assertCanRunCommentSync();
  if (blocked) return blocked;

  // Refresh page tokens only when needed (not on every incremental run — avoids slow/no-op page fetches).
  const pagesResult = mode === 'backfill' ? await syncPagesFromMeta() : null;
  if (pagesResult && !pagesResult.ok) {
    console.warn('[comment-sync] Page sync warning:', pagesResult.message);
  }

  const ads = await getAdsForCommentSync();
  if (!ads.length) {
    return {
      ok: true,
      synced: 0,
      message: 'No ads in database. Run Sync Ads first, then sync comments.',
    };
  }

  const since = await sinceTimestamp(mode);
  const until = Math.floor(Date.now() / 1000);
  const adWatermarks = mode === 'incremental'
    ? await getConfigValue<Record<string, string>>(AD_WATERMARKS_CONFIG_KEY, {})
    : undefined;
  const { selected: adsToProcess, cursor, tokenLaneCursors, laneSizes: selectedLaneSizes, pinnedHighSpendCount } = await selectAdsForCommentRun(ads, mode);
  const processCtx: ProcessAdsContext = {
    modeLabel: mode,
    since,
    until: mode === 'incremental' ? until : undefined,
    adWatermarks,
    analyzeWithAi: mode === 'incremental',
    alertNewComment: mode === 'incremental',
    updateProgress: true,
  };
  let { synced, adsProcessed, adsSkipped, adsWithStory, adsChecked, skipReasons, errors, laneCount, laneSizes, failedAds } = await processAdsForCommentsParallel(adsToProcess, processCtx);

  if (failedAds.length > 0) {
    const retryAds = uniqueAds(failedAds).slice(0, 500);
    console.log(`[comment-sync] Retrying ${retryAds.length} ad(s) after fetch errors…`);
    await sleep(3000);
    const retry = await processAdsForCommentsParallel(retryAds, {
      ...processCtx,
      modeLabel: `${mode}-retry`,
      updateProgress: false,
    });
    synced += retry.synced;
    adsProcessed += retry.adsProcessed;
    adsSkipped += retry.adsSkipped;
    adsWithStory += retry.adsWithStory;
    adsChecked += retry.adsChecked;
    errors.push(...retry.errors);
    for (const [reason, count] of Object.entries(retry.skipReasons)) {
      skipReasons[reason] = (skipReasons[reason] ?? 0) + count;
    }
    if (retry.synced > 0) {
      console.log(`[comment-sync] Retry recovered ${retry.synced} comment(s) from ${retryAds.length} ad(s)`);
    }
    if (retry.failedAds.length) {
      console.warn(`[comment-sync] ${retry.failedAds.length} ad(s) still failing after retry`);
    }
  }

  const fatalTokenError = errors.find(error => error.startsWith('Meta token expired during sync.'));
  if (fatalTokenError) {
    return {
      ok: false,
      synced,
      message: fatalTokenError,
      adsProcessed,
      adsSkipped,
      adsWithStory,
    };
  }

  const fatalRateLimitError = errors.find(error => error.startsWith('Meta rate limit during sync.'));
  if (fatalRateLimitError) {
    return {
      ok: false,
      synced,
      message: fatalRateLimitError,
      adsProcessed,
      adsSkipped,
      adsWithStory,
    };
  }

  if (cursor != null && adsChecked > 0) {
    await setConfigValue(AD_CURSOR_CONFIG_KEY, cursor);
  }
  if (tokenLaneCursors && adsChecked > 0) {
    await setConfigValue(TOKEN_CURSOR_CONFIG_KEY, tokenLaneCursors);
  }
  if (adWatermarks) {
    await setConfigValue(AD_WATERMARKS_CONFIG_KEY, adWatermarks);
  }

  // Organic sweep — catches comments on posts that aren't tied to any ad row (spark ads,
  // whitelisted posts, plain organic posts). Runs in both incremental and backfill modes;
  // in backfill we widen the lookback in the caller.
  const organic = await syncOrganicComments({
    sinceUnix: mode === 'backfill' ? since : Math.floor(Date.now() / 1000) - ORGANIC_LOOKBACK_HOURS * 3600,
    analyzeWithAi: mode === 'incremental',
    alertNewComment: mode === 'incremental',
  });

  const totalSynced = synced + organic.synced;

  const label = mode === 'backfill' ? `${BACKFILL_DAYS}-day backfill` : 'incremental';
  let message = `Comment ${label}: synced ${totalSynced} comment(s) — ${synced} from ${adsProcessed}/${adsToProcess.length} ad(s) across ${laneCount} lane(s), ${organic.synced} from organic media (${organic.mediaChecked} IG · ${organic.postsChecked} FB posts).`;
  if (pinnedHighSpendCount) message += ` Included ${pinnedHighSpendCount} high-spend NOBL/FLO ad(s) first.`;
  if (adsSkipped) {
    message += ` Skipped ${adsSkipped} ad(s)`;
    if (skipReasons.no_story) message += ` (${skipReasons.no_story} without post story ID)`;
    message += '.';
  }
  if (errors.length) message += ` ${errors.length} fetch error(s).`;
  if (organic.errors.length) message += ` ${organic.errors.length} organic error(s).`;

  return {
    ok: true,
    synced: totalSynced,
    adsProcessed,
    adsSkipped,
    adsWithStory,
    message,
    details: {
      mode,
      since,
      until: mode === 'incremental' ? until : undefined,
      adBatchSize: adsToProcess.length,
      totalAds: ads.length,
      adsChecked,
      nextCursor: adsChecked > 0 ? cursor : null,
      tokenLaneCursorsUpdated: Boolean(tokenLaneCursors && adsChecked > 0),
      laneCount,
      laneSizes,
      selectedLaneSizes,
      pinnedHighSpendCount,
      highSpendPinnedAdsPerBrand: HIGH_SPEND_PINNED_ADS_PER_BRAND,
      regularAdsPerTokenReserve: REGULAR_ADS_PER_TOKEN_RESERVE,
      perTokenAdLimit: PARALLEL_TOKEN_LANES ? PER_TOKEN_AD_LIMIT : undefined,
      adConcurrencyPerToken: AD_CONCURRENCY_PER_TOKEN,
      skipReasons,
      errors: errors.slice(0, 10),
      pagesSync: pagesResult?.message,
      organic: {
        synced: organic.synced,
        igAccounts: organic.accountsProcessed,
        igMediaChecked: organic.mediaChecked,
        fbPages: organic.pagesProcessed,
        fbPostsChecked: organic.postsChecked,
        errors: organic.errors.slice(0, 10),
      },
    },
  };
}

export async function runTargetedCommentSync(options: TargetedCommentSyncOptions): Promise<CommentSyncOutcome> {
  const blocked = await assertCanRunCommentSync();
  if (blocked) return blocked;

  const limit = Math.min(Math.max(options.limit ?? 15, 1), 100);
  const sinceDays = Math.min(Math.max(options.sinceDays ?? BACKFILL_DAYS, 1), BACKFILL_DAYS);
  const adIdSet = new Set((options.adIds ?? []).map(id => id.trim()).filter(Boolean));
  const accountLabel = options.accountLabel?.trim().toUpperCase();

  let ads = await getAdsForCommentSync();
  if (adIdSet.size > 0) {
    ads = ads.filter(ad => adIdSet.has(ad.adId) || adIdSet.has(ad.id));
  }
  if (accountLabel) {
    ads = ads.filter(ad => ad.accountLabel?.toUpperCase() === accountLabel);
  }

  ads = ads
    .sort((a, b) => Number(b.recentSpend ?? b.spend ?? -1) - Number(a.recentSpend ?? a.spend ?? -1))
    .slice(0, limit);

  if (!ads.length) {
    return {
      ok: true,
      synced: 0,
      message: 'No matching ads found for targeted comment sync.',
      details: { accountLabel, requestedAdIds: [...adIdSet], limit },
    };
  }

  const since = Math.floor((Date.now() - sinceDays * 24 * 60 * 60 * 1000) / 1000);
  const { synced, adsProcessed, adsSkipped, adsWithStory, adsChecked, skipReasons, errors } = await processAdsForComments(ads, {
    modeLabel: 'targeted',
    since,
    analyzeWithAi: options.analyzeWithAi ?? true,
    alertNewComment: options.alertNewComment ?? false,
  });

  let message = `Targeted comment sync: synced ${synced} comment(s) from ${adsProcessed}/${ads.length} ad(s) (${adsWithStory} with post IDs, ${adsChecked} marked checked).`;
  if (adsSkipped) {
    message += ` Skipped ${adsSkipped} ad(s)`;
    if (skipReasons.no_story) message += ` (${skipReasons.no_story} without post story ID)`;
    message += '.';
  }
  if (errors.length) message += ` ${errors.length} fetch error(s).`;

  return {
    ok: errors.length === 0,
    synced,
    adsProcessed,
    adsSkipped,
    adsWithStory,
    message,
    details: {
      accountLabel,
      limit,
      sinceDays,
      adsChecked,
      selectedAds: ads.map(ad => ({ adId: ad.adId, adName: ad.adName, spend: ad.spend, postStoryId: ad.postStoryId })),
      skipReasons,
      errors: errors.slice(0, 10),
    },
  };
}

/** Fast poll: top-spend ads only, one dedicated token lane per brand (FLO / NOBL). */
async function syncHighSpendCommentsFromMeta(): Promise<CommentSyncOutcome> {
  const blocked = await assertCanRunCommentSync();
  if (blocked) return blocked;

  const ads = await getAdsForCommentSync();
  const pinnedAds = getPinnedHighSpendAds(ads);
  if (!pinnedAds.length) {
    return {
      ok: true,
      synced: 0,
      message: 'High-spend poll: no ads with recent spend to prioritize.',
      details: { adsPerBrand: HIGH_SPEND_PINNED_ADS_PER_BRAND },
    };
  }

  const since = await sinceTimestamp('incremental');
  const until = Math.floor(Date.now() / 1000);
  const adWatermarks = await getConfigValue<Record<string, string>>(AD_WATERMARKS_CONFIG_KEY, {});
  const lanes = groupAdsByTokenLane(pinnedAds);
  const processCtx: ProcessAdsContext = {
    modeLabel: 'high-spend',
    since,
    until,
    adWatermarks,
    // Keep the fast ingestion lane independent of external AI quotas; the
    // persisted fallback analysis is enough to keep the comment visible.
    analyzeWithAi: false,
    alertNewComment: false,
    updateProgress: false,
    adConcurrency: HIGH_SPEND_AD_CONCURRENCY,
  };

  let synced = 0;
  let adsProcessed = 0;
  let adsSkipped = 0;
  let adsWithStory = 0;
  let adsChecked = 0;
  const errors: string[] = [];
  const failedAds: SyncAd[] = [];

  // Run each token lane sequentially so FLO and NOBL tokens stay isolated from each other.
  for (const [laneIndex, lane] of lanes.entries()) {
    const laneResult = await processAdsForComments(lane.ads, {
      ...processCtx,
      modeLabel: lanes.length > 1 ? `high-spend/lane-${laneIndex + 1}` : 'high-spend',
    });
    synced += laneResult.synced;
    adsProcessed += laneResult.adsProcessed;
    adsSkipped += laneResult.adsSkipped;
    adsWithStory += laneResult.adsWithStory;
    adsChecked += laneResult.adsChecked;
    errors.push(...laneResult.errors);
    failedAds.push(...laneResult.failedAds);
  }

  if (failedAds.length > 0) {
    const retryAds = uniqueAds(failedAds);
    const retry = await processAdsForComments(retryAds, {
      ...processCtx,
      modeLabel: 'high-spend-retry',
    });
    synced += retry.synced;
    adsProcessed += retry.adsProcessed;
    adsSkipped += retry.adsSkipped;
    adsWithStory += retry.adsWithStory;
    adsChecked += retry.adsChecked;
    errors.push(...retry.errors);
  }

  if (adsChecked > 0) {
    await setConfigValue(AD_WATERMARKS_CONFIG_KEY, adWatermarks);
  }

  const laneLabels = lanes.map(lane => {
    const sample = lane.ads[0];
    return sample?.accountLabel || normalizedBrandLabel(sample!) || lane.key;
  });

  let message = `High-spend poll: synced ${synced} comment(s) from ${adsProcessed}/${pinnedAds.length} ad(s) across ${lanes.length} token lane(s)`;
  if (laneLabels.length) message += ` (${laneLabels.join(', ')})`;
  message += '.';
  if (errors.length) message += ` ${errors.length} fetch error(s).`;

  return {
    ok: errors.length === 0,
    synced,
    adsProcessed,
    adsSkipped,
    adsWithStory,
    message,
    details: {
      mode: 'high-spend',
      since,
      until,
      pinnedAds: pinnedAds.length,
      adsPerBrand: HIGH_SPEND_PINNED_ADS_PER_BRAND,
      laneCount: lanes.length,
      laneLabels,
      adsChecked,
      errors: errors.slice(0, 10),
    },
  };
}

export async function runHighSpendCommentSync(): Promise<CommentSyncOutcome> {
  if (!HIGH_SPEND_POLL_ENABLED) {
    return { ok: true, synced: 0, message: 'High-spend poll is disabled (COMMENT_SYNC_HIGH_SPEND_POLL=false).' };
  }

  if (HIGH_SPEND_SKIP_DURING_FULL && syncState.isRunning) {
    return { ok: true, synced: 0, message: 'High-spend poll skipped — full comment sync in progress.' };
  }

  if (highSpendSyncRunning) {
    if (highSpendRunStartedAt && Date.now() - highSpendRunStartedAt > STUCK_SYNC_MS) {
      console.warn('[comment-sync/high-spend] Resetting stuck high-spend flag after timeout');
      highSpendSyncRunning = false;
      highSpendRunStartedAt = null;
    } else {
      return { ok: false, synced: 0, message: 'High-spend poll already in progress.' };
    }
  }

  highSpendSyncRunning = true;
  highSpendRunStartedAt = Date.now();

  try {
    const result = await syncHighSpendCommentsFromMeta();
    highSpendPollState.lastRunAt = new Date().toISOString();
    highSpendPollState.lastRunOk = result.ok;
    highSpendPollState.lastSynced = result.synced;
    highSpendPollState.lastMessage = result.message;
    console.log(`[comment-sync/high-spend] ${result.message}`);
    return result;
  } catch (err) {
    const { message } = syncErrorMessage(err);
    highSpendPollState.lastRunAt = new Date().toISOString();
    highSpendPollState.lastRunOk = false;
    highSpendPollState.lastSynced = 0;
    highSpendPollState.lastMessage = message;
    console.error('[comment-sync/high-spend] failed:', message);
    return { ok: false, synced: 0, message };
  } finally {
    highSpendSyncRunning = false;
    highSpendRunStartedAt = null;
  }
}

export async function syncHighSpendCommentsIncremental(): Promise<CommentSyncOutcome> {
  return runHighSpendCommentSync();
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

const CRON_INTERVAL_MS = Math.max(Number(process.env.COMMENT_SYNC_INTERVAL_MINUTES || 15), 1) * 60 * 1000;
let cronTimer: ReturnType<typeof setInterval> | null = null;

function scheduleHighSpendPollNextRun(): void {
  if (!HIGH_SPEND_POLL_ENABLED) return;
  highSpendPollState.nextRunAt = new Date(Date.now() + HIGH_SPEND_POLL_INTERVAL_MS).toISOString();
}

function startHighSpendCommentSyncCron(): void {
  if (!HIGH_SPEND_POLL_ENABLED || isServerDemoMode() || highSpendCronTimer) return;

  scheduleHighSpendPollNextRun();

  highSpendCronTimer = setInterval(async () => {
    scheduleHighSpendPollNextRun();
    const resolved = await resolveCommentSyncToken();
    if (!resolved?.status.canSyncComments) {
      console.warn('[comment-sync/high-spend] Cron skipped — no valid token');
      return;
    }
    console.log('[comment-sync/high-spend] Cron: starting high-spend poll');
    await runHighSpendCommentSync();
    scheduleHighSpendPollNextRun();
  }, HIGH_SPEND_POLL_INTERVAL_MS);

  console.log(
    `[comment-sync/high-spend] Cron scheduled every ${HIGH_SPEND_POLL_INTERVAL_MS / 60000} minutes ` +
    `(${HIGH_SPEND_PINNED_ADS_PER_BRAND} ads/brand, ${HIGH_SPEND_AD_CONCURRENCY} concurrent/ lane)`
  );

  // Stagger first run so it does not collide with startup full sync.
  setTimeout(() => {
    void (async () => {
      const resolved = await resolveCommentSyncToken();
      if (!resolved?.status.canSyncComments) return;
      if (HIGH_SPEND_SKIP_DURING_FULL && syncState.isRunning) return;
      console.log('[comment-sync/high-spend] Startup: first high-spend poll');
      await runHighSpendCommentSync();
      scheduleHighSpendPollNextRun();
    })();
  }, Math.min(90_000, HIGH_SPEND_POLL_INTERVAL_MS));
}

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

  void (async () => {
    const resolved = await resolveCommentSyncToken();
    if (!resolved?.status.canSyncComments) {
      console.warn('[comment-sync] Startup sync skipped — no valid token for comment sync');
      return;
    }
    syncState.tokenValid = resolved.status.valid;
    syncState.tokenMessage = resolved.status.message;
    console.log('[comment-sync] Startup: starting incremental sync');
    await runCommentSync('incremental');
    syncState.nextRunAt = new Date(Date.now() + CRON_INTERVAL_MS).toISOString();
  })();

  startHighSpendCommentSyncCron();
}

export function stopCommentSyncCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
  if (highSpendCronTimer) {
    clearInterval(highSpendCronTimer);
    highSpendCronTimer = null;
  }
  highSpendPollState.nextRunAt = null;
}
