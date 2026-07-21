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

async function fetchCommentsPages(opts: { brand?: string; platform?: string; topSpend?: boolean; maxItems?: number } = {}): Promise<Comment[]> {
  const pageSize = 2000;
  const all: Comment[] = [];
  let offset = 0;
  let total = Infinity;
  const maxItems = opts.maxItems ?? Infinity;

  while (offset < total && all.length < maxItems) {
    const res = await apiClient.getComments({
      limit: Math.min(pageSize, maxItems - all.length),
      offset,
      brand: opts.brand,
      platform: opts.platform,
      topSpend: opts.topSpend,
    });
    if (Array.isArray(res)) return res;
    all.push(...res.items);
    total = res.total;
    if (res.items.length < pageSize) break;
    offset += res.items.length;
  }
  return all;
}

async function fetchAllComments(): Promise<Comment[]> {
  const [recent, floFacebook, floInstagram, topSpend] = await Promise.all([
    fetchCommentsPages({ maxItems: 1000 }),
    fetchCommentsPages({ brand: 'FLO', platform: 'facebook' }),
    fetchCommentsPages({ brand: 'FLO', platform: 'instagram' }),
    fetchCommentsPages({ topSpend: true }),
  ]);
  const byId = new Map<string, Comment>();
  for (const comment of [...recent, ...floFacebook, ...floInstagram, ...topSpend]) byId.set(comment.id, comment);
  return [...byId.values()].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

export async function loadAppData(mode: DataMode): Promise<AppDataSnapshot> {
  if (mode === 'demo') return demoSnapshot();

  try {
    const [comments, notes, activityLogs, autoTaggingRules, team, campaigns, ads] = await Promise.all([
      fetchAllComments(),
      apiClient.getNotes(),
      apiClient.getActivityLogs(),
      apiClient.getRules(),
      apiClient.getTeam(),
      apiClient.getCampaigns(),
      apiClient.getAds({ summary: true }),
    ]);

    console.log(`Using live API data (${comments.length} comments, ${ads.length} ads)`);

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
    console.error('[dataService] API load failed in production mode', err);
    throw err;
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
      onChange(await fetchAllComments());
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
  return fetchAllComments();
}
