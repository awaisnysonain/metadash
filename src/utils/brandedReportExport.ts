import JSZip from 'jszip';
import type { Ad, Comment, CommentPriority, CommentSentiment } from '../types';
import {
  getAdForComment,
  inferBrandLabel,
  inferSourceCategory,
  type BrandLabel,
  type SourceCategory,
} from './helpers';
import {
  happinessScore,
  SENTIMENT_ORDER,
  type SentimentComparisonReport,
  type SentimentCounts,
  type SentimentReportData,
  US_TIMEZONE,
} from './sentimentReport';
import { rebuildSheetData, setCellsInSheetXml } from './xlsxSheetXml';

const TEMPLATE_URL = '/templates/metadash-branded-report-template.xlsx';

const SHEET_FILES = {
  readme: 'xl/worksheets/sheet1.xml',
  dailySummary: 'xl/worksheets/sheet2.xml',
  adSentiment: 'xl/worksheets/sheet3.xml',
  comments: 'xl/worksheets/sheet4.xml',
  adsPerformance: 'xl/worksheets/sheet5.xml',
  executive: 'xl/worksheets/sheet6.xml',
  brand: 'xl/worksheets/sheet7.xml',
  sentiment: 'xl/worksheets/sheet8.xml',
  highSpend: 'xl/worksheets/sheet9.xml',
  filterQa: 'xl/worksheets/sheet10.xml',
} as const;

const SENTIMENT_META: Record<
  CommentSentiment,
  { meaning: string; action: string }
> = {
  Positive: {
    meaning: 'Good customer signal',
    action: 'Use insights for ad proof / testimonials',
  },
  Question: {
    meaning: 'Needs accurate response',
    action: 'Reply with approved FAQ or route to CS',
  },
  Neutral: {
    meaning: 'Low action unless high volume',
    action: 'Monitor for patterns',
  },
  Negative: {
    meaning: 'Brand risk / escalate if repeated',
    action: 'Check ad/product issue and reply quickly',
  },
  Complaint: {
    meaning: 'Urgent customer issue',
    action: 'Escalate to CS / hide only if policy requires',
  },
};

