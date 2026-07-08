import React, { useMemo, useState } from 'react';
import { X, Download, Facebook, Instagram, ChevronRight } from 'lucide-react';
import type { Comment, Ad } from '../types';
import type { InboxFilters } from './UnifiedInbox';
import { SentimentBadge } from './ui/Badges';
import {
  displayCommenterName,
  getAdForComment,
  inferBrandLabel,
  inferSourceCategory,
  sentimentStyles,
  type BrandLabel,
  type SourceCategory,
} from '../utils/helpers';
import {
  buildSentimentReport,
  downloadSentimentReportCsv,
  happinessScore,
  SENTIMENT_ORDER,
  sentimentPct,
  type SentimentCounts,
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

const BRAND_ORDER: BrandLabel[] = ['Nobl', 'Flo', 'Unattributed'];
const SOURCE_ORDER: SourceCategory[] = [
  'Brand page',
  'Creator / Whitelist',
  'Third-party page',
  'Organic',
];

const SENTIMENT_COLORS: Record<(typeof SENTIMENT_ORDER)[number], string> = {
  Positive: 'var(--color-sem-green)',
  Question: 'var(--color-accent)',
  Neutral: 'var(--color-sem-amber)',
  Negative: 'var(--color-sem-amber)',
  Complaint: 'var(--color-sem-red)',
};

function MiniBar({ counts }: { counts: SentimentCounts }) {
  if (counts.total === 0) {
    return <div className="h-2 rounded-full" style={{ background: 'var(--color-line-soft)' }} />;
  }
  return (
    <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-line-soft)' }}>
      {SENTIMENT_ORDER.map(s => {
        const pct = (counts[s] / counts.total) * 100;
        if (pct <= 0) return null;
        return (
          <div
            key={s}
            title={`${s}: ${counts[s]}`}
            style={{ width: `${pct}%`, background: SENTIMENT_COLORS[s] }}
          />
        );
      })}
    </div>
  );
}

