import { Router } from 'express';
import {
  getAllConnectedAdAccounts,
  getAllConnectedPages,
  getAllInstagramAccounts,
  getTopAdsBySpend,
} from '../db/sync-repository.js';
import { isDatabaseConfigured } from '../db/pool.js';
import { query } from '../db/pool.js';
import { getMetaConfig, metaGraphGet } from '../lib/meta.js';
import { isIgnoredInstagramAccountId, isIgnoredPageId } from '../lib/ignore-list.js';

// Simple in-memory cache for brand assets; TTL 5 minutes
const brandAssetsCache: Map<string, { at: number; data: { brand: string; count: number; assets: Array<{ pageId: string; pageName: string; pageAvatar?: string; ads: number; instagram?: { id: string; username: string; avatar?: string }; comments: { facebook: number; instagram: number; total: number } }> } }> = new Map();
const BRAND_ASSETS_TTL_MS = 5 * 60 * 1000;

export const accountsRouter = Router();

accountsRouter.get('/', async (_req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });

    const [adAccounts, pages, instagram, topAds] = await Promise.all([
      getAllConnectedAdAccounts(),
      getAllConnectedPages(),
      getAllInstagramAccounts(),
      getTopAdsBySpend(15),
    ]);

    res.json({ adAccounts, pages, instagram, topAds });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

accountsRouter.get('/top-ads', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    res.json(await getTopAdsBySpend(limit));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Brand assets: pages used by brand's active ads, with linked Instagram username if available
accountsRouter.get('/brand-assets', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const brand = String(req.query.brand || '').toUpperCase();
    if (!brand || (brand !== 'FLO' && brand !== 'NOBL')) {
      return res.status(400).json({ error: 'brand must be FLO or NOBL' });
    }

    // Serve from cache if fresh
    const key = brand;
    const cached = brandAssetsCache.get(key);
    if (cached && Date.now() - cached.at < BRAND_ASSETS_TTL_MS) {
      return res.json(cached.data);
    }

    // 1) Distinct page ids from active ads for this brand
    const sql = `
      SELECT split_part(post_story_id, '_', 1) AS page_id,
             COUNT(*)::int AS ads,
             MAX(account_label) AS account_label
      FROM ads
      WHERE effective_status = 'ACTIVE'
        AND account_label = $1
        AND post_story_id IS NOT NULL
        AND split_part(post_story_id, '_', 1) <> ''
      GROUP BY 1
      ORDER BY ads DESC`;
    const { rows: rawPageRows } = await query<{ page_id: string; ads: number; account_label: string }>(sql, [brand]);
    const pageRows = rawPageRows.filter(r => !isIgnoredPageId(r.page_id));

    // 2) Join with connected_pages for names/tokens
    const pgMap = new Map<string, { pageId: string; pageName: string; pageAvatar?: string; accessToken: string | null }>();
    if (pageRows.length) {
      const inList = pageRows.map(r => `'${r.page_id}'`).join(',');
      const { rows } = await query<{ page_id: string; name: string; avatar: string | null; access_token: string | null }>(
        `SELECT page_id, name, avatar, access_token FROM connected_pages WHERE page_id IN (${inList})`
      );
      for (const r of rows) {
        pgMap.set(r.page_id, { pageId: r.page_id, pageName: r.name, pageAvatar: r.avatar ?? undefined, accessToken: r.access_token });
      }
    }

    // 3) Bulk comment counts for FB/IG comments associated with active ads on each Page.
    // Most ad comments are keyed by ad_id, not by comments.page_id, so count through ads.post_story_id too.
    const pageCounts = new Map<string, number>();
    const igCounts = new Map<string, number>();
    {
      const { rows } = await query<{ page_id: string | null; count: number }>(
        `SELECT COALESCE(NULLIF(c.page_id, ''), split_part(a.post_story_id, '_', 1)) AS page_id,
                COUNT(DISTINCT c.comment_id)::int AS count
         FROM comments c
         LEFT JOIN ads a ON (a.ad_id = c.ad_id OR a.id = c.ad_id) AND a.effective_status = 'ACTIVE'
         WHERE c.platform = 'facebook'
           AND (
             c.page_id IS NOT NULL
             OR (a.account_label = $1 AND a.post_story_id IS NOT NULL)
           )
         GROUP BY 1`,
        [brand]
      );
      for (const r of rows) if (r.page_id) pageCounts.set(r.page_id, r.count);
    }
    {
      const { rows } = await query<{ page_id: string | null; count: number }>(
        `SELECT split_part(a.post_story_id, '_', 1) AS page_id,
                COUNT(DISTINCT c.comment_id)::int AS count
         FROM comments c
         JOIN ads a ON (a.ad_id = c.ad_id OR a.id = c.ad_id)
         WHERE c.platform = 'instagram'
           AND a.effective_status = 'ACTIVE'
           AND a.account_label = $1
           AND a.post_story_id IS NOT NULL
         GROUP BY 1`,
        [brand]
      );
      for (const r of rows) if (r.page_id) igCounts.set(r.page_id, r.count);
    }

    // 4) Resolve Instagram usernames from DB first; fallback to one Graph call if old rows lack linked_page_id.
    const igByPage = new Map<string, { id: string; username: string; avatar?: string }>();
    {
      const { rows } = await query<{ linked_page_id: string | null; account_id: string; username: string; avatar: string | null }>(
        `SELECT linked_page_id, account_id, username, avatar
         FROM connected_instagram_accounts
         WHERE linked_page_id IS NOT NULL AND is_connected = TRUE`
      );
      for (const r of rows) {
        if (r.linked_page_id) igByPage.set(r.linked_page_id, { id: r.account_id, username: r.username, avatar: r.avatar ?? undefined });
      }
    }
    const appToken = getMetaConfig().accessToken;
    if (appToken) {
      try {
        const data = await metaGraphGet<{ data?: Array<{ id: string; instagram_business_account?: { id?: string; username?: string } }> }>(
          `/me/accounts?fields=id,instagram_business_account{id,username}&limit=100`,
          appToken
        );
        for (const p of data.data || []) {
          const ig = p.instagram_business_account;
          if (ig?.id && !igByPage.has(p.id)) igByPage.set(p.id, { id: ig.id, username: ig.username ? `@${ig.username}` : '' });
        }
      } catch (err) {
        console.warn('[brand-assets] me/accounts read failed:', err instanceof Error ? err.message : String(err));
      }
    }
    const assets = [] as Array<{ pageId: string; pageName: string; pageAvatar?: string; ads: number; instagram?: { id: string; username: string; avatar?: string }; comments: { facebook: number; instagram: number; total: number } }>;
    for (const r of pageRows) {
      const meta = pgMap.get(r.page_id) || { pageId: r.page_id, pageName: r.page_id, accessToken: null };
      const foundIg = igByPage.get(r.page_id);
      const instagram = foundIg && foundIg.username && !isIgnoredInstagramAccountId(foundIg.id) ? foundIg : undefined;
      const fbCount = pageCounts.get(r.page_id) || 0;
      const igCount = instagram?.id ? igCounts.get(r.page_id) || 0 : 0;
      assets.push({ pageId: r.page_id, pageName: meta.pageName, pageAvatar: meta.pageAvatar, ads: r.ads, instagram, comments: { facebook: fbCount, instagram: igCount, total: fbCount + igCount } });
    }
    const payload = { brand, count: assets.length, assets };
    brandAssetsCache.set(key, { at: Date.now(), data: payload });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
