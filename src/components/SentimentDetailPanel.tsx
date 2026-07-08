import React, { useMemo, useState } from 'react';
import {
  X,
  Download,
  Facebook,
  Instagram,
  ChevronUp,
  ChevronDown,
  Minus,
  ThumbsUp,
  ThumbsDown,
  LayoutGrid,
} from 'lucide-react';
import type { Comment, Ad, CommentSentiment } from '../types';
import type { InboxFilters } from './UnifiedInbox';
import {
  displayCommenterName,
  formatCommentTime,
  getAdForComment,
  inferBrandLabel,
  inferSourceCategory,
  sentimentStyles,
} from '../utils/helpers';
import {
  buildSentimentComparison,
  downloadSentimentReportCsv,
  happinessScore,
  SENTIMENT_ORDER,
  sentimentPct,
  topCommentsBySentiment,
  type SentimentPeriod,
  US_TIMEZONE,
} from '../utils/sentimentReport';

interface SentimentDetailPanelProps {
  comments: Comment[];
  ads: Ad[];
  onClose: () => void;
  onSelectComment?: (comment: Comment) => void;
  onNavigateToInbox?: (filters?: InboxFilters) => void;
}

type PanelTab = 'summary' | 'positive' | 'negative' | 'ads';

const SENTIMENT_COLORS: Record<CommentSentiment, string> = {
  Positive: '#2D7A5F',
  Question: '#0F5B4D',
  Neutral: '#B8860B',
  Negative: '#C17D3A',
  Complaint: '#B54545',
};

const SENTIMENT_HEADER_BG: Record<CommentSentiment, string> = {
  Positive: '#E8F5EF',
  Question: '#E6F0EE',
  Neutral: '#FDF6E8',
  Negative: '#FBF0E8',
  Complaint: '#FCECEC',
};

const TABS: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'summary', label: 'Summary', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { id: 'positive', label: 'Top positive', icon: <ThumbsUp className="w-3.5 h-3.5" /> },
  { id: 'negative', label: 'Top negative', icon: <ThumbsDown className="w-3.5 h-3.5" /> },
  { id: 'ads', label: 'By ad', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
];

function DeltaBadge({
  value,
  suffix = 'pts',
  positiveIsGood = false,
}: {
  value: number;
  suffix?: string;
  positiveIsGood?: boolean;
}) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular" style={{ color: 'var(--color-muted)' }}>
        <Minus className="w-3 h-3" /> same
      </span>
    );
  }
  const up = value > 0;
  const good = positiveIsGood ? up : !up;
  const color = good ? 'var(--color-sem-green)' : 'var(--color-sem-red)';
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular" style={{ color }}>
      {up ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      {up ? '+' : ''}{value}{suffix}
    </span>
  );
}

function SentimentDeltaBadge({ sentiment, deltaPts }: { sentiment: CommentSentiment; deltaPts: number }) {
  if (deltaPts === 0) return <DeltaBadge value={0} />;
  const up = deltaPts > 0;
  let good = false;
  if (sentiment === 'Positive') good = up;
  else if (sentiment === 'Complaint' || sentiment === 'Negative') good = !up;
  else good = false;
  const color = good ? 'var(--color-sem-green)' : up ? 'var(--color-sem-red)' : 'var(--color-sem-green)';
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular" style={{ color }}>
      {up ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      {up ? '+' : ''}{deltaPts}pts
    </span>
  );
}

