import React, { useEffect, useState } from 'react';
import { Comment, TeamMember, CommentNote, ActivityLog, CommentStatus, CommentPriority, Ad } from '../types';
import { getAdForComment, formatFullTime, displayCommenterName, commentExternalUrl, commentLinkLabel } from '../utils/helpers';
import { StatusBadge, PriorityBadge, SentimentBadge, PlatformBadge } from './ui/Badges';
import AdPreviewPanel from './AdPreviewPanel';
import CommentAvatar from './CommentAvatar';
import { apiClient, type MetaThreadItem } from '../services/apiClient';
import {
  X,
  ExternalLink,
  Eye,
  CheckCircle,
  EyeOff,
  MessageSquareReply,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
  AlertTriangle,
  CheckCheck,
} from 'lucide-react';

type Toast = { kind: 'success' | 'error'; text: string };

interface CommentDetailDrawerProps {
  comment?: Comment;
  ads: Ad[];
  onClose?: () => void;
  displayMode?: 'drawer' | 'panel';
  teamMembers: TeamMember[];
  notes: CommentNote[];
  activityLogs: ActivityLog[];
  onAddNote: (commentId: string, noteText: string) => void;
  onUpdateStatus: (commentId: string, status: CommentStatus) => void;
  onReplyToComment?: (commentId: string, message: string, opts?: { targetCommentId?: string; mention?: string; includeMention?: boolean }) => Promise<void> | void;
  onModerateComment?: (commentId: string, hidden: boolean) => Promise<void> | void;
  onUpdatePriority: (commentId: string, priority: CommentPriority) => void;
  onAssignTeam: (commentId: string, teamUserId?: string) => void;
  onRemoveCommentTag: (commentId: string, tag: string) => void;
  onAddCommentTag: (commentId: string, tag: string) => void;
}

