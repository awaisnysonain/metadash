import type { Ad, Comment } from '../types';
import { formatSpend } from './campaignHelpers';
import { getAdForComment, inferBrandLabel, inferSourceCategory, type BrandLabel, type SourceCategory } from './helpers';
import {
  addToCounts,
  emptySentimentCounts,
  type AdSentimentRow,
  type SentimentCounts,
  type SentimentReportData,
} from './sentimentReport';

export const TOP_SPEND_ADS_PER_BRAND = 15;

export interface TopSpendAdReportRow {
  ad: Ad;
  adId: string;
  adName: string;
  campaignName: string;
  brand: BrandLabel;
  source: SourceCategory;
  spend: number;
  spendLabel: string;
  counts: SentimentCounts;
  shareOfPeriod: number;
  riskCount: number;
}

export interface TopSpendCommentStats {
  trackedAds: number;
  totalComments: number;
  shareOfPeriod: number;
  negativeAndComplaints: number;
  happiness: number;
}

/** Top spend ads per brand account (same logic as inbox high-spend filter). */
export function getTopSpendAds(ads: Ad[], limitPerBrand = TOP_SPEND_ADS_PER_BRAND): Ad[] {
  const byAccount = new Map<string, Ad[]>();
  for (const ad of ads) {
    const spend = ad.recentSpend ?? ad.spend ?? 0;
    if (spend <= 0) continue;
    const account = (ad.accountLabel || inferBrandLabel(undefined, ad)).toUpperCase();
    byAccount.set(account, [...(byAccount.get(account) ?? []), ad]);
  }

  const picked: Ad[] = [];
  byAccount.forEach(accountAds => {
    accountAds
      .sort((a, b) => (b.recentSpend ?? b.spend ?? 0) - (a.recentSpend ?? a.spend ?? 0))
      .slice(0, limitPerBrand)
      .forEach(ad => picked.push(ad));
  });

  return picked.sort((a, b) => (b.recentSpend ?? b.spend ?? 0) - (a.recentSpend ?? a.spend ?? 0));
}

export function getTopSpendAdIdSet(ads: Ad[]): Set<string> {
  const ids = new Set<string>();
  for (const ad of getTopSpendAds(ads)) {
    ids.add(ad.id);
    ids.add(ad.adId);
    if (ad.postStoryId) ids.add(ad.postStoryId);
    if (ad.instagramMediaId) ids.add(ad.instagramMediaId);
  }
  return ids;
}

export function isCommentOnTopSpendAd(comment: Comment, ads: Ad[], idSet?: Set<string>): boolean {
  const linked = getAdForComment(comment, ads);
  if (!linked) return false;
  const ids = idSet ?? getTopSpendAdIdSet(ads);
  return ids.has(linked.id) || ids.has(linked.adId);
}

export function filterCommentsOnTopSpend(comments: Comment[], ads: Ad[]): Comment[] {
  const ids = getTopSpendAdIdSet(ads);
  return comments.filter(c => isCommentOnTopSpendAd(c, ads, ids));
}

export function countCommentsOnTopSpend(comments: Comment[], ads: Ad[]): number {
  return filterCommentsOnTopSpend(comments, ads).length;
}

function findAdSentimentRow(report: SentimentReportData, ad: Ad): AdSentimentRow | undefined {
  return report.byAd.find(r => r.adId === ad.adId || r.adId === ad.id);
}

export function buildTopSpendAdRows(report: SentimentReportData, ads: Ad[]): TopSpendAdReportRow[] {
  const periodTotal = Math.max(report.overall.total, 1);
  return getTopSpendAds(ads).map(ad => {
    const row = findAdSentimentRow(report, ad);
    const spend = ad.recentSpend ?? ad.spend ?? 0;
    const counts = row?.counts ?? emptySentimentCounts();
    const riskCount = counts.Negative + counts.Complaint;
    return {
      ad,
      adId: ad.adId || ad.id,
      adName: row?.adName ?? ad.adName,
      campaignName: row?.campaignName ?? ad.campaignName,
      brand: row?.brand ?? inferBrandLabel(undefined, ad),
      source: row?.source ?? 'Brand page',
      spend,
      spendLabel: formatSpend(spend),
      counts,
      shareOfPeriod: Math.round((counts.total / periodTotal) * 100),
      riskCount,
    };
  });
}

export function aggregateCommentCounts(comments: Comment[]): SentimentCounts {
  let counts = emptySentimentCounts();
  for (const c of comments) counts = addToCounts(counts, c.sentiment);
  return counts;
}

export function getTopSpendCommentStats(report: SentimentReportData, ads: Ad[]): TopSpendCommentStats {
  const topSpendComments = filterCommentsOnTopSpend(report.comments, ads);
  const counts = aggregateCommentCounts(topSpendComments);
  const total = topSpendComments.length;
  const periodTotal = report.overall.total;
  return {
    trackedAds: getTopSpendAds(ads).length,
    totalComments: total,
    shareOfPeriod: periodTotal > 0 ? Math.round((total / periodTotal) * 100) : 0,
    negativeAndComplaints: counts.Negative + counts.Complaint,
    happiness:
      counts.Positive + counts.Negative + counts.Complaint > 0
        ? Math.round((counts.Positive / (counts.Positive + counts.Negative + counts.Complaint)) * 100)
        : 0,
  };
}

export function topSpendSubtitle(
  listLabel: string,
  listCount: number,
  onTopSpend: number,
  periodTotal: number
): string {
  const share = periodTotal > 0 ? Math.round((onTopSpend / periodTotal) * 100) : 0;
  return `${listLabel} · ${listCount.toLocaleString()} shown · ${onTopSpend.toLocaleString()} on high-spend ads (${share}% of period)`;
}
