import type { Comment, CommentNote, ActivityLog, TeamMember, AutoTaggingRule, Campaign, Ad, CommentStatus, CommentPriority, AppUser, Permission, CommentView } from '../types';

export interface MetaThreadItem {
  id: string;
  text: string;
  author: string;
  username?: string;
  createdAt?: string;
  hidden?: boolean;
  permalinkUrl?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const TOKEN_KEY = 'metadash_token';

let authToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string>) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    let message = body || `API error ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      message = parsed.message || parsed.error || message;
    } catch {
      /* response is not JSON */
    }
    if (res.status === 401 && !path.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      authToken = null;
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
  metaTokenValid?: boolean;
  metaTokenExpiresAt?: string | null;
  metaTokenMessage?: string | null;
  timestamp: string;
}

export interface MetaTokenStatus {
  valid: boolean;
  expiresAt: number | null;
  expiresAtIso: string | null;
  dataAccessExpiresAt?: number | null;
  message: string;
  scopes: string[];
  appId: string | null;
  hasPagesReadUserContent?: boolean;
  canSyncComments?: boolean;
}

export interface SyncResult {
  ok: boolean;
  synced: number;
  message: string;
  pagesFound?: number;
  pagesSaved?: number;
  details?: {
    warnings?: string[];
    syncedPages?: number;
    syncedInstagram?: number;
    rawMetaResponses?: unknown[];
  };
}

export interface FullSyncJobStatus {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  ok: boolean | null;
  message: string;
  synced: number;
}

export interface SlackStatus {
  enabled: boolean;
  configured: boolean;
  channelId: string | null;
}

async function requestRaw(path: string, options?: RequestInit): Promise<Response> {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string>) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return fetch(url, { ...options, headers });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  setToken(token: string | null) {
    authToken = token;
  },

  login: (username: string, password: string) =>
    request<{ token: string; user: AppUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getMe: () => request<{ user: AppUser }>('/api/auth/me'),

  updateProfile: (fields: Partial<Pick<AppUser, 'name' | 'email' | 'title' | 'bio' | 'avatarUrl'>>) =>
    request<{ user: AppUser }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(fields) }),

  getPermissions: () => request<{ permissions: Permission[] }>('/api/auth/permissions'),

  getUsers: () => request<AppUser[]>('/api/users'),

  createUser: (data: {
    username: string;
    password: string;
    name: string;
    email?: string;
    title?: string;
    bio?: string;
    avatarUrl?: string;
    permissions?: Permission[];
    slackUserId?: string;
  }) => request<AppUser & { inviteSent?: boolean; inviteError?: string }>('/api/users', { method: 'POST', body: JSON.stringify(data) }),

  updateUser: (id: string, data: Partial<AppUser & { password?: string; isActive?: boolean }>) =>
    request<AppUser>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteUser: (id: string) =>
    request<void>(`/api/users/${id}`, { method: 'DELETE' }),

  recordCommentView: (id: string) =>
    request<{ comment?: Comment; views: CommentView[] }>(`/api/comments/${id}/view`, { method: 'POST' }),

  getCommentViews: (id: string) => request<CommentView[]>(`/api/comments/${id}/views`),

  getConnectedAccounts: () =>
    request<{
      adAccounts: Array<{ id: string; accountId: string; name: string; spend: string; status: string; isConnected: boolean; label: string }>;
      pages: Array<{ id: string; pageId: string; pageName: string; fans?: string; avatar?: string; isConnected: boolean }>;
      instagram: Array<{ id: string; accountId: string; username: string; followers: string; avatar?: string; isConnected: boolean }>;
      topAds: Array<{ id: string; adId: string; adName: string; campaignName: string; platform: string; spend: number; recentSpend?: number; accountLabel: string; thumbnailUrl?: string; mediaUrl?: string; commentsCount: number }>;
    }>('/api/accounts'),

  getBrandAssets: (brand: 'FLO' | 'NOBL') =>
    request<{ brand: string; count: number; assets: Array<{ pageId: string; pageName: string; pageAvatar?: string; ads: number; instagram?: { id: string; username: string; avatar?: string }; comments: { facebook: number; instagram: number; total: number } }> }>(
      `/api/accounts/brand-assets?brand=${brand}`
    ),

  getTopAdsBySpend: (limit = 20) =>
    request<Array<{ id: string; adId: string; adName: string; campaignName: string; platform: string; spend: number; recentSpend?: number; accountLabel: string }>>(
      `/api/ads/top-by-spend?limit=${limit}`
    ),

  health: () => request<HealthStatus>('/api/health'),

  getComments: (opts?: { limit?: number; offset?: number; platform?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    if (opts?.platform) params.set('platform', opts.platform);
    if (opts?.status) params.set('status', opts.status);
    const qs = params.toString();
    return request<Comment[] | { items: Comment[]; total: number; limit: number; offset: number }>(
      `/api/comments${qs ? `?${qs}` : ''}`
    );
  },
  createComment: (comment: Comment) =>
    request<Comment>('/api/comments', { method: 'POST', body: JSON.stringify(comment) }),

  patchCommentStatus: (id: string, status: CommentStatus, meta?: { oldStatus?: string }) =>
    request<Comment>(`/api/comments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...meta }),
    }),

  replyToComment: (id: string, message: string, opts?: { targetCommentId?: string; mention?: string; includeMention?: boolean }) =>
    request<Comment>(`/api/comments/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ message, ...opts }),
    }),

  getCommentReplies: (id: string) =>
    request<{ items: MetaThreadItem[]; unavailableReason?: string }>(`/api/comments/${id}/replies`),

  getReplySuggestions: (id: string, data: { brand?: string; replies?: MetaThreadItem[]; refresh?: boolean }) =>
    request<{ suggestion: string; suggestions: string[]; confidence?: number; generatedAt?: string; cached?: boolean }>(`/api/comments/${id}/reply-suggestions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  editMetaComment: (id: string, metaCommentId: string, message: string) =>
    request<{ ok: boolean }>(`/api/comments/${id}/meta-comment/${metaCommentId}/edit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  deleteMetaComment: (id: string, metaCommentId: string) =>
    request<{ ok: boolean; comment?: Comment }>(`/api/comments/${id}/meta-comment/${metaCommentId}`, { method: 'DELETE' }),

  moderateComment: (id: string, hidden: boolean) =>
    request<Comment>(`/api/comments/${id}/moderate`, {
      method: 'POST',
      body: JSON.stringify({ hidden }),
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

  getAds: (opts?: { summary?: boolean }) =>
    request<Ad[]>(`/api/ads${opts?.summary ? '?summary=1' : ''}`),
  getAdById: (id: string) => request<Ad>(`/api/ads/${encodeURIComponent(id)}`),
  getPages: () =>
    request<Array<{ id: string; pageId: string; pageName: string; fans?: string; avatar?: string; pageAccessToken: string | null; isConnected: boolean; syncedAt: string | null }>>(
      '/api/pages'
    ),
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
  syncAll: async (): Promise<SyncResult> => {
    const res = await requestRaw('/api/meta/sync/all', {
      method: 'POST',
      body: JSON.stringify({ async: true }),
    });

    if (res.status === 202) {
      const started = (await res.json()) as SyncResult & { job?: FullSyncJobStatus };
      for (let i = 0; i < 180; i++) {
        await sleep(5000);
        const job = await request<FullSyncJobStatus>('/api/meta/sync/all/status');
        if (!job.isRunning) {
          return {
            ok: job.ok ?? false,
            synced: job.synced,
            message: job.message || started.message,
          };
        }
      }
      return { ok: true, synced: 0, message: 'Sync is still running in the background. Refresh in a few minutes.' };
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `API error ${res.status}`);
    }
    return res.json() as Promise<SyncResult>;
  },

  syncComments: () => request<SyncResult>('/api/meta/sync/comments', { method: 'POST' }),
  syncCommentsBackfill: () => request<SyncResult>('/api/meta/sync/comments/backfill', { method: 'POST' }),
  getCommentSyncStatus: () =>
    request<{ lastRunAt: string | null; lastRunOk: boolean; lastSynced: number; lastMessage: string; isRunning: boolean; nextRunAt: string | null }>(
      '/api/meta/sync/comments/status'
    ),

  // Legacy aliases for Settings UI
  syncAdSets: () => request<SyncResult>('/api/meta/sync/campaigns', { method: 'POST' }),
  syncCreatives: () => request<SyncResult>('/api/meta/sync/ads', { method: 'POST' }),
  syncFacebookComments: () => request<SyncResult>('/api/meta/sync/comments', { method: 'POST' }),
  syncInstagramComments: () => request<SyncResult>('/api/meta/sync/comments', { method: 'POST' }),

  getMetaStatusLatest: () =>
    request<{ latestAds: Array<{ adId: string; adName: string; campaignName: string }>; latestCampaigns: Array<{ campaignId: string; campaignName: string; platform: string; status: string }> }>(
      '/api/meta/status/latest'
    ),

  getMetaTokenStatus: () => request<MetaTokenStatus>('/api/meta/token/status'),

  exchangeMetaToken: (shortLivedToken: string) =>
    request<{ accessToken: string; expiresIn: number; expiresInDays: number; instructions: string; validation: MetaTokenStatus }>(
      '/api/meta/token/exchange',
      { method: 'POST', body: JSON.stringify({ shortLivedToken }) }
    ),

  getSlackStatus: () => request<SlackStatus>('/api/notifications/slack/status'),
  setSlackEnabled: (enabled: boolean) =>
    request<SlackStatus>('/api/notifications/slack/status', { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  testSlackAlert: () => request<{ sent: boolean; reason?: string }>('/api/notifications/slack/test', { method: 'POST' }),

  getRetentionStatus: () => request<RetentionStatus>('/api/settings/retention'),
  setRetentionDays: (days: number) =>
    request<RetentionStatus>('/api/settings/retention', { method: 'PATCH', body: JSON.stringify({ days }) }),
  runRetentionSweep: () => request<RetentionStatus & { justRan?: { deleted?: number; archived?: number; days: number } }>('/api/settings/retention/run', { method: 'POST' }),
};

export interface RetentionStatus {
  days: number;
  minDays: number;
  maxDays: number;
  archivedTotal: number;
  deletedTotal?: number;
  lastArchivedAt?: string | null;
  ownerUsername: string;
  lastRun: { at: string; deleted?: number; archived?: number; days: number } | null;
}
