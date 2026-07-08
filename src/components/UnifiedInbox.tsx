import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Comment, CommentStatus, CommentPriority, CommentNote, ActivityLog, Ad, CommentView } from '../types';
import { getAdForComment, formatCommentTime, formatFullTime, displayCommenterName, isGenericCommenterName, inferBrandLabel, commentExternalUrl, commentLinkLabel, inferSourceCategory, sourceChipClass } from '../utils/helpers';
import { matchesStatusTab } from '../utils/commentMetrics';
import { PlatformBadge } from './ui/Badges';
import CommentDetailDrawer from './CommentDetailDrawer';
import CommentAvatar from './CommentAvatar';
import { BrandLogoBadge } from './BrandLogo';
import { apiClient } from '../services/apiClient';
import {
  Search,
  ExternalLink,
  Clock,
  Inbox,
  RefreshCw,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';

export interface InboxFilters {
  platform?: 'facebook' | 'instagram';
  status?: string;
  priority?: string;
  sentiment?: string;
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
  ads: Ad[];
  onSelectComment: (comment: Comment) => void;
  selectedCommentId?: string;
  onUpdateStatus: (id: string, status: CommentStatus) => Promise<void>;
  onReplyToComment?: (id: string, message: string, opts?: { targetCommentId?: string; mention?: string; includeMention?: boolean }) => Promise<void>;
  onModerateComment?: (id: string, hidden: boolean) => Promise<void>;
  onUpdatePriority: (id: string, priority: CommentPriority) => Promise<void>;
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

const SOURCE_FILTERS = [
  { id: 'All', label: 'All sources' },
  { id: 'Brand page', label: 'Brand page' },
  { id: 'Organic', label: 'Organic' },
  { id: 'Creator / Whitelist', label: 'Creator / WL' },
  { id: 'Third-party page', label: 'Third-party' },
] as const;

export default function UnifiedInbox({
  comments,
  ads,
  onSelectComment,
  selectedCommentId,
  onUpdateStatus,
  onReplyToComment,
  onModerateComment,
  onUpdatePriority,
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

  const passesBaseFilters = useCallback((comment: Comment) => {
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
    if (preconfiguredFilters?.campaign && comment.campaignName !== preconfiguredFilters.campaign && comment.campaignId !== preconfiguredFilters.campaign) return false;
    return true;
  }, [ads, topSpendAdIds, searchTerm, platformFilter, priorityFilter, sentimentFilter, brandFilter, sourceFilter, topSpendOnly, preconfiguredFilters]);

  const sortComments = useCallback((list: Comment[]) => {
    return [...list].sort((a, b) => {
      const aTime = Date.parse(a.createdAt) || 0;
      const bTime = Date.parse(b.createdAt) || 0;
      if (bTime !== aTime) return bTime - aTime;
      return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
    });
  }, []);

  const baseFilteredComments = useMemo(
    () => sortComments(comments.filter(passesBaseFilters)),
    [comments, passesBaseFilters, sortComments]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of STATUS_TABS) {
      counts[tab.id] = tab.id === 'All'
        ? baseFilteredComments.length
        : baseFilteredComments.filter(c => matchesStatusTab(c, tab.id)).length;
    }
    return counts;
  }, [baseFilteredComments]);

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = { All: baseFilteredComments.length };
    for (const src of SOURCE_FILTERS) {
      if (src.id === 'All') continue;
      counts[src.id] = baseFilteredComments.filter(c => inferSourceCategory(c, getAdForComment(c, ads)) === src.id).length;
    }
    return counts;
  }, [baseFilteredComments, ads]);

  const filteredComments = useMemo(() => {
    if (statusFilter === 'All') return baseFilteredComments;
    return baseFilteredComments.filter(c => matchesStatusTab(c, statusFilter));
  }, [baseFilteredComments, statusFilter]);

  const previewComment = filteredComments.find(c => c.id === previewCommentId)
    || comments.find(c => c.id === previewCommentId);
  const totalPages = Math.max(1, Math.ceil(filteredComments.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = filteredComments.length === 0 ? 0 : (safePage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, filteredComments.length);
  const visibleComments = filteredComments.slice(pageStartIndex, pageEndIndex);

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
    <div className="space-y-3 animate-fade-in" id="inbox-screen">
      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-[10px] px-3 py-1.5 text-sm font-semibold transition-all ${
                  statusFilter === tab.id
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
                {statusCounts[tab.id] > 0 && (
                  <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-extrabold tabular ${
                    statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-950 text-white'
                  }`}>{statusCounts[tab.id].toLocaleString()}</span>
                )}
              </button>
            ))}
            <span className="hidden h-6 w-px bg-slate-200 lg:inline-block" />
            {SOURCE_FILTERS.map(src => (
              <button
                key={src.id}
                type="button"
                onClick={() => setSourceFilter(src.id)}
                className={`rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                  sourceFilter === src.id
                    ? 'bg-violet-700 text-white shadow-sm'
                    : 'bg-violet-50 text-violet-800 hover:bg-violet-100'
                }`}
              >
                {src.label}
                {sourceCounts[src.id] > 0 && (
                  <span className={`ml-1 rounded px-1 py-0.5 text-[9px] font-extrabold tabular ${
                    sourceFilter === src.id ? 'bg-white/20' : 'bg-violet-200 text-violet-900'
                  }`}>{sourceCounts[src.id].toLocaleString()}</span>
                )}
              </button>
            ))}
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
              title="Simple status filters are active"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-xl">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search comments..."
                className="h-9 w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-[3px] focus:ring-slate-100"
              />
            </div>
            {onRefresh && (
              <button
                onClick={() => void onRefresh()}
                disabled={isRefreshing}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-slate-950 px-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
              >
                {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="hidden sm:inline">{isRefreshing ? 'Updating' : 'Refresh'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 items-start ${previewComment ? 'xl:grid-cols-[minmax(260px,20%)_minmax(0,80%)]' : 'xl:grid-cols-[minmax(360px,0.42fr)_minmax(0,0.58fr)]'}`}>
        {/* Comment list */}
        <div className="space-y-2">
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

                  <div className="p-2.5 pl-3 group/card">
                    <div className="flex items-start gap-2.5">
                      <div className="relative shrink-0">
                        <CommentAvatar comment={comment} highlight={isUnseen} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 min-w-0">
                          <p className={`min-w-0 flex-1 truncate ${isUnseen ? 'text-[13px] font-extrabold text-slate-950' : 'text-[13px] font-bold text-slate-800'}`}>
                            {displayCommenterName(comment.commenterName)}
                          </p>
                          <span
                            className="shrink-0 text-[10px] text-slate-400 flex items-center gap-1"
                            title={`Received: ${formatFullTime(comment.updatedAt)} · Comment made: ${formatFullTime(comment.createdAt)}`}
                          >
                            <Clock className="w-3 h-3" />
                            {formatCommentTime(comment.updatedAt || comment.createdAt)}
                          </span>
                        </div>

                        <p className={`mt-1 text-[12.5px] leading-snug line-clamp-2 ${isUnseen ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
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

                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-500">
                          <BrandLogoBadge brand={brand} />
                          <PlatformBadge platform={comment.platform} />
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${isOrganic ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                            {linkedAd?.accountLabel || comment.pageName || comment.instagramAccountName || (isOrganic ? 'Organic' : 'Ad')}
                          </span>
                          {isTopSpend && (
                            <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700" title="One of the top 15 recent-spend ads for this account">
                              Top spend
                            </span>
                          )}
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${sourceChipClass(source)}`} title="Source category">
                            {source}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-500">
                          <span className={`inline-flex min-w-0 flex-1 items-center gap-1 rounded-lg border px-2 py-1 ${comment.status === 'Unseen' ? 'border-blue-100 bg-blue-50 text-blue-800' : 'border-slate-100 bg-slate-50 text-slate-600'}`} title={seenLabel}>
                            <Users className="h-3 w-3 shrink-0" />
                            <span className="truncate font-bold">{seenLabel}</span>
                          </span>
                          {commentUrl && (
                            <a
                              href={commentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
                              title="Open comment"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>

                        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[10.5px] text-slate-500">
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
                        </div>
                      </div>
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
        <div>
          <div className="xl:sticky xl:top-16">
            {previewComment ? (
              <CommentDetailDrawer
                comment={previewComment}
                ads={ads}
                displayMode="panel"
                onClose={() => setPreviewCommentId(undefined)}
                notes={notes}
                activityLogs={activityLogs}
                onAddNote={onAddNote}
                onUpdateStatus={onUpdateStatus}
                onReplyToComment={onReplyToComment}
                onModerateComment={onModerateComment}
                onUpdatePriority={onUpdatePriority}
                onAddCommentTag={onAddCommentTag}
                onRemoveCommentTag={onRemoveCommentTag}
                onViewComment={onViewComment}
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
