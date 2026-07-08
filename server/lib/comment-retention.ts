import { isDatabaseConfigured } from '../db/pool.js';
import { deleteOldComments, getConfigValue, setConfigValue } from '../db/repository.js';
import { isServerDemoMode } from './meta.js';

/** Default retention window — comments older than this are permanently deleted. */
export const DEFAULT_RETENTION_DAYS = 7;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 90;

const RETENTION_CONFIG_KEY = 'comment_retention_days';
const RETENTION_LAST_RUN_KEY = 'comment_retention_last_run_at';

// Once a day is plenty — the archive query is a single UPDATE.
const RUN_INTERVAL_MS = Math.max(Number(process.env.COMMENT_RETENTION_INTERVAL_MS || 24 * 60 * 60 * 1000), 60_000);

let cronTimer: ReturnType<typeof setInterval> | null = null;
let lastRun: { at: string; deleted: number; days: number } | null = null;

export async function getRetentionDays(): Promise<number> {
  const envDays = Number(process.env.COMMENT_RETENTION_DAYS);
  if (Number.isFinite(envDays) && envDays >= MIN_RETENTION_DAYS) {
    return Math.min(Math.floor(envDays), MAX_RETENTION_DAYS);
  }
  const value = await getConfigValue<number | string>(RETENTION_CONFIG_KEY, DEFAULT_RETENTION_DAYS);
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  return Math.min(Math.max(Math.floor(n), MIN_RETENTION_DAYS), MAX_RETENTION_DAYS);
}

export async function setRetentionDays(days: number): Promise<number> {
  const clamped = Math.min(Math.max(Math.floor(days), MIN_RETENTION_DAYS), MAX_RETENTION_DAYS);
  await setConfigValue(RETENTION_CONFIG_KEY, clamped);
  return clamped;
}

export async function runRetentionSweep(): Promise<{ deleted: number; days: number; archived?: number }> {
  if (!isDatabaseConfigured()) return { deleted: 0, days: DEFAULT_RETENTION_DAYS };
  const days = await getRetentionDays();
  const deleted = await deleteOldComments(days);
  const at = new Date().toISOString();
  lastRun = { at, deleted, days };
  await setConfigValue(RETENTION_LAST_RUN_KEY, { at, deleted, days });
  if (deleted > 0) {
    console.log(`[retention] Deleted ${deleted} comment(s) older than ${days} day(s)`);
  }
  return { deleted, days, archived: deleted };
}

export async function getRetentionStatus() {
  const [days, storedLastRun] = await Promise.all([
    getRetentionDays(),
    getConfigValue<typeof lastRun>(RETENTION_LAST_RUN_KEY, null),
  ]);
  const resolvedLastRun = lastRun ?? storedLastRun ?? null;
  return {
    days,
    minDays: MIN_RETENTION_DAYS,
    maxDays: MAX_RETENTION_DAYS,
    lastRun: resolvedLastRun
      ? {
          at: resolvedLastRun.at,
          deleted: resolvedLastRun.deleted ?? (resolvedLastRun as { archived?: number }).archived ?? 0,
          days: resolvedLastRun.days,
          archived: resolvedLastRun.deleted ?? (resolvedLastRun as { archived?: number }).archived ?? 0,
        }
      : null,
    deletedTotal: resolvedLastRun?.deleted ?? (resolvedLastRun as { archived?: number } | null)?.archived ?? 0,
    archivedTotal: resolvedLastRun?.deleted ?? (resolvedLastRun as { archived?: number } | null)?.archived ?? 0,
  };
}

export function startCommentRetentionCron(): void {
  if (isServerDemoMode() || cronTimer) return;

  // Run once shortly after boot so operators see the effect immediately.
  setTimeout(() => {
    runRetentionSweep().catch(err => console.error('[retention] initial sweep failed:', err));
  }, 30_000);

  cronTimer = setInterval(() => {
    runRetentionSweep().catch(err => console.error('[retention] sweep failed:', err));
  }, RUN_INTERVAL_MS);

  console.log(`[retention] Cron scheduled every ${Math.round(RUN_INTERVAL_MS / 3600000)}h`);
}

export function stopCommentRetentionCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
}
