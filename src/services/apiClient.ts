import type { Comment, CommentNote, ActivityLog, TeamMember, AutoTaggingRule, Campaign, Ad, CommentStatus, CommentPriority } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = body || `API error ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      message = parsed.message || parsed.error || message;
    } catch {
      /* response is not JSON */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface HealthStatus {
  ok: boolean;
  mode: string;
  demoMode?: boolean;
  database: boolean;
  meta: boolean;
  metaAppId?: boolean;
  metaAccessToken?: boolean;
  metaVerifyToken?: boolean;
  timestamp: string;
}

export interface SyncResult {
  ok: boolean;
  synced: number;
  message: string;
  details?: {
    warnings?: string[];
    syncedPages?: number;
    syncedInstagram?: number;
  };
}

export interface ReportsSummary {
  total: number;
  unseen: number;
  replied: number;
  unreplied: number;
  urgent: number;
  facebook: number;
  instagram: number;
}

export const apiClient = {
  health: () => request<HealthStatus>('/api/health'),

  getComments: () => request<Comment[]>('/api/comments'),
  createComment: (comment: Comment) =>
    request<Comment>('/api/comments', { method: 'POST', body: JSON.stringify(comment) }),

  patchCommentStatus: (id: string, status: CommentStatus, meta?: { oldStatus?: string }) =>
    request<Comment>(`/api/comments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...meta }),
    }),

  patchCommentAssign: (id: string, assignedTo: string | undefined, meta?: { oldAssignee?: string; assigneeName?: string }) =>
    request<Comment>(`/api/comments/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assignedTo: assignedTo ?? null, ...meta }),
    }),

  patchCommentPriority: (id: string, priority: CommentPriority, meta?: { oldPriority?: string }) =>
    request<Comment>(`/api/comments/${id}/priority`, {
      method: 'PATCH',
      body: JSON.stringify({ priority, ...meta }),
    }),

  patchCommentTags: (id: string, tags: string[]) =>
    request<Comment>(`/api/comments/${id}/tags`, { method: 'PATCH', body: JSON.stringify({ tags }) }),

  addCommentNote: (id: string, note: { note: string; userId?: string; userName?: string; userAvatar?: string }) =>
    request<CommentNote>(`/api/comments/${id}/notes`, { method: 'POST', body: JSON.stringify(note) }),

  getAds: () => request<Ad[]>('/api/ads'),
  getNotes: () => request<CommentNote[]>('/api/notes'),
  getActivityLogs: () => request<ActivityLog[]>('/api/activity-logs'),
  getTeam: () => request<TeamMember[]>('/api/team'),
  getCampaigns: () => request<Campaign[]>('/api/campaigns'),
  getRules: () => request<AutoTaggingRule[]>('/api/auto-tagging-rules'),
  getReportsSummary: () => request<ReportsSummary>('/api/reports/summary'),

  saveRules: (rules: AutoTaggingRule[]) =>
    request<AutoTaggingRule[]>('/api/auto-tagging-rules', {
      method: 'POST',
      body: JSON.stringify({ rules: rules.map(r => ({ id: r.id, keyword: r.keyword, tag: r.tag, priority: r.priority, isActive: r.isActive })) }),
    }),

  deleteRule: (id: string) =>
    request<{ ok: boolean }>(`/api/auto-tagging-rules/${id}`, { method: 'DELETE' }),

  addTeamMember: (member: TeamMember) =>
    request<TeamMember>('/api/team', { method: 'POST', body: JSON.stringify(member) }),

  syncAds: () => request<SyncResult>('/api/meta/sync/ads', { method: 'POST' }),
  syncPages: () => request<SyncResult>('/api/meta/sync/pages', { method: 'POST' }),
  syncInstagram: () => request<SyncResult>('/api/meta/sync/instagram', { method: 'POST' }),
  syncCampaigns: () => request<SyncResult>('/api/meta/sync/campaigns', { method: 'POST' }),
  syncAll: () => request<SyncResult>('/api/meta/sync/all', { method: 'POST' }),

  // Legacy aliases for Settings UI
  syncAdSets: () => request<SyncResult>('/api/meta/sync/campaigns', { method: 'POST' }),
  syncCreatives: () => request<SyncResult>('/api/meta/sync/ads', { method: 'POST' }),
  syncFacebookComments: () => request<SyncResult>('/api/meta/sync/pages', { method: 'POST' }),
  syncInstagramComments: () => request<SyncResult>('/api/meta/sync/instagram', { method: 'POST' }),

  getMetaStatusLatest: () =>
    request<{ latestAds: Array<{ adId: string; adName: string; campaignName: string }>; latestCampaigns: Array<{ campaignId: string; campaignName: string; platform: string; status: string }> }>(
      '/api/meta/status/latest'
    ),
};