export default function CommentDetailDrawer({
  comment,
  ads,
  onClose,
  displayMode = 'drawer',
  teamMembers,
  notes,
  activityLogs,
  onAddNote,
  onUpdateStatus,
  onReplyToComment,
  onModerateComment,
  onUpdatePriority,
  onAssignTeam,
  onRemoveCommentTag,
  onAddCommentTag,
}: CommentDetailDrawerProps) {
  const [newNote, setNewNote] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [replyTarget, setReplyTarget] = useState<{ id: string; mention: string; label: string } | null>(null);
  const [replies, setReplies] = useState<MetaThreadItem[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [repliesError, setRepliesError] = useState('');
  const [editingReplyId, setEditingReplyId] = useState('');
  const [editingText, setEditingText] = useState('');
  const [updatingMetaId, setUpdatingMetaId] = useState('');
  const [detailTab, setDetailTab] = useState<'details' | 'notes' | 'activity'>('details');

  const notify = (text: string, kind: Toast['kind'] = 'success') => setToast({ kind, text });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setReplyText('');
    setReplyTarget(null);
    setEditingReplyId('');
    setEditingText('');
    setActionError('');
    setRepliesError('');
    setDetailTab('details');
    if (!comment) {
      setReplies([]);
      return;
    }

    let cancelled = false;
    setLoadingReplies(true);
    apiClient.getCommentReplies(comment.id)
      .then(result => {
        if (!cancelled) setReplies(result.items);
      })
      .catch(err => {
        if (!cancelled) {
          setReplies([]);
          setRepliesError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingReplies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [comment?.id]);

  if (!comment) return null;

  const matchingAd = getAdForComment(comment, ads);
  const commentUrl = commentExternalUrl(comment);
  const filteredNotes = notes.filter(n => n.commentId === comment.id);
  const filteredLogs = activityLogs.filter(log => log.commentId === comment.id);
  const mentionName = comment.platform === 'instagram'
    ? displayCommenterName(comment.commenterName).replace(/^@/, '')
    : displayCommenterName(comment.commenterName);
  const seenNames = [...new Set((comment.views ?? []).map(view => view.userName).filter(Boolean))];
  const seenByText = seenNames.length === 0
    ? comment.seenAt ? 'Seen by team' : 'Unread for everyone'
    : `Seen by ${seenNames.join(', ')}`;
  const repliesPreview = replies.slice(0, 2);
  const notesPreview = filteredNotes.slice(0, 3);
  const logsPreview = filteredLogs.slice(0, 8);
  const isOrganicComment = !matchingAd || comment.campaignName === 'Organic' || comment.adName?.startsWith('Organic');
  const ownerName = comment.instagramAccountName
    ? `@${comment.instagramAccountName}`
    : comment.pageName || comment.platform;
  const detailTitle = isOrganicComment
    ? `Organic post · ${ownerName}`
    : (matchingAd?.adName || comment.adName || 'Comment');
  const detailSubtitle = isOrganicComment
    ? `${ownerName} · Organic / no linked ad`
    : `${matchingAd?.accountLabel || 'Ad account'} · ${comment.campaignName || matchingAd?.campaignName || 'Campaign'} · ${comment.adsetName || matchingAd?.adsetName || 'Ad set'}`;
  const headerThumb = matchingAd?.thumbnailUrl || (matchingAd?.mediaType === 'image' ? matchingAd.mediaUrl : undefined);

  const refreshReplies = async () => {
    setLoadingReplies(true);
    setRepliesError('');
    try {
      const result = await apiClient.getCommentReplies(comment.id);
      setReplies(result.items);
    } catch (err) {
      setReplies([]);
      setRepliesError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    onAddNote(comment.id, newNote.trim());
    setNewNote('');
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !onReplyToComment) return;
    setReplying(true);
    setActionError('');
    try {
      await onReplyToComment(comment.id, replyText.trim(), {
        targetCommentId: replyTarget?.id,
        mention: replyTarget?.mention || mentionName,
        includeMention: true,
      });
      setReplyText('');
      setReplyTarget(null);
      await refreshReplies();
      notify(replyTarget ? `Reply sent to ${replyTarget.label} on Meta.` : 'Reply posted on Meta.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      notify(`Reply failed: ${msg}`, 'error');
    } finally {
      setReplying(false);
    }
  };

  const handleDeleteMetaComment = async (metaCommentId: string) => {
    setUpdatingMetaId(metaCommentId);
    setActionError('');
    const isRoot = metaCommentId === comment.commentId;
    try {
      const result = await apiClient.deleteMetaComment(comment.id, metaCommentId);
      if (result.comment) onUpdateStatus(comment.id, result.comment.status);
      if (!isRoot) {
        await refreshReplies();
      } else {
        setReplies([]);
      }
      notify(isRoot
        ? 'Comment deleted on Meta. It has been marked Ignored here and tagged “Deleted on Meta”.'
        : 'Reply deleted on Meta.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      notify(`Delete failed: ${msg}`, 'error');
    } finally {
      setUpdatingMetaId('');
    }
  };

  const handleEditMetaComment = async (metaCommentId: string) => {
    if (!editingText.trim()) return;
    setUpdatingMetaId(metaCommentId);
    setActionError('');
    try {
      await apiClient.editMetaComment(comment.id, metaCommentId, editingText.trim());
      setEditingReplyId('');
      setEditingText('');
      await refreshReplies();
      notify('Reply updated on Meta.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      notify(`Edit failed: ${msg}`, 'error');
    } finally {
      setUpdatingMetaId('');
    }
  };

  const handleModerate = async (hidden: boolean) => {
    if (!onModerateComment) return;
    setModerating(true);
    setActionError('');
    try {
      await onModerateComment(comment.id, hidden);
      notify(hidden ? 'Comment hidden on Meta.' : 'Comment unhidden on Meta.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      notify(`${hidden ? 'Hide' : 'Unhide'} failed: ${msg}`, 'error');
    } finally {
      setModerating(false);
    }
  };

  const toastNode = toast && (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute right-4 top-4 z-[60] flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg ${
        toast.kind === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-red-200 bg-red-50 text-red-800'
      }`}
      style={{ maxWidth: '22rem' }}
    >
      {toast.kind === 'success' ? <CheckCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{toast.text}</span>
    </div>
  );

  const content = (
    <div className={`${displayMode === 'drawer' ? 'relative my-4 mr-4 h-[calc(100vh-2rem)] w-full max-w-6xl rounded-[28px] shadow-2xl z-50 border animate-slide-over overflow-y-auto' : 'relative min-h-[720px] rounded-[24px] border shadow-sm'} bg-white dark:bg-slate-900 flex flex-col border-slate-200 dark:border-slate-800`}>
      {toastNode}
      <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white/95 dark:bg-slate-900/95">
        <div className="flex min-w-0 items-center gap-3">
          {headerThumb ? (
            <img src={headerThumb} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-slate-100 dark:bg-slate-800 object-cover ring-1 ring-slate-200 dark:ring-slate-700" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-2xl bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700" />
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Comment details</p>
            <h3 className="detail-line-clamp-2 text-lg font-extrabold leading-tight tracking-tight text-slate-950 dark:text-slate-50" title={detailTitle}>{detailTitle}</h3>
            <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400" title={detailSubtitle}>{detailSubtitle}</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 p-3 flex flex-col gap-3">
        <div className="shrink-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3">
          <div className="flex items-start gap-3">
            <CommentAvatar comment={comment} size="md" highlight={comment.status === 'Unseen'} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="truncate text-base font-extrabold text-slate-950 dark:text-slate-50">{displayCommenterName(comment.commenterName)}</h4>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{formatFullTime(comment.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <PlatformBadge platform={comment.platform} />
                  <StatusBadge status={comment.status} />
                  <PriorityBadge priority={comment.priority} />
                  <SentimentBadge sentiment={comment.sentiment} />
                </div>
              </div>
              <blockquote className="mt-2 whitespace-pre-wrap rounded-xl border border-white dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-[13px] font-medium leading-relaxed text-slate-800 dark:text-slate-200 shadow-sm">
                {comment.commentText}
              </blockquote>
              <div className="mt-2 grid grid-cols-1 gap-2 2xl:grid-cols-[1fr_auto]">
                <div className={`rounded-xl border px-3 py-2 ${comment.status === 'Unseen' ? 'border-blue-100 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}>
                  <div className="flex items-center gap-2">
                    {comment.status === 'Unseen' ? <EyeOff className="h-4 w-4 shrink-0" /> : <Users className="h-4 w-4 shrink-0" />}
                    <p className="truncate text-[11px] font-extrabold">{comment.status === 'Unseen' ? 'Unread for everyone' : seenByText}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {comment.status === 'Unseen' && (
                    <button onClick={() => onUpdateStatus(comment.id, 'Seen')} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] font-extrabold text-sky-700">
                      <Eye className="w-3.5 h-3.5" /> Seen
                    </button>
                  )}
                  {comment.status === 'Seen' && (
                    <button onClick={() => onUpdateStatus(comment.id, 'Unseen')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-extrabold text-slate-600">
                      <EyeOff className="w-3.5 h-3.5" /> Unread
                    </button>
                  )}
                  {comment.status !== 'Replied' && (
                    <button onClick={() => onUpdateStatus(comment.id, 'Replied')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] font-extrabold text-emerald-700">
                      <CheckCircle className="w-3.5 h-3.5" /> Replied
                    </button>
                  )}
                  {comment.status !== 'Ignored' && (
                    <button onClick={() => onUpdateStatus(comment.id, 'Ignored')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-extrabold text-slate-600">
                      <EyeOff className="w-3.5 h-3.5" /> Ignore
                    </button>
                  )}
                  {commentUrl && <a
                    href={commentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => { if (comment.status === 'Unseen') onUpdateStatus(comment.id, 'Seen'); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-900 bg-slate-900 px-2.5 py-2 text-[11px] font-extrabold text-white hover:bg-slate-800"
                  >
                    Open <ExternalLink className="w-3.5 h-3.5" />
                  </a>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 grid grid-cols-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
          {[
            { id: 'details', label: 'Details' },
            { id: 'notes', label: `Notes${filteredNotes.length ? ` ${filteredNotes.length}` : ''}` },
            { id: 'activity', label: 'Activity' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDetailTab(tab.id as typeof detailTab)}
              className={`rounded-xl px-3 py-2 text-xs font-extrabold transition-colors ${
                detailTab === tab.id
                  ? 'bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1">
          {detailTab === 'details' && (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
              <AdPreviewPanel ad={matchingAd} comment={comment} detail />

              <div className="grid content-start gap-3">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-500">Moderation</p>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{loadingReplies ? '...' : `${replies.length} replies`}</p>
                  </div>
                  {onModerateComment && (
                    <div className="grid grid-cols-3 gap-1.5">
                      <button type="button" disabled={moderating || comment.status === 'Ignored'} onClick={() => void handleModerate(true)} className="rounded-lg bg-slate-950 px-2 py-2 text-[10px] font-extrabold text-white disabled:opacity-50">
                        {moderating ? '...' : 'Hide'}
                      </button>
                      <button type="button" disabled={moderating || comment.status !== 'Ignored'} onClick={() => void handleModerate(false)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-extrabold text-slate-800 disabled:opacity-50">
                        {moderating ? '...' : 'Unhide'}
                      </button>
                      <button type="button" disabled={Boolean(updatingMetaId)} onClick={() => void handleDeleteMetaComment(comment.commentId)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-[10px] font-extrabold text-red-700 disabled:opacity-50">
                        {updatingMetaId === comment.commentId ? '...' : 'Delete'}
                      </button>
                    </div>
                  )}
                  {actionError && <p className="detail-line-clamp-2 mt-2 rounded-lg border border-red-100 bg-red-50 p-2 text-[10px] font-semibold text-red-700">{actionError}</p>}
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-500">Public reply</p>
                    {replyTarget && <button type="button" onClick={() => setReplyTarget(null)} className="text-[10px] font-bold text-slate-500">Cancel target</button>}
                  </div>
                  {onReplyToComment && (
                    <form onSubmit={handleReplySubmit} className="space-y-2">
                      <p className="truncate rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-2 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-300">
                        @{replyTarget?.mention || mentionName}{replyTarget ? ` to ${replyTarget.label}` : ' to original comment'}
                      </p>
                      <textarea
                        rows={2}
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Write a public reply..."
                        className="h-14 w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 p-2 text-xs focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button type="submit" disabled={replying || !replyText.trim()} className="w-full rounded-xl bg-blue-600 py-2 text-xs font-extrabold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
                        {replying ? 'Sending...' : 'Send reply'}
                      </button>
                    </form>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-500">Replies</p>
                    <button type="button" onClick={() => void refreshReplies()} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-900">
                      <RefreshCw className={`w-3 h-3 ${loadingReplies ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                  </div>
                  {loadingReplies ? (
                    <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 text-center text-xs text-slate-400">Loading replies...</p>
                  ) : repliesError ? (
                    <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 text-center text-xs italic text-slate-400 dark:text-slate-500">Replies unavailable from Meta.</p>
                  ) : replies.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 text-center text-xs italic text-slate-400 dark:text-slate-500">No replies returned.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {repliesPreview.map(reply => (
                        <div key={reply.id} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[11px] font-extrabold text-slate-800">{reply.author}</p>
                            {reply.hidden && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-600">Hidden</span>}
                          </div>
                          {editingReplyId === reply.id ? (
                            <div className="mt-1.5 space-y-1.5">
                              <textarea rows={2} value={editingText} onChange={e => setEditingText(e.target.value)} className="h-14 w-full resize-none rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 p-2 text-xs" />
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => void handleEditMetaComment(reply.id)} disabled={updatingMetaId === reply.id || !editingText.trim()} className="rounded bg-blue-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50">Save</button>
                                <button type="button" onClick={() => { setEditingReplyId(''); setEditingText(''); }} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <p className="detail-line-clamp-2 mt-1 text-[11px] text-slate-600">{reply.text}</p>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => setReplyTarget({ id: reply.id, mention: reply.username || reply.author, label: reply.author })} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-700"><MessageSquareReply className="w-3 h-3" /> Reply</button>
                            <button type="button" onClick={() => { setEditingReplyId(reply.id); setEditingText(reply.text); }} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-700"><Pencil className="w-3 h-3" /> Edit</button>
                            <button type="button" disabled={updatingMetaId === reply.id} onClick={() => void handleDeleteMetaComment(reply.id)} className="inline-flex items-center gap-1 rounded border border-red-100 bg-red-50 px-1.5 py-1 text-[10px] font-bold text-red-700 disabled:opacity-50"><Trash2 className="w-3 h-3" /> Del</button>
                          </div>
                        </div>
                      ))}
                      {replies.length > repliesPreview.length && <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">+{replies.length - repliesPreview.length} more replies on Meta</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {detailTab === 'notes' && (
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Internal notes</h4>
                <div className="mt-3 space-y-2">
                  {filteredNotes.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 text-center text-xs italic text-slate-400 dark:text-slate-500">No notes yet</p>
                  ) : notesPreview.map(note => (
                    <div key={note.id} className="rounded-xl border border-blue-100 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 p-2">
                      <p className="text-[10px] font-extrabold text-slate-700 dark:text-slate-200">{note.userName} · {formatFullTime(note.createdAt)}</p>
                      <p className="detail-line-clamp-2 text-xs text-slate-700 dark:text-slate-200">{note.note}</p>
                    </div>
                  ))}
                  {filteredNotes.length > notesPreview.length && <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">+{filteredNotes.length - notesPreview.length} more notes hidden to keep the panel fixed.</p>}
                </div>
              </div>
              <form onSubmit={handleNoteSubmit} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <textarea rows={2} placeholder="Add a note for your team..." value={newNote} onChange={e => setNewNote(e.target.value)} className="h-16 w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 p-2 text-xs focus:ring-2 focus:ring-blue-500/20" />
                <button type="submit" className="mt-2 w-full rounded-xl bg-slate-950 py-2 text-xs font-extrabold text-white transition-colors hover:bg-black">Save Note</button>
              </form>
            </div>
          )}

          {detailTab === 'activity' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Activity</h4>
              {filteredLogs.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 text-center text-xs italic text-slate-400 dark:text-slate-500">No activity recorded yet.</p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {logsPreview.map(log => (
                    <div key={log.id} className="flex gap-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                      <div className="min-w-0">
                        <p className="truncate text-xs text-slate-800"><span className="font-extrabold">{log.userName}</span> · {log.action}</p>
                        {(log.oldValue || log.newValue) && <p className="mt-0.5 truncate text-[11px] text-slate-500">{log.oldValue}{log.oldValue && log.newValue ? ' -> ' : ''}{log.newValue}</p>}
                        <p className="mt-0.5 text-[10px] text-slate-400">{formatFullTime(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                  {filteredLogs.length > logsPreview.length && <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">+{filteredLogs.length - logsPreview.length} older events hidden to avoid scrolling.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (displayMode === 'panel') return content;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end" id="detail-drawer">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      {content}
    </div>
  );
}
