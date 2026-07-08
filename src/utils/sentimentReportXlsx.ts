import ExcelJS from 'exceljs';
import type { Ad, Comment, CommentSentiment } from '../types';
import {
  displayCommenterName,
  formatCommentTime,
  getAdForComment,
  inferBrandLabel,
  inferSourceCategory,
} from './helpers';
import {
  formatUsDateTime,
  happinessScore,
  SENTIMENT_ORDER,
  topCommentsBySentiment,
  type SentimentComparisonReport,
  type SentimentCounts,
  type SentimentReportData,
  US_TIMEZONE,
  getUsTodayDay,
} from './sentimentReport';
import {
  buildTopSpendAdRows,
  countCommentsOnTopSpend,
  getTopSpendCommentStats,
  topSpendSubtitle,
  aggregateCommentCounts,
  filterCommentsOnTopSpend,
  isCommentOnTopSpendAd,
  type TopSpendCommentStats,
} from './topSpendAds';

const BRAND_GREEN = 'FF0F5B4D';
const BRAND_GREEN_LIGHT = 'FF1A7A64';
const BRAND_GREEN_DARK = 'FF1A3D36';
const GOLD = 'FFB8860B';
const GOLD_BG = 'FFFFF8EB';
const WHITE = 'FFFFFFFF';
const INK = 'FF1A1F24';
const MUTED = 'FF6B7280';
const LINE = 'FFE8ECE9';

const SENTIMENT_COLORS: Record<CommentSentiment, string> = {
  Positive: 'FF2D7A5F',
  Question: 'FF0F5B4D',
  Neutral: 'FFB8860B',
  Negative: 'FFC17D3A',
  Complaint: 'FFB54545',
};

const SENTIMENT_HEADER_BG: Record<CommentSentiment, string> = {
  Positive: 'FFE8F5EF',
  Question: 'FFE6F0EE',
  Neutral: 'FFFDF6E8',
  Negative: 'FFFBF0E8',
  Complaint: 'FFFCECEC',
};

