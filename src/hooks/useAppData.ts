import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppUser } from '../types';
import type { DataMode } from '../lib/config';
import { getAppConfig, resolveDataMode } from '../lib/config';
import type {
  Comment,
  CommentNote,
  ActivityLog,
  TeamMember,
  AutoTaggingRule,
  Campaign,
  Ad,
  CommentStatus,
  CommentPriority,
} from '../types';
import {
  loadAppData,
  persistComment,
  updateCommentStatusApi,
  updateCommentAssignApi,
  updateCommentPriorityApi,
  updateCommentTagsApi,
  persistNote,
  persistRules,
  deleteRule,
  persistTeam,
  subscribeToComments,
} from '../services/dataService';

export interface UseAppDataReturn {
  dataMode: DataMode;
  isLoading: boolean;
  loadError: string | null;
  isDemoMode: boolean;
  isLiveMode: boolean;
  comments: Comment[];
  notes: CommentNote[];
  activityLogs: ActivityLog[];
  autoTaggingRules: AutoTaggingRule[];
  team: TeamMember[];
  campaigns: Campaign[];
  ads: Ad[];
  saveComments: (comments: Comment[]) => void;
  saveComment: (comment: Comment) => void;
  updateStatus: (id: string, status: CommentStatus, oldStatus?: string) => Promise<void>;
  updateAssign: (id: string, assignedTo: string | undefined, meta?: { oldAssignee?: string; assigneeName?: string }) => Promise<void>;
  updatePriority: (id: string, priority: CommentPriority, oldPriority?: string) => Promise<void>;
  updateTags: (id: string, tags: string[]) => Promise<void>;
  addNote: (commentId: string, noteText: string) => Promise<CommentNote | undefined>;
  addActivityLogLocal: (log: ActivityLog) => void;
  saveRules: (rules: AutoTaggingRule[]) => void;
  removeRule: (id: string) => void;
  addTeamMember: (member: TeamMember) => void;
  reload: () => Promise<void>;
}

export function useAppData(currentUser?: AppUser | null): UseAppDataReturn {
  const config = getAppConfig();
  const dataMode = resolveDataMode();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [notes, setNotes] = useState<CommentNote[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [autoTaggingRules, setAutoTaggingRules] = useState<AutoTaggingRule[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const modeRef = useRef(dataMode);
  modeRef.current = dataMode;

  const applySnapshot = useCallback((snap: Awaited<ReturnType<typeof loadAppData>>) => {
    setComments(snap.comments);
    setNotes(snap.notes);
    setActivityLogs(snap.activityLogs);
    setAutoTaggingRules(snap.autoTaggingRules);
    setTeam(snap.team);
    setCampaigns(snap.campaigns);
    setAds(snap.ads);
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      applySnapshot(await loadAppData(modeRef.current));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setLoadError(message);
      console.error('[useAppData] reload failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    if (modeRef.current === 'demo') {
      void reload();
      return;
    }
    if (currentUser) {
      void reload();
    } else {
      setIsLoading(false);
    }
  }, [currentUser, reload]);

  useEffect(() => {
    const unsub = subscribeToComments(dataMode, setComments);
    return () => unsub?.();
  }, [dataMode]);

  const saveComments = useCallback((next: Comment[]) => setComments(next), []);

  const saveComment = useCallback((comment: Comment) => {
    setComments(prev => [comment, ...prev.filter(c => c.id !== comment.id)]);
    persistComment(modeRef.current, comment);
  }, []);

  const updateStatus = useCallback(async (id: string, status: CommentStatus, oldStatus?: string) => {
    const now = new Date().toISOString();
    setComments(prev =>
      prev.map(c =>
        c.id === id
          ? {
              ...c,
              status,
              updatedAt: now,
              seenAt: status === 'Seen' && !c.seenAt ? now : c.seenAt,
              repliedAt: status === 'Replied' && !c.repliedAt ? now : c.repliedAt,
            }
          : c
      )
    );
    if (modeRef.current === 'live') {
      await updateCommentStatusApi('live', id, status, oldStatus);
    }
  }, []);

  const updateAssign = useCallback(async (id: string, assignedTo: string | undefined, meta?: { oldAssignee?: string; assigneeName?: string }) => {
    const now = new Date().toISOString();
    setComments(prev =>
      prev.map(c =>
        c.id === id ? { ...c, assignedTo, status: c.status === 'Unseen' ? 'Seen' : c.status, updatedAt: now } : c
      )
    );
    if (modeRef.current === 'live') {
      await updateCommentAssignApi('live', id, assignedTo, meta);
    }
  }, []);

  const updatePriority = useCallback(async (id: string, priority: CommentPriority, oldPriority?: string) => {
    setComments(prev => prev.map(c => (c.id === id ? { ...c, priority, updatedAt: new Date().toISOString() } : c)));
    if (modeRef.current === 'live') {
      await updateCommentPriorityApi('live', id, priority, oldPriority);
    }
  }, []);

  const updateTags = useCallback(async (id: string, tags: string[]) => {
    setComments(prev => prev.map(c => (c.id === id ? { ...c, tags, updatedAt: new Date().toISOString() } : c)));
    await updateCommentTagsApi(modeRef.current, id, tags);
  }, []);

  const addNote = useCallback(async (commentId: string, noteText: string) => {
    const dateStr = new Date().toISOString();
    const localNote: CommentNote = {
      id: `note-${Date.now()}`,
      commentId,
      userId: currentUser?.id ?? 'team-1',
      userName: currentUser?.name ?? 'Team',
      userAvatar: currentUser?.avatarUrl ?? '',
      note: noteText,
      createdAt: dateStr,
    };

    if (modeRef.current === 'demo') {
      setNotes(prev => [localNote, ...prev]);
      return localNote;
    }

    const saved = await persistNote('live', commentId, noteText, currentUser);
    await reload();
    return saved ?? localNote;
  }, [reload, currentUser]);

  const addActivityLogLocal = useCallback((log: ActivityLog) => {
    setActivityLogs(prev => [log, ...prev]);
  }, []);

  const saveRules = useCallback((next: AutoTaggingRule[]) => {
    setAutoTaggingRules(next);
    persistRules(modeRef.current, next);
  }, []);

  const removeRule = useCallback((id: string) => {
    setAutoTaggingRules(prev => prev.filter(r => r.id !== id));
    deleteRule(modeRef.current, id);
  }, []);

  const addTeamMember = useCallback((member: TeamMember) => {
    setTeam(prev => [...prev, member]);
    persistTeam(modeRef.current, member);
  }, []);

  return {
    dataMode,
    isLoading,
    loadError,
    isDemoMode: config.isDemoMode,
    isLiveMode: config.isLiveMode,
    comments,
    notes,
    activityLogs,
    autoTaggingRules,
    team,
    campaigns,
    ads,
    saveComments,
    saveComment,
    updateStatus,
    updateAssign,
    updatePriority,
    updateTags,
    addNote,
    addActivityLogLocal,
    saveRules,
    removeRule,
    addTeamMember,
    reload,
  };
}