function ComparisonChart({
  deltas,
  compareLabel,
  happinessCurrent,
  happinessPrevious,
  happinessDelta,
  totalDelta,
}: {
  deltas: ReturnType<typeof buildSentimentComparison>['deltas'];
  compareLabel: string;
  happinessCurrent: number;
  happinessPrevious: number;
  happinessDelta: number;
  totalDelta: number;
}) {
  const maxPct = Math.max(1, ...deltas.flatMap(d => [d.currentPct, d.previousPct]));

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-line)' }}>
      <div
        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        style={{ background: 'linear-gradient(90deg, #0F5B4D 0%, #1A7A64 100%)' }}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">Period comparison</p>
          <p className="text-[13px] font-semibold text-white mt-0.5">{compareLabel}</p>
        </div>
        <div className="flex flex-wrap gap-4 text-white">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide opacity-70">Volume</p>
            <p className="text-lg font-bold tabular flex items-center gap-1 justify-end">
              {totalDelta > 0 ? '+' : ''}{totalDelta}
              <span className="text-[11px] font-normal opacity-80">comments</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide opacity-70">Happiness</p>
            <p className="text-lg font-bold tabular">
              {happinessCurrent}%
              <span className="text-[11px] font-normal ml-1.5 opacity-90">was {happinessPrevious}%</span>
            </p>
            <DeltaBadge value={happinessDelta} suffix="%" positiveIsGood />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3" style={{ background: 'var(--color-ground)' }}>
        <div className="grid grid-cols-[88px_1fr_72px_72px_64px] gap-2 text-[10px] font-bold uppercase tracking-[0.08em] px-1" style={{ color: 'var(--color-muted)' }}>
          <span>Sentiment</span>
          <span>Share of comments</span>
          <span className="text-right">Now</span>
          <span className="text-right">Prior</span>
          <span className="text-right">Change</span>
        </div>
        {deltas.map(row => (
          <div key={row.sentiment} className="grid grid-cols-[88px_1fr_72px_72px_64px] gap-2 items-center">
            <span
              className="text-[11px] font-bold rounded-md px-2 py-1 text-center truncate"
              style={{ background: SENTIMENT_HEADER_BG[row.sentiment], color: SENTIMENT_COLORS[row.sentiment] }}
            >
              {row.sentiment}
            </span>
            <div className="space-y-1">
              <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-line-soft)' }}>
                <div
                  className="h-full rounded-l-full transition-all"
                  style={{ width: `${(row.currentPct / maxPct) * 100}%`, background: SENTIMENT_COLORS[row.sentiment], opacity: 1 }}
                  title={`Current ${row.currentPct}%`}
                />
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden opacity-50" style={{ background: 'var(--color-line-soft)' }}>
                <div
                  className="h-full rounded-l-full"
                  style={{ width: `${(row.previousPct / maxPct) * 100}%`, background: SENTIMENT_COLORS[row.sentiment] }}
                  title={`Prior ${row.previousPct}%`}
                />
              </div>
            </div>
            <span className="text-right text-[13px] font-bold tabular" style={{ color: 'var(--color-ink)' }}>
              {row.currentPct}%
            </span>
            <span className="text-right text-[12px] tabular" style={{ color: 'var(--color-muted)' }}>
              {row.previousPct}%
            </span>
            <span className="text-right">
              <SentimentDeltaBadge sentiment={row.sentiment} deltaPts={row.deltaPts} />
            </span>
          </div>
        ))}
        <p className="text-[10px] pt-1" style={{ color: 'var(--color-muted)' }}>
          Taller bar = current period · Faded bar = comparison period
        </p>
      </div>
    </div>
  );
}

