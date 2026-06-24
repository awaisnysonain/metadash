import type { DataMode } from '../lib/config';
import type {
  AppUser,
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
  initialComments,
  preMadeNotes,
  initialActivityLogs,
  mockAutoTaggingRules,
  teamMembers,
  mockCampaigns,
  mockAds,
} from '../data';
import { apiClient } from './apiClient';

export interface AppDataSnapshot {
  comments: Comment[];
  notes: CommentNote[];
  activityLogs: ActivityLog[];
  autoTaggingRules: AutoTaggingRule[];
  team: TeamMember[];
  campaigns: Campaign[];
  ads: Ad[];
}

function demoSnapshot(): AppDataSnapshot {
  return {
    comments: initialComments,
    notes: preMadeNotes,
    activityLogs: initialActivityLogs,
    autoTaggingRules: mockAutoTaggingRules,
    team: teamMembers,
    campaigns: mockCampaigns,
    ads: mockAds,
  };
}

function emptyLiveSnapshot(): AppDataSnapshot {
  return {
    comments: [],
    notes: [],
    activityLogs: [],
    autoTaggingRules: [],
    team: [],
    campaigns: [],
    ads: [],
  };
}

export async function loadAppData(mode: DataMode): Promise<AppDataSnapshot> {
  if (mode === 'demo') return demoSnapshot();

  try {
    const [comments, notes, activityLogs, autoTaggingRules, team, campaigns, ads] = await Promise.all([
      apiClient.getComments(),
      apiClient.getNotes(),
      apiClient.getActivityLogs(),
      apiClient.getRules(),
      apiClient.getTeam(),
      apiClient.getCampaigns(),
      apiClient.getAds(),
    ]);

    console.log('Using live PostgreSQL API data');

    return {
      comments,
      notes,
      activityLogs,
      autoTaggingRules,
      team,
      campaigns,
      ads,
    };
  } catch (err) {
    console.error('[dataService] API load failed in production mode — showing empty state', err);
    return emptyLiveSnapshot();
  }
}

export async function persistComments(mode: DataMode, comments: Comment[]): Promise<void> {
  if (mode === 'demo') return;
  void comments;
}

export async function persistComment(mode: DataMode, comment: Comment): Promise<void> {
  if (mode === 'demo') return;
  await apiClient.createComment(comment);
}

export async function updateCommentStatusApi(
  mode: DataMode,
  id: string,
  status: CommentStatus,
  oldStatus?: string
): Promise<Comment | void> {
  if (mode === 'demo') return;
  return apiClient.patchCommentStatus(id, status, { oldStatus });
}

export async function updateCommentAssignApi(
  mode: DataMode,
  id: string,
  assignedTo: string | undefined,
  meta?: { oldAssignee?: string; assigneeName?: string }
): Promise<Comment | void> {
  if (mode === 'demo') return;
  return apiClient.patchCommentAssign(id, assignedTo, meta);
}

export async function updateCommentPriorityApi(
  mode: DataMode,
  id: string,
  priority: CommentPriority,
  oldPriority?: string
): Promise<Comment | void> {
  if (mode === 'demo') return;
  return apiClient.patchCommentPriority(id, priority, { oldPriority });
}

export async function updateCommentTagsApi(mode: DataMode, id: string, tags: string[]): Promise<void> {
  if (mode === 'demo') return;
  await apiClient.patchCommentTags(id, tags);
}

export async function persistNote(
  mode: DataMode,
  commentId: string,
  noteText: string,
  user?: AppUser | null
): Promise<CommentNote | void> {
  if (mode === 'demo') return;
  return apiClient.addCommentNote(commentId, {
    note: noteText,
    userId: user?.id,
    userName: user?.name,
    userAvatar: user?.avatarUrl,
  });
}

export async function persistRules(mode: DataMode, rules: AutoTaggingRule[]): Promise<void> {
  if (mode === 'demo') return;
  await apiClient.saveRules(rules);
}

export async function deleteRule(mode: DataMode, id: string): Promise<void> {
  if (mode === 'demo') return;
  await apiClient.deleteRule(id);
}

export async function persistTeam(mode: DataMode, member: TeamMember): Promise<void> {
  if (mode === 'demo') return;
  await apiClient.addTeamMember(member);
}

export function subscribeToComments(
  mode: DataMode,
  onChange: (comments: Comment[]) => void
): (() => void) | undefined {
  if (mode === 'demo') return undefined;
  const interval = setInterval(async () => {
    try {
      const comments = await apiClient.getComments();
      onChange(comments);
    } catch {
      /* ignore poll errors */
    }
  }, 60000);
  return () => clearInterval(interval);
}

export async function fetchCommentsNow(mode: DataMode): Promise<Comment[]> {
  if (mode === 'demo') return initialComments;
  if (mode === 'live') {
    await apiClient.syncComments();
  }
  return apiClient.getComments();
}