const TAB_COLORS = {
  summary: 'FF0F5B4D',
  positive: 'FF2D7A5F',
  negative: 'FFB54545',
  topSpend: 'FFB8860B',
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function setCell(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: string | number | null | undefined,
  style?: Partial<ExcelJS.Style>
) {
  const cell = ws.getCell(row, col);
  cell.value = value ?? '';
  if (style) cell.style = { ...cell.style, ...style };
  return cell;
}

function sectionTitle(ws: ExcelJS.Worksheet, row: number, col: number, endCol: number, title: string, subtitle?: string) {
  ws.mergeCells(row, col, row, endCol);
  setCell(ws, row, col, title, {
    font: { bold: true, size: 11, color: { argb: WHITE } },
    fill: solidFill(BRAND_GREEN_DARK),
    alignment: { vertical: 'middle' },
  });
  ws.getRow(row).height = 22;
  if (subtitle) {
    ws.mergeCells(row + 1, col, row + 1, endCol);
    setCell(ws, row + 1, col, subtitle, {
      font: { size: 9, color: { argb: MUTED } },
      fill: solidFill('FFF7FAF8'),
      alignment: { wrapText: true, vertical: 'middle' },
    });
    ws.getRow(row + 1).height = 18;
    return row + 2;
  }
  return row + 1;
}

function headerCell(ws: ExcelJS.Worksheet, row: number, col: number, value: string, bg = BRAND_GREEN) {
  return setCell(ws, row, col, value, {
    font: { bold: true, color: { argb: WHITE }, size: 10 },
    fill: solidFill(bg),
    alignment: { vertical: 'middle', horizontal: col <= 2 ? 'left' : 'center', wrapText: true },
    border: { bottom: { style: 'medium', color: { argb: '33FFFFFF' } } },
  });
}

function sentimentHeaderCell(ws: ExcelJS.Worksheet, row: number, col: number, sentiment: CommentSentiment) {
  return setCell(ws, row, col, sentiment, {
    font: { bold: true, color: { argb: SENTIMENT_COLORS[sentiment] }, size: 9 },
    fill: solidFill(SENTIMENT_HEADER_BG[sentiment]),
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: { bottom: { style: 'medium', color: { argb: SENTIMENT_COLORS[sentiment] + '33' } } },
  });
}

function sentimentValueCell(ws: ExcelJS.Worksheet, row: number, col: number, value: number, sentiment: CommentSentiment) {
  const style: Partial<ExcelJS.Style> =
    value > 0
      ? {
          font: { bold: true, color: { argb: SENTIMENT_COLORS[sentiment] } },
          fill: solidFill(SENTIMENT_HEADER_BG[sentiment]),
          alignment: { horizontal: 'center' },
        }
      : { font: { color: { argb: MUTED } }, alignment: { horizontal: 'center' } };
  return setCell(ws, row, col, value > 0 ? value : '—', style);
}

function deltaText(delta: number, suffix = ' pts'): string {
  if (delta === 0) return 'No change';
  return `${delta > 0 ? '+' : ''}${delta}${suffix}`;
}

function deltaFont(delta: number, positiveIsGood: boolean): Partial<ExcelJS.Font> {
  if (delta === 0) return { color: { argb: MUTED }, italic: true };
  const up = delta > 0;
  const good = positiveIsGood ? up : !up;
  return { bold: true, color: { argb: good ? 'FF2D7A5F' : 'FFB54545' } };
}

function sentimentDeltaFont(sentiment: CommentSentiment, deltaPts: number): Partial<ExcelJS.Font> {
  if (deltaPts === 0) return { color: { argb: MUTED }, italic: true };
  const up = deltaPts > 0;
  let good = false;
  if (sentiment === 'Positive') good = up;
  else if (sentiment === 'Complaint' || sentiment === 'Negative') good = !up;
  return { bold: true, color: { argb: good ? 'FF2D7A5F' : 'FFB54545' } };
}

function writeSegmentTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  rows: { label: string; counts: SentimentCounts; bold?: boolean }[]
): number {
  let row = startRow;
  headerCell(ws, row, 1, 'Segment');
  headerCell(ws, row, 2, 'Comments');
  SENTIMENT_ORDER.forEach((s, i) => sentimentHeaderCell(ws, row, 3 + i, s));
  headerCell(ws, row, 8, 'Happiness');
  row += 1;

  for (const seg of rows) {
    if (seg.counts.total === 0 && seg.label !== 'Overall' && seg.label !== 'High-spend ads') continue;
    const bg = seg.bold ? 'FFF5F8F7' : undefined;
    setCell(ws, row, 1, seg.label, {
      font: { bold: !!seg.bold, color: { argb: INK } },
      fill: bg ? solidFill(bg) : undefined,
    });
    setCell(ws, row, 2, seg.counts.total, {
      font: { bold: true },
      alignment: { horizontal: 'right' },
      fill: bg ? solidFill(bg) : undefined,
    });
    SENTIMENT_ORDER.forEach((s, i) => sentimentValueCell(ws, row, 3 + i, seg.counts[s], s));
    setCell(ws, row, 8, `${happinessScore(seg.counts)}%`, {
      font: { bold: true, color: { argb: 'FF2D7A5F' } },
      alignment: { horizontal: 'right' },
      fill: bg ? solidFill(bg) : undefined,
    });
    row += 1;
  }
  return row;
}

