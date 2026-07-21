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
  // Initial load was 4 parallel queries (recent + FLO-FB + FLO-IG + topSpend),
  // each hitting an expensive WHERE with a correlated regex NOT EXISTS. The FLO
  // brand queries mostly overlapped `recent`; consolidating to `recent 3000` +
  // `topSpend` roughly halves the DB work on page load.
  const [recent, topSpend] = await Promise.all([
    fetchCommentsPages({ maxItems: 3000 }),
    fetchCommentsPages({ topSpend: true }),
  ]);
  const byId = new Map<string, Comment>();
  for (const comment of [...recent, ...topSpend]) byId.set(comment.id, comment);
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
  onChange: (updater: (previous: Comment[]) => Comment[]) => void
): (() => void) | undefined {
  if (mode === 'demo') return undefined;
  const interval = setInterval(async () => {
    try {
      const incoming = await fetchAllComments();
      // Merge, don't replace. Preserves object identity for existing rows so
      // React skips re-renders of the row DOM (avoids the inbox "shifting"
      // effect users saw during moderation).
      onChange(previous => mergeCommentSnapshots(previous, incoming));
    } catch {
      /* ignore poll errors */
    }
  }, 60000);
  return () => clearInterval(interval);
}

function mergeCommentSnapshots(previous: Comment[], incoming: Comment[]): Comment[] {
  if (!previous.length) return incoming;
  const prevById = new Map<string, Comment>(previous.map(c => [c.id, c]));
  const incomingById = new Map<string, Comment>(incoming.map(c => [c.id, c]));
  const seen = new Set<string>();
  const merged: Comment[] = [];

  // Keep previous order for rows that still exist; update field values only if
  // something meaningful changed so React reference equality skips unchanged rows.
  for (const prev of previous) {
    const next = incomingById.get(prev.id);
    if (!next) continue;
    seen.add(prev.id);
    merged.push(commentsShallowEqual(prev, next) ? prev : { ...prev, ...next });
  }
  // Then append any brand-new rows in incoming order (which is createdAt DESC).
  for (const next of incoming) {
    if (seen.has(next.id) || prevById.has(next.id)) continue;
    merged.push(next);
  }
  return merged;
}

function commentsShallowEqual(a: Comment, b: Comment): boolean {
  return (
    a.status === b.status &&
    a.priority === b.priority &&
    a.sentiment === b.sentiment &&
    a.assignedTo === b.assignedTo &&
    a.repliedAt === b.repliedAt &&
    a.seenAt === b.seenAt &&
    a.commentText === b.commentText &&
    (a.tags?.length ?? 0) === (b.tags?.length ?? 0) &&
    (a.views?.length ?? 0) === (b.views?.length ?? 0)
  );
}

export async function fetchCommentsNow(mode: DataMode): Promise<Comment[]> {
  if (mode === 'demo') return initialComments;
  if (mode === 'live') {
    await apiClient.syncComments();
  }
  return fetchAllComments();
}