function BreakdownRow({
  label,
  sub,
  counts,
  onClick,
}: {
  label: string;
  sub?: string;
  counts: SentimentCounts;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left rounded-xl p-3.5 ${onClick ? 'hover:bg-black/[0.02] transition-colors cursor-pointer' : ''}`}
      style={{ border: '1px solid var(--color-line-soft)' }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="font-semibold text-[13px] truncate" style={{ color: 'var(--color-ink)' }}>{label}</p>
          {sub && <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>{sub}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold tabular text-[15px]" style={{ color: 'var(--color-ink)' }}>{counts.total}</p>
          {counts.total > 0 && (
            <p className="text-[10px] tabular mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {happinessScore(counts)}% positive
            </p>
          )}
        </div>
      </div>
      <MiniBar counts={counts} />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]" style={{ color: 'var(--color-muted)' }}>
        {SENTIMENT_ORDER.map(s => (
          counts[s] > 0 ? (
            <span key={s} className="tabular">
              {s} {counts[s]} ({sentimentPct(counts, s)}%)
            </span>
          ) : null
        ))}
      </div>
    </Wrapper>
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
  const [activeTab, setActiveTab] = useState<'overview' | 'brands' | 'creators' | 'ads'>('overview');

  const report = useMemo(
    () => buildSentimentReport(comments, ads, period),
    [comments, ads, period]
  );

  const donutSlices = SENTIMENT_ORDER.map(s => ({
    label: s,
    value: report.overall[s],
    color: SENTIMENT_COLORS[s],
  })).filter(s => s.value > 0);

  const handleDownload = () => {
    downloadSentimentReportCsv(report, ads);
  };

  const brandSwatch = (brand: BrandLabel) =>
    brand === 'Nobl' ? '#3A5F5D' : brand === 'Flo' ? 'var(--color-brand-ig)' : 'var(--color-muted)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15, 18, 24, 0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-4xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl animate-fade-in"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-4 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-line-soft)' }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-muted)' }}>
              Comment sentiment
            </p>
            <h2 className="font-editorial text-[22px] mt-0.5" style={{ color: 'var(--color-ink)' }}>
              Sentiment report
            </h2>
            <p className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>
              {report.periodLabel} · US Eastern time
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={report.overall.total === 0}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-40 transition-colors"
              style={{ background: 'var(--color-accent)', color: '#FFFFFF' }}
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-black/5"
              style={{ border: '1px solid var(--color-line)' }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-2 shrink-0" style={{ borderBottom: '1px solid var(--color-line-soft)' }}>
          <div className="inline-flex rounded-lg p-0.5" style={{ background: 'var(--color-ground)', border: '1px solid var(--color-line)' }}>
            {(['daily', 'weekly'] as SentimentPeriod[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded-md text-[12px] font-semibold capitalize transition-colors"
                style={
                  period === p
                    ? { background: 'var(--color-panel)', color: 'var(--color-ink)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                    : { color: 'var(--color-muted)' }
                }
              >
                {p === 'daily' ? 'Daily' : 'Weekly (7 days)'}
              </button>
            ))}
          </div>
          <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
            Calendar boundaries in {US_TIMEZONE.replace('_', ' ')}
          </span>
        </div>

        <div className="px-5 pt-3 flex gap-1 overflow-x-auto shrink-0" style={{ borderBottom: '1px solid var(--color-line-soft)' }}>
          {([
            ['overview', 'Overview'],
            ['brands', 'By brand'],
            ['creators', 'Creators & sources'],
            ['ads', 'By ad'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className="px-3 py-2 text-[12px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors"
              style={{
                color: activeTab === id ? 'var(--color-accent)' : 'var(--color-muted)',
                borderColor: activeTab === id ? 'var(--color-accent)' : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {report.overall.total === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[14px] font-medium" style={{ color: 'var(--color-ink-2)' }}>No comments in this period</p>
              <p className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>
                Try switching to weekly or sync more comments.
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div
                    className="rounded-2xl p-5 grid grid-cols-1 md:grid-cols-[140px_1fr] gap-5 items-center"
                    style={{ background: 'var(--color-ground)', border: '1px solid var(--color-line-soft)' }}
                  >
                    <OverviewDonut slices={donutSlices} total={report.overall.total} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {SENTIMENT_ORDER.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onNavigateToInbox?.({ sentiment: s })}
                          className="text-left rounded-xl p-3 hover:bg-white/60 transition-colors"
                          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line-soft)' }}
                        >
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${sentimentStyles[s]}`}
                          >
                            {s}
                          </span>
                          <p className="mt-2 font-editorial tabular text-[28px] leading-none" style={{ color: 'var(--color-ink)' }}>
                            {report.overall[s]}
                          </p>
                          <p className="text-[11px] tabular mt-1" style={{ color: 'var(--color-muted)' }}>
                            {sentimentPct(report.overall, s)}% of total
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl p-4" style={{ border: '1px solid var(--color-line-soft)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--color-muted)' }}>Platform</p>
                      <BreakdownRow label="Facebook" counts={report.byPlatform.facebook} onClick={() => onNavigateToInbox?.({ platform: 'facebook' })} />
                      <div className="mt-2">
                        <BreakdownRow label="Instagram" counts={report.byPlatform.instagram} onClick={() => onNavigateToInbox?.({ platform: 'instagram' })} />
                      </div>
                    </div>
                    <div className="rounded-xl p-4" style={{ border: '1px solid var(--color-line-soft)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--color-muted)' }}>Happiness score</p>
                      <p className="font-editorial text-[42px] tabular leading-none" style={{ color: 'var(--color-sem-green)' }}>
                        {happinessScore(report.overall)}%
                      </p>
                      <p className="text-[12px] mt-2" style={{ color: 'var(--color-muted)' }}>
                        Positive vs negative + complaints in this period
                      </p>
                    </div>
                  </div>

                  <RecentComments
                    comments={report.comments.slice(0, 12)}
                    ads={ads}
                    onSelectComment={onSelectComment}
                  />
                </div>
              )}

              {activeTab === 'brands' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {BRAND_ORDER.map(brand => (
                    <BreakdownRow
                      key={brand}
                      label={brand}
                      counts={report.byBrand[brand]}
                      onClick={
                        brand !== 'Unattributed' && report.byBrand[brand].total > 0
                          ? () => onNavigateToInbox?.({ brand })
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}

              {activeTab === 'creators' && (
                <div className="space-y-3">
                  {SOURCE_ORDER.map(source => (
                    <BreakdownRow
                      key={source}
                      label={source}
                      sub={
                        source === 'Creator / Whitelist'
                          ? 'UGC, whitelisted, spark & partnership ads'
                          : undefined
                      }
                      counts={report.bySource[source]}
                    />
                  ))}
                </div>
              )}

              {activeTab === 'ads' && (
                <div className="space-y-2">
                  {report.byAd.length === 0 ? (
                    <p className="text-[13px] py-8 text-center" style={{ color: 'var(--color-muted)' }}>No ad-linked comments.</p>
                  ) : (
                    report.byAd.slice(0, 20).map(row => (
                      <button
                        key={row.adId}
                        type="button"
                        onClick={() => onNavigateToInbox?.({ adId: row.adId })}
                        className="w-full text-left rounded-xl p-4 hover:bg-black/[0.02] transition-colors"
                        style={{ border: '1px solid var(--color-line-soft)' }}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0 mt-1"
                            style={{ background: brandSwatch(row.brand) }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-[13.5px] truncate" style={{ color: 'var(--color-ink)' }}>
                                  {row.adName}
                                </p>
                                <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>
                                  {row.campaignName} · {row.brand} · {row.source}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold tabular" style={{ color: 'var(--color-ink)' }}>{row.counts.total}</p>
                                <ChevronRight className="w-4 h-4 ml-auto mt-1" style={{ color: 'var(--color-muted)' }} />
                              </div>
                            </div>
                            <div className="mt-3">
                              <MiniBar counts={row.counts} />
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewDonut({ slices, total }: { slices: { label: string; value: number; color: string }[]; total: number }) {
  const c = 15.915;
  let offset = 25;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 42 42" width={140} height={140} aria-label="Sentiment breakdown">
        <circle cx={21} cy={21} r={c} fill="none" stroke="#EFEDE7" strokeWidth={6} />
        {slices.map((s, i) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          const el = (
            <circle
              key={i}
              cx={21}
              cy={21}
              r={c}
              fill="none"
              stroke={s.color}
              strokeWidth={6}
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={offset}
              transform="rotate(-90 21 21)"
            />
          );
          offset -= pct;
          return el;
        })}
        <text x={21} y={20} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 500, fill: 'var(--color-ink)' }}>
          {total.toLocaleString()}
        </text>
        <text x={21} y={26} textAnchor="middle" style={{ fontFamily: 'var(--font-sans)', fontSize: 3, fill: 'var(--color-muted)' }}>
          comments
        </text>
      </svg>
    </div>
  );
}

function RecentComments({
  comments,
  ads,
  onSelectComment,
}: {
  comments: Comment[];
  ads: Ad[];
  onSelectComment?: (comment: Comment) => void;
}) {
  if (comments.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: 'var(--color-muted)' }}>
        Recent comments in period
      </p>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-line-soft)' }}>
        {comments.map(comment => {
          const ad = getAdForComment(comment, ads);
          const brand = inferBrandLabel(comment, ad);
          const source = inferSourceCategory(comment, ad);
          return (
            <button
              key={comment.id}
              type="button"
              onClick={() => onSelectComment?.(comment)}
              className="w-full text-left px-4 py-3 hover:bg-black/[0.02] transition-colors"
              style={{ borderBottom: '1px solid var(--color-line-soft)' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[13px]" style={{ color: 'var(--color-ink)' }}>
                  {displayCommenterName(comment.commenterName)}
                </span>
                <SentimentBadge sentiment={comment.sentiment} />
                {comment.platform === 'facebook' ? (
                  <Facebook className="w-3 h-3" style={{ color: 'var(--color-brand-fb)' }} />
                ) : (
                  <Instagram className="w-3 h-3" style={{ color: 'var(--color-brand-ig)' }} />
                )}
                <span className="text-[10px] rounded-full px-1.5 py-[1px]" style={{ background: 'var(--color-ground)', color: 'var(--color-muted)', border: '1px solid var(--color-line)' }}>
                  {brand}
                </span>
                <span className="text-[10px] rounded-full px-1.5 py-[1px]" style={{ background: 'var(--color-ground)', color: 'var(--color-muted)', border: '1px solid var(--color-line)' }}>
                  {source}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] line-clamp-2" style={{ color: 'var(--color-ink-2)' }}>
                {comment.commentText}
              </p>
              <p className="mt-1 text-[11px] truncate" style={{ color: 'var(--color-muted)' }}>
                {comment.adName || 'Organic'} · {comment.campaignName || '—'}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
