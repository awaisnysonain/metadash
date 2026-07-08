import type { Comment, Ad, CommentSentiment } from '../types';
import {
  getAdForComment,
  inferBrandLabel,
  inferSourceCategory,
  type BrandLabel,
  type SourceCategory,
} from './helpers';

export const US_TIMEZONE = 'America/New_York';
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Aligns with comment retention — oldest day available for historical reports. */
export const SENTIMENT_REPORT_MAX_DAYS = 30;

export const SENTIMENT_ORDER: CommentSentiment[] = [
  'Positive',
  'Question',
  'Neutral',
  'Negative',
  'Complaint',
];

export type SentimentPeriod = 'daily' | 'weekly';

export interface SentimentCounts {
  Positive: number;
  Question: number;
  Neutral: number;
  Negative: number;
  Complaint: number;
  total: number;
}

export interface AdSentimentRow {
  adId: string;
  adName: string;
  campaignName: string;
  brand: BrandLabel;
  source: SourceCategory;
  counts: SentimentCounts;
}

export interface SentimentReportData {
  period: SentimentPeriod;
  periodLabel: string;
  timezone: string;
  generatedAt: string;
  overall: SentimentCounts;
  byBrand: Record<BrandLabel, SentimentCounts>;
  bySource: Record<SourceCategory, SentimentCounts>;
  byPlatform: { facebook: SentimentCounts; instagram: SentimentCounts };
  byAd: AdSentimentRow[];
  comments: Comment[];
}

export function emptySentimentCounts(): SentimentCounts {
  return { Positive: 0, Question: 0, Neutral: 0, Negative: 0, Complaint: 0, total: 0 };
}

export function addToCounts(counts: SentimentCounts, sentiment: CommentSentiment): SentimentCounts {
  const next = { ...counts, [sentiment]: counts[sentiment] + 1, total: counts.total + 1 };
  return next;
}

export function getUsCalendarDay(isoOrMs: string | number, tz = US_TIMEZONE): string {
  const d = typeof isoOrMs === 'string' ? new Date(isoOrMs) : new Date(isoOrMs);
  return d.toLocaleDateString('en-CA', { timeZone: tz });
}