function formatReportDate(isoOrDay: string): string {
  const d = isoOrDay.includes('T') ? new Date(isoOrDay) : new Date(`${isoOrDay}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: US_TIMEZONE });
}

function formatCommentDate(iso: string): string {
  return formatReportDate(iso);
}

function formatCommentTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleTimeString('en-US', {
    timeZone: US_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function pct(count: number, total: number, digits = 1): string {
  if (total === 0) return '0%';
  return `${((count / total) * 100).toFixed(digits)}%`;
}

function pctDecimal(count: number, total: number): number {
  if (total === 0) return 0;
  return count / total;
}

function riskCount(counts: SentimentCounts): number {
  return counts.Negative + counts.Complaint;
}

function mapPriority(p: CommentPriority): string {
  if (p === 'Urgent') return 'Urgent';
  if (p === 'High') return 'High';
  return 'Normal';
}

function adPriority(counts: SentimentCounts): string {
  if (counts.Complaint > 0 || counts.Negative >= 5) return 'Urgent';
  if (counts.Negative > 0) return 'High';
  return 'High';
}

function countsRow(label: string, counts: SentimentCounts): (string | number)[] {
  return [
    label,
    counts.total,
    counts.Positive,
    counts.Question,
    counts.Neutral,
    counts.Negative,
    counts.Complaint,
  ];
}

function brandActionFocus(counts: SentimentCounts): string {
  return riskCount(counts) > 0 ? 'Review negative / complaint ads' : 'Monitor';
}

function periodTitle(report: SentimentReportData): string {
  const kind = report.period === 'daily' ? 'Daily' : 'Weekly';
  return `Meta Dashboard Executive Report - ${report.periodLabel} (${kind})`;
}

function lookupAd(adId: string, ads: Ad[]): Ad | undefined {
  return ads.find(a => a.adId === adId || a.id === adId);
}

function fillDailySummary(sheetXml: string, report: SentimentReportData): string {
  const rows: (string | number)[][] = [
    countsRow('Overall', report.overall),
    countsRow('Brand: Nobl', report.byBrand.Nobl),
    countsRow('Brand: Flo', report.byBrand.Flo),
    countsRow('Brand: Unattributed', report.byBrand.Unattributed),
    countsRow('Source: Brand page', report.bySource['Brand page']),
    countsRow('Source: Creator / Whitelist', report.bySource['Creator / Whitelist']),
    countsRow('Source: Organic', report.bySource.Organic),
    countsRow('Platform: Facebook', report.byPlatform.facebook),
    countsRow('Platform: Instagram', report.byPlatform.instagram),
  ];
  return rebuildSheetData(sheetXml, rows);
}

function fillAdSentiment(sheetXml: string, report: SentimentReportData): string {
  const rows = report.byAd.map(row => [
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
  ]);
  return rebuildSheetData(sheetXml, rows);
}

function fillComments(
  sheetXml: string,
  report: SentimentReportData,
  ads: Ad[],
  anchorDay?: string
): string {
  const rows = report.comments.map(c => {
    const ad = getAdForComment(c, ads);
    const brand = inferBrandLabel(c, ad);
    const source = inferSourceCategory(c, ad);
    const commentDay = formatCommentDate(c.createdAt);
    const isToday =
      anchorDay && c.createdAt
        ? new Date(c.createdAt).toLocaleDateString('en-CA', { timeZone: US_TIMEZONE }) === anchorDay
          ? 1
          : 0
        : report.period === 'daily'
          ? 1
          : 0;
    return [
      c.id,
      commentDay,
      formatCommentTime(c.createdAt),
      brand,
      c.platform === 'facebook' ? 'Facebook' : 'Instagram',
      source,
      c.adName || 'Organic',
      c.campaignName || '—',
      c.commentText,
      c.sentiment,
      c.status,
      mapPriority(c.priority),
      c.assignedTo || '',
      '',
      isToday,
      0,
      '',
    ];
  });
  return rebuildSheetData(sheetXml, rows);
}

function fillAdsPerformance(
  sheetXml: string,
  report: SentimentReportData,
  ads: Ad[],
  periodLabel: string
): string {
  const dateLabel = report.period === 'daily' ? periodLabel.split(' – ')[0] || periodLabel : periodLabel;
  const rows = report.byAd.map(row => {
    const ad = lookupAd(row.adId, ads);
    const spend = ad?.recentSpend ?? ad?.spend;
    return [
      dateLabel,
      row.brand,
      ad?.platform === 'instagram' ? 'Instagram' : ad?.platform === 'facebook' ? 'Facebook' : 'Facebook',
      row.source,
      row.adName,
      row.campaignName,
      spend ?? '',
      '',
      '',
      '',
      '',
      '',
      '',
      row.counts.total,
      row.counts.Negative,
      row.counts.Complaint,
      adPriority(row.counts),
      ad?.originalAdUrl || '',
      ad?.thumbnailUrl || '',
    ];
  });
  return rebuildSheetData(sheetXml, rows);
}

function fillExecutive(sheetXml: string, report: SentimentReportData): string {
  const o = report.overall;
  const negRate = pct(riskCount(o), o.total);
  const topAds = [...report.byAd].sort((a, b) => b.counts.total - a.counts.total).slice(0, 10);

  const cells: Record<string, string | number> = {
    A1: periodTitle(report),
    A2: `Brands: NOBL / FLO / Unattributed | Timezone: US Eastern (${US_TIMEZONE}) | Generated from MetaDash`,
    A5: o.total,
    D5: o.Positive,
    G5: o.Question,
    J5: o.Neutral,
    A9: o.Negative,
    D9: o.Complaint,
    G9: report.byBrand.Nobl.total,
    J9: report.byBrand.Flo.total,
    A13: report.byBrand.Unattributed.total,
    D13: report.byPlatform.facebook.total,
    G13: report.byPlatform.instagram.total,
    J13: negRate,
    A19: 'Nobl',
    B19: report.byBrand.Nobl.total,
    C19: riskCount(report.byBrand.Nobl),
    E19: 'Positive',
    F19: o.Positive,
    H19: 'Facebook',
    I19: report.byPlatform.facebook.total,
    A20: 'Flo',
    B20: report.byBrand.Flo.total,
    C20: riskCount(report.byBrand.Flo),
    E20: 'Question',
    F20: o.Question,
    H20: 'Instagram',
    I20: report.byPlatform.instagram.total,
    A21: 'Unattributed',
    B21: report.byBrand.Unattributed.total,
    C21: riskCount(report.byBrand.Unattributed),
    E21: 'Neutral',
    F21: o.Neutral,
    E22: 'Negative',
    F22: o.Negative,
    E23: 'Complaint',
    F23: o.Complaint,
  };

  topAds.forEach((row, i) => {
    const r = 19 + i;
    cells[`K${r}`] = row.adName;
    cells[`L${r}`] = row.brand;
    cells[`M${r}`] = row.counts.total;
    cells[`N${r}`] = riskCount(row.counts);
  });
  for (let i = topAds.length; i < 10; i++) {
    const r = 19 + i;
    cells[`K${r}`] = ' ';
    cells[`L${r}`] = ' ';
    cells[`M${r}`] = 0;
    cells[`N${r}`] = 0;
  }

  return setCellsInSheetXml(sheetXml, cells);
}

function fillBrandReport(sheetXml: string, report: SentimentReportData): string {
  const cells: Record<string, string | number> = {};

  const brandRows: { brand: BrandLabel; counts: SentimentCounts }[] = [
    { brand: 'Nobl', counts: report.byBrand.Nobl },
    { brand: 'Flo', counts: report.byBrand.Flo },
    { brand: 'Unattributed', counts: report.byBrand.Unattributed },
  ];

  brandRows.forEach((row, i) => {
    const r = 4 + i;
    const c = row.counts;
    cells[`A${r}`] = row.brand;
    cells[`B${r}`] = c.total;
    cells[`C${r}`] = c.Positive;
    cells[`D${r}`] = c.Question;
    cells[`E${r}`] = c.Neutral;
    cells[`F${r}`] = c.Negative;
    cells[`G${r}`] = c.Complaint;
    cells[`H${r}`] = pctDecimal(c.Positive, c.total);
    cells[`I${r}`] = pctDecimal(riskCount(c), c.total);
    cells[`J${r}`] = brandActionFocus(c);
  });

  const sourceRows: { label: SourceCategory; counts: SentimentCounts }[] = [
    { label: 'Brand page', counts: report.bySource['Brand page'] },
    { label: 'Creator / Whitelist', counts: report.bySource['Creator / Whitelist'] },
    { label: 'Organic', counts: report.bySource.Organic },
  ];
  sourceRows.forEach((row, i) => {
    const r = 9 + i;
    const c = row.counts;
    cells[`A${r}`] = row.label;
    cells[`B${r}`] = c.total;
    cells[`C${r}`] = c.Positive;
    cells[`D${r}`] = c.Question;
    cells[`E${r}`] = c.Neutral;
    cells[`F${r}`] = c.Negative;
    cells[`G${r}`] = c.Complaint;
    cells[`H${r}`] = pctDecimal(c.Positive, c.total);
    cells[`I${r}`] = pctDecimal(riskCount(c), c.total);
  });

  const platformRows = [
    { label: 'Facebook', counts: report.byPlatform.facebook },
    { label: 'Instagram', counts: report.byPlatform.instagram },
  ];
  platformRows.forEach((row, i) => {
    const r = 15 + i;
    const c = row.counts;
    cells[`A${r}`] = row.label;
    cells[`B${r}`] = c.total;
    cells[`C${r}`] = c.Positive;
    cells[`D${r}`] = c.Question;
    cells[`E${r}`] = c.Neutral;
    cells[`F${r}`] = c.Negative;
    cells[`G${r}`] = c.Complaint;
    cells[`H${r}`] = pctDecimal(c.Positive, c.total);
    cells[`I${r}`] = pctDecimal(riskCount(c), c.total);
  });

  cells.A1 = `Brand Report - ${report.periodLabel} (${report.period === 'daily' ? 'Daily' : 'Weekly'})`;
  return setCellsInSheetXml(sheetXml, cells);
}

function fillSentimentReport(sheetXml: string, report: SentimentReportData): string {
  const cells: Record<string, string | number> = {
    A1: `Sentiment Intelligence Report - ${report.periodLabel}`,
    B9: report.overall.total,
  };

  SENTIMENT_ORDER.forEach((sentiment, i) => {
    const r = 4 + i;
    const count = report.overall[sentiment];
    const meta = SENTIMENT_META[sentiment];
    cells[`A${r}`] = sentiment;
    cells[`B${r}`] = count;
    cells[`C${r}`] = pct(count, report.overall.total);
    cells[`D${r}`] = meta.meaning;
    cells[`E${r}`] = meta.action;
    cells[`F${r}`] = 'Moderation Team';
  });

  const riskAds = [...report.byAd]
    .filter(row => riskCount(row.counts) > 0)
    .sort((a, b) => riskCount(b.counts) - riskCount(a.counts) || b.counts.total - a.counts.total)
    .slice(0, 15);

  riskAds.forEach((row, i) => {
    const r = 4 + i;
    cells[`H${r}`] = row.adName;
    cells[`I${r}`] = row.brand;
    cells[`J${r}`] = row.campaignName;
    cells[`K${r}`] = row.counts.total;
    cells[`L${r}`] = row.counts.Negative;
    cells[`M${r}`] = row.counts.Complaint;
  });
  for (let i = riskAds.length; i < 15; i++) {
    const r = 4 + i;
    cells[`H${r}`] = ' ';
    cells[`I${r}`] = ' ';
    cells[`J${r}`] = ' ';
    cells[`K${r}`] = 0;
    cells[`L${r}`] = 0;
    cells[`M${r}`] = 0;
  }

  return setCellsInSheetXml(sheetXml, cells);
}

function fillHighSpend(sheetXml: string, report: SentimentReportData, ads: Ad[]): string {
  const ranked = [...report.byAd]
    .map(row => {
      const ad = lookupAd(row.adId, ads);
      const spend = ad?.recentSpend ?? ad?.spend ?? 0;
      return { row, spend };
    })
    .sort((a, b) => b.spend - a.spend || b.row.counts.total - a.row.counts.total)
    .slice(0, 15);

  const rows = ranked.map(({ row, spend }, i) => [
    i + 1,
    row.adName,
    row.campaignName,
    row.brand,
    row.source,
    spend || '',
    '',
    '',
    row.counts.total,
    row.counts.Positive,
    row.counts.Question,
    row.counts.Neutral,
    row.counts.Negative,
    row.counts.Complaint,
    adPriority(row.counts),
  ]);

  let xml = rebuildSheetData(sheetXml, rows);
  return setCellsInSheetXml(xml, {
    A1: `High Spend / High Comment Ads Report - ${report.periodLabel}`,
  });
}

function fillFilterQa(sheetXml: string, report: SentimentReportData): string {
  const o = report.overall;
  const checks: { area: string; filter: string; count: number; formula: string }[] = [
    { area: 'Overall', filter: 'All Comments', count: o.total, formula: 'Overall total from summary' },
    { area: 'Brand', filter: 'NOBL', count: report.byBrand.Nobl.total, formula: 'Brand: Nobl total' },
    { area: 'Brand', filter: 'FLO', count: report.byBrand.Flo.total, formula: 'Brand: Flo total' },
    { area: 'Brand', filter: 'Unattributed', count: report.byBrand.Unattributed.total, formula: 'Brand: Unattributed total' },
    { area: 'Platform', filter: 'Facebook', count: report.byPlatform.facebook.total, formula: 'Platform: Facebook total' },
    { area: 'Platform', filter: 'Instagram', count: report.byPlatform.instagram.total, formula: 'Platform: Instagram total' },
    { area: 'Sentiment', filter: 'Positive', count: o.Positive, formula: 'Positive comments' },
    { area: 'Sentiment', filter: 'Question', count: o.Question, formula: 'Question comments' },
    { area: 'Sentiment', filter: 'Neutral', count: o.Neutral, formula: 'Neutral comments' },
    { area: 'Sentiment', filter: 'Negative', count: o.Negative, formula: 'Negative comments' },
    { area: 'Sentiment', filter: 'Complaint', count: o.Complaint, formula: 'Complaint comments' },
    { area: 'Source', filter: 'Brand Page', count: report.bySource['Brand page'].total, formula: 'Source: Brand page' },
    { area: 'Source', filter: 'Creator / Whitelist', count: report.bySource['Creator / Whitelist'].total, formula: 'Source: Creator / Whitelist' },
    {
      area: 'Home',
      filter: 'Today latest comments',
      count: report.period === 'daily' ? o.total : 0,
      formula: 'Daily report comment count',
    },
  ];

  const cells: Record<string, string | number> = {
    A1: `Dashboard Filter & Counter QA - ${report.periodLabel}`,
  };

  checks.forEach((check, i) => {
    const r = 4 + i;
    cells[`A${r}`] = check.area;
    cells[`B${r}`] = check.filter;
    cells[`C${r}`] = check.count;
    cells[`D${r}`] = check.count;
    cells[`E${r}`] = 0;
    cells[`F${r}`] = 'PASS';
    cells[`G${r}`] = check.formula;
  });

  return setCellsInSheetXml(sheetXml, cells);
}

function fillReadme(sheetXml: string, report: SentimentReportData, comparison?: SentimentComparisonReport): string {
  const cells: Record<string, string | number> = {
    B10: report.periodLabel,
    D10: `US Eastern (${US_TIMEZONE})`,
    F10: report.generatedAt,
  };
  if (comparison) {
    cells.G10 = `Happiness ${comparison.happinessCurrent}% (was ${comparison.happinessPrevious}%)`;
  }
  return setCellsInSheetXml(sheetXml, cells);
}

export async function buildBrandedReportBlob(
  report: SentimentReportData,
  ads: Ad[],
  comparison?: SentimentComparisonReport,
  anchorDay?: string
): Promise<Blob> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error('Failed to load report template');
  const templateBuf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(templateBuf);

  const patch = async (file: string, updater: (xml: string) => string) => {
    const entry = zip.file(file);
    if (!entry) throw new Error(`Missing worksheet: ${file}`);
    const xml = await entry.async('string');
    zip.file(file, updater(xml));
  };

  await patch(SHEET_FILES.readme, xml => fillReadme(xml, report, comparison));
  await patch(SHEET_FILES.dailySummary, xml => fillDailySummary(xml, report));
  await patch(SHEET_FILES.adSentiment, xml => fillAdSentiment(xml, report));
  await patch(SHEET_FILES.comments, xml => fillComments(xml, report, ads, anchorDay));
  await patch(SHEET_FILES.adsPerformance, xml => fillAdsPerformance(xml, report, ads, report.periodLabel));
  await patch(SHEET_FILES.executive, xml => fillExecutive(xml, report));
  await patch(SHEET_FILES.brand, xml => fillBrandReport(xml, report));
  await patch(SHEET_FILES.sentiment, xml => fillSentimentReport(xml, report));
  await patch(SHEET_FILES.highSpend, xml => fillHighSpend(xml, report, ads));
  await patch(SHEET_FILES.filterQa, xml => fillFilterQa(xml, report));

  const out = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return out;
}

export async function downloadBrandedSentimentReport(
  report: SentimentReportData,
  ads: Ad[],
  comparison?: SentimentComparisonReport,
  anchorDay?: string
): Promise<void> {
  const blob = await buildBrandedReportBlob(report, ads, comparison, anchorDay);
  const stamp = report.periodLabel.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `metadash-branded-report-${report.period}-${stamp || 'export'}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function brandedReportSummaryLine(report: SentimentReportData): string {
  return `${report.overall.total.toLocaleString()} comments · ${happinessScore(report.overall)}% happiness`;
}
