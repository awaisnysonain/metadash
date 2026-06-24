export const META_GRAPH = 'https://graph.facebook.com/v21.0';

import { isAnyMetaAccountConfigured } from './meta-accounts.js';

export interface MetaGraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class MetaApiError extends Error {
  readonly code?: number;
  readonly subcode?: number;
  readonly type?: string;
  readonly fbtraceId?: string;
  readonly status: number;

  constructor(message: string, opts: { code?: number; subcode?: number; type?: string; fbtraceId?: string; status?: number } = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.code = opts.code;
    this.subcode = opts.subcode;
    this.type = opts.type;
    this.fbtraceId = opts.fbtraceId;
    this.status = opts.status ?? 502;
  }
}

export function getMetaConfig() {
  return {
    appId: (process.env.META_APP_ID || '').trim(),
    appSecret: (process.env.META_APP_SECRET || '').trim(),
    verifyToken: (process.env.META_VERIFY_TOKEN || 'meta_comment_inbox_token_v2_secure_hash').trim(),
    redirectUri: (process.env.META_REDIRECT_URI || `${process.env.APP_URL || 'https://meta-dashboard.nysonik.com'}/auth/meta/callback`).trim(),
    accessToken: (process.env.META_ACCESS_TOKEN || '').trim(),
    webhookUrl: (process.env.META_WEBHOOK_URL || 'https://meta-dashboard.nysonik.com/api/meta/webhook').trim(),
  };
}

export function isServerDemoMode(): boolean {
  const v = process.env.VITE_DEMO_MODE || process.env.DEMO_MODE || 'false';
  return v === 'true' || v === '1';
}

export function isMetaConfigured(): boolean {
  const cfg = getMetaConfig();
  return Boolean(cfg.appId && (cfg.accessToken || isAnyMetaAccountConfigured()));
}

export interface MetaSyncValidation {
  ok: boolean;
  message?: string;
  status?: number;
}

export function validateMetaSync(): MetaSyncValidation {
  if (isServerDemoMode()) return { ok: true };

  const cfg = getMetaConfig();
  const missing: string[] = [];

  if (!cfg.appId) missing.push('META_APP_ID');
  if (!cfg.accessToken && !isAnyMetaAccountConfigured()) {
    missing.push('META_ACCESS_TOKEN or NOBL_META_*/FLO_META_*');
  }

  if (missing.length) {
    return {
      ok: false,
      status: 400,
      message: `Meta API not configured. Set ${missing.join(', ')} in server environment.`,
    };
  }

  return { ok: true };
}

function friendlyMetaMessage(body: MetaGraphErrorBody, fallback: string): string {
  const err = body.error;
  if (!err?.message) return fallback;

  const code = err.code;
  if (code === 190) {
    return `Meta access token is invalid or expired. Generate a new long-lived token and update META_ACCESS_TOKEN. (${err.message})`;
  }
  if (code === 200 || code === 10) {
    return `Missing Meta permissions. Ensure your token has ads_read, pages_show_list, pages_manage_metadata, and instagram_basic. (${err.message})`;
  }
  if (code === 100) {
    return `Meta API field error — token may lack Marketing API access. (${err.message})`;
  }
  if (code === 1 && err.message?.toLowerCase().includes('reduce the amount of data')) {
    return `Meta API returned too much data for one request. Sync uses lighter ad queries; retry or sync per account. (${err.message})`;
  }

  return err.message;
}

async function parseMetaResponse<T>(res: Response, context: string): Promise<T> {
  const text = await res.text();
  let body: T & MetaGraphErrorBody;
  try {
    body = JSON.parse(text) as T & MetaGraphErrorBody;
  } catch {
    throw new MetaApiError(`${context}: ${text || res.statusText}`, { status: res.status });
  }

  if (!res.ok || body.error) {
    throw new MetaApiError(friendlyMetaMessage(body, `${context} failed`), {
      code: body.error?.code,
      subcode: body.error?.error_subcode,
      type: body.error?.type,
      fbtraceId: body.error?.fbtrace_id,
      status: res.status >= 400 ? res.status : 502,
    });
  }

  return body;
}

