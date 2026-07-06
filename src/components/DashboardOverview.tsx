import React, { useMemo } from 'react';
import { Comment, Campaign, TeamMember, Ad } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { InboxFilters } from './UnifiedInbox';
import {
  displayCommenterName,
  formatCommentTime,
  inferBrandLabel,
  inferSourceCategory,
} from '../utils/helpers';

interface DashboardOverviewProps {
  comments: Comment[];
  campaigns: Campaign[];
  teamMembers: TeamMember[];
  ads?: Ad[];
  currentUserId?: string;
  onNavigateToInbox: (filters?: InboxFilters) => void;
  onSelectComment?: (comment: Comment) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): number {
  return Date.now() - n * DAY_MS;
}

function bucketByDay(comments: Comment[], filter: (c: Comment) => boolean, days = 7): number[] {
  const counts = Array<number>(days).fill(0);
  const now = Date.now();
  for (const c of comments) {
    if (!filter(c)) continue;
    const t = Date.parse(c.createdAt);
    if (Number.isNaN(t)) continue;
    const offset = Math.floor((now - t) / DAY_MS);
    if (offset >= 0 && offset < days) counts[days - 1 - offset] += 1;
  }
  return counts;
}

interface SparkProps {
  values: number[];
  color: string;
  className?: string;
}

function Sparkline({ values, color, className }: SparkProps) {
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
        return (
          <rect key={i} x={i * (barW + gap)} y={h - bh} width={barW} height={bh} fill={color} rx={1.5} />
        );
      })}
    </svg>
  );
}

interface Slice {
  label: string;
  value: number;
  color: string;
}

function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  const c = 15.915; // circumference-friendly radius for viewBox 42
  let offset = 25; // start at 12 o'clock
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
      <text
        x={21}
        y={20}
        textAnchor="middle"
        style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 500, fill: 'var(--color-ink)' }}
      >
        {total.toLocaleString()}
      </text>
      <text
        x={21}
        y={26}
        textAnchor="middle"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 3, fill: 'var(--color-muted)' }}
      >
        today
      </text>
    </svg>
  );
}