function buildTopSpendBanner(ws: ExcelJS.Worksheet, row: number, stats: TopSpendCommentStats, endCol: number): number {
  ws.mergeCells(row, 1, row, endCol);
  setCell(
    ws,
    row,
    1,
    `High-spend ads: ${stats.totalComments.toLocaleString()} comments across ${stats.trackedAds} tracked ads (${stats.shareOfPeriod}% of period) · ${stats.negativeAndComplaints} need attention · ${stats.happiness}% happiness on spend`,
    {
      font: { size: 10, color: { argb: INK } },
      fill: solidFill(GOLD_BG),
      alignment: { wrapText: true, vertical: 'middle' },
      border: {
        top: { style: 'thin', color: { argb: LINE } },
        bottom: { style: 'thin', color: { argb: LINE } },
        left: { style: 'thin', color: { argb: LINE } },
        right: { style: 'thin', color: { argb: LINE } },
      },
    }
  );
  ws.getRow(row).height = 28;
  return row + 2;
}

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  report: SentimentReportData,
  topSpendStats: TopSpendCommentStats,
  topSpendCounts: SentimentCounts,
  comparison?: SentimentComparisonReport
) {
  const ws = wb.addWorksheet('Summary', {
    properties: { tabColor: { argb: TAB_COLORS.summary } },
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  ws.columns = [
    { width: 18 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 12 },
    { width: 12 },
  ];

  const kind = report.period === 'daily' ? 'Daily report' : 'Weekly report';
  ws.mergeCells(1, 1, 1, 9);
  setCell(ws, 1, 1, `MetaDash Sentiment Report`, {
    font: { bold: true, size: 16, color: { argb: WHITE } },
    fill: solidFill(BRAND_GREEN),
    alignment: { vertical: 'middle' },
  });
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, 9);
  setCell(
    ws,
    2,
    1,
    `${kind} · ${report.periodLabel} · US Eastern (${US_TIMEZONE}) · Generated ${formatUsDateTime(report.generatedAt)}`,
    {
      font: { size: 10, color: { argb: 'FFE8F5EF' } },
      fill: solidFill(BRAND_GREEN_LIGHT),
      alignment: { vertical: 'middle', wrapText: true },
    }
  );
  ws.getRow(2).height = 20;

  let row = 4;
  row = buildTopSpendBanner(ws, row, topSpendStats, 9);

  if (comparison) {
    ws.mergeCells(row, 1, row, 4);
    setCell(ws, row, 1, 'HOW THIS PERIOD COMPARES', {
      font: { bold: true, size: 9, color: { argb: 'B3FFFFFF' } },
      fill: solidFill(BRAND_GREEN),
    });
    setCell(ws, row, 5, comparison.compareLabel, {
      font: { bold: true, size: 10, color: { argb: WHITE } },
      fill: solidFill(BRAND_GREEN),
    });
    ws.mergeCells(row, 6, row, 8);
    setCell(
      ws,
      row,
      6,
      `Comment volume ${comparison.totalDelta > 0 ? '+' : ''}${comparison.totalDelta} · Happiness ${comparison.happinessCurrent}% (was ${comparison.happinessPrevious}%)`,
      {
        font: { bold: true, size: 10, color: { argb: WHITE } },
        fill: solidFill(BRAND_GREEN),
        alignment: { horizontal: 'right', wrapText: true },
      }
    );
    setCell(ws, row, 9, deltaText(comparison.happinessDelta, '%'), {
      font: deltaFont(comparison.happinessDelta, true),
      fill: solidFill(BRAND_GREEN),
      alignment: { horizontal: 'right' },
    });
    ws.getRow(row).height = 24;
    row += 1;

    row = sectionTitle(ws, row, 1, 9, 'Sentiment breakdown', 'Share of comments in this period vs the prior period');
    ['Sentiment', 'This period %', 'Prior period %', 'Change', 'This period #', 'Prior period #', 'Change #'].forEach((h, i) => {
      headerCell(ws, row, i + 1, h, BRAND_GREEN_DARK);
    });
    row += 1;

    for (const d of comparison.deltas) {
      setCell(ws, row, 1, d.sentiment, {
        font: { bold: true, color: { argb: SENTIMENT_COLORS[d.sentiment] } },
        fill: solidFill(SENTIMENT_HEADER_BG[d.sentiment]),
      });
      setCell(ws, row, 2, `${d.currentPct}%`, { alignment: { horizontal: 'center' }, font: { bold: true } });
      setCell(ws, row, 3, `${d.previousPct}%`, { alignment: { horizontal: 'center' }, font: { color: { argb: MUTED } } });
      setCell(ws, row, 4, deltaText(d.deltaPts), {
        font: sentimentDeltaFont(d.sentiment, d.deltaPts),
        alignment: { horizontal: 'center' },
      });
      setCell(ws, row, 5, d.current, { alignment: { horizontal: 'center' } });
      setCell(ws, row, 6, d.previous, { alignment: { horizontal: 'center' }, font: { color: { argb: MUTED } } });
      setCell(ws, row, 7, d.deltaCount > 0 ? `+${d.deltaCount}` : String(d.deltaCount), {
        alignment: { horizontal: 'center' },
      });
      row += 1;
    }
    row += 1;
  }

  row = sectionTitle(
    ws,
    row,
    1,
    9,
    'Comments by segment',
    `${report.overall.total.toLocaleString()} total comments · ${happinessScore(report.overall)}% overall happiness`
  );
  row = writeSegmentTable(ws, row, [
    { label: 'Overall', counts: report.overall, bold: true },
    { label: 'High-spend ads', counts: topSpendCounts },
    { label: 'Facebook', counts: report.byPlatform.facebook },
    { label: 'Instagram', counts: report.byPlatform.instagram },
    { label: 'Nobl', counts: report.byBrand.Nobl },
    { label: 'Flo', counts: report.byBrand.Flo },
    { label: 'Unattributed', counts: report.byBrand.Unattributed },
  ]);
}

function buildCommentsSheet(
  wb: ExcelJS.Workbook,
  name: string,
  tabColor: string,
  title: string,
  subtitle: string,
  headerBg: string,
  accent: string,
  comments: Comment[],
  ads: Ad[],
  periodTotal: number
) {
  const onTopSpend = countCommentsOnTopSpend(comments, ads);
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  ws.columns = [
    { width: 5 },
    { width: 18 },
    { width: 44 },
    { width: 30 },
    { width: 10 },
    { width: 12 },
    { width: 11 },
    { width: 16 },
    { width: 12 },
  ];

  ws.mergeCells(1, 1, 1, 9);
  setCell(ws, 1, 1, title, {
    font: { bold: true, size: 15, color: { argb: accent } },
    fill: solidFill(headerBg),
  });
  ws.mergeCells(2, 1, 2, 9);
  setCell(ws, 2, 1, subtitle, {
    font: { size: 10, color: { argb: MUTED } },
    fill: solidFill(headerBg),
    alignment: { wrapText: true },
  });
  ws.mergeCells(3, 1, 3, 9);
  setCell(
    ws,
    3,
    1,
    topSpendSubtitle('This tab', comments.length, onTopSpend, periodTotal),
    {
      font: { size: 9, italic: true, color: { argb: GOLD } },
      fill: solidFill(GOLD_BG),
    }
  );
  ws.getRow(1).height = 26;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 18;

  const headers = ['#', 'Commenter', 'Comment', 'Ad / source', 'Brand', 'Sentiment', 'Platform', 'Time', 'High spend'];
  headers.forEach((h, i) => headerCell(ws, 4, i + 1, h));

  let row = 5;
  for (const [index, comment] of comments.entries()) {
    const ad = getAdForComment(comment, ads);
    const brand = inferBrandLabel(comment, ad);
    const source = inferSourceCategory(comment, ad);
    const zebra = index % 2 === 0 ? 'FFFDFDFB' : 'FFFFFFFF';
    const isTopSpend = isCommentOnTopSpendAd(comment, ads);

    setCell(ws, row, 1, index + 1, {
      alignment: { horizontal: 'center' },
      fill: solidFill(zebra),
      font: { color: { argb: MUTED } },
    });
    setCell(ws, row, 2, displayCommenterName(comment.commenterName), {
      font: { bold: true },
      fill: solidFill(zebra),
    });
    setCell(ws, row, 3, comment.commentText, { fill: solidFill(zebra), alignment: { wrapText: true } });
    setCell(ws, row, 4, `${comment.adName || 'Organic'}\n${source}`, {
      fill: solidFill(zebra),
      font: { size: 9, color: { argb: MUTED } },
      alignment: { wrapText: true },
    });
    setCell(ws, row, 5, brand, { fill: solidFill(zebra) });
    setCell(ws, row, 6, comment.sentiment, {
      font: { bold: true, color: { argb: SENTIMENT_COLORS[comment.sentiment] } },
      fill: solidFill(SENTIMENT_HEADER_BG[comment.sentiment]),
      alignment: { horizontal: 'center' },
    });
    setCell(ws, row, 7, comment.platform === 'facebook' ? 'Facebook' : 'Instagram', {
      fill: solidFill(zebra),
      alignment: { horizontal: 'center' },
    });
    setCell(ws, row, 8, formatCommentTime(comment.createdAt), {
      fill: solidFill(zebra),
      font: { size: 9, color: { argb: MUTED } },
    });
    setCell(ws, row, 9, isTopSpend ? 'Yes' : '—', {
      fill: solidFill(isTopSpend ? GOLD_BG : zebra),
      font: { bold: isTopSpend, color: { argb: isTopSpend ? GOLD : MUTED } },
      alignment: { horizontal: 'center' },
    });
    row += 1;
  }

  if (comments.length === 0) {
    ws.mergeCells(5, 1, 5, 9);
    setCell(ws, 5, 1, 'No comments in this category for the selected period.', {
      font: { italic: true, color: { argb: MUTED } },
      alignment: { horizontal: 'center' },
    });
  }
}

function buildTopSpendSheet(
  wb: ExcelJS.Workbook,
  report: SentimentReportData,
  ads: Ad[],
  topSpendStats: TopSpendCommentStats
) {
  const rows = buildTopSpendAdRows(report, ads);
  const ws = wb.addWorksheet('Top spend ads', {
    properties: { tabColor: { argb: TAB_COLORS.topSpend } },
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  ws.columns = [
    { width: 5 },
    { width: 38 },
    { width: 22 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 10 },
    { width: 10 },
  ];

  ws.mergeCells(1, 1, 1, 14);
  setCell(ws, 1, 1, `Top spend ads — ${report.periodLabel}`, {
    font: { bold: true, size: 15, color: { argb: WHITE } },
    fill: solidFill(BRAND_GREEN),
  });
  ws.mergeCells(2, 1, 2, 14);
  setCell(
    ws,
    2,
    1,
    `Highest recent spend per brand account · ${rows.length} ads tracked · sorted by spend`,
    {
      font: { size: 10, color: { argb: 'FFE8F5EF' } },
      fill: solidFill(BRAND_GREEN_LIGHT),
    }
  );
  ws.mergeCells(3, 1, 3, 14);
  setCell(
    ws,
    3,
    1,
    `${topSpendStats.totalComments.toLocaleString()} comments on high-spend ads (${topSpendStats.shareOfPeriod}% of period) · ${topSpendStats.negativeAndComplaints} negative or complaints`,
    {
      font: { size: 9, italic: true, color: { argb: GOLD } },
      fill: solidFill(GOLD_BG),
      alignment: { wrapText: true },
    }
  );

  const hdr = 4;
  headerCell(ws, hdr, 1, '#');
  headerCell(ws, hdr, 2, 'Ad name');
  headerCell(ws, hdr, 3, 'Campaign');
  headerCell(ws, hdr, 4, 'Brand');
  headerCell(ws, hdr, 5, 'Recent spend');
  headerCell(ws, hdr, 6, 'Comments');
  headerCell(ws, hdr, 7, '% of period');
  SENTIMENT_ORDER.forEach((s, i) => sentimentHeaderCell(ws, hdr, 8 + i, s));
  headerCell(ws, hdr, 13, 'Happiness');
  headerCell(ws, hdr, 14, 'Risk');

  let row = 5;
  for (const [index, adRow] of rows.entries()) {
    const zebra = index % 2 === 0 ? 'FFF8FAF9' : 'FFFFFFFF';
    setCell(ws, row, 1, index + 1, {
      alignment: { horizontal: 'center' },
      fill: solidFill(zebra),
      font: { color: { argb: MUTED } },
    });
    setCell(ws, row, 2, adRow.adName, { font: { bold: true }, fill: solidFill(zebra) });
    setCell(ws, row, 3, adRow.campaignName, { fill: solidFill(zebra), font: { color: { argb: MUTED } } });
    setCell(ws, row, 4, adRow.brand, { fill: solidFill(zebra) });
    setCell(ws, row, 5, adRow.spendLabel, {
      font: { bold: true, color: { argb: GOLD } },
      alignment: { horizontal: 'right' },
      fill: solidFill(zebra),
    });
    setCell(ws, row, 6, adRow.counts.total, {
      font: { bold: true, size: 12 },
      alignment: { horizontal: 'right' },
      fill: solidFill(zebra),
    });
    setCell(ws, row, 7, `${adRow.shareOfPeriod}%`, {
      alignment: { horizontal: 'right' },
      fill: solidFill(zebra),
      font: { color: { argb: MUTED } },
    });
    SENTIMENT_ORDER.forEach((s, i) => sentimentValueCell(ws, row, 8 + i, adRow.counts[s], s));
    setCell(ws, row, 13, `${happinessScore(adRow.counts)}%`, {
      font: { bold: true, color: { argb: 'FF2D7A5F' } },
      alignment: { horizontal: 'right' },
      fill: solidFill(zebra),
    });
    setCell(ws, row, 14, adRow.riskCount, {
      font: { bold: true, color: { argb: adRow.riskCount > 0 ? 'FFB54545' : MUTED } },
      alignment: { horizontal: 'center' },
      fill: solidFill(zebra),
    });
    row += 1;
  }

  if (rows.length === 0) {
    ws.mergeCells(5, 1, 5, 14);
    setCell(ws, 5, 1, 'No high-spend ads with spend data available.', {
      font: { italic: true, color: { argb: MUTED } },
      alignment: { horizontal: 'center' },
    });
  }
}

export async function downloadSentimentReportXlsx(
  report: SentimentReportData,
  ads: Ad[],
  comparison?: SentimentComparisonReport
): Promise<void> {
  const topSpendStats = getTopSpendCommentStats(report, ads);
  const topSpendCounts = aggregateCommentCounts(filterCommentsOnTopSpend(report.comments, ads));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetaDash';
  wb.created = new Date();

  buildSummarySheet(wb, report, topSpendStats, topSpendCounts, comparison);

  const topPositive = topCommentsBySentiment(report.comments, ['Positive'], 40);
  buildCommentsSheet(
    wb,
    'Top positive',
    TAB_COLORS.positive,
    'Top positive comments',
    'Best customer signals — ranked by priority, then newest first',
    SENTIMENT_HEADER_BG.Positive,
    SENTIMENT_COLORS.Positive,
    topPositive,
    ads,
    report.overall.total
  );

  const topNegative = topCommentsBySentiment(report.comments, ['Complaint', 'Negative'], 40);
  buildCommentsSheet(
    wb,
    'Top negative',
    TAB_COLORS.negative,
    'Top negative & complaints',
    'Issues that may need a fast reply — urgent items first',
    SENTIMENT_HEADER_BG.Complaint,
    SENTIMENT_COLORS.Complaint,
    topNegative,
    ads,
    report.overall.total
  );

  buildTopSpendSheet(wb, report, ads, topSpendStats);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dayStamp = report.periodLabel.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `metadash-sentiment-${report.period}-${dayStamp || getUsTodayDay().replace(/-/g, '')}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
