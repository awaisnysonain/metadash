import { Router } from 'express';
import { getMetaConfig, validateMetaAccessToken, exchangeForLongLivedToken } from '../lib/meta.js';
import { PAGE_SYNC_FIELDS, fetchInstagramMediaComments, fetchInstagramMediaPermalink } from '../lib/meta-graph.js';
import { query } from '../db/pool.js';
import { getConnectedInstagramAccountsForSync } from '../db/sync-repository.js';

export const metaDebugRouter = Router();

const META_GRAPH_V23 = 'https://graph.facebook.com/v23.0';

async function fetchMetaRaw(path: string, accessToken: string): Promise<{ status: number; body: unknown }> {
  const url = `${META_GRAPH_V23}${path}?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const text = await res.text();

  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

metaDebugRouter.get('/debug', async (_req, res) => {
  const { accessToken } = getMetaConfig();
  if (!accessToken) {
    return res.status(400).json({ error: 'META_ACCESS_TOKEN is not set' });
  }

  try {
    const { status, body } = await fetchMetaRaw('/me/adaccounts', accessToken);
    res.status(status).json(body);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

metaDebugRouter.get('/debug-pages', async (_req, res) => {
  const { accessToken } = getMetaConfig();
  if (!accessToken) {
    return res.status(400).json({ error: 'META_ACCESS_TOKEN is not set' });
  }

  try {
    const { status, body } = await fetchMetaRaw(
      `/me/accounts?fields=${encodeURIComponent(PAGE_SYNC_FIELDS)}`,
      accessToken
    );
    res.status(status).json(body);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

metaDebugRouter.get('/token/status', async (_req, res) => {
  try {
    const status = await validateMetaAccessToken();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Diagnostic: given an Instagram public URL/shortcode, tell the operator whether we have
 * comments for it, and what the underlying media_id resolves to. Helps triage reports of
 * "comments missing for post X" without SSHing to the DB.
 *
 * GET /api/meta/debug/ig-post?url=https://www.instagram.com/p/DadQnUbsRoY/
 *   or
 * GET /api/meta/debug/ig-post?shortcode=DadQnUbsRoY
 * GET /api/meta/debug/ig-post?mediaId=17999999999999999
 */
metaDebugRouter.get('/debug/ig-post', async (req, res) => {
  const rawUrl = String(req.query.url ?? '').trim();
  const rawShortcode = String(req.query.shortcode ?? '').trim();
  const rawMediaId = String(req.query.mediaId ?? '').trim();

  let shortcode = rawShortcode;
  if (!shortcode && rawUrl) {
    const match = rawUrl.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (match) shortcode = match[1];
  }

  if (!shortcode && !rawMediaId) {
    return res.status(400).json({ error: 'Provide url= or shortcode= or mediaId=' });
  }

  const report: Record<string, unknown> = { shortcode, mediaId: rawMediaId || null };

  // 1. Look up by media_id or shortcode in our own comments/ads tables.
  if (rawMediaId) {
    const ads = await query<{ ad_id: string; ad_name: string; instagram_media_id: string | null }>(
      `SELECT ad_id, ad_name, instagram_media_id FROM ads WHERE instagram_media_id = $1 LIMIT 5`,
      [rawMediaId]
    );
    const comments = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM comments WHERE ad_id = $1 OR original_comment_url LIKE '%' || $1 || '%'`,
      [rawMediaId]
    );
    report.linkedAds = ads.rows;
    report.commentsInDb = Number(comments.rows[0]?.count ?? 0);
  }
  if (shortcode) {
    const comments = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM comments WHERE original_comment_url ILIKE '%' || $1 || '%'`,
      [shortcode]
    );
    report.commentsInDbByShortcode = Number(comments.rows[0]?.count ?? 0);
  }

  // 2. Try to resolve the shortcode → media_id via each connected IG account's token.
  //    Meta doesn't expose a direct shortcode→id endpoint, so we try the /oembed_instagram
  //    endpoint which returns the numeric media_id.
  if (!rawMediaId && shortcode) {
    const igAccounts = await getConnectedInstagramAccountsForSync();
    const attempts: Array<{ account: string; error?: string; mediaId?: string }> = [];
    for (const account of igAccounts) {
      const token = account.pageAccessToken?.trim() || getMetaConfig().accessToken?.trim();
      if (!token) continue;
      try {
        const url = `${META_GRAPH_V23}/instagram_oembed?url=${encodeURIComponent(`https://www.instagram.com/p/${shortcode}/`)}&fields=media_id&access_token=${encodeURIComponent(token)}`;
        const res2 = await fetch(url);
        const body = (await res2.json()) as { media_id?: string; error?: { message?: string } };
        if (body.media_id) {
          attempts.push({ account: account.username, mediaId: body.media_id });
        } else if (body.error?.message) {
          attempts.push({ account: account.username, error: body.error.message });
        }
      } catch (err) {
        attempts.push({ account: account.username, error: err instanceof Error ? err.message : String(err) });
      }
    }
    report.shortcodeResolveAttempts = attempts;
    const firstMediaId = attempts.find(a => a.mediaId)?.mediaId;
    if (firstMediaId) report.resolvedMediaId = firstMediaId;
  }

  // 3. If we have a media ID (given or resolved), fetch Meta's live comment count.
  const effectiveMediaId = rawMediaId || (report.resolvedMediaId as string | undefined);
  if (effectiveMediaId) {
    try {
      const igAccounts = await getConnectedInstagramAccountsForSync();
      let liveComments = 0;
      let permalink: string | null = null;
      for (const account of igAccounts) {
        const token = account.pageAccessToken?.trim() || getMetaConfig().accessToken?.trim();
        if (!token) continue;
        try {
          permalink = await fetchInstagramMediaPermalink(effectiveMediaId, token);
          const rows = await fetchInstagramMediaComments(effectiveMediaId, token, { limit: 100, mediaPermalink: permalink });
          liveComments = rows.length;
          break;
        } catch {
          /* try next account's token */
        }
      }
      report.liveCommentsOnMeta = liveComments;
      report.permalink = permalink;
    } catch (err) {
      report.liveFetchError = err instanceof Error ? err.message : String(err);
    }
  }

  res.json(report);
});

metaDebugRouter.post('/token/exchange', async (req, res) => {
  const shortToken = String(req.body?.shortLivedToken ?? req.body?.token ?? '').trim();
  if (!shortToken) {
    return res.status(400).json({ error: 'shortLivedToken is required' });
  }

  try {
    const exchanged = await exchangeForLongLivedToken(shortToken);
    const status = await validateMetaAccessToken(exchanged.accessToken);
    res.json({
      ...exchanged,
      expiresInDays: Math.round(exchanged.expiresIn / 86400),
      validation: status,
      instructions:
        'Copy accessToken into META_ACCESS_TOKEN in server .env, then run: pm2 restart metadashboard',
    });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

