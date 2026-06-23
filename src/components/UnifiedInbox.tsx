import React, { useState, useMemo, useEffect } from 'react';
import { Comment, TeamMember, CommentStatus, CommentPriority, Ad } from '../types';
import { getAdForComment, formatCommentTime } from '../utils/helpers';
import { StatusBadge, PriorityBadge, SentimentBadge, PlatformBadge } from './ui/Badges';
import AdPreviewPanel from './AdPreviewPanel';
import {
  Search,
  X,
  UserPlus,
  CheckCircle,
  Eye,
  ExternalLink,
  Tag,
  Clock,
  Inbox,
  SlidersHorizontal,
  ChevronRight,
  EyeOff,
  Calendar,
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
  onAssignTeam: (id: string, teamUserId?: string) => void;
  onAddNote: (id: string, noteText: string) => void;
  preconfiguredFilters?: InboxFilters | null;
}

export default function UnifiedInbox({
  comments,
  teamMembers,
  ads,
  onSelectComment,
  selectedCommentId,
  onUpdateStatus,
  onAssignTeam,
  onAddNote,
  preconfiguredFilters,
}: UnifiedInboxProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'All' | 'facebook' | 'instagram'>(
    preconfiguredFilters?.platform || 'All'
  );
  const [statusFilter, setStatusFilter] = useState(preconfiguredFilters?.status || 'All');
  const [priorityFilter, setPriorityFilter] = useState(preconfiguredFilters?.priority || 'All');
  const [sentimentFilter, setSentimentFilter] = useState(preconfiguredFilters?.sentiment || 'All');
  const [assigneeFilter, setAssigneeFilter] = useState(preconfiguredFilters?.assignedTo || 'All');
  const [campaignFilter, setCampaignFilter] = useState(preconfiguredFilters?.campaign || 'All');
  const [selectedTag, setSelectedTag] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [onlyMe, setOnlyMe] = useState(preconfiguredFilters?.assignedTo === 'team-1');
  const [previewCommentId, setPreviewCommentId] = useState<string | undefined>(selectedCommentId);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [activeNoteCommentId, setActiveNoteCommentId] = useState<string | null>(null);
  const [activeAssignDropdown, setActiveAssignDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (preconfiguredFilters) {
      if (preconfiguredFilters.status !== undefined) setStatusFilter(preconfiguredFilters.status);
      if (preconfiguredFilters.priority !== undefined) setPriorityFilter(preconfiguredFilters.priority);
      if (preconfiguredFilters.platform !== undefined) setPlatformFilter(preconfiguredFilters.platform);
      if (preconfiguredFilters.sentiment !== undefined) setSentimentFilter(preconfiguredFilters.sentiment);
      if (preconfiguredFilters.campaign !== undefined) setCampaignFilter(preconfiguredFilters.campaign);
      if (preconfiguredFilters.assignedTo !== undefined) {
        setAssigneeFilter(preconfiguredFilters.assignedTo);
        setOnlyMe(preconfiguredFilters.assignedTo === 'team-1');
      }
    }
  }, [preconfiguredFilters]);

  useEffect(() => {
    if (selectedCommentId) setPreviewCommentId(selectedCommentId);
  }, [selectedCommentId]);

  const allTagsList = useMemo(() => {
    const tags = new Set<string>();
    comments.forEach(c => c.tags.forEach(t => tags.add(t)));
    return Array.from(tags);
  }, [comments]);

  const campaignList = useMemo(() => {
    const names = new Set(comments.map(c => c.campaignName));
    return Array.from(names);
  }, [comments]);

  const filteredComments = useMemo(() => {
    return comments.filter(comment => {
      const textMatches =
        searchTerm === '' ||
        comment.commentText.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comment.commenterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comment.campaignName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comment.adName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comment.adsetName.toLowerCase().includes(searchTerm.toLowerCase());

      if (!textMatches) return false;
      if (platformFilter !== 'All' && comment.platform !== platformFilter) return false;

      if (statusFilter !== 'All') {
        if (statusFilter === 'Unreplied') {
          if (comment.status === 'Replied' || comment.status === 'Ignored') return false;
        } else if (comment.status !== statusFilter) return false;
      }

      if (priorityFilter !== 'All' && comment.priority !== priorityFilter) return false;
      if (sentimentFilter !== 'All' && comment.sentiment !== sentimentFilter) return false;
      if (campaignFilter !== 'All' && comment.campaignName !== campaignFilter) return false;

      if (dateFrom) {
        if (new Date(comment.createdAt) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(comment.createdAt) > end) return false;
      }

      if (onlyMe) {
        if (comment.assignedTo !== 'team-1') return false;
      } else if (assigneeFilter !== 'All') {
        if (assigneeFilter === 'Unassigned') {
          if (comment.assignedTo) return false;
        } else if (comment.assignedTo !== assigneeFilter) return false;
      }

      if (selectedTag !== 'All' && !comment.tags.includes(selectedTag)) return false;
      return true;
    });
  }, [
    comments, searchTerm, platformFilter, statusFilter, priorityFilter,
    sentimentFilter, assigneeFilter, campaignFilter, selectedTag, onlyMe, dateFrom, dateTo,
  ]);

  const previewComment = filteredComments.find(c => c.id === previewCommentId)
    || comments.find(c => c.id === previewCommentId);
  const previewAd = previewComment ? getAdForComment(previewComment, ads) : undefined;

  const handleNoteSubmit = (commentId: string) => {
    const text = noteInputs[commentId]?.trim();
    if (!text) return;
    onAddNote(commentId, text);
    setNoteInputs({ ...noteInputs, [commentId]: '' });
    setActiveNoteCommentId(null);
  };

  const selectComment = (comment: Comment) => {
    setPreviewCommentId(comment.id);
    onSelectComment(comment);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setPlatformFilter('All');
    setStatusFilter('All');
    setPriorityFilter('All');
    setSentimentFilter('All');
    setAssigneeFilter('All');
    setCampaignFilter('All');
    setSelectedTag('All');
    setDateFrom('');
    setDateTo('');
    setOnlyMe(false);
  };

  return (
    <div className="space-y-4 animate-fade-in" id="inbox-screen">
      {/* Sticky filters */}
      <div className="sticky top-0 z-30 p-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              Unified Comment Inbox
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Filter Facebook & Instagram ad comments by campaign, status, priority, and more.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
            <span className="text-xs font-mono bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-100 font-bold">
              {filteredComments.length} matched
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search comment, user, campaign, ad set, ad..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value as typeof platformFilter)} className="filter-select">
            <option value="All">All Platforms</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select">
            <option value="All">All Statuses</option>
            <option value="Unseen">Unseen</option>
            <option value="Seen">Seen</option>
            <option value="Replied">Replied</option>
            <option value="Ignored">Ignored</option>
            <option value="Unreplied">Unreplied</option>
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="filter-select">
            <option value="All">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 mt-3 pt-3 border-t border-slate-100">
          <select value={sentimentFilter} onChange={e => setSentimentFilter(e.target.value)} className="filter-select">
            <option value="All">All Sentiments</option>
            <option value="Positive">Positive</option>
            <option value="Question">Question</option>
            <option value="Neutral">Neutral</option>
            <option value="Complaint">Complaint</option>
            <option value="Negative">Negative</option>
          </select>
          <select value={assigneeFilter} disabled={onlyMe} onChange={e => setAssigneeFilter(e.target.value)} className="filter-select disabled:opacity-50">
            <option value="All">All Assignees</option>
            <option value="Unassigned">Unassigned</option>
            {teamMembers.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} className="filter-select">
            <option value="All">All Campaigns</option>
            {campaignList.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={selectedTag} onChange={e => setSelectedTag(e.target.value)} className="filter-select">
            <option value="All">All Tags</option>
            {allTagsList.map(tag => (
              <option key={tag} value={tag}>#{tag}</option>
            ))}
          </select>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="filter-select pl-8" placeholder="From" />
          </div>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="filter-select pl-8" placeholder="To" />
          </div>
        </div>

        <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
          <input type="checkbox" checked={onlyMe} onChange={e => setOnlyMe(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600" />
          <span className="text-xs font-semibold text-slate-700">Only show comments assigned to me</span>
        </label>
      </div>

      {/* Split layout: list + ad preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 space-y-3">
          {filteredComments.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Inbox className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="font-bold text-slate-800 text-base">No comments match your filters</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                Try adjusting filters or use the Webhook Simulator to inject a test comment.
              </p>
              <button onClick={clearFilters} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors">
                Reset filters
              </button>
            </div>
          ) : (
            filteredComments.map(comment => {
              const isSelected = previewCommentId === comment.id;
              const assignedUser = teamMembers.find(t => t.id === comment.assignedTo);
              const matchingAd = getAdForComment(comment, ads);

              return (
                <div
                  key={comment.id}
                  className={`bg-white border rounded-xl transition-all duration-200 ${
                    isSelected ? 'border-blue-400 ring-2 ring-blue-100 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <img
                          src={comment.commenterProfileUrl}
                          alt={comment.commenterName}
                          className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2 border-white ${
                          comment.platform === 'facebook' ? 'bg-[#1877F2]' : 'bg-gradient-to-br from-purple-500 to-pink-500'
                        }`}>
                          {comment.platform === 'facebook' ? 'f' : 'ig'}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <PlatformBadge platform={comment.platform} />
                          <StatusBadge status={comment.status} />
                          <PriorityBadge priority={comment.priority} />
                          <SentimentBadge sentiment={comment.sentiment} />
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <button onClick={() => selectComment(comment)} className="font-semibold text-sm text-slate-900 hover:text-blue-600 transition-colors text-left">
                            {comment.commenterName}
                          </button>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3" />
                            {formatCommentTime(comment.createdAt)}
                          </span>
                        </div>

                        <p onClick={() => selectComment(comment)} className="text-sm text-slate-700 mt-1 leading-relaxed cursor-pointer hover:text-slate-900 line-clamp-2">
                          {comment.commentText}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                          <span><strong className="text-slate-600">Campaign:</strong> {comment.campaignName}</span>
                          <span><strong className="text-slate-600">Ad Set:</strong> {comment.adsetName}</span>
                          <span><strong className="text-slate-600">Ad:</strong> {comment.adName}</span>
                        </div>

                        {assignedUser && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <img src={assignedUser.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                            <span className="text-[10px] font-semibold text-slate-600">{assignedUser.name}</span>
                          </div>
                        )}

                        {comment.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {comment.tags.map(tag => (
                              <button
                                key={tag}
                                onClick={() => setSelectedTag(tag)}
                                className="inline-flex items-center gap-0.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 transition-colors"
                              >
                                <Tag className="w-2.5 h-2.5" /> {tag}
                              </button>
                            ))}
                          </div>
                        )}

                        {matchingAd && (
                          <button
                            onClick={() => selectComment(comment)}
                            className="mt-2.5 w-full p-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2 transition-colors text-left xl:hidden"
                          >
                            <div className="w-10 h-7 bg-black rounded overflow-hidden shrink-0">
                              {matchingAd.mediaType === 'image' && matchingAd.mediaUrl ? (
                                <img src={matchingAd.mediaUrl} alt="" className="w-full h-full object-cover" />
                              ) : matchingAd.thumbnailUrl ? (
                                <img src={matchingAd.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              ) : null}
                            </div>
                            <span className="text-[10px] font-semibold text-slate-600 truncate">{matchingAd.adName}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => selectComment(comment)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                      {comment.status === 'Unseen' && (
                        <button
                          onClick={() => onUpdateStatus(comment.id, 'Seen')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-bold transition-colors"
                        >
                          <Eye className="w-3 h-3" /> Mark Seen
                        </button>
                      )}
                      {comment.status !== 'Replied' && (
                        <button
                          onClick={() => onUpdateStatus(comment.id, 'Replied')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" /> Mark Replied
                        </button>
                      )}
                      {comment.status !== 'Ignored' && (
                        <button
                          onClick={() => onUpdateStatus(comment.id, 'Ignored')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold transition-colors"
                        >
                          <EyeOff className="w-3 h-3" /> Ignore
                        </button>
                      )}
                      <div className="relative">
                        <button
                          onClick={() => setActiveAssignDropdown(activeAssignDropdown === comment.id ? null : comment.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold transition-colors"
                        >
                          <UserPlus className="w-3 h-3" /> Assign
                        </button>
                        {activeAssignDropdown === comment.id && (
                          <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                            {teamMembers.map(member => (
                              <button
                                key={member.id}
                                onClick={() => { onAssignTeam(comment.id, member.id); setActiveAssignDropdown(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-left"
                              >
                                <img src={member.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                                {member.name}
                              </button>
                            ))}
                            <button
                              onClick={() => { onAssignTeam(comment.id, undefined); setActiveAssignDropdown(null); }}
                              className="w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50 text-left border-t border-slate-100"
                            >
                              Unassign
                            </button>
                          </div>
                        )}
                      </div>
                      <a
                        href={comment.originalCommentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => { if (comment.status === 'Unseen') onUpdateStatus(comment.id, 'Seen'); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold transition-colors"
                      >
                        Open Original <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        onClick={() => setActiveNoteCommentId(activeNoteCommentId === comment.id ? null : comment.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-[11px] font-bold transition-colors ml-auto"
                      >
                        + Note
                      </button>
                      <button
                        onClick={() => selectComment(comment)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                        title="Open detail drawer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {activeNoteCommentId === comment.id && (
                      <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <textarea
                          rows={2}
                          value={noteInputs[comment.id] || ''}
                          onChange={e => setNoteInputs({ ...noteInputs, [comment.id]: e.target.value })}
                          placeholder="Add internal note..."
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg resize-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <div className="flex gap-2 justify-end mt-1">
                          <button onClick={() => setActiveNoteCommentId(null)} className="text-xs text-slate-500 px-2 py-1">Cancel</button>
                          <button onClick={() => handleNoteSubmit(comment.id)} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-bold">Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Ad Preview Panel — sticky on desktop */}
        <div className="xl:col-span-5">
          <div className="xl:sticky xl:top-[280px]">
            <AdPreviewPanel ad={previewAd} comment={previewComment} />
          </div>
        </div>
      </div>
    </div>
  );
}
