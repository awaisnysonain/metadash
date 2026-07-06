import React, { useState, useMemo, useEffect } from 'react';
import { Comment, TeamMember, CommentStatus, CommentPriority, CommentNote, ActivityLog, Ad, CommentView } from '../types';
import { getAdForComment, formatCommentTime, formatFullTime, displayCommenterName, isGenericCommenterName, inferBrandLabel, commentExternalUrl, commentLinkLabel, inferSourceCategory, sourceChipClass } from '../utils/helpers';
import { PlatformBadge } from './ui/Badges';
import CommentDetailDrawer from './CommentDetailDrawer';
import CommentAvatar from './CommentAvatar';
import { BrandLogoBadge } from './BrandLogo';
import { apiClient } from '../services/apiClient';
import {
  Search,
  CheckCircle,
  Eye,
  ExternalLink,
  Clock,
  Inbox,
  Bell,
  RefreshCw,
  Loader2,
  MessageSquareReply,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface InboxFilters {
  platform?: 'facebook' | 'instagram';
  status?: string;
  priority?: string;
  sentiment?: string;
  assignedTo?: string;
  campaign?: string;
  brand?: string;
  topSpend?: boolean;
  pageId?: string;
  igAccountId?: string;
  adId?: string;
  source?: string;
}

interface UnifiedInboxProps {
  comments: Comment[];
  teamMembers: TeamMember[];
  ads: Ad[];
  onSelectComment: (comment: Comment) => void;
  selectedCommentId?: string;
  onUpdateStatus: (id: string, status: CommentStatus) => Promise<void>;
  onReplyToComment?: (id: string, message: string, opts?: { targetCommentId?: string; mention?: string; includeMention?: boolean }) => Promise<void>;
  onModerateComment?: (id: string, hidden: boolean) => Promise<void>;
  onUpdatePriority: (id: string, priority: CommentPriority) => Promise<void>;
  onAssignTeam: (commentId: string, teamUserId?: string) => Promise<void>;
  onAddNote: (commentId: string, noteText: string) => Promise<void>;
  onAddCommentTag: (commentId: string, tag: string) => Promise<void>;
  onRemoveCommentTag: (commentId: string, tag: string) => Promise<void>;
  notes: CommentNote[];
  activityLogs: ActivityLog[];
  onViewComment?: (id: string, views?: CommentView[], updatedComment?: Comment) => void;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
  preconfiguredFilters?: InboxFilters | null;
}

const STATUS_TABS = [
  { id: 'All', label: 'All' },
  { id: 'Unseen', label: 'Unseen' },
  { id: 'Seen', label: 'Seen' },
  { id: 'Replied', label: 'Replied' },
  { id: 'Unreplied', label: 'Unreplied' },
] as const;

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;

export default function UnifiedInbox({
  comments,
  teamMembers,
  ads,
  onSelectComment,
  selectedCommentId,
  onUpdateStatus,
  onReplyToComment,
  onModerateComment,
  onUpdatePriority,
  onAssignTeam,
  onAddNote,
  onAddCommentTag,
  onRemoveCommentTag,
  notes,
  activityLogs,
  onViewComment,
  onRefresh,
  isRefreshing = false,
  preconfiguredFilters,
}: UnifiedInboxProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'All' | 'facebook' | 'instagram'>(
    preconfiguredFilters?.platform || 'All'
  );
  const [statusFilter, setStatusFilter] = useState(preconfiguredFilters?.status || 'All');
  const [priorityFilter, setPriorityFilter] = useState(preconfiguredFilters?.priority || 'All');
  const [sentimentFilter, setSentimentFilter] = useState(preconfiguredFilters?.sentiment || 'All');
  const [brandFilter, setBrandFilter] = useState(preconfiguredFilters?.brand || 'All');
  const [sourceFilter, setSourceFilter] = useState(preconfiguredFilters?.source || 'All');
  const [topSpendOnly, setTopSpendOnly] = useState(Boolean(preconfiguredFilters?.topSpend));
  const [previewCommentId, setPreviewCommentId] = useState<string | undefined>(selectedCommentId);
  const [recentlyViewed, setRecentlyViewed] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  useEffect(() => {
    setPlatformFilter(preconfiguredFilters?.platform ?? 'All');
    setStatusFilter(preconfiguredFilters?.status ?? 'All');
    setPriorityFilter(preconfiguredFilters?.priority ?? 'All');
    setSentimentFilter(preconfiguredFilters?.sentiment ?? 'All');
    setBrandFilter(preconfiguredFilters?.brand ?? 'All');
    setSourceFilter(preconfiguredFilters?.source ?? 'All');
    setTopSpendOnly(Boolean(preconfiguredFilters?.topSpend));
  }, [preconfiguredFilters]);

  const topSpendAdIds = useMemo(() => {
    const ids = new Set<string>();
    const byAccount = new Map<string, Ad[]>();
    for (const ad of ads) {
      const recentSpend = ad.recentSpend ?? 0;
      if (recentSpend <= 0) continue;
      const account = (ad.accountLabel || inferBrandLabel(undefined, ad)).toUpperCase();
      byAccount.set(account, [...(byAccount.get(account) ?? []), ad]);
    }

    byAccount.forEach(accountAds => {
      accountAds
        .sort((a, b) => (b.recentSpend ?? 0) - (a.recentSpend ?? 0))
        .slice(0, 15)
        .forEach(ad => {
          ids.add(ad.id);
          ids.add(ad.adId);
        });
      });
    return ids;
  }, [ads]);

  useEffect(() => {
    if (selectedCommentId) setPreviewCommentId(selectedCommentId);
  }, [selectedCommentId]);

  const filteredComments = useMemo(() => {
    return comments.filter(comment => {
      const linkedAd = getAdForComment(comment, ads);
      const brand = inferBrandLabel(comment, linkedAd);
      const source = inferSourceCategory(comment, linkedAd);
      const isTopSpend = Boolean(linkedAd && (topSpendAdIds.has(linkedAd.id) || topSpendAdIds.has(linkedAd.adId)));
      const q = searchTerm.toLowerCase();
      const textMatches =
        !q ||
        comment.commentText.toLowerCase().includes(q) ||
        comment.commenterName.toLowerCase().includes(q) ||
        displayCommenterName(comment.commenterName).toLowerCase().includes(q) ||
        comment.campaignName.toLowerCase().includes(q) ||
        comment.adName.toLowerCase().includes(q) ||
        brand.toLowerCase().includes(q) ||
        (linkedAd?.accountLabel || '').toLowerCase().includes(q);

      if (!textMatches) return false;
      if (platformFilter !== 'All' && comment.platform !== platformFilter) return false;
      if (priorityFilter !== 'All' && comment.priority !== priorityFilter) return false;
      if (sentimentFilter !== 'All' && comment.sentiment !== sentimentFilter) return false;
      if (brandFilter !== 'All' && brand !== brandFilter) return false;
      if (sourceFilter !== 'All' && source !== sourceFilter) return false;
      if (preconfiguredFilters?.pageId || preconfiguredFilters?.igAccountId) {
        const pageMatches = Boolean(preconfiguredFilters.pageId && comment.pageId === preconfiguredFilters.pageId);
        const linkedAdPageId = linkedAd?.postStoryId?.split('_')[0];
        const linkedAdPageMatches = Boolean(preconfiguredFilters.pageId && linkedAdPageId === preconfiguredFilters.pageId);
        const igMatches = Boolean(preconfiguredFilters.igAccountId && comment.instagramAccountId === preconfiguredFilters.igAccountId);
        if (!pageMatches && !linkedAdPageMatches && !igMatches) return false;
      }
      if (preconfiguredFilters?.adId) {
        const target = preconfiguredFilters.adId;
        const adMatches = comment.adId === target || linkedAd?.id === target || linkedAd?.adId === target;
        if (!adMatches) return false;
      }
      if (topSpendOnly && !isTopSpend) return false;
      if (preconfiguredFilters?.assignedTo && comment.assignedTo !== preconfiguredFilters.assignedTo) return false;
      if (preconfiguredFilters?.campaign && comment.campaignName !== preconfiguredFilters.campaign && comment.campaignId !== preconfiguredFilters.campaign) return false;

      if (statusFilter !== 'All') {
        if (statusFilter === 'Unreplied') {
          if (comment.status === 'Replied' || comment.status === 'Ignored') return false;
        } else if (comment.status !== statusFilter) return false;
      }

      return true;
    }).sort((a, b) => {
      const aTime = Date.parse(a.createdAt) || 0;
      const bTime = Date.parse(b.createdAt) || 0;
      if (bTime !== aTime) return bTime - aTime;
      return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
    });
  }, [comments, ads, topSpendAdIds, searchTerm, platformFilter, statusFilter, priorityFilter, sentimentFilter, brandFilter, sourceFilter, topSpendOnly, preconfiguredFilters]);

  const previewComment = filteredComments.find(c => c.id === previewCommentId)
    || comments.find(c => c.id === previewCommentId);
  const totalPages = Math.max(1, Math.ceil(filteredComments.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = filteredComments.length === 0 ? 0 : (safePage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, filteredComments.length);
  const visibleComments = filteredComments.slice(pageStartIndex, pageEndIndex);

  const unseenCount = comments.filter(c => c.status === 'Unseen').length;

  const seenByLabel = (comment: Comment) => {
    const names = [...new Set((comment.views ?? []).map(view => view.userName).filter(Boolean))];
    if (names.length === 0) return comment.seenAt ? 'Seen by team' : 'Not seen yet';
    if (names.length === 1) return `Seen by ${names[0]}`;
    if (names.length === 2) return `Seen by ${names[0]} and ${names[1]}`;
    return `Seen by ${names[0]} and ${names.length - 1} others`;
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, platformFilter, statusFilter, priorityFilter, sentimentFilter, brandFilter, sourceFilter, topSpendOnly, pageSize, preconfiguredFilters]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, safePage - 2);
    const end = Math.min(totalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [safePage, totalPages]);

  const pagination = filteredComments.length > 0 && (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          Showing <span className="font-semibold text-slate-900">{pageStartIndex + 1}-{pageEndIndex}</span> of{' '}
          <span className="font-semibold text-slate-900">{filteredComments.length}</span>
        </span>
        <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
        <label className="inline-flex items-center gap-2">
          Rows
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        {pageNumbers.map(page => (
          <button
            key={page}
            type="button"
            onClick={() => setCurrentPage(page)}
            className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition-colors ${page === safePage ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  const selectComment = async (comment: Comment) => {
    setPreviewCommentId(comment.id);
    onSelectComment(comment);

    try {
      const result = await apiClient.recordCommentView(comment.id);
      onViewComment?.(comment.id, result.views, result.comment);
      if (comment.status === 'Unseen') {
        setRecentlyViewed(prev => new Set(prev).add(comment.id));
      }
    } catch {
      if (comment.status === 'Unseen') {
        setRecentlyViewed(prev => new Set(prev).add(comment.id));
        await onUpdateStatus(comment.id, 'Seen');
      }
    }
  };

  return (
    <div className="space-y-5 animate-fade-in" id="inbox-screen">
      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-editorial" style={{ fontSize: 20, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)' }}>The queue</h3>
              {unseenCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular"
                  style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
                  {unseenCount.toLocaleString()} new
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              <span className="font-semibold tabular" style={{ color: 'var(--color-ink-2)' }}>{comments.length.toLocaleString()}</span> loaded comments
            </p>
          </div>
          {onRefresh && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter('Unseen')}
                className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-1.5 text-sm font-semibold transition-colors ${unseenCount > 0 ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <Bell className="w-4 h-4" />
                Notifications
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${unseenCount > 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{unseenCount}</span>
              </button>
              <button
                onClick={() => void onRefresh()}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-[10px] text-sm font-medium transition-colors"
              >
                {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {isRefreshing ? 'Updating…' : 'Refresh'}
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-[9px] text-sm font-medium transition-all ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
              {tab.id === 'Unseen' && unseenCount > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  statusFilter === tab.id ? 'bg-white/20' : 'bg-slate-900 text-white'
                }`}>{unseenCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.2fr)_minmax(140px,0.7fr)_minmax(140px,0.7fr)_minmax(150px,0.7fr)_minmax(140px,0.7fr)_minmax(170px,0.8fr)_auto]">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search comment text, author, campaign, or ad…"
              className="h-10 w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-[3px] focus:ring-slate-100"
            />
          </div>
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value as typeof platformFilter)}
            className="filter-select"
          >
            <option value="All">All platforms</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="filter-select">
            <option value="All">All priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select value={sentimentFilter} onChange={e => setSentimentFilter(e.target.value)} className="filter-select">
            <option value="All">All sentiment</option>
            <option value="Complaint">Complaint</option>
            <option value="Negative">Negative</option>
            <option value="Question">Question</option>
            <option value="Positive">Positive</option>
            <option value="Neutral">Neutral</option>
          </select>
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className="filter-select">
            <option value="All">All brands</option>
            <option value="Nobl">Nobl</option>
            <option value="Flo">Flo</option>
            <option value="Unattributed">Unattributed</option>
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="filter-select">
            <option value="All">All sources</option>
            <option value="Brand page">Brand page</option>
            <option value="Whitelisted creator">Whitelisted creator</option>
            <option value="Creator/UGC">Creator / UGC</option>
            <option value="Third-party page">Third-party page</option>
            <option value="Organic">Organic</option>
          </select>
          <button
            type="button"
            onClick={() => setTopSpendOnly(v => !v)}
            className={`h-10 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition-colors ${topSpendOnly ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Top spend
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Comment list */}
        <div className="xl:col-span-6 space-y-2">
          {filteredComments.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
              <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="font-medium text-slate-800">No comments yet</h3>
              <p className="text-sm text-slate-500 mt-1">Comments from your Facebook and Instagram ads will show up here.</p>
            </div>
          ) : (
            <>
            {pagination}
            {visibleComments.map(comment => {
              const isSelected = previewCommentId === comment.id;
              const isUnseen = comment.status === 'Unseen';
              const wasJustViewed = recentlyViewed.has(comment.id);
              const assignedUser = teamMembers.find(t => t.id === comment.assignedTo);
              const linkedAd = getAdForComment(comment, ads);
              const brand = inferBrandLabel(comment, linkedAd);
              const source = inferSourceCategory(comment, linkedAd);
              const isTopSpend = Boolean(linkedAd && (topSpendAdIds.has(linkedAd.id) || topSpendAdIds.has(linkedAd.adId)));
              const isOrganic = !linkedAd;
              const commentUrl = commentExternalUrl(comment);
              const seenLabel = seenByLabel(comment);

              return (
                <div
                  key={comment.id}
                  onClick={() => void selectComment(comment)}
                  className={`comment-card cursor-pointer transition-all duration-300 ${
                    isSelected
                      ? 'comment-card--selected'
                      : isUnseen
                        ? 'comment-card--unseen'
                        : 'comment-card--seen'
                  } ${wasJustViewed && !isUnseen ? 'comment-card--just-viewed' : ''}`}
                >
                  {/* Unseen indicator bar */}
                  {isUnseen && <div className="comment-card__indicator" />}

                  <div className="p-3.5 pl-4 group/card">
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <CommentAvatar comment={comment} highlight={isUnseen} />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Header row: name · time · tiny signals */}
                        <div className="flex items-center gap-2 min-w-0">
                          <p className={`min-w-0 truncate ${isUnseen ? 'text-[13.5px] font-bold text-slate-900' : 'text-[13.5px] font-semibold text-slate-800'}`}>
                            {displayCommenterName(comment.commenterName)}
                          </p>
                          <PlatformBadge platform={comment.platform} />
                          {isUnseen && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                              New
                            </span>
                          )}
                          <span
                            className="ml-auto shrink-0 text-[11px] text-slate-400 flex items-center gap-1"
                            title={`Received: ${formatFullTime(comment.updatedAt)} · Comment made: ${formatFullTime(comment.createdAt)}`}
                          >
                            <Clock className="w-3 h-3" />
                            {formatCommentTime(comment.updatedAt || comment.createdAt)}
                          </span>
                        </div>

                        {/* Comment body */}
                        <p className={`mt-1.5 text-[13.5px] leading-relaxed line-clamp-3 ${isUnseen ? 'text-slate-900' : 'text-slate-600'}`}>
                          {comment.commentText}
                        </p>
                        {isGenericCommenterName(comment.commenterName) && commentUrl && (
                          <a
                            href={commentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="mt-1 inline-block text-[11px] text-blue-600 hover:underline"
                          >
                            {commentLinkLabel(comment.platform)}
                          </a>
                        )}

                        {/* Source footer — single truncated line: brand · source · destination */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                          <BrandLogoBadge brand={brand} />
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${isOrganic ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            {isOrganic ? 'Organic' : 'Ad'}
                          </span>
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${sourceChipClass(source)}`} title="Source category">
                            {source}
                          </span>
                          {isTopSpend && (
                            <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="One of the top 15 recent-spend ads for this account">
                              Top spend
                            </span>
                          )}
                          <span
                            className="min-w-0 truncate"
                            title={isOrganic
                              ? (comment.adName?.startsWith('Organic') ? comment.adName : `Organic · ${comment.pageName || comment.instagramAccountName || comment.platform}`)
                              : `${comment.campaignName || linkedAd?.campaignName || '—'} · ${comment.adsetName || linkedAd?.adsetName || '—'} · ${comment.adName || linkedAd?.adName || '—'}`}
                          >
                            → {isOrganic
                              ? (comment.adName?.startsWith('Organic') ? comment.adName : `Organic · ${comment.pageName || comment.instagramAccountName || comment.platform}`)
                              : `${comment.adName || linkedAd?.adName || '—'}`}
                          </span>
                          {assignedUser && (
                            <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                              <Users className="w-3 h-3" /> {assignedUser.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action row — appears on hover / selected / unseen. Keeps the card quiet otherwise. */}
                    <div
                      onClick={e => e.stopPropagation()}
                      className={`mt-3 flex flex-wrap items-center gap-1.5 transition-opacity ${(isSelected || isUnseen) ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}
                    >
                      {comment.status !== 'Replied' && (
                        <button
                          onClick={() => onUpdateStatus(comment.id, 'Replied')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" /> Replied
                        </button>
                      )}
                      {isUnseen && (
                        <button
                          onClick={() => onUpdateStatus(comment.id, 'Seen')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors"
                        >
                          <Eye className="w-3 h-3" /> Seen
                        </button>
                      )}
                      {commentUrl && (
                        <a
                          href={commentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => { if (comment.status === 'Unseen') onUpdateStatus(comment.id, 'Seen'); }}
                          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors"
                        >
                          <MessageSquareReply className="w-3 h-3" />
                          Open
                          <ExternalLink className="w-3 h-3 opacity-70" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {pagination}
            </>
          )}
        </div>

        {/* Inline detail panel */}
        <div className="xl:col-span-6">
          <div className="xl:sticky xl:top-20">
            {previewComment ? (
              <CommentDetailDrawer
                comment={previewComment}
                ads={ads}
                displayMode="panel"
                teamMembers={teamMembers}
                notes={notes}
                activityLogs={activityLogs}
                onAddNote={onAddNote}
                onUpdateStatus={onUpdateStatus}
                onReplyToComment={onReplyToComment}
                onModerateComment={onModerateComment}
                onUpdatePriority={onUpdatePriority}
                onAssignTeam={onAssignTeam}
                onAddCommentTag={onAddCommentTag}
                onRemoveCommentTag={onRemoveCommentTag}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                Select a comment to review details, source, notes, and actions without leaving the list.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
