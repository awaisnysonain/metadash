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

const BRAND_GREEN = 'FF0F5B4D';
const BRAND_GREEN_LIGHT = 'FF1A7A64';
const WHITE = 'FFFFFFFF';
const INK = 'FF1A1F24';
const MUTED = 'FF6B7280';

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
  ads: 'FF64748B',
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

function headerCell(ws: ExcelJS.Worksheet, row: number, col: number, value: string, bg = BRAND_GREEN) {
  return setCell(ws, row, col, value, {
    font: { bold: true, color: { argb: WHITE }, size: 10 },
    fill: solidFill(bg),
    alignment: { vertical: 'middle', horizontal: col <= 2 ? 'left' : 'center' },
    border: {
      bottom: { style: 'medium', color: { argb: '33FFFFFF' } },
    },
  });
}

function sentimentHeaderCell(ws: ExcelJS.Worksheet, row: number, col: number, sentiment: CommentSentiment) {
  return setCell(ws, row, col, sentiment.slice(0, 3).toUpperCase(), {
    font: { bold: true, color: { argb: SENTIMENT_COLORS[sentiment] }, size: 9 },
    fill: solidFill(SENTIMENT_HEADER_BG[sentiment]),
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      bottom: { style: 'medium', color: { argb: SENTIMENT_COLORS[sentiment].slice(0, 2) + SENTIMENT_COLORS[sentiment].slice(2) + '33' } },
    },
  });
}

function sentimentValueCell(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: number,
  sentiment: CommentSentiment
) {
  const style: Partial<ExcelJS.Style> =
    value > 0
      ? {
          font: { bold: true, color: { argb: SENTIMENT_COLORS[sentiment] } },
          fill: solidFill(SENTIMENT_HEADER_BG[sentiment]),
          alignment: { horizontal: 'center' },
        }
      : {
          font: { color: { argb: MUTED } },
          alignment: { horizontal: 'center' },
        };
  return setCell(ws, row, col, value > 0 ? value : '—', style);
}

