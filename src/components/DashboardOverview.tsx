import React, { useMemo, useState } from 'react';
import { Comment, Ad } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, ChevronDown, ChevronUp, MessageCircle, TrendingUp } from 'lucide-react';
import SentimentDetailPanel from './SentimentDetailPanel';
import type { InboxFilters } from './UnifiedInbox';
import {
  displayCommenterName,
  formatCommentTime,
  getAdForComment,
  inferBrandLabel,
} from '../utils/helpers';
import { formatSpend } from '../utils/campaignHelpers';
import {
  bucketByCalendarDay,
  countDelta,
  getCommentsForAd,
  isOpenComment,
  isToday,
  isWaitingForReply,
  isYesterday,
} from '../utils/commentMetrics';

interface DashboardOverviewProps {
  comments: Comment[];
  ads?: Ad[];
  onNavigateToInbox: (filters?: InboxFilters) => void;
  onSelectComment?: (comment: Comment) => void;
}

interface Slice {
  label: string;
  value: number;
  color: string;
}

function Sparkline({ values, color, className }: { values: number[]; color: string; className?: string }) {
  if (values.length === 0) return null;
  const w = 96;
  const h = 26;
  const max = Math.max(1, ...values);
  const barW = 10;
  const gap = 2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      {values.map((v, i) => {
        const bh = Math.max(2, Math.round((v / max) * (h - 2)));
        return <rect key={i} x={i * (barW + gap)} y={h - bh} width={barW} height={bh} fill={color} rx={1.5} />;
      })}
    </svg>
  );
}

function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  const c = 15.915;
  let offset = 25;
  return (
    <svg viewBox="0 0 42 42" width={128} height={128} aria-label="Sentiment donut">
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
        today
      </text>
    </svg>
  );
}