export default function DashboardOverview({
  comments,
  campaigns,
  teamMembers,
  ads = [],
  currentUserId,
  onNavigateToInbox,
  onSelectComment,
}: DashboardOverviewProps) {
  const { user } = useAuth();

  const now = Date.now();
  const todayMs = daysAgo(1);
  const yesterdayMs = daysAgo(2);

  // Received today / yesterday
  const receivedToday = useMemo(
    () => comments.filter(c => Date.parse(c.createdAt) >= todayMs).length,
    [comments, todayMs]
  );

  // Waiting for reply = status in ('Unseen','Seen')
  const waitingForReply = useMemo(
    () => comments.filter(c => c.status === 'Unseen' || c.status === 'Seen'),
    [comments]
  );
  const waitingCount = waitingForReply.length;
  const waitingToday = waitingForReply.filter(c => Date.parse(c.createdAt) >= todayMs).length;
  const waitingYesterday = waitingForReply.filter(c => {
    const t = Date.parse(c.createdAt);
    return t >= yesterdayMs && t < todayMs;
  }).length;
  const waitingDelta = waitingToday - waitingYesterday;

  // Urgent
  const urgentComments = useMemo(
    () => comments.filter(c => c.priority === 'Urgent' && c.status !== 'Ignored' && c.status !== 'Replied'),
    [comments]
  );
  const urgentCount = urgentComments.length;
  const urgentToday = urgentComments.filter(c => Date.parse(c.createdAt) >= todayMs).length;
  const urgentYesterday = comments.filter(c => {
    const t = Date.parse(c.createdAt);
    return c.priority === 'Urgent' && t >= yesterdayMs && t < todayMs;
  }).length;
  const urgentDelta = urgentToday - urgentYesterday;

  // Assigned to me
  const assignedToMe = useMemo(
    () => currentUserId ? comments.filter(c => c.assignedTo === currentUserId && c.status !== 'Replied' && c.status !== 'Ignored') : [],
    [comments, currentUserId]
  );
  const assignedCount = assignedToMe.length;
  const assignedUnread = assignedToMe.filter(c => c.status === 'Unseen').length;
  const oldestAssigned = assignedToMe.reduce<number>((oldest, c) => {
    const t = Date.parse(c.createdAt);
    return Number.isNaN(t) ? oldest : Math.max(oldest, now - t);
  }, 0);
  const oldestAssignedLabel = oldestAssigned > 0
    ? formatCommentTime(new Date(now - oldestAssigned).toISOString())
    : '—';

  // Sparklines
  const sparkWaiting = useMemo(
    () => bucketByDay(comments, c => c.status === 'Unseen' || c.status === 'Seen'),
    [comments]
  );
  const sparkUrgent = useMemo(
    () => bucketByDay(comments, c => c.priority === 'Urgent'),
    [comments]
  );
  const sparkAssigned = useMemo(
    () => bucketByDay(comments, c => Boolean(currentUserId) && c.assignedTo === currentUserId),
    [comments, currentUserId]
  );

  // Queue — top 4 unseen, urgent first
  const queue = useMemo(() => {
    const priorityRank = { Urgent: 0, High: 1, Medium: 2, Low: 3 } as const;
    return comments
      .filter(c => c.status === 'Unseen' || (c.status === 'Seen' && c.priority === 'Urgent'))
      .sort((a, b) => {
        const pa = priorityRank[a.priority] ?? 2;
        const pb = priorityRank[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
      })
      .slice(0, 4);
  }, [comments]);

  // Sentiment split (last 24h)
  const last24h = useMemo(() => comments.filter(c => Date.parse(c.createdAt) >= todayMs), [comments, todayMs]);
  const sentimentCounts = useMemo(() => ({
    positive: last24h.filter(c => c.sentiment === 'Positive').length,
    question: last24h.filter(c => c.sentiment === 'Question').length,
    complaint: last24h.filter(c => c.sentiment === 'Complaint').length,
    neutral: last24h.filter(c => c.sentiment === 'Neutral' || c.sentiment === 'Negative').length,
  }), [last24h]);

  const donutSlices: Slice[] = [
    { label: 'Positive', value: sentimentCounts.positive, color: 'var(--color-sem-green)' },
    { label: 'Questions', value: sentimentCounts.question, color: 'var(--color-accent)' },
    { label: 'Complaints', value: sentimentCounts.complaint, color: 'var(--color-sem-red)' },
    { label: 'Neutral', value: sentimentCounts.neutral, color: 'var(--color-sem-amber)' },
  ];

  // Median first response (approx — only where we have both created + replied timestamps)
  const responseTimes = useMemo(
    () => comments
      .filter(c => c.repliedAt && c.createdAt)
      .map(c => {
        const created = Date.parse(c.createdAt);
        const replied = Date.parse(c.repliedAt!);
        return Number.isNaN(created) || Number.isNaN(replied) ? null : (replied - created) / 60000;
      })
      .filter((n): n is number => n !== null && n >= 0)
      .sort((a, b) => a - b),
    [comments]
  );
  const medianResponseMin = responseTimes.length > 0
    ? responseTimes[Math.floor(responseTimes.length / 2)]
    : null;
  const responseTargetMin = 15;
  const responseBarPct = medianResponseMin != null
    ? Math.min(100, Math.max(4, (medianResponseMin / (responseTargetMin * 2)) * 100))
    : 0;

  const fbToday = last24h.filter(c => c.platform === 'facebook').length;
  const igToday = last24h.filter(c => c.platform === 'instagram').length;
  const platformTotal = Math.max(1, fbToday + igToday);
  const fbPct = (fbToday / platformTotal) * 100;
  const igPct = (igToday / platformTotal) * 100;

  // Source breakdown — group today's comments by (brand, source-type, ad/post name)
  interface SourceRow {
    key: string;
    brand: string;
    account: string;
    source: 'Paid ad' | 'Whitelisted creator' | 'Creator/UGC' | 'Third-party page' | 'Organic';
    displayName: string;
    subtext: string;
    received: number;
    unseen: number;
    urgent: number;
    spend7d: number;
  }

  const sourceRows: SourceRow[] = useMemo(() => {
    const bucket = new Map<string, SourceRow>();
    for (const c of last24h) {
      const linkedAd = ads.find(a => a.adId === c.adId || a.id === c.adId);
      const brand = inferBrandLabel(c, linkedAd);
      const category = inferSourceCategory(c, linkedAd);
      const isOrganic = !linkedAd || c.campaignName === 'Organic';
      const source: SourceRow['source'] = isOrganic
        ? 'Organic'
        : category === 'Whitelisted creator'
          ? 'Whitelisted creator'
          : category === 'Creator/UGC'
            ? 'Creator/UGC'
            : category === 'Third-party page'
              ? 'Third-party page'
              : 'Paid ad';
      const displayName = linkedAd?.adName || c.adName || (isOrganic ? `Organic · ${c.instagramAccountName || c.pageName || c.platform}` : 'Unknown ad');
      const account = linkedAd?.accountLabel || (isOrganic ? (c.instagramAccountName ? `@${c.instagramAccountName}` : (c.pageName || 'organic')) : brand);
      const key = `${brand}|${source}|${displayName}`;
      const row = bucket.get(key) ?? {
        key,
        brand,
        account,
        source,
        displayName,
        subtext: c.campaignName || c.adsetName || '',
        received: 0,
        unseen: 0,
        urgent: 0,
        spend7d: linkedAd?.recentSpend ?? 0,
      };
      row.received += 1;
      if (c.status === 'Unseen') row.unseen += 1;
      if (c.priority === 'Urgent' && c.status !== 'Ignored' && c.status !== 'Replied') row.urgent += 1;
      bucket.set(key, row);
    }
    return [...bucket.values()]
      .sort((a, b) => b.unseen - a.unseen || b.received - a.received)
      .slice(0, 8);
  }, [last24h, ads]);

  const displayName = user?.name?.split(' ')[0] || 'there';
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const totalCampaigns = campaigns.length;
  void totalCampaigns;
  void teamMembers;

  const brandSwatch = (brand: string) =>
    brand === 'Nobl' ? '#3A5F5D' : brand === 'Flo' ? 'var(--color-brand-ig)' : 'var(--color-muted)';

  const sourceChip = (source: SourceRow['source']) => {
    if (source === 'Paid ad') return { background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid rgba(15,91,77,0.15)' };
    if (source === 'Organic') return { background: 'var(--color-sem-green-soft)', color: 'var(--color-sem-green)', border: '1px solid rgba(75,122,85,0.2)' };
    if (source === 'Whitelisted creator') return { background: 'rgba(180,50,107,0.06)', color: 'var(--color-brand-ig)', border: '1px solid rgba(180,50,107,0.15)' };
    if (source === 'Creator/UGC') return { background: 'rgba(180,50,107,0.06)', color: 'var(--color-brand-ig)', border: '1px solid rgba(180,50,107,0.15)' };
    return { background: 'var(--color-ground-2)', color: 'var(--color-muted)', border: '1px solid var(--color-line)' };
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6" id="dashboard-screen">

      {/* Context bar (integrated with header, but adds a subline of numbers) */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--color-muted)' }}>{dateLabel}</p>
          <h1
            className="font-editorial mt-1"
            style={{ fontSize: 32, lineHeight: 1.1, letterSpacing: '-0.015em', color: 'var(--color-ink)', textWrap: 'balance' }}
          >
            Good morning, {displayName}.
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: 'var(--color-muted)' }}>
            <span className="font-semibold tabular" style={{ color: 'var(--color-ink-2)' }}>{receivedToday.toLocaleString()}</span> comments came in in the last 24 hours ·{' '}
            <span className="font-semibold tabular" style={{ color: urgentCount > 0 ? 'var(--color-sem-red)' : 'var(--color-ink-2)' }}>{urgentCount.toLocaleString()}</span> flagged urgent
          </p>
        </div>
      </div>

      {/* Priority strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Waiting */}
        <button
          onClick={() => onNavigateToInbox({ status: 'Unreplied' })}
          className="text-left rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-muted)' }}>Waiting for reply</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="font-editorial tabular" style={{ fontSize: 46, lineHeight: 1, color: 'var(--color-accent)' }}>
              {waitingCount.toLocaleString()}
            </div>
            <div
              className="text-[11px] font-semibold tabular flex items-center gap-1 pb-1"
              style={{ color: waitingDelta > 0 ? 'var(--color-sem-red)' : waitingDelta < 0 ? 'var(--color-sem-green)' : 'var(--color-muted-2)' }}
            >
              {waitingDelta > 0 ? <ChevronUp className="w-3 h-3" /> : waitingDelta < 0 ? <ChevronDown className="w-3 h-3" /> : null}
              {waitingDelta === 0 ? 'no change' : `${Math.abs(waitingDelta)} vs yesterday`}
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
              {waitingToday.toLocaleString()} arrived today.
            </p>
            <Sparkline values={sparkWaiting} color="var(--color-accent)" className="w-24 h-6" />
          </div>
        </button>

        {/* Urgent */}
        <button
          onClick={() => onNavigateToInbox({ priority: 'Urgent' })}
          className="text-left rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-muted)' }}>Escalations</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="font-editorial tabular" style={{ fontSize: 46, lineHeight: 1, color: urgentCount > 0 ? 'var(--color-sem-red)' : 'var(--color-ink)' }}>
              {urgentCount.toLocaleString()}
            </div>
            <div
              className="text-[11px] font-semibold tabular flex items-center gap-1 pb-1"
              style={{ color: urgentDelta > 0 ? 'var(--color-sem-red)' : urgentDelta < 0 ? 'var(--color-sem-green)' : 'var(--color-muted-2)' }}
            >
              {urgentDelta > 0 ? <ChevronUp className="w-3 h-3" /> : urgentDelta < 0 ? <ChevronDown className="w-3 h-3" /> : null}
              {urgentDelta === 0 ? 'no change' : `${Math.abs(urgentDelta)} vs yesterday`}
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
              Complaints &amp; refund requests to work first.
            </p>
            <Sparkline values={sparkUrgent} color="var(--color-sem-red)" className="w-24 h-6" />
          </div>
        </button>

        {/* Assigned to me */}
        <button
          onClick={() => currentUserId && onNavigateToInbox({ assignedTo: currentUserId })}
          className="text-left rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-muted)' }}>Assigned to you</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="font-editorial tabular" style={{ fontSize: 46, lineHeight: 1, color: 'var(--color-ink)' }}>
              {assignedCount.toLocaleString()}
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
              {assignedUnread > 0 ? `${assignedUnread} unread. Oldest ${oldestAssignedLabel}.` : 'All caught up.'}
            </p>
            <Sparkline values={sparkAssigned} color="var(--color-muted-2)" className="w-24 h-6" />
          </div>
        </button>
      </section>

      {/* Middle band */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-3.5">

        {/* The queue */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}>
          <div className="flex items-baseline justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--color-line-soft)' }}>
            <h2 className="font-editorial text-[18px]" style={{ color: 'var(--color-ink)' }}>The queue</h2>
            <button
              onClick={() => onNavigateToInbox({ status: 'Unseen' })}
              className="text-[12px] font-semibold flex items-center gap-1"
              style={{ color: 'var(--color-accent)' }}
            >
              Open inbox <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {queue.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>Inbox is clear — nothing waiting.</p>
            </div>
          ) : (
            <div>
              {queue.map(comment => {
                const isUrgent = comment.priority === 'Urgent';
                const isHigh = comment.priority === 'High';
                const stripeColor = isUrgent ? 'var(--color-sem-red)' : isHigh ? 'var(--color-sem-amber)' : 'transparent';
                const brand = inferBrandLabel(comment, ads.find(a => a.adId === comment.adId));
                const displayNameC = displayCommenterName(comment.commenterName);
                const initial = displayNameC.replace('@', '').charAt(0).toUpperCase() || '?';
                return (
                  <div
                    key={comment.id}
                    onClick={() => onSelectComment?.(comment)}
                    className="grid gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-black/[0.02]"
                    style={{ gridTemplateColumns: '3px 32px 1fr auto', borderBottom: '1px solid var(--color-line-soft)' }}
                  >
                    <div className="rounded-sm" style={{ background: stripeColor }} />
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--color-ground)', border: '1px solid var(--color-line)', color: 'var(--color-ink-2)', fontFamily: 'var(--font-display)', fontSize: 14 }}
                    >
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[13.5px] truncate" style={{ color: 'var(--color-ink)' }}>
                          {displayNameC}
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-[0.06em] rounded-full px-1.5 py-[1px]"
                          style={
                            comment.platform === 'instagram'
                              ? { background: 'rgba(180,50,107,0.08)', color: 'var(--color-brand-ig)' }
                              : { background: 'rgba(30,75,143,0.08)', color: 'var(--color-brand-fb)' }
                          }
                        >
                          {comment.platform === 'instagram' ? 'Instagram' : 'Facebook'}
                        </span>
                        {brand !== 'Unattributed' && (
                          <span
                            className="text-[10px] font-bold rounded-full px-1.5 py-[1px]"
                            style={{ background: 'var(--color-ground)', color: 'var(--color-muted)', border: '1px solid var(--color-line)' }}
                          >
                            {brand}
                          </span>
                        )}
                        <span className="ml-auto text-[11px] tabular shrink-0" style={{ color: 'var(--color-muted-2)' }}>
                          {formatCommentTime(comment.createdAt)}
                        </span>
                      </div>
                      <p
                        className="mt-1 text-[13px]"
                        style={{ color: 'var(--color-ink-2)', lineHeight: 1.45, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
                      >
                        {comment.commentText}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                        <span style={{ color: 'var(--color-muted-2)' }}>→</span>
                        <span className="truncate" style={{ color: 'var(--color-ink-2)' }}>
                          {comment.adName || 'Organic'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 self-center">
                      <button
                        onClick={e => { e.stopPropagation(); onSelectComment?.(comment); }}
                        className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
                        style={{ background: 'var(--color-accent)', color: '#FFFFFF' }}
                      >
                        Reply
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onSelectComment?.(comment); }}
                        className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
                        style={{ background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-line)' }}
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Signal */}
        <div className="rounded-2xl p-5 flex flex-col gap-5" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-editorial text-[18px]" style={{ color: 'var(--color-ink)' }}>Signal</h2>
            <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>Last 24h · {last24h.length.toLocaleString()} comments</div>
          </div>

          <div className="grid grid-cols-[132px_1fr] gap-4 items-center">
            <Donut slices={donutSlices} total={last24h.length} />
            <div className="flex flex-col gap-1.5 text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
              {donutSlices.map(s => {
                const pct = last24h.length > 0 ? Math.round((s.value / last24h.length) * 100) : 0;
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

          {medianResponseMin != null && (
            <div className="pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--color-line-soft)' }}>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)' }}>Median first response</span>
                <span className="font-editorial tabular" style={{ fontSize: 24, color: medianResponseMin <= responseTargetMin ? 'var(--color-accent)' : 'var(--color-sem-amber)' }}>
                  {Math.round(medianResponseMin)}m
                </span>
              </div>
              <div className="h-1.5 rounded-full relative" style={{ background: 'var(--color-line-soft)' }}>
                <div className="h-full rounded-full" style={{ width: `${responseBarPct}%`, background: medianResponseMin <= responseTargetMin ? 'var(--color-accent)' : 'var(--color-sem-amber)' }} />
                <div className="absolute top-[-2px] bottom-[-2px] w-[2px]" style={{ left: '50%', background: 'var(--color-ink-2)' }} title={`Target ${responseTargetMin}m`} />
              </div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                Target: under {responseTargetMin} minutes ·{' '}
                <span className="font-semibold" style={{ color: medianResponseMin <= responseTargetMin ? 'var(--color-sem-green)' : 'var(--color-sem-red)' }}>
                  {medianResponseMin <= responseTargetMin
                    ? `${Math.round(responseTargetMin - medianResponseMin)}m under target`
                    : `${Math.round(medianResponseMin - responseTargetMin)}m over target`}
                </span>
              </div>
            </div>
          )}

          <div className="pt-3" style={{ borderTop: '1px solid var(--color-line-soft)' }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)' }}>Platform split</span>
              <span className="text-[11px] tabular" style={{ color: 'var(--color-muted)' }}>FB {fbToday} · IG {igToday}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden mt-2" style={{ background: 'var(--color-line-soft)' }}>
              <div style={{ width: `${fbPct}%`, background: 'var(--color-brand-fb)' }} />
              <div style={{ width: `${igPct}%`, background: 'var(--color-brand-ig)' }} />
            </div>
          </div>
        </div>
      </section>

      {/* Source breakdown */}
      <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)' }}>
        <div className="flex items-baseline justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-line-soft)' }}>
          <h2 className="font-editorial text-[18px]" style={{ color: 'var(--color-ink)' }}>Where comments came from today</h2>
          <div className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>Grouped by ad · sorted by unseen</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr style={{ background: 'var(--color-ground-2)' }}>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-line)' }}>Brand · account</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-line)' }}>Source</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-line)' }}>Campaign / post</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-line)' }}>Received</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-line)' }}>Unseen</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-line)' }}>Urgent</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-line)' }}>Spend 7d</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-[12px]" style={{ color: 'var(--color-muted)' }}>
                    No comments received in the last 24 hours yet.
                  </td>
                </tr>
              )}
              {sourceRows.map(row => (
                <tr key={row.key} style={{ borderBottom: '1px solid var(--color-line-soft)' }}>
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex items-center gap-2 font-semibold" style={{ color: 'var(--color-ink)' }}>
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: brandSwatch(row.brand) }} />
                      {row.brand} · {row.account}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                      style={sourceChip(row.source)}
                    >
                      {row.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div style={{ color: 'var(--color-ink)' }}>{row.displayName}</div>
                    {row.subtext && (
                      <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--color-muted)' }}>{row.subtext}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{row.received.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular" style={{ color: 'var(--color-ink-2)' }}>{row.unseen.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular">
                    <span style={{ color: row.urgent > 0 ? 'var(--color-sem-red)' : 'var(--color-muted-2)', fontWeight: row.urgent > 0 ? 600 : 400 }}>
                      {row.urgent > 0 ? row.urgent.toLocaleString() : '0'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular" style={{ color: 'var(--color-muted)' }}>
                    {row.spend7d > 0 ? `$${Math.round(row.spend7d).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Urgent alert */}
      {urgentCount > 0 && (
        <section
          className="rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4"
          style={{ background: 'var(--color-sem-red-soft)', border: '1px solid rgba(181,69,69,0.2)' }}
        >
          <div className="min-w-0">
            <h3 className="font-editorial text-[17px]" style={{ color: 'var(--color-sem-red)' }}>
              {urgentCount.toLocaleString()} urgent {urgentCount === 1 ? 'comment needs' : 'comments need'} a reply today
            </h3>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--color-ink-2)' }}>
              Complaints and refund requests are flagged in red — clearing these first protects your response-time SLA.
            </p>
          </div>
          <button
            onClick={() => onNavigateToInbox({ priority: 'Urgent' })}
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