function daysBetweenCalendarDays(earlier: string, later: string): number {
  const a = new Date(`${earlier}T12:00:00`);
  const b = new Date(`${later}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function getUsTodayDay(now = Date.now(), tz = US_TIMEZONE): string {
  return getUsCalendarDay(now, tz);
}

export function getUsDayOffset(baseDay: string, offsetDays: number, tz = US_TIMEZONE): string {
  const d = new Date(`${baseDay}T12:00:00`);
  d.setDate(d.getDate() + offsetDays);
  return getUsCalendarDay(d.getTime(), tz);
}

export function getSentimentReportMinDay(now = Date.now(), tz = US_TIMEZONE): string {
  return getUsDayOffset(getUsTodayDay(now, tz), -(SENTIMENT_REPORT_MAX_DAYS - 1), tz);
}

export function isOnUsCalendarDay(iso: string, day: string, tz = US_TIMEZONE): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return getUsCalendarDay(t, tz) === day;
}

export function isInUsWeekEnding(iso: string, endDay: string, tz = US_TIMEZONE): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const commentDay = getUsCalendarDay(t, tz);
  const diff = daysBetweenCalendarDays(commentDay, endDay);
  return diff >= 0 && diff <= 6;
}

export function isInUsPeriod(
  iso: string,
  period: SentimentPeriod,
  anchorDay?: string,
  now = Date.now(),
  tz = US_TIMEZONE
): boolean {
  const day = anchorDay ?? getUsTodayDay(now, tz);
  if (period === 'daily') return isOnUsCalendarDay(iso, day, tz);
  return isInUsWeekEnding(iso, day, tz);
}

export function getPeriodLabel(
  period: SentimentPeriod,
  anchorDayOrNow?: string | number,
  tz = US_TIMEZONE
): string {
  const fmt = (day: string) => {
    const d = new Date(`${day}T12:00:00`);
    return d.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' });
  };
  const anchorDay =
    typeof anchorDayOrNow === 'string'
      ? anchorDayOrNow
      : getUsTodayDay(typeof anchorDayOrNow === 'number' ? anchorDayOrNow : Date.now(), tz);
  if (period === 'daily') return fmt(anchorDay);
  const startDay = getUsDayOffset(anchorDay, -6, tz);
  return `${fmt(startDay)} – ${fmt(anchorDay)}`;
}

export function formatUsDateTime(iso: string, tz = US_TIMEZONE): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function filterCommentsForPeriod(
  comments: Comment[],
  period: SentimentPeriod,
  anchorDay: string,
  now = Date.now()
): Comment[] {
  return comments.filter(c => isInUsPeriod(c.createdAt, period, anchorDay, now));
}

export function buildSentimentReport(
  comments: Comment[],
  ads: Ad[],
  period: SentimentPeriod,
  anchorDay?: string,
  now = Date.now()
): SentimentReportData {
  const day = anchorDay ?? getUsTodayDay(now);
  const filtered = filterCommentsForPeriod(comments, period, day, now);
  let overall = emptySentimentCounts();
  const byBrand: Record<BrandLabel, SentimentCounts> = {
    Nobl: emptySentimentCounts(),
    Flo: emptySentimentCounts(),
    Unattributed: emptySentimentCounts(),
  };
  const bySource: Record<SourceCategory, SentimentCounts> = {
    'Brand page': emptySentimentCounts(),
    'Creator / Whitelist': emptySentimentCounts(),
    'Third-party page': emptySentimentCounts(),
    Organic: emptySentimentCounts(),
  };
  const byPlatform = {
    facebook: emptySentimentCounts(),
    instagram: emptySentimentCounts(),
  };
  const adMap = new Map<string, AdSentimentRow>();

  for (const comment of filtered) {
    const ad = getAdForComment(comment, ads);
    const brand = inferBrandLabel(comment, ad);
    const source = inferSourceCategory(comment, ad);

    overall = addToCounts(overall, comment.sentiment);
    byBrand[brand] = addToCounts(byBrand[brand], comment.sentiment);
    bySource[source] = addToCounts(bySource[source], comment.sentiment);
    byPlatform[comment.platform] = addToCounts(byPlatform[comment.platform], comment.sentiment);

    const adKey = comment.adId || comment.adName || 'organic';
    const existing = adMap.get(adKey);
    if (existing) {
      existing.counts = addToCounts(existing.counts, comment.sentiment);
    } else {
      adMap.set(adKey, {
        adId: comment.adId || adKey,
        adName: comment.adName || ad?.adName || 'Organic',
        campaignName: comment.campaignName || ad?.campaignName || '—',
        brand,
        source,
        counts: addToCounts(emptySentimentCounts(), comment.sentiment),
      });
    }
  }

  const byAd = [...adMap.values()].sort((a, b) => b.counts.total - a.counts.total);

  return {
    period,
    periodLabel: getPeriodLabel(period, day),
    timezone: US_TIMEZONE,
    generatedAt: new Date(now).toISOString(),
    overall,
    byBrand,
    bySource,
    byPlatform,
    byAd,
    comments: [...filtered].sort(
      (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    ),
  };
}

function csvEscape(value: string | number | undefined | null): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function countsToCsvRow(label: string, counts: SentimentCounts): string {
  return [
    label,
    counts.total,
    counts.Positive,
    counts.Question,
    counts.Neutral,
    counts.Negative,
    counts.Complaint,
  ].map(csvEscape).join(',');
}

export function downloadSentimentReportCsv(
  report: SentimentReportData,
  ads: Ad[],
  comparison?: SentimentComparisonReport
): void {
  const lines: string[] = [];
  const periodTitle = report.period === 'daily' ? 'Daily' : 'Weekly';
  const tzLabel = 'US Eastern (America/New_York)';

  lines.push(`MetaDash Sentiment Report — ${periodTitle}`);
  lines.push(`Period,${csvEscape(report.periodLabel)}`);
  lines.push(`Timezone,${csvEscape(tzLabel)}`);
  lines.push(`Generated (UTC),${csvEscape(report.generatedAt)}`);
  lines.push('');
  lines.push('Summary');
  lines.push('Segment,Total,Positive,Question,Neutral,Negative,Complaint');
  lines.push(countsToCsvRow('Overall', report.overall));
  for (const brand of ['Nobl', 'Flo', 'Unattributed'] as BrandLabel[]) {
    if (report.byBrand[brand].total > 0) lines.push(countsToCsvRow(`Brand: ${brand}`, report.byBrand[brand]));
  }
  for (const source of Object.keys(report.bySource) as SourceCategory[]) {
    if (report.bySource[source].total > 0) {
      lines.push(countsToCsvRow(`Source: ${source}`, report.bySource[source]));
    }
  }
  lines.push(countsToCsvRow('Platform: Facebook', report.byPlatform.facebook));
  lines.push(countsToCsvRow('Platform: Instagram', report.byPlatform.instagram));

  if (comparison) {
    lines.push('');
    lines.push(`Comparison,${csvEscape(comparison.compareLabel)}`);
    lines.push('Sentiment,Current %,Prior %,Change (pts),Current #,Prior #,Change #');
    for (const d of comparison.deltas) {
      lines.push(
        [d.sentiment, d.currentPct, d.previousPct, d.deltaPts, d.current, d.previous, d.deltaCount]
          .map(csvEscape)
          .join(',')
      );
    }
    lines.push(`Happiness score,${comparison.happinessCurrent}%,${comparison.happinessPrevious}%,${comparison.happinessDelta} pts,,,`);
    lines.push(`Total volume,,,${comparison.totalDelta},${comparison.current.overall.total},${comparison.previous.overall.total},`);
  }

  lines.push('');
  lines.push('By Ad');
  lines.push('Ad Name,Campaign,Brand,Source,Total,Positive,Question,Neutral,Negative,Complaint');
  for (const row of report.byAd) {
    lines.push(
      [
        row.adName,
        row.campaignName,
        row.brand,
        row.source,
        row.counts.total,
        row.counts.Positive,
        row.counts.Question,
        row.counts.Neutral,
        row.counts.Negative,
        row.counts.Complaint,
      ].map(csvEscape).join(',')
    );
  }
  lines.push('');
  lines.push('Comments');
  lines.push(
    'Date (US ET),Platform,Brand,Source,Ad Name,Campaign,Commenter,Sentiment,Priority,Status,Comment'
  );
  for (const c of report.comments) {
    const ad = getAdForComment(c, ads);
    const brand = inferBrandLabel(c, ad);
    const source = inferSourceCategory(c, ad);
    lines.push(
      [
        formatUsDateTime(c.createdAt),
        c.platform,
        brand,
        source,
        c.adName || 'Organic',
        c.campaignName || '—',
        c.commenterName,
        c.sentiment,
        c.priority,
        c.status,
        c.commentText,
      ].map(csvEscape).join(',')
    );
  }

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const dayStamp = report.periodLabel.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  anchor.href = url;
  anchor.download = `metadash-sentiment-${report.period}-${dayStamp || getUsTodayDay().replace(/-/g, '')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function sentimentPct(counts: SentimentCounts, sentiment: CommentSentiment): number {
  if (counts.total === 0) return 0;
  return Math.round((counts[sentiment] / counts.total) * 100);
}

export function happinessScore(counts: SentimentCounts): number {
  const positive = counts.Positive;
  const negative = counts.Complaint + counts.Negative;
  const total = positive + negative;
  if (total === 0) return 0;
  return Math.round((positive / total) * 100);
}

export function getUsYesterdayDay(anchorDay?: string, tz = US_TIMEZONE): string {
  const base = anchorDay ?? getUsTodayDay();
  return getUsDayOffset(base, -1, tz);
}

export function isInUsYesterday(iso: string, anchorDay?: string, tz = US_TIMEZONE): boolean {
  return isOnUsCalendarDay(iso, getUsYesterdayDay(anchorDay, tz), tz);
}

/** Calendar days 7–13 before the anchor end day (prior week vs current week). */
export function isInPriorUsWeek(iso: string, anchorDay?: string, tz = US_TIMEZONE): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const endDay = anchorDay ?? getUsTodayDay(undefined, tz);
  const commentDay = getUsCalendarDay(t, tz);
  const diff = daysBetweenCalendarDays(commentDay, endDay);
  return diff >= 7 && diff <= 13;
}

function filterCommentsForComparison(
  comments: Comment[],
  period: SentimentPeriod,
  anchorDay: string
): Comment[] {
  if (period === 'daily') {
    const prevDay = getUsYesterdayDay(anchorDay);
    return comments.filter(c => isOnUsCalendarDay(c.createdAt, prevDay));
  }
  return comments.filter(c => isInPriorUsWeek(c.createdAt, anchorDay));
}

export interface SentimentDelta {
  sentiment: CommentSentiment;
  current: number;
  previous: number;
  currentPct: number;
  previousPct: number;
  deltaPts: number;
  deltaCount: number;
}

export interface SentimentComparisonReport {
  current: SentimentReportData;
  previous: SentimentReportData;
  compareLabel: string;
  deltas: SentimentDelta[];
  happinessCurrent: number;
  happinessPrevious: number;
  happinessDelta: number;
  totalDelta: number;
}

export function buildSentimentComparison(
  comments: Comment[],
  ads: Ad[],
  period: SentimentPeriod,
  anchorDay?: string,
  now = Date.now()
): SentimentComparisonReport {
  const day = anchorDay ?? getUsTodayDay(now);
  const current = buildSentimentReport(comments, ads, period, day, now);
  const previousFiltered = filterCommentsForComparison(comments, period, day);
  const previousPeriod: SentimentPeriod = period;
  const previous = buildSentimentReportFromList(previousFiltered, ads, previousPeriod, day, true);

  const compareLabel =
    period === 'daily'
      ? `vs prior day (${getPeriodLabel('daily', getUsYesterdayDay(day))})`
      : `vs prior 7 days (${getPeriodLabel('weekly', getUsDayOffset(day, -7))})`;

  const deltas: SentimentDelta[] = SENTIMENT_ORDER.map(sentiment => {
    const cur = current.overall[sentiment];
    const prev = previous.overall[sentiment];
    const currentPct = sentimentPct(current.overall, sentiment);
    const previousPct = sentimentPct(previous.overall, sentiment);
    return {
      sentiment,
      current: cur,
      previous: prev,
      currentPct,
      previousPct,
      deltaPts: currentPct - previousPct,
      deltaCount: cur - prev,
    };
  });

  const happinessCurrent = happinessScore(current.overall);
  const happinessPrevious = happinessScore(previous.overall);

  return {
    current,
    previous,
    compareLabel,
    deltas,
    happinessCurrent,
    happinessPrevious,
    happinessDelta: happinessCurrent - happinessPrevious,
    totalDelta: current.overall.total - previous.overall.total,
  };
}

function buildSentimentReportFromList(
  filtered: Comment[],
  ads: Ad[],
  period: SentimentPeriod,
  anchorDay: string,
  isComparison = false
): SentimentReportData {
  let overall = emptySentimentCounts();
  const byBrand: Record<BrandLabel, SentimentCounts> = {
    Nobl: emptySentimentCounts(),
    Flo: emptySentimentCounts(),
    Unattributed: emptySentimentCounts(),
  };
  const bySource: Record<SourceCategory, SentimentCounts> = {
    'Brand page': emptySentimentCounts(),
    'Creator / Whitelist': emptySentimentCounts(),
    'Third-party page': emptySentimentCounts(),
    Organic: emptySentimentCounts(),
  };
  const byPlatform = {
    facebook: emptySentimentCounts(),
    instagram: emptySentimentCounts(),
  };
  const adMap = new Map<string, AdSentimentRow>();

  for (const comment of filtered) {
    const ad = getAdForComment(comment, ads);
    const brand = inferBrandLabel(comment, ad);
    const source = inferSourceCategory(comment, ad);
    overall = addToCounts(overall, comment.sentiment);
    byBrand[brand] = addToCounts(byBrand[brand], comment.sentiment);
    bySource[source] = addToCounts(bySource[source], comment.sentiment);
    byPlatform[comment.platform] = addToCounts(byPlatform[comment.platform], comment.sentiment);
    const adKey = comment.adId || comment.adName || 'organic';
    const existing = adMap.get(adKey);
    if (existing) {
      existing.counts = addToCounts(existing.counts, comment.sentiment);
    } else {
      adMap.set(adKey, {
        adId: comment.adId || adKey,
        adName: comment.adName || ad?.adName || 'Organic',
        campaignName: comment.campaignName || ad?.campaignName || '—',
        brand,
        source,
        counts: addToCounts(emptySentimentCounts(), comment.sentiment),
      });
    }
  }

  const periodLabel = isComparison
    ? period === 'daily'
      ? getPeriodLabel('daily', getUsYesterdayDay(anchorDay))
      : getPeriodLabel('weekly', getUsDayOffset(anchorDay, -7))
    : getPeriodLabel(period, anchorDay);

  return {
    period,
    periodLabel,
    timezone: US_TIMEZONE,
    generatedAt: new Date().toISOString(),
    overall,
    byBrand,
    bySource,
    byPlatform,
    byAd: [...adMap.values()].sort((a, b) => b.counts.total - a.counts.total),
    comments: [...filtered].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)),
  };
}

export function topCommentsBySentiment(
  comments: Comment[],
  sentiments: CommentSentiment[],
  limit = 30
): Comment[] {
  return comments
    .filter(c => sentiments.includes(c.sentiment))
    .sort((a, b) => {
      const priority = (p: Comment['priority']) =>
        p === 'Urgent' ? 4 : p === 'High' ? 3 : p === 'Medium' ? 2 : 1;
      const pd = priority(b.priority) - priority(a.priority);
      if (pd !== 0) return pd;
      return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
    })
    .slice(0, limit);
}