function SheetTable({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl overflow-hidden shadow-sm ${className}`} style={{ border: '1px solid var(--color-line)' }}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[12px]">{children}</table>
      </div>
    </div>
  );
}

function SheetHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr style={{ background: 'linear-gradient(180deg, #1A3D36 0%, #0F5B4D 100%)', color: '#FFFFFF' }}>
        {children}
      </tr>
    </thead>
  );
}

function Th({ children, align = 'left', width }: { children: React.ReactNode; align?: 'left' | 'center' | 'right'; width?: string }) {
  return (
    <th
      className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] whitespace-nowrap"
      style={{ textAlign: align, width, borderBottom: '2px solid rgba(255,255,255,0.15)' }}
    >
      {children}
    </th>
  );
}

function SentimentTh({ sentiment }: { sentiment: CommentSentiment }) {
  return (
    <th
      className="px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em] text-center whitespace-nowrap"
      style={{ background: SENTIMENT_HEADER_BG[sentiment], color: SENTIMENT_COLORS[sentiment], borderBottom: `2px solid ${SENTIMENT_COLORS[sentiment]}33` }}
    >
      {sentiment.slice(0, 3)}
    </th>
  );
}

function Td({ children, align = 'left', muted }: { children: React.ReactNode; align?: 'left' | 'center' | 'right'; muted?: boolean }) {
  return (
    <td
      className={`px-3 py-2.5 border-b align-top ${muted ? '' : 'font-medium'}`}
      style={{
        textAlign: align,
        borderColor: 'var(--color-line-soft)',
        color: muted ? 'var(--color-muted)' : 'var(--color-ink)',
        background: 'var(--color-panel)',
      }}
    >
      {children}
    </td>
  );
}

function SentimentTd({ value, sentiment }: { value: number; sentiment: CommentSentiment }) {
  return (
    <td
      className="px-2 py-2.5 text-center tabular font-semibold border-b"
      style={{
        borderColor: 'var(--color-line-soft)',
        background: value > 0 ? SENTIMENT_HEADER_BG[sentiment] : 'var(--color-panel)',
        color: value > 0 ? SENTIMENT_COLORS[sentiment] : 'var(--color-muted)',
      }}
    >
      {value > 0 ? value : '—'}
    </td>
  );
}

export default function SentimentDetailPanel({
  comments,
  ads,
  onClose,
  onSelectComment,
  onNavigateToInbox,
}: SentimentDetailPanelProps) {
  const [period, setPeriod] = useState<SentimentPeriod>('daily');
  const [activeTab, setActiveTab] = useState<PanelTab>('summary');

  const comparison = useMemo(
    () => buildSentimentComparison(comments, ads, period),
    [comments, ads, period]
  );
  const { current: report } = comparison;

  const topPositive = useMemo(
    () => topCommentsBySentiment(report.comments, ['Positive'], 40),
    [report.comments]
  );
  const topNegative = useMemo(
    () => topCommentsBySentiment(report.comments, ['Complaint', 'Negative'], 40),
    [report.comments]
  );

  const brandSwatch = (brand: string) =>
    brand === 'Nobl' ? '#3A5F5D' : brand === 'Flo' ? 'var(--color-brand-ig)' : 'var(--color-muted)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15, 18, 24, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-5xl max-h-[94vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-fade-in"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0F5B4D 0%, #1A6B5C 50%, #2D8A72 100%)' }}>
          <div className="flex items-start justify-between gap-4 px-5 py-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">MetaDash · Insights</p>
              <h2 className="font-editorial text-[26px] text-white mt-1 leading-tight">Sentiment report</h2>
              <p className="text-[13px] mt-1.5 text-white/80">
                {report.periodLabel}
                <span className="mx-2 opacity-40">·</span>
                US Eastern ({US_TIMEZONE.replace('America/', '').replace('_', ' ')})
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => downloadSentimentReportCsv(report, ads, comparison)}
                disabled={report.overall.total === 0}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold disabled:opacity-40 transition-colors"
                style={{ background: 'rgba(255,255,255,0.95)', color: '#0F5B4D' }}
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.25)' }}
                aria-label="Close"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          <div className="px-5 pb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.2)' }}>
              {(['daily', 'weekly'] as SentimentPeriod[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className="px-4 py-2 rounded-md text-[12px] font-semibold transition-colors"
                  style={
                    period === p
                      ? { background: '#FFFFFF', color: '#0F5B4D', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }
                      : { color: 'rgba(255,255,255,0.85)' }
                  }
                >
                  {p === 'daily' ? 'Today' : 'Past 7 days'}
                </button>
              ))}
            </div>
            <div className="flex gap-4 ml-auto text-white">
              <div>
                <p className="text-[10px] uppercase tracking-wide opacity-60">Total comments</p>
                <p className="text-2xl font-editorial tabular leading-none mt-0.5">{report.overall.total.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide opacity-60">Happiness score</p>
                <p className="text-2xl font-editorial tabular leading-none mt-0.5">{happinessScore(report.overall)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-0 overflow-x-auto shrink-0 px-5"
          style={{ background: 'var(--color-ground)', borderBottom: '1px solid var(--color-line)' }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-3 text-[12px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors"
              style={{
                color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-muted)',
                borderColor: activeTab === tab.id ? 'var(--color-accent)' : 'transparent',
                background: activeTab === tab.id ? 'var(--color-panel)' : 'transparent',
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'positive' && topPositive.length > 0 && (
                <span className="ml-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold tabular bg-emerald-100 text-emerald-800">
                  {topPositive.length}
                </span>
              )}
              {tab.id === 'negative' && topNegative.length > 0 && (
                <span className="ml-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold tabular bg-red-100 text-red-800">
                  {topNegative.length}
                </span>
              )}
              {tab.id === 'ads' && report.byAd.length > 0 && (
                <span className="ml-1 rounded px-1.5 py-0.5 text-[9px] font-extrabold tabular bg-slate-200 text-slate-700">
                  {report.byAd.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ background: 'var(--color-ground)' }}>
          {report.overall.total === 0 ? (
            <div className="py-20 text-center rounded-2xl" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}>
              <p className="text-[15px] font-semibold" style={{ color: 'var(--color-ink)' }}>No comments in this period</p>
              <p className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>Try switching to the past 7 days view.</p>
            </div>
          ) : (
            <>
              {activeTab === 'summary' && (
                <div className="space-y-4">
                  <ComparisonChart
                    deltas={comparison.deltas}
                    compareLabel={comparison.compareLabel}
                    happinessCurrent={comparison.happinessCurrent}
                    happinessPrevious={comparison.happinessPrevious}
                    happinessDelta={comparison.happinessDelta}
                    totalDelta={comparison.totalDelta}
                  />

                  <SheetTable>
                    <SheetHead>
                      <Th>Segment</Th>
                      <Th align="right">Total</Th>
                      {SENTIMENT_ORDER.map(s => (
                        <SentimentTh key={s} sentiment={s} />
                      ))}
                      <Th align="right">Happy %</Th>
                    </SheetHead>
                    <tbody>
                      <SheetDataRow label="Overall" counts={report.overall} bold />
                      <SheetDataRow label="Facebook" counts={report.byPlatform.facebook} />
                      <SheetDataRow label="Instagram" counts={report.byPlatform.instagram} />
                      {(['Nobl', 'Flo', 'Unattributed'] as const).map(brand =>
                        report.byBrand[brand].total > 0 ? (
                          <SheetDataRow key={brand} label={brand} counts={report.byBrand[brand]} />
                        ) : null
                      )}
                    </tbody>
                  </SheetTable>
                </div>
              )}

              {activeTab === 'positive' && (
                <CommentSheet
                  title="Top positive comments"
                  subtitle="Ranked by priority, then newest"
                  headerColor="#E8F5EF"
                  accentColor="#2D7A5F"
                  comments={topPositive}
                  ads={ads}
                  onSelectComment={onSelectComment}
                  onNavigateToInbox={() => onNavigateToInbox?.({ sentiment: 'Positive' })}
                />
              )}

              {activeTab === 'negative' && (
                <CommentSheet
                  title="Top negative & complaints"
                  subtitle="Complaints and negative sentiment · urgent first"
                  headerColor="#FCECEC"
                  accentColor="#B54545"
                  comments={topNegative}
                  ads={ads}
                  onSelectComment={onSelectComment}
                  onNavigateToInbox={() => onNavigateToInbox?.({ sentiment: 'Complaint' })}
                />
              )}

              {activeTab === 'ads' && (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <h3 className="font-editorial text-[17px]" style={{ color: 'var(--color-ink)' }}>Comments by ad</h3>
                      <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                        {report.byAd.length} ads with comments in period · click a row to open in inbox
                      </p>
                    </div>
                  </div>
                  <SheetTable>
                    <SheetHead>
                      <Th width="36px">#</Th>
                      <Th>Ad name</Th>
                      <Th>Campaign</Th>
                      <Th>Brand</Th>
                      <Th align="right">Total</Th>
                      {SENTIMENT_ORDER.map(s => (
                        <SentimentTh key={s} sentiment={s} />
                      ))}
                      <Th align="right">Happy %</Th>
                    </SheetHead>
                    <tbody>
                      {report.byAd.map((row, index) => (
                        <tr
                          key={row.adId}
                          onClick={() => onNavigateToInbox?.({ adId: row.adId })}
                          className="cursor-pointer hover:opacity-90 transition-opacity"
                        >
                          <Td align="center" muted>{index + 1}</Td>
                          <Td>
                            <div className="flex items-center gap-2 min-w-0 max-w-[220px]">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: brandSwatch(row.brand) }} />
                              <span className="truncate font-semibold text-[12.5px]">{row.adName}</span>
                            </div>
                          </Td>
                          <Td muted>
                            <span className="truncate block max-w-[140px]">{row.campaignName}</span>
                          </Td>
                          <Td muted>{row.brand}</Td>
                          <Td align="right">
                            <span className="font-bold tabular text-[14px]">{row.counts.total}</span>
                          </Td>
                          {SENTIMENT_ORDER.map(s => (
                            <SentimentTd key={s} value={row.counts[s]} sentiment={s} />
                          ))}
                          <Td align="right">
                            <span className="font-bold tabular" style={{ color: 'var(--color-sem-green)' }}>
                              {happinessScore(row.counts)}%
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </SheetTable>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SheetDataRow({
  label,
  counts,
  bold,
}: {
  label: string;
  counts: import('../utils/sentimentReport').SentimentCounts;
  bold?: boolean;
}) {
  return (
    <tr>
      <Td>
        <span className={bold ? 'font-bold text-[13px]' : ''}>{label}</span>
      </Td>
      <Td align="right">
        <span className="font-bold tabular">{counts.total}</span>
      </Td>
      {SENTIMENT_ORDER.map(s => (
        <SentimentTd key={s} value={counts[s]} sentiment={s} />
      ))}
      <Td align="right">
        <span className="font-bold tabular" style={{ color: 'var(--color-sem-green)' }}>
          {happinessScore(counts)}%
        </span>
      </Td>
    </tr>
  );
}

function CommentSheet({
  title,
  subtitle,
  headerColor,
  accentColor,
  comments,
  ads,
  onSelectComment,
  onNavigateToInbox,
}: {
  title: string;
  subtitle: string;
  headerColor: string;
  accentColor: string;
  comments: Comment[];
  ads: Ad[];
  onSelectComment?: (comment: Comment) => void;
  onNavigateToInbox?: () => void;
}) {
  if (comments.length === 0) {
    return (
      <div className="py-16 text-center rounded-2xl" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}>
        <p className="text-[14px]" style={{ color: 'var(--color-muted)' }}>No comments in this category for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-t-xl px-4 py-3 flex items-baseline justify-between"
        style={{ background: headerColor, borderBottom: `2px solid ${accentColor}33` }}
      >
        <div>
          <h3 className="font-editorial text-[17px]" style={{ color: accentColor }}>{title}</h3>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-muted)' }}>{subtitle}</p>
        </div>
        {onNavigateToInbox && (
          <button
            type="button"
            onClick={onNavigateToInbox}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: accentColor, color: '#FFF' }}
          >
            Open in inbox
          </button>
        )}
      </div>
      <SheetTable className="rounded-t-none">
        <SheetHead>
          <Th width="40px">#</Th>
          <Th>Commenter</Th>
          <Th>Comment</Th>
          <Th>Ad / source</Th>
          <Th>Brand</Th>
          <Th>Sentiment</Th>
          <Th>Platform</Th>
          <Th>Time</Th>
        </SheetHead>
        <tbody>
          {comments.map((comment, index) => {
            const ad = getAdForComment(comment, ads);
            const brand = inferBrandLabel(comment, ad);
            const source = inferSourceCategory(comment, ad);
            return (
              <tr
                key={comment.id}
                onClick={() => onSelectComment?.(comment)}
                className="cursor-pointer hover:opacity-90"
              >
                <Td align="center" muted>{index + 1}</Td>
                <Td>
                  <span className="font-semibold text-[12.5px]">{displayCommenterName(comment.commenterName)}</span>
                  {comment.priority === 'Urgent' && (
                    <span className="ml-1 text-[9px] font-bold uppercase text-red-600">Urgent</span>
                  )}
                </Td>
                <Td>
                  <p className="line-clamp-2 max-w-[280px] text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
                    {comment.commentText}
                  </p>
                </Td>
                <Td muted>
                  <p className="truncate max-w-[160px] text-[11px]">{comment.adName || 'Organic'}</p>
                  <p className="truncate max-w-[160px] text-[10px] mt-0.5">{source}</p>
                </Td>
                <Td muted>{brand}</Td>
                <Td>
                  <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold border ${sentimentStyles[comment.sentiment]}`}>
                    {comment.sentiment}
                  </span>
                </Td>
                <Td align="center">
                  {comment.platform === 'facebook' ? (
                    <Facebook className="w-4 h-4 mx-auto" style={{ color: 'var(--color-brand-fb)' }} />
                  ) : (
                    <Instagram className="w-4 h-4 mx-auto" style={{ color: 'var(--color-brand-ig)' }} />
                  )}
                </Td>
                <Td muted>
                  <span className="text-[11px] whitespace-nowrap">{formatCommentTime(comment.createdAt)}</span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </SheetTable>
    </div>
  );
}
