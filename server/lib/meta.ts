export function getMetaConfig() {
  return {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    verifyToken: process.env.META_VERIFY_TOKEN || 'meta_comment_inbox_token_v2_secure_hash',
    redirectUri: process.env.META_REDIRECT_URI || `${process.env.APP_URL || 'https://meta-dashboard.nysonik.com'}/auth/meta/callback`,
    accessToken: process.env.META_ACCESS_TOKEN || '',
    webhookUrl: process.env.META_WEBHOOK_URL || 'https://meta-dashboard.nysonik.com/api/meta/webhook',
  };
}

export function isMetaConfigured(): boolean {
  const cfg = getMetaConfig();
  return Boolean(cfg.appId && (cfg.appSecret || cfg.accessToken));
}

export const META_GRAPH = 'https://graph.facebook.com/v21.0';

export async function metaGraphGet<T>(path: string, accessToken?: string): Promise<T> {
  const token = accessToken || getMetaConfig().accessToken;
  if (!token) throw new Error('Meta access token not configured');
  const url = path.startsWith('http') ? path : `${META_GRAPH}${path}`;
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}access_token=${token}`);
  if (!res.ok) throw new Error(`Meta API ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