function deltaText(delta: number, suffix = 'pts'): string {
  if (delta === 0) return 'same';
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

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  report: SentimentReportData,
  comparison?: SentimentComparisonReport
) {
  const ws = wb.addWorksheet('Summary', {
    properties: { tabColor: { argb: TAB_COLORS.summary } },
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  ws.columns = [
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
  ];

  const kind = report.period === 'daily' ? 'Daily' : 'Weekly';
  ws.mergeCells(1, 1, 1, 9);
  setCell(ws, 1, 1, `MetaDash Sentiment Report — ${report.periodLabel} (${kind})`, {
    font: { bold: true, size: 14, color: { argb: WHITE } },
    fill: solidFill(BRAND_GREEN),
    alignment: { vertical: 'middle' },
  });
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, 9);
  setCell(
    ws,
    2,
    1,
    `US Eastern (${US_TIMEZONE}) · Generated ${formatUsDateTime(report.generatedAt)} · Total ${report.overall.total.toLocaleString()} · Happiness ${happinessScore(report.overall)}%`,
    {
      font: { size: 10, color: { argb: 'FFE8F5EF' } },
      fill: solidFill(BRAND_GREEN_LIGHT),
      alignment: { vertical: 'middle' },
    }
  );
  ws.getRow(2).height = 20;

  let row = 4;
  if (comparison) {
    ws.mergeCells(row, 1, row, 5);
    setCell(ws, row, 1, 'PERIOD COMPARISON', {
      font: { bold: true, size: 9, color: { argb: 'B3FFFFFF' } },
      fill: solidFill(BRAND_GREEN),
    });
    setCell(ws, row, 6, comparison.compareLabel, {
      font: { bold: true, size: 10, color: { argb: WHITE } },
      fill: solidFill(BRAND_GREEN),
    });
    ws.mergeCells(row, 7, row, 9);
    setCell(
      ws,
      row,
      7,
      `Volume ${comparison.totalDelta > 0 ? '+' : ''}${comparison.totalDelta} · Happiness ${comparison.happinessCurrent}% (was ${comparison.happinessPrevious}%)`,
      {
        font: { bold: true, size: 10, color: { argb: WHITE } },
        fill: solidFill(BRAND_GREEN),
        alignment: { horizontal: 'right' },
      }
    );
    setCell(ws, row, 9, deltaText(comparison.happinessDelta, '%'), {
      font: deltaFont(comparison.happinessDelta, true),
      fill: solidFill(BRAND_GREEN),
      alignment: { horizontal: 'right' },
    });
    ws.getRow(row).height = 22;
    row += 1;

    ['Sentiment', 'Now %', 'Prior %', 'Change', 'Now #', 'Prior #', 'Change #', '', ''].forEach((h, i) => {
      if (i < 7) headerCell(ws, row, i + 1, h, 'FF1A3D36');
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
      setCell(ws, row, 7, d.deltaCount > 0 ? `+${d.deltaCount}` : d.deltaCount, {
        alignment: { horizontal: 'center' },
        font: { color: { argb: d.deltaCount > 0 ? INK : MUTED } },
      });
      row += 1;
    }
    row += 1;
  }

  headerCell(ws, row, 1, 'Segment');
  headerCell(ws, row, 2, 'Total');
  SENTIMENT_ORDER.forEach((s, i) => sentimentHeaderCell(ws, row, 3 + i, s));
  headerCell(ws, row, 8, 'Happy %');
  row += 1;

  const segmentRows: { label: string; counts: SentimentCounts; bold?: boolean }[] = [
    { label: 'Overall', counts: report.overall, bold: true },
    { label: 'Facebook', counts: report.byPlatform.facebook },
    { label: 'Instagram', counts: report.byPlatform.instagram },
    { label: 'Nobl', counts: report.byBrand.Nobl },
    { label: 'Flo', counts: report.byBrand.Flo },
    { label: 'Unattributed', counts: report.byBrand.Unattributed },
  ];

  for (const seg of segmentRows) {
    if (seg.counts.total === 0 && seg.label !== 'Overall') continue;
    setCell(ws, row, 1, seg.label, {
      font: { bold: !!seg.bold, color: { argb: INK } },
      fill: seg.bold ? solidFill('FFF5F8F7') : undefined,
    });
    setCell(ws, row, 2, seg.counts.total, {
      font: { bold: true },
      alignment: { horizontal: 'right' },
      fill: seg.bold ? solidFill('FFF5F8F7') : undefined,
    });
    SENTIMENT_ORDER.forEach((s, i) => sentimentValueCell(ws, row, 3 + i, seg.counts[s], s));
    setCell(ws, row, 8, `${happinessScore(seg.counts)}%`, {
      font: { bold: true, color: { argb: 'FF2D7A5F' } },
      alignment: { horizontal: 'right' },
      fill: seg.bold ? solidFill('FFF5F8F7') : undefined,
    });
    row += 1;
  }
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
  ads: Ad[]
) {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  ws.columns = [
    { width: 5 },
    { width: 18 },
    { width: 42 },
    { width: 28 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 16 },
  ];

  ws.mergeCells(1, 1, 1, 8);
  setCell(ws, 1, 1, title, {
    font: { bold: true, size: 14, color: { argb: accent } },
    fill: solidFill(headerBg),
  });
  ws.mergeCells(2, 1, 2, 8);
  setCell(ws, 2, 1, subtitle, {
    font: { size: 10, color: { argb: MUTED } },
    fill: solidFill(headerBg),
  });
  ws.getRow(1).height = 24;
  ws.getRow(2).height = 18;

  const headers = ['#', 'Commenter', 'Comment', 'Ad / source', 'Brand', 'Sentiment', 'Platform', 'Time'];
  headers.forEach((h, i) => headerCell(ws, 3, i + 1, h));

  let row = 4;
  for (const [index, comment] of comments.entries()) {
    const ad = getAdForComment(comment, ads);
    const brand = inferBrandLabel(comment, ad);
    const source = inferSourceCategory(comment, ad);
    const zebra = index % 2 === 0 ? 'FFFDFDFB' : 'FFFFFFFF';

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
    if (comment.priority === 'Urgent') {
      ws.getCell(row, 2).note = 'Urgent';
    }
    row += 1;
  }

  if (comments.length === 0) {
    ws.mergeCells(4, 1, 4, 8);
    setCell(ws, 4, 1, 'No comments in this category for the selected period.', {
      font: { italic: true, color: { argb: MUTED } },
      alignment: { horizontal: 'center' },
    });
  }
}

function buildByAdSheet(wb: ExcelJS.Workbook, report: SentimentReportData) {
  const ws = wb.addWorksheet('By ad', {
    properties: { tabColor: { argb: TAB_COLORS.ads } },
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  ws.columns = [
    { width: 5 },
    { width: 36 },
    { width: 22 },
    { width: 12 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 10 },
  ];

  ws.mergeCells(1, 1, 1, 11);
  setCell(ws, 1, 1, `Comments by ad — ${report.periodLabel}`, {
    font: { bold: true, size: 14, color: { argb: WHITE } },
    fill: solidFill(BRAND_GREEN),
  });
  ws.mergeCells(2, 1, 2, 11);
  setCell(ws, 2, 1, `${report.byAd.length} ads with comments in period`, {
    font: { size: 10, color: { argb: 'FFE8F5EF' } },
    fill: solidFill(BRAND_GREEN_LIGHT),
  });

  headerCell(ws, 3, 1, '#');
  headerCell(ws, 3, 2, 'Ad name');
  headerCell(ws, 3, 3, 'Campaign');
  headerCell(ws, 3, 4, 'Brand');
  headerCell(ws, 3, 5, 'Total');
  SENTIMENT_ORDER.forEach((s, i) => sentimentHeaderCell(ws, 3, 6 + i, s));
  headerCell(ws, 3, 11, 'Happy %');

  let row = 4;
  for (const [index, adRow] of report.byAd.entries()) {
    const zebra = index % 2 === 0 ? 'FFF8FAF9' : 'FFFFFFFF';
    setCell(ws, row, 1, index + 1, {
      alignment: { horizontal: 'center' },
      fill: solidFill(zebra),
      font: { color: { argb: MUTED } },
    });
    setCell(ws, row, 2, adRow.adName, { font: { bold: true }, fill: solidFill(zebra) });
    setCell(ws, row, 3, adRow.campaignName, { fill: solidFill(zebra), font: { color: { argb: MUTED } } });
    setCell(ws, row, 4, adRow.brand, { fill: solidFill(zebra) });
    setCell(ws, row, 5, adRow.counts.total, {
      font: { bold: true, size: 12 },
      alignment: { horizontal: 'right' },
      fill: solidFill(zebra),
    });
    SENTIMENT_ORDER.forEach((s, i) => sentimentValueCell(ws, row, 6 + i, adRow.counts[s], s));
    setCell(ws, row, 11, `${happinessScore(adRow.counts)}%`, {
      font: { bold: true, color: { argb: 'FF2D7A5F' } },
      alignment: { horizontal: 'right' },
      fill: solidFill(zebra),
    });
    row += 1;
  }
}

export async function downloadSentimentReportXlsx(
  report: SentimentReportData,
  ads: Ad[],
  comparison?: SentimentComparisonReport
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetaDash';
  wb.created = new Date();

  buildSummarySheet(wb, report, comparison);

  const topPositive = topCommentsBySentiment(report.comments, ['Positive'], 40);
  buildCommentsSheet(
    wb,
    'Top positive',
    TAB_COLORS.positive,
    'Top positive comments',
    'Ranked by priority, then newest',
    SENTIMENT_HEADER_BG.Positive,
    SENTIMENT_COLORS.Positive,
    topPositive,
    ads
  );

  const topNegative = topCommentsBySentiment(report.comments, ['Complaint', 'Negative'], 40);
  buildCommentsSheet(
    wb,
    'Top negative',
    TAB_COLORS.negative,
    'Top negative & complaints',
    'Complaints and negative sentiment · urgent first',
    SENTIMENT_HEADER_BG.Complaint,
    SENTIMENT_COLORS.Complaint,
    topNegative,
    ads
  );

  buildByAdSheet(wb, report);

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
