import React, { useState } from 'react';
import { Comment, TeamMember, CommentNote, ActivityLog, CommentStatus, CommentPriority, Ad } from '../types';
import { getAdForComment, formatFullTime } from '../utils/helpers';
import { StatusBadge, PriorityBadge, SentimentBadge, PlatformBadge } from './ui/Badges';
import AdPreviewPanel from './AdPreviewPanel';
import {
  X,
  ExternalLink,
  Tag,
  History,
  Lock,
  Eye,
  CheckCircle,
  EyeOff,
} from 'lucide-react';

interface CommentDetailDrawerProps {
  comment?: Comment;
  ads: Ad[];
  onClose: () => void;
  teamMembers: TeamMember[];
  notes: CommentNote[];
  activityLogs: ActivityLog[];
  onAddNote: (commentId: string, noteText: string) => void;
  onUpdateStatus: (commentId: string, status: CommentStatus) => void;
  onUpdatePriority: (commentId: string, priority: CommentPriority) => void;
  onAssignTeam: (commentId: string, teamUserId?: string) => void;
  onRemoveCommentTag: (commentId: string, tag: string) => void;
  onAddCommentTag: (commentId: string, tag: string) => void;
}

export default function CommentDetailDrawer({
  comment,
  ads,
  onClose,
  teamMembers,
  notes,
  activityLogs,
  onAddNote,
  onUpdateStatus,
  onUpdatePriority,
  onAssignTeam,
  onRemoveCommentTag,
  onAddCommentTag,
}: CommentDetailDrawerProps) {
  const [newNote, setNewNote] = useState('');
  const [newTag, setNewTag] = useState('');

  if (!comment) return null;

  const matchingAd = getAdForComment(comment, ads);
  const filteredNotes = notes.filter(n => n.commentId === comment.id);
  const filteredLogs = activityLogs.filter(l => l.commentId === comment.id);

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    onAddNote(comment.id, newNote.trim());
    setNewNote('');
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    onAddCommentTag(comment.id, newTag.trim());
    setNewTag('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end" id="detail-drawer">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-50 border-l border-slate-200 animate-slide-over">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Comment Details</h3>
            <p className="text-[10px] font-mono text-slate-400">ID: {comment.commentId}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Comment card */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <img
                src={comment.commenterProfileUrl}
                alt=""
                className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-100"
                referrerPolicy="no-referrer"
              />
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{comment.commenterName}</h4>
                <p className="text-[10px] text-slate-400">{formatFullTime(comment.createdAt)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              <PlatformBadge platform={comment.platform} />
              <StatusBadge status={comment.status} />
              <PriorityBadge priority={comment.priority} />
              <SentimentBadge sentiment={comment.sentiment} />
            </div>

            <blockquote className="text-sm text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              {comment.commentText}
            </blockquote>

            <div className="mt-3 flex flex-wrap gap-2">
              {comment.status === 'Unseen' && (
                <button onClick={() => onUpdateStatus(comment.id, 'Seen')} className="action-btn bg-sky-50 text-sky-700 border-sky-200">
                  <Eye className="w-3.5 h-3.5" /> Mark Seen
                </button>
              )}
              {comment.status !== 'Replied' && (
                <button onClick={() => onUpdateStatus(comment.id, 'Replied')} className="action-btn bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle className="w-3.5 h-3.5" /> Mark Replied
                </button>
              )}
              {comment.status !== 'Ignored' && (
                <button onClick={() => onUpdateStatus(comment.id, 'Ignored')} className="action-btn bg-slate-50 text-slate-600 border-slate-200">
                  <EyeOff className="w-3.5 h-3.5" /> Ignore
                </button>
              )}
              <a
                href={comment.originalCommentUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { if (comment.status === 'Unseen') onUpdateStatus(comment.id, 'Seen'); }}
                className="action-btn bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
              >
                Open on Meta <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Ad preview */}
          <AdPreviewPanel ad={matchingAd} comment={comment} compact />

          {/* Management controls */}
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-3">Management</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">Status</label>
                <select
                  value={comment.status}
                  onChange={e => onUpdateStatus(comment.id, e.target.value as CommentStatus)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="Unseen">Unseen</option>
                  <option value="Seen">Seen</option>
                  <option value="Replied">Replied</option>
                  <option value="Ignored">Ignored</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">Priority</label>
                <select
                  value={comment.priority}
                  onChange={e => onUpdatePriority(comment.id, e.target.value as CommentPriority)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">Assigned To</label>
                <select
                  value={comment.assignedTo || ''}
                  onChange={e => onAssignTeam(comment.id, e.target.value || undefined)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Tags</h4>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {comment.tags.length === 0 ? (
                <span className="text-xs text-slate-400 italic">No tags</span>
              ) : (
                comment.tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => onRemoveCommentTag(comment.id, tag)}
                    className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-md border border-blue-100 hover:bg-red-50 hover:text-red-700 hover:border-red-100 transition-colors"
                  >
                    <Tag className="w-2.5 h-2.5" /> {tag} ×
                  </button>
                ))
              )}
            </div>
            <form onSubmit={handleAddTag} className="flex gap-2">
              <input
                type="text"
                placeholder="Add tag..."
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
              />
              <button type="submit" className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold">Add</button>
            </form>
          </div>

          {/* Notes */}
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">
              Internal Notes ({filteredNotes.length})
            </h4>
            <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
              {filteredNotes.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                  No notes yet
                </p>
              ) : (
                filteredNotes.map(note => (
                  <div key={note.id} className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <img src={note.userAvatar} alt="" className="w-4 h-4 rounded-full" />
                        <span className="font-bold text-xs text-slate-800">{note.userName}</span>
                      </div>
                      <span className="text-[9px] text-slate-400">{formatFullTime(note.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-700">{note.note}</p>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleNoteSubmit}>
              <textarea
                rows={2}
                placeholder="Add internal note..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                className="w-full text-xs p-2 border border-slate-200 rounded-lg resize-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button type="submit" className="w-full mt-2 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors">
                Save Note
              </button>
            </form>
          </div>

          {/* Activity timeline */}
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5 mb-3">
              <History className="w-3.5 h-3.5" /> Activity Timeline
            </h4>
            <div className="space-y-3">
              {filteredLogs.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No activity yet</p>
              ) : (
                filteredLogs.map(log => (
                  <div key={log.id} className="relative pl-4 border-l-2 border-slate-200">
                    <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-blue-500" />
                    <p className="text-xs text-slate-700">
                      <strong>{log.userName}</strong>{' '}
                      {log.action === 'Status Change' && (
                        <>changed status from <span className="font-mono text-slate-500">{log.oldValue}</span> to <span className="font-bold">{log.newValue}</span></>
                      )}
                      {log.action === 'Assignment' && (
                        <>assigned to <span className="font-bold text-blue-600">{log.newValue}</span></>
                      )}
                      {log.action === 'Priority Change' && (
                        <>changed priority from {log.oldValue} to <span className="font-bold">{log.newValue}</span></>
                      )}
                      {log.action === 'Context Note Addition' && <>added an internal note</>}
                      {log.action === 'Webhook Received' && (
                        <span className="text-emerald-600 font-semibold">{log.newValue}</span>
                      )}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{formatFullTime(log.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-1.5 text-slate-400">
          <Lock className="w-3 h-3" />
          <span className="text-[10px] uppercase tracking-widest font-mono">Internal Use Only</span>
        </div>
      </div>
    </div>
  );
}