function withToken(url: string, accessToken: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(accessToken)}`;
}

export { withToken };

export async function metaGraphGet<T>(path: string, accessToken?: string): Promise<T> {
  const token = accessToken || getMetaConfig().accessToken;
  if (!token) throw new MetaApiError('META_ACCESS_TOKEN is not set', { status: 400 });

  const url = path.startsWith('http') ? path : `${META_GRAPH}${path}`;
  const res = await fetch(withToken(url, token));
  return parseMetaResponse<T>(res, `Meta GET ${path}`);
}

export async function metaGraphPost<T>(
  path: string,
  params: Record<string, string> = {},
  accessToken?: string
): Promise<T> {
  const token = accessToken || getMetaConfig().accessToken;
  if (!token) throw new MetaApiError('META_ACCESS_TOKEN is not set', { status: 400 });

  const url = path.startsWith('http') ? path : `${META_GRAPH}${path}`;
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(url, { method: 'POST', body });
  return parseMetaResponse<T>(res, `Meta POST ${path}`);
}

export interface MetaPaginated<T> {
  data?: T[];
  paging?: { next?: string; previous?: string };
}

export const ORGANIC_FEED_DISABLED_WARNING =
  'pages_read_user_content is missing, so organic feed/post reading is disabled. Ads sync and Page account discovery still work.';

export interface MetaTokenStatus {
  valid: boolean;
  expiresAt: number | null;
  expiresAtIso: string | null;
  dataAccessExpiresAt: number | null;
  message: string;
  scopes: string[];
  appId: string | null;
  userId: string | null;
  hasPagesReadUserContent: boolean;
  canSyncComments: boolean;
}

export async function validateMetaAccessToken(accessToken?: string): Promise<MetaTokenStatus> {
  const token = (accessToken || getMetaConfig().accessToken)?.trim();
  const cfg = getMetaConfig();

  if (!token) {
    return {
      valid: false,
      expiresAt: null,
      expiresAtIso: null,
      dataAccessExpiresAt: null,
      message: 'META_ACCESS_TOKEN is not set',
      scopes: [],
      appId: cfg.appId || null,
      userId: null,
      hasPagesReadUserContent: false,
      canSyncComments: false,
    };
  }

  if (!cfg.appId || !cfg.appSecret) {
    return {
      valid: false,
      expiresAt: null,
      expiresAtIso: null,
      dataAccessExpiresAt: null,
      message: 'META_APP_ID and META_APP_SECRET required to validate token',
      scopes: [],
      appId: cfg.appId || null,
      userId: null,
      hasPagesReadUserContent: false,
      canSyncComments: false,
    };
  }

  try {
    const appToken = `${cfg.appId}|${cfg.appSecret}`;
    const res = await metaGraphGet<{
      data?: {
        is_valid?: boolean;
        expires_at?: number;
        data_access_expires_at?: number;
        app_id?: string;
        user_id?: string;
        scopes?: string[];
        error?: { message?: string; code?: number };
      };
    }>(`/debug_token?input_token=${encodeURIComponent(token)}`, appToken);

    const d = res.data;
    const errMsg = d?.error?.message;
    const expiresAt = d?.expires_at && d.expires_at > 0 ? d.expires_at : null;

    const scopes = d?.scopes ?? [];
    const hasPagesReadUserContent = scopes.includes('pages_read_user_content');
    const valid = Boolean(d?.is_valid) && !errMsg;

    return {
      valid,
      expiresAt,
      expiresAtIso: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      dataAccessExpiresAt: d?.data_access_expires_at ?? null,
      message: errMsg || (valid ? 'Token is valid' : 'Token is invalid or expired'),
      scopes,
      appId: d?.app_id ?? null,
      userId: d?.user_id ?? null,
      hasPagesReadUserContent,
      canSyncComments: valid && hasPagesReadUserContent,
    };
  } catch (err) {
    const msg = err instanceof MetaApiError ? err.message : String(err);
    return {
      valid: false,
      expiresAt: null,
      expiresAtIso: null,
      dataAccessExpiresAt: null,
      message: msg,
      scopes: [],
      appId: cfg.appId || null,
      userId: null,
      hasPagesReadUserContent: false,
      canSyncComments: false,
    };
  }
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}> {
  const cfg = getMetaConfig();
  if (!cfg.appId || !cfg.appSecret) {
    throw new MetaApiError('META_APP_ID and META_APP_SECRET are required', { status: 400 });
  }

  const path =
    `/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(cfg.appId)}` +
    `&client_secret=${encodeURIComponent(cfg.appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(shortLivedToken.trim())}`;

  const res = await metaGraphGet<{ access_token?: string; token_type?: string; expires_in?: number }>(path);
  if (!res.access_token) {
    throw new MetaApiError('Meta did not return a long-lived access token', { status: 502 });
  }

  return {
    accessToken: res.access_token,
    tokenType: res.token_type ?? 'bearer',
    expiresIn: res.expires_in ?? 0,
  };
}

export async function tokenHasPermission(permission: string, accessToken?: string): Promise<boolean> {
  try {
    const token = accessToken || getMetaConfig().accessToken;
    if (!token) return false;
    const res = await metaGraphGet<{ data?: Array<{ permission: string; status: string }> }>(
      '/me/permissions?fields=permission,status',
      token
    );
    return res.data?.some(p => p.permission === permission && p.status === 'granted') ?? false;
  } catch {
    return false;
  }
}

export async function metaGraphPaginateWithRaw<T>(
  path: string,
  accessToken?: string,
  logLabel = 'metaGraphPaginate'
): Promise<{ items: T[]; rawPages: unknown[] }> {
  const token = (accessToken || getMetaConfig().accessToken)?.trim();
  if (!token) throw new MetaApiError('META_ACCESS_TOKEN is not set', { status: 400 });

  const items: T[] = [];
  const rawPages: unknown[] = [];
  let url: string | null = path.startsWith('http') ? path : `${META_GRAPH}${path}`;

  while (url) {
    const fetchUrl = url.includes('access_token=') ? url : withToken(url, token);
    const res = await fetch(fetchUrl);
    const text = await res.text();
    console.log(`[${logLabel}] raw Meta response (${fetchUrl.split('?')[0]}):`, text.slice(0, 12000));

    let body: MetaPaginated<T> & MetaGraphErrorBody;
    try {
      body = JSON.parse(text) as MetaPaginated<T> & MetaGraphErrorBody;
    } catch {
      throw new MetaApiError(`${logLabel}: ${text || res.statusText}`, { status: res.status });
    }

    rawPages.push(body);

    if (!res.ok || body.error) {
      throw new MetaApiError(friendlyMetaMessage(body, `${logLabel} failed`), {
        code: body.error?.code,
        subcode: body.error?.error_subcode,
        type: body.error?.type,
        fbtraceId: body.error?.fbtrace_id,
        status: res.status >= 400 ? res.status : 502,
      });
    }

    if (body.data?.length) items.push(...body.data);
    url = body.paging?.next ?? null;
  }

  return { items, rawPages };
}

export async function metaGraphPaginate<T>(path: string, accessToken?: string): Promise<T[]> {
  const token = accessToken || getMetaConfig().accessToken;
  if (!token) throw new MetaApiError('META_ACCESS_TOKEN is not set', { status: 400 });

  const all: T[] = [];
  let url: string | null = path.startsWith('http') ? path : `${META_GRAPH}${path}`;

  while (url) {
    const fetchUrl = url.includes('access_token=') ? url : withToken(url, token);
    const res = await fetch(fetchUrl);
    const page = await parseMetaResponse<MetaPaginated<T>>(res, `Meta GET ${path}`);
    if (page.data?.length) all.push(...page.data);
    url = page.paging?.next ?? null;
  }

  return all;
}
