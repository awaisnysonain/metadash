import React, { useState, useMemo, useEffect } from 'react';
import { Comment, TeamMember, CommentStatus, Ad } from '../types';
import { getAdForComment, formatCommentTime, displayCommenterName, isGenericCommenterName, commenterAvatarUrl, commenterInitial, inferBrandLabel, brandChipClass } from '../utils/helpers';
import { StatusBadge, PlatformBadge, PriorityBadge, SentimentBadge } from './ui/Badges';
import AdPreviewPanel from './AdPreviewPanel';
import { apiClient } from '../services/apiClient';
import {
  Search,
  X,
  CheckCircle,
  Eye,
  ExternalLink,
  Clock,
  Inbox,
  RefreshCw,
  Loader2,
  MessageSquareReply,
  Users,
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
}

interface UnifiedInboxProps {
  comments: Comment[];
  teamMembers: TeamMember[];
  ads: Ad[];
  onSelectComment: (comment: Comment) => void;
  selectedCommentId?: string;
  onUpdateStatus: (id: string, status: CommentStatus) => Promise<void>;
  onViewComment?: (id: string) => void;
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

const MAX_VISIBLE_COMMENTS = 250;

export default function UnifiedInbox({
  comments,
  teamMembers,
  ads,
  onSelectComment,
  selectedCommentId,
  onUpdateStatus,
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
  const [topSpendOnly, setTopSpendOnly] = useState(Boolean(preconfiguredFilters?.topSpend));
  const [previewCommentId, setPreviewCommentId] = useState<string | undefined>(selectedCommentId);
  const [recentlyViewed, setRecentlyViewed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPlatformFilter(preconfiguredFilters?.platform ?? 'All');
    setStatusFilter(preconfiguredFilters?.status ?? 'All');
    setPriorityFilter(preconfiguredFilters?.priority ?? 'All');
    setSentimentFilter(preconfiguredFilters?.sentiment ?? 'All');
    setBrandFilter(preconfiguredFilters?.brand ?? 'All');
    setTopSpendOnly(Boolean(preconfiguredFilters?.topSpend));
  }, [preconfiguredFilters]);

  const topSpendAdIds = useMemo(() => {
    const ids = new Set<string>();
    [...ads]
      .filter(ad => (ad.spend ?? 0) > 0)
      .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
      .slice(0, 25)
      .forEach(ad => {
        ids.add(ad.id);
        ids.add(ad.adId);
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
      if (topSpendOnly && !isTopSpend) return false;
      if (preconfiguredFilters?.assignedTo && comment.assignedTo !== preconfiguredFilters.assignedTo) return false;
      if (preconfiguredFilters?.campaign && comment.campaignName !== preconfiguredFilters.campaign && comment.campaignId !== preconfiguredFilters.campaign) return false;

      if (statusFilter !== 'All') {
        if (statusFilter === 'Unreplied') {
          if (comment.status === 'Replied' || comment.status === 'Ignored') return false;
        } else if (comment.status !== statusFilter) return false;
      }

      return true;
    });
  }, [comments, ads, topSpendAdIds, searchTerm, platformFilter, statusFilter, priorityFilter, sentimentFilter, brandFilter, topSpendOnly, preconfiguredFilters]);

  const previewComment = filteredComments.find(c => c.id === previewCommentId)
    || comments.find(c => c.id === previewCommentId);
  const previewAd = previewComment ? getAdForComment(previewComment, ads) : undefined;
  const visibleComments = filteredComments.slice(0, MAX_VISIBLE_COMMENTS);

  const unseenCount = comments.filter(c => c.status === 'Unseen').length;

  const selectComment = async (comment: Comment) => {
    setPreviewCommentId(comment.id);
    onSelectComment(comment);

    try {
      await apiClient.recordCommentView(comment.id);
      if (comment.status === 'Unseen') {
        setRecentlyViewed(prev => new Set(prev).add(comment.id));
        onViewComment?.(comment.id);
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
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
          <div>
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-800">{comments.length}</span> loaded comments
              {unseenCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                  {unseenCount} new
                </span>
              )}
            </p>
          </div>
          {onRefresh && (
            <button
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors shadow-sm shadow-blue-500/20"
            >
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isRefreshing ? 'Updating…' : 'Refresh'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                statusFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
              {tab.id === 'Unseen' && unseenCount > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  statusFilter === tab.id ? 'bg-white/25' : 'bg-blue-600 text-white'
                }`}>{unseenCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search comments, users, campaigns…"
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value as typeof platformFilter)}
            className="filter-select sm:w-40"
          >
            <option value="All">All platforms</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="filter-select sm:w-36">
            <option value="All">All priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select value={sentimentFilter} onChange={e => setSentimentFilter(e.target.value)} className="filter-select sm:w-40">
            <option value="All">All sentiment</option>
            <option value="Complaint">Complaint</option>
            <option value="Negative">Negative</option>
            <option value="Question">Question</option>
            <option value="Positive">Positive</option>
            <option value="Neutral">Neutral</option>
          </select>
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className="filter-select sm:w-36">
            <option value="All">All brands</option>
            <option value="Nobl">Nobl</option>
            <option value="Flo">Flo</option>
            <option value="Unattributed">Unattributed</option>
          </select>
          <button
            type="button"
            onClick={() => setTopSpendOnly(v => !v)}
            className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${topSpendOnly ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Top spend only
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Comment list */}
        <div className="xl:col-span-7 space-y-2">
          {filteredComments.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
              <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="font-medium text-slate-800">No comments yet</h3>
              <p className="text-sm text-slate-500 mt-1">Comments from your Facebook and Instagram ads will show up here.</p>
            </div>
          ) : (
            <>
            {visibleComments.map(comment => {
              const isSelected = previewCommentId === comment.id;
              const isUnseen = comment.status === 'Unseen';
              const wasJustViewed = recentlyViewed.has(comment.id);
              const assignedUser = teamMembers.find(t => t.id === comment.assignedTo);
              const linkedAd = getAdForComment(comment, ads);
              const brand = inferBrandLabel(comment, linkedAd);
              const isTopSpend = Boolean(linkedAd && (topSpendAdIds.has(linkedAd.id) || topSpendAdIds.has(linkedAd.adId)));

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

                  <div className="p-4 pl-5">
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        {commenterAvatarUrl(comment) ? (
                          <img
                            src={commenterAvatarUrl(comment)}
                            alt=""
                            className={`w-10 h-10 rounded-full object-cover ring-2 ${
                              isUnseen ? 'ring-blue-200' : 'ring-slate-100'
                            }`}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                            isUnseen ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {commenterInitial(comment.commenterName)}
                          </div>
                        )}
                        {isUnseen && (
                          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white animate-pulse-dot" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <PlatformBadge platform={comment.platform} />
                          <StatusBadge status={comment.status} />
                          <PriorityBadge priority={comment.priority} />
                          <SentimentBadge sentiment={comment.sentiment} />
                          <span className={`text-[10px] px-1.5 py-0.5 border rounded-md font-semibold ${brandChipClass(brand)}`}>{brand}</span>
                          {isTopSpend && <span className="text-[10px] px-1.5 py-0.5 border rounded-md font-semibold bg-amber-50 text-amber-700 border-amber-200">Top spend</span>}
                          {isUnseen && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              New
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 ml-auto">
                            <Clock className="w-3 h-3" />
                            {formatCommentTime(comment.createdAt)}
                          </span>
                        </div>

                        <p className={`text-sm ${isUnseen ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>
                          {displayCommenterName(comment.commenterName)}
                        </p>
                        {isGenericCommenterName(comment.commenterName) && comment.originalCommentUrl && (
                          <a
                            href={comment.originalCommentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-[11px] text-blue-600 hover:underline"
                          >
                            View on Facebook
                          </a>
                        )}
                        <p className={`text-sm mt-1 leading-relaxed ${isUnseen ? 'text-slate-800' : 'text-slate-600'}`}>
                          {comment.commentText}
                        </p>

                        <p className="text-[10px] text-slate-500 mt-2 truncate">
                          {(linkedAd?.accountLabel || brand)} · {comment.campaignName} · {comment.adName}
                        </p>

                        {assignedUser && (
                          <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {assignedUser.name}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
                      {comment.status !== 'Replied' && (
                        <button
                          onClick={() => onUpdateStatus(comment.id, 'Replied')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" /> Mark replied
                        </button>
                      )}
                      {comment.status === 'Unseen' && (
                        <button
                          onClick={() => onUpdateStatus(comment.id, 'Seen')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-medium transition-colors"
                        >
                          <Eye className="w-3 h-3" /> Mark seen
                        </button>
                      )}
                      <a
                        href={comment.originalCommentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => { if (comment.status === 'Unseen') onUpdateStatus(comment.id, 'Seen'); }}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-semibold ml-auto shadow-sm shadow-blue-500/25 transition-all"
                      >
                        <MessageSquareReply className="w-3.5 h-3.5" />
                        Reply on Meta
                        <ExternalLink className="w-3 h-3 opacity-70" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredComments.length > visibleComments.length && (
              <div className="p-4 text-center bg-white border border-slate-200 rounded-2xl text-sm text-slate-500">
                Showing the newest {visibleComments.length} of {filteredComments.length} matching comments. Use search or filters to narrow the list.
              </div>
            )}
            </>
          )}
        </div>

        {/* Ad preview panel */}
        <div className="xl:col-span-5">
          <div className="xl:sticky xl:top-20">
            <AdPreviewPanel ad={previewAd} comment={previewComment} />
          </div>
        </div>
      </div>
    </div>
  );
}