export default function DashboardOverview({
  comments,
  ads = [],
  onNavigateToInbox,
  onSelectComment,
}: DashboardOverviewProps) {
  const { user } = useAuth();
  const [sentimentPanelOpen, setSentimentPanelOpen] = useState(false);
  const now = Date.now();

  const todayComments = useMemo(() => comments.filter(c => isToday(c.createdAt, now)), [comments, now]);
  const yesterdayComments = useMemo(() => comments.filter(c => isYesterday(c.createdAt, now)), [comments, now]);

  const receivedToday = todayComments.length;
  const receivedYesterday = yesterdayComments.length;
  const receivedVariance = countDelta(receivedToday, receivedYesterday);

  const waitingOpen = useMemo(() => comments.filter(c => isWaitingForReply(c)), [comments]);
  const waitingToday = waitingOpen.filter(c => isToday(c.createdAt, now)).length;
  const waitingYesterday = waitingOpen.filter(c => isYesterday(c.createdAt, now)).length;
  const waitingVariance = countDelta(waitingToday, waitingYesterday);

  const urgentOpen = useMemo(
    () => comments.filter(c => c.priority === 'Urgent' && isOpenComment(c)),
    [comments]
  );
  const urgentToday = urgentOpen.filter(c => isToday(c.createdAt, now)).length;
  const urgentYesterday = comments.filter(
    c => c.priority === 'Urgent' && isYesterday(c.createdAt, now)
  ).length;
  const urgentVariance = countDelta(urgentToday, urgentYesterday);

  const repliedToday = useMemo(
    () => comments.filter(c => c.status === 'Replied' && isToday(c.repliedAt || c.updatedAt, now)).length,
    [comments, now]
  );
  const repliedYesterday = useMemo(
    () => comments.filter(c => c.status === 'Replied' && isYesterday(c.repliedAt || c.updatedAt, now)).length,
    [comments, now]
  );
  const repliedVariance = countDelta(repliedToday, repliedYesterday);

  const latestToday = useMemo(
    () => [...todayComments].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).slice(0, 8),
    [todayComments]
  );

  const sentimentCounts = useMemo(() => ({
    positive: todayComments.filter(c => c.sentiment === 'Positive').length,
    question: todayComments.filter(c => c.sentiment === 'Question').length,
    complaint: todayComments.filter(c => c.sentiment === 'Complaint').length,
    neutral: todayComments.filter(c => c.sentiment === 'Neutral' || c.sentiment === 'Negative').length,
  }), [todayComments]);

  const donutSlices: Slice[] = [
    { label: 'Positive', value: sentimentCounts.positive, color: 'var(--color-sem-green)' },
    { label: 'Questions', value: sentimentCounts.question, color: 'var(--color-accent)' },
    { label: 'Complaints', value: sentimentCounts.complaint, color: 'var(--color-sem-red)' },
    { label: 'Neutral', value: sentimentCounts.neutral, color: 'var(--color-sem-amber)' },
  ];

  const fbToday = todayComments.filter(c => c.platform === 'facebook').length;
  const igToday = todayComments.filter(c => c.platform === 'instagram').length;
  const platformTotal = Math.max(1, fbToday + igToday);

  const sparkReceived = useMemo(() => bucketByCalendarDay(comments, () => true, 7, now), [comments, now]);
  const sparkWaiting = useMemo(() => bucketByCalendarDay(comments, isWaitingForReply, 7, now), [comments, now]);
  const sparkUrgent = useMemo(
    () => bucketByCalendarDay(comments, c => c.priority === 'Urgent' && isOpenComment(c), 7, now),
    [comments, now]
  );

  const topSpendAds = useMemo(() => {
    return [...ads]
      .filter(ad => (ad.recentSpend ?? ad.spend ?? 0) > 0)
      .sort((a, b) => (b.recentSpend ?? b.spend ?? 0) - (a.recentSpend ?? a.spend ?? 0))
      .slice(0, 8)
      .map(ad => {
        const adComments = getCommentsForAd(comments, ad, ads);
        const todayOnAd = adComments.filter(c => isToday(c.createdAt, now));
        const latest = [...adComments].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))[0];
        return {
          ad,
          totalComments: adComments.length,
          todayComments: todayOnAd.length,
          unseen: adComments.filter(c => c.status === 'Unseen').length,
          urgent: adComments.filter(c => c.priority === 'Urgent' && isOpenComment(c)).length,
          latest,
        };
      });
  }, [ads, comments, now]);

  const displayName = user?.name?.split(' ')[0] || 'there';
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const brandSwatch = (brand: string) =>
    brand === 'Nobl' ? '#3A5F5D' : brand === 'Flo' ? 'var(--color-brand-ig)' : 'var(--color-muted)';

  return (
    <div className="animate-fade-in flex flex-col gap-6" id="dashboard-screen">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--color-muted)' }}>{dateLabel}</p>
          <h1 className="font-editorial mt-1" style={{ fontSize: 32, lineHeight: 1.1, letterSpacing: '-0.015em', color: 'var(--color-ink)' }}>
            Good morning, {displayName}.
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: 'var(--color-muted)' }}>
            <span className="font-semibold tabular" style={{ color: 'var(--color-ink-2)' }}>{receivedToday.toLocaleString()}</span> comments today ·{' '}
            <span className="font-semibold tabular" style={{ color: urgentOpen.length > 0 ? 'var(--color-sem-red)' : 'var(--color-ink-2)' }}>
              {urgentOpen.length.toLocaleString()}
            </span>{' '}
            urgent open ·{' '}
            <span className="font-semibold tabular" style={{ color: 'var(--color-ink-2)' }}>{waitingOpen.length.toLocaleString()}</span> waiting reply
          </p>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <MetricCard
          label="Comments today"
          value={receivedToday}
          variance={receivedVariance}
          sub={`${receivedYesterday} yesterday`}
          spark={sparkReceived}
          sparkColor="var(--color-accent)"
          onClick={() => onNavigateToInbox({})}
        />
        <MetricCard
          label="Waiting for reply"
          value={waitingOpen.length}
          variance={waitingVariance}
          sub={`${waitingToday} arrived today`}
          spark={sparkWaiting}
          sparkColor="var(--color-accent)"
          onClick={() => onNavigateToInbox({ status: 'Unreplied' })}
        />
        <MetricCard
          label="Urgent open"
          value={urgentOpen.length}
          variance={urgentVariance}
          sub="Complaints & refund requests"
          spark={sparkUrgent}
          sparkColor="var(--color-sem-red)"
          valueColor={urgentOpen.length > 0 ? 'var(--color-sem-red)' : 'var(--color-ink)'}
          onClick={() => onNavigateToInbox({ priority: 'Urgent', status: 'Unreplied' })}
        />
        <MetricCard
          label="Replied today"
          value={repliedToday}
          variance={repliedVariance}
          sub={`${repliedYesterday} yesterday`}
          spark={sparkReceived}
          sparkColor="var(--color-sem-green)"
          onClick={() => onNavigateToInbox({ status: 'Replied' })}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-3.5">
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}>
          <div className="flex items-baseline justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--color-line-soft)' }}>
            <div>
              <h2 className="font-editorial text-[18px]" style={{ color: 'var(--color-ink)' }}>Today&apos;s latest comments</h2>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-muted)' }}>Newest first · calendar day only</p>
            </div>
            <button
              onClick={() => onNavigateToInbox({})}
              className="text-[12px] font-semibold flex items-center gap-1"
              style={{ color: 'var(--color-accent)' }}
            >
              Open inbox <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {latestToday.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>No comments yet today.</p>
            </div>
          ) : (
            <div>
              {latestToday.map(comment => {
                const linkedAd = getAdForComment(comment, ads);
                const brand = inferBrandLabel(comment, linkedAd);
                const isUrgent = comment.priority === 'Urgent';
                return (
                  <div
                    key={comment.id}
                    onClick={() => onSelectComment?.(comment)}
                    className="grid gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-black/[0.02]"
                    style={{ gridTemplateColumns: '3px 1fr auto', borderBottom: '1px solid var(--color-line-soft)' }}
                  >
                    <div className="rounded-sm" style={{ background: isUrgent ? 'var(--color-sem-red)' : 'transparent' }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="font-semibold text-[13.5px]" style={{ color: 'var(--color-ink)' }}>
                          {displayCommenterName(comment.commenterName)}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.06em] rounded-full px-1.5 py-[1px]" style={
                          comment.sentiment === 'Complaint'
                            ? { background: 'var(--color-sem-red-soft)', color: 'var(--color-sem-red)' }
                            : comment.sentiment === 'Positive'
                              ? { background: 'var(--color-sem-green-soft)', color: 'var(--color-sem-green)' }
                              : comment.sentiment === 'Question'
                                ? { background: 'rgba(15,91,77,0.08)', color: 'var(--color-accent)' }
                                : { background: 'var(--color-ground)', color: 'var(--color-muted)', border: '1px solid var(--color-line)' }
                        }>
                          {comment.sentiment}
                        </span>
                        {brand !== 'Unattributed' && (
                          <span className="text-[10px] font-bold rounded-full px-1.5 py-[1px]" style={{ background: 'var(--color-ground)', color: 'var(--color-muted)', border: '1px solid var(--color-line)' }}>
                            {brand}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[13px]" style={{ color: 'var(--color-ink-2)', lineHeight: 1.45, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
                        {comment.commentText}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                        <span className="truncate">{comment.adName || 'Organic'}</span>
                        <span>·</span>
                        <span className="shrink-0">{formatCommentTime(comment.createdAt)}</span>
                        <span>·</span>
                        <span className="capitalize">{comment.status.toLowerCase()}</span>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); onSelectComment?.(comment); }}
                      className="self-center px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
                      style={{ background: 'var(--color-accent)', color: '#FFFFFF' }}
                    >
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSentimentPanelOpen(true)}
          className="rounded-2xl p-5 flex flex-col gap-5 text-left w-full transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}
        >
          <div className="flex items-baseline justify-between">
            <h2 className="font-editorial text-[18px]" style={{ color: 'var(--color-ink)' }}>Today&apos;s sentiment</h2>
            <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
              <span>{receivedToday.toLocaleString()} comments</span>
              <span className="font-semibold flex items-center gap-0.5" style={{ color: 'var(--color-accent)' }}>
                Details <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[132px_1fr] gap-4 items-center">
            <Donut slices={donutSlices} total={receivedToday} />
            <div className="flex flex-col gap-1.5 text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
              {donutSlices.map(s => {
                const pct = receivedToday > 0 ? Math.round((s.value / receivedToday) * 100) : 0;
                return (
                  <div key={s.label} className="grid items-baseline gap-2" style={{ gridTemplateColumns: '10px 1fr auto auto' }}>
                    <span className="rounded-sm h-2.5 self-center" style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <span className="tabular font-semibold" style={{ color: 'var(--color-ink)' }}>{s.value.toLocaleString()}</span>
                    <span className="tabular text-[11px]" style={{ color: 'var(--color-muted)' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3" style={{ borderTop: '1px solid var(--color-line-soft)' }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)' }}>Platform split today</span>
              <span className="text-[11px] tabular" style={{ color: 'var(--color-muted)' }}>FB {fbToday} · IG {igToday}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden mt-2" style={{ background: 'var(--color-line-soft)' }}>
              <div style={{ width: `${(fbToday / platformTotal) * 100}%`, background: 'var(--color-brand-fb)' }} />
              <div style={{ width: `${(igToday / platformTotal) * 100}%`, background: 'var(--color-brand-ig)' }} />
            </div>
          </div>
        </button>
      </section>

      {sentimentPanelOpen && (
        <SentimentDetailPanel
          comments={comments}
          ads={ads}
          onClose={() => setSentimentPanelOpen(false)}
          onSelectComment={comment => {
            setSentimentPanelOpen(false);
            onSelectComment?.(comment);
          }}
          onNavigateToInbox={filters => {
            setSentimentPanelOpen(false);
            onNavigateToInbox(filters);
          }}
        />
      )}

      <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}>
        <div className="flex items-baseline justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-line-soft)' }}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <div>
              <h2 className="font-editorial text-[18px]" style={{ color: 'var(--color-ink)' }}>Top spend ads &amp; comments</h2>
              <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>Highest recent spend with inbox activity</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToInbox({ topSpend: true })}
            className="text-[12px] font-semibold flex items-center gap-1"
            style={{ color: 'var(--color-accent)' }}
          >
            View all top spend <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {topSpendAds.length === 0 ? (
          <p className="p-6 text-[13px]" style={{ color: 'var(--color-muted)' }}>Sync ads to load spend-ranked comments.</p>
        ) : (
          <div className="grid grid-cols-1 gap-0 divide-y" style={{ borderColor: 'var(--color-line-soft)' }}>
            {topSpendAds.map((row, index) => {
              const brand = inferBrandLabel(row.latest, row.ad);
              return (
                <button
                  key={row.ad.id}
                  type="button"
                  onClick={() => onNavigateToInbox({ adId: row.ad.adId || row.ad.id })}
                  className="w-full text-left px-5 py-4 hover:bg-black/[0.02] transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <span className="w-6 text-center text-sm font-bold shrink-0" style={{ color: 'var(--color-muted)' }}>#{index + 1}</span>
                    <div className="w-14 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--color-ground)' }}>
                      {(row.ad.thumbnailUrl || row.ad.mediaUrl) && (
                        <img src={row.ad.thumbnailUrl || row.ad.mediaUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: brandSwatch(brand) }} />
                        <span className="font-semibold text-[14px] truncate" style={{ color: 'var(--color-ink)' }}>{row.ad.adName}</span>
                      </div>
                      <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>
                        {row.ad.campaignName} · {row.ad.accountLabel || brand}
                      </p>
                      {row.latest ? (
                        <p className="mt-2 text-[12.5px] line-clamp-2" style={{ color: 'var(--color-ink-2)' }}>
                          <MessageCircle className="inline w-3 h-3 mr-1 -mt-0.5" />
                          {displayCommenterName(row.latest.commenterName)}: {row.latest.commentText}
                        </p>
                      ) : (
                        <p className="mt-2 text-[12px]" style={{ color: 'var(--color-muted)' }}>No comments linked yet.</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold tabular" style={{ color: 'var(--color-ink)' }}>{formatSpend(row.ad.recentSpend ?? row.ad.spend ?? 0)}</p>
                      <p className="text-[11px] mt-1 tabular" style={{ color: 'var(--color-muted)' }}>
                        {row.totalComments} total · {row.todayComments} today
                      </p>
                      {row.unseen > 0 && (
                        <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--color-accent)' }}>{row.unseen} unseen</p>
                      )}
                      {row.urgent > 0 && (
                        <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--color-sem-red)' }}>{row.urgent} urgent</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {urgentOpen.length > 0 && (
        <section
          className="rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4"
          style={{ background: 'var(--color-sem-red-soft)', border: '1px solid rgba(181,69,69,0.2)' }}
        >
          <div className="min-w-0">
            <h3 className="font-editorial text-[17px]" style={{ color: 'var(--color-sem-red)' }}>
              {urgentOpen.length.toLocaleString()} urgent {urgentOpen.length === 1 ? 'comment needs' : 'comments need'} a reply
            </h3>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--color-ink-2)' }}>
              {urgentToday} arrived today · {urgentVariance.label}
            </p>
          </div>
          <button
            onClick={() => onNavigateToInbox({ priority: 'Urgent', status: 'Unreplied' })}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold"
            style={{ background: 'var(--color-sem-red)', color: '#FFFFFF' }}
          >
            Open urgent queue <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  variance,
  sub,
  spark,
  sparkColor,
  valueColor = 'var(--color-ink)',
  onClick,
}: {
  label: string;
  value: number;
  variance: { delta: number; label: string };
  sub: string;
  spark: number[];
  sparkColor: string;
  valueColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-muted)' }}>{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="font-editorial tabular" style={{ fontSize: 42, lineHeight: 1, color: valueColor }}>
          {value.toLocaleString()}
        </div>
        <div
          className="text-[11px] font-semibold tabular flex items-center gap-1 pb-1 text-right max-w-[120px]"
          style={{ color: variance.delta > 0 ? 'var(--color-sem-red)' : variance.delta < 0 ? 'var(--color-sem-green)' : 'var(--color-muted-2)' }}
        >
          {variance.delta > 0 ? <ChevronUp className="w-3 h-3 shrink-0" /> : variance.delta < 0 ? <ChevronDown className="w-3 h-3 shrink-0" /> : null}
          <span className="leading-tight">{variance.label}</span>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{sub}</p>
        <Sparkline values={spark} color={sparkColor} className="w-24 h-6" />
      </div>
    </button>
  );
}
