import React, { useState, useMemo, useEffect } from 'react';
import { Comment, TeamMember, CommentStatus, Ad } from '../types';
import { getAdForComment, formatCommentTime } from '../utils/helpers';
import { StatusBadge, PlatformBadge } from './ui/Badges';
import AdPreviewPanel from './AdPreviewPanel';
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
} from 'lucide-react';

export interface InboxFilters {
  platform?: 'facebook' | 'instagram';
  status?: string;
  priority?: string;
  sentiment?: string;
  assignedTo?: string;
  campaign?: string;
}

interface UnifiedInboxProps {
  comments: Comment[];
  teamMembers: TeamMember[];
  ads: Ad[];
  onSelectComment: (comment: Comment) => void;
  selectedCommentId?: string;
  onUpdateStatus: (id: string, status: CommentStatus) => void;
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

export default function UnifiedInbox({
  comments,
  teamMembers,
  ads,
  onSelectComment,
  selectedCommentId,
  onUpdateStatus,
  onRefresh,
  isRefreshing = false,
  preconfiguredFilters,
}: UnifiedInboxProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'All' | 'facebook' | 'instagram'>(
    preconfiguredFilters?.platform || 'All'
  );
  const [statusFilter, setStatusFilter] = useState(preconfiguredFilters?.status || 'All');
  const [previewCommentId, setPreviewCommentId] = useState<string | undefined>(selectedCommentId);

  useEffect(() => {
    if (preconfiguredFilters?.platform !== undefined) setPlatformFilter(preconfiguredFilters.platform);
    if (preconfiguredFilters?.status !== undefined) setStatusFilter(preconfiguredFilters.status);
  }, [preconfiguredFilters]);

  useEffect(() => {
    if (selectedCommentId) setPreviewCommentId(selectedCommentId);
  }, [selectedCommentId]);

  const filteredComments = useMemo(() => {
    return comments.filter(comment => {
      const q = searchTerm.toLowerCase();
      const textMatches =
        !q ||
        comment.commentText.toLowerCase().includes(q) ||
        comment.commenterName.toLowerCase().includes(q) ||
        comment.campaignName.toLowerCase().includes(q) ||
        comment.adName.toLowerCase().includes(q);

      if (!textMatches) return false;
      if (platformFilter !== 'All' && comment.platform !== platformFilter) return false;

      if (statusFilter !== 'All') {
        if (statusFilter === 'Unreplied') {
          if (comment.status === 'Replied' || comment.status === 'Ignored') return false;
        } else if (comment.status !== statusFilter) return false;
      }

      return true;
    });
  }, [comments, searchTerm, platformFilter, statusFilter]);

  const previewComment = filteredComments.find(c => c.id === previewCommentId)
    || comments.find(c => c.id === previewCommentId);
  const previewAd = previewComment ? getAdForComment(previewComment, ads) : undefined;

  const unseenCount = comments.filter(c => c.status === 'Unseen').length;

  const selectComment = (comment: Comment) => {
    setPreviewCommentId(comment.id);
    onSelectComment(comment);
    if (comment.status === 'Unseen') onUpdateStatus(comment.id, 'Seen');
  };

  return (
    <div className="space-y-5 animate-fade-in" id="inbox-screen">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
          <div>
            <p className="text-sm text-slate-500">
              {comments.length} comments · {unseenCount} new
            </p>
          </div>
          {onRefresh && (
            <button
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isRefreshing ? 'Updating…' : 'Refresh comments'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
              {tab.id === 'Unseen' && unseenCount > 0 && (
                <span className="ml-1.5 bg-white/25 px-1.5 py-0.5 rounded text-[10px]">{unseenCount}</span>
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
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
          {(searchTerm || platformFilter !== 'All' || statusFilter !== 'All') && (
            <button
              onClick={() => { setSearchTerm(''); setPlatformFilter('All'); setStatusFilter('All'); }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <X className="w-3.5 h-3.5 inline mr-1" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 space-y-2">
          {filteredComments.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
              <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="font-medium text-slate-800">No comments yet</h3>
              <p className="text-sm text-slate-500 mt-1">
                Comments from your Facebook and Instagram ads will show up here.
              </p>
            </div>
          ) : (
            filteredComments.map(comment => {
              const isSelected = previewCommentId === comment.id;
              const isUnseen = comment.status === 'Unseen';
              const assignedUser = teamMembers.find(t => t.id === comment.assignedTo);

              return (
                <div
                  key={comment.id}
                  onClick={() => selectComment(comment)}
                  className={`bg-white border rounded-2xl cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-300 ring-2 ring-blue-100'
                      : isUnseen
                        ? 'border-blue-200 bg-blue-50/40 hover:border-blue-300'
                        : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        {comment.commenterProfileUrl ? (
                          <img
                            src={comment.commenterProfileUrl}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                            {comment.commenterName.charAt(0)}
                          </div>
                        )}
                        {isUnseen && (
                          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <PlatformBadge platform={comment.platform} />
                          <StatusBadge status={comment.status} />
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 ml-auto">
                            <Clock className="w-3 h-3" />
                            {formatCommentTime(comment.createdAt)}
                          </span>
                        </div>

                        <p className="font-semibold text-sm text-slate-900">{comment.commenterName}</p>
                        <p className="text-sm text-slate-700 mt-1 leading-relaxed">{comment.commentText}</p>

                        <p className="text-[10px] text-slate-500 mt-2 truncate">
                          {comment.campaignName} · {comment.adName}
                        </p>

                        {assignedUser && (
                          <p className="text-[10px] text-slate-500 mt-1">Assigned: {assignedUser.name}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
                      {comment.status !== 'Replied' && (
                        <button
                          onClick={() => onUpdateStatus(comment.id, 'Replied')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium"
                        >
                          <CheckCircle className="w-3 h-3" /> Mark replied
                        </button>
                      )}
                      {comment.status === 'Unseen' && (
                        <button
                          onClick={() => onUpdateStatus(comment.id, 'Seen')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-medium"
                        >
                          <Eye className="w-3 h-3" /> Mark seen
                        </button>
                      )}
                      <a
                        href={comment.originalCommentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => { if (comment.status === 'Unseen') onUpdateStatus(comment.id, 'Seen'); }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium ml-auto"
                      >
                        Reply on Meta <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="xl:col-span-5">
          <div className="xl:sticky xl:top-20">
            <AdPreviewPanel ad={previewAd} comment={previewComment} />
          </div>
        </div>
      </div>
    </div>
  );
}
