import { query } from './pool.js';

export async function upsertAdAccount(row: {
  id: string;
  accountId: string;
  name: string;
  platform: string;
  spend: string;
  status: string;
  isConnected: boolean;
}) {
  await query(
    `INSERT INTO connected_ad_accounts (id, account_id, name, platform, spend, status, is_connected, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       spend = EXCLUDED.spend,
       status = EXCLUDED.status,
       is_connected = EXCLUDED.is_connected,
       synced_at = NOW()`,
    [row.id, row.accountId, row.name, row.platform, row.spend, row.status, row.isConnected]
  );
}

export async function upsertCampaign(row: {
  id: string;
  platform: string;
  campaignId: string;
  campaignName: string;
  status: string;
  budget: string;
  metaAccountId?: string;
  accountLabel?: string;
}) {
  await query(
    `INSERT INTO campaigns (id, platform, campaign_id, campaign_name, status, budget, meta_account_id, account_label, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (id) DO UPDATE SET
       campaign_name = EXCLUDED.campaign_name,
       status = EXCLUDED.status,
       budget = EXCLUDED.budget,
       meta_account_id = EXCLUDED.meta_account_id,
       account_label = COALESCE(EXCLUDED.account_label, campaigns.account_label),
       synced_at = NOW()`,
    [row.id, row.platform, row.campaignId, row.campaignName, row.status, row.budget, row.metaAccountId ?? null, row.accountLabel ?? null]
  );
}

export async function upsertAdSet(row: {
  id: string;
  campaignId: string | null;
  adsetId: string;
  adsetName: string;
  platform: string;
}) {
  await query(
    `INSERT INTO adsets (id, campaign_id, adset_id, adset_name, platform, synced_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (id) DO UPDATE SET
       adset_name = EXCLUDED.adset_name,
       campaign_id = EXCLUDED.campaign_id,
       synced_at = NOW()`,
    [row.id, row.campaignId, row.adsetId, row.adsetName, row.platform]
  );
}

export async function upsertAd(row: {
  id: string;
  platform: string;
  adId: string;
  adName: string;
  adsetName: string;
  campaignName: string;
  adsetId: string | null;
  campaignId: string | null;
  originalAdUrl: string;
  mediaType: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  adCopy: string;
  headline?: string;
  description?: string;
  cta?: string;
  postStoryId?: string | null;
  spend?: number;
  recentSpend?: number;
  accountLabel?: string;
  metaAccountId?: string;
  effectiveStatus?: string | null;
  configuredStatus?: string | null;
  instagramMediaId?: string | null;
}) {
  await query(
    `INSERT INTO ads (
       id, platform, ad_id, ad_name, adset_name, campaign_name,
       adset_id, campaign_id, original_ad_url, media_type, media_url, thumbnail_url,
       ad_copy, headline, description, cta, post_story_id, spend, account_label, meta_account_id,
       effective_status, configured_status, recent_spend, instagram_media_id, synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW())
      ON CONFLICT (id) DO UPDATE SET
        platform = EXCLUDED.platform,
        ad_name = EXCLUDED.ad_name,
        adset_name = EXCLUDED.adset_name,
       campaign_name = EXCLUDED.campaign_name,
       adset_id = EXCLUDED.adset_id,
       campaign_id = EXCLUDED.campaign_id,
       original_ad_url = EXCLUDED.original_ad_url,
       media_type = EXCLUDED.media_type,
       media_url = EXCLUDED.media_url,
       thumbnail_url = EXCLUDED.thumbnail_url,
       ad_copy = EXCLUDED.ad_copy,
       headline = EXCLUDED.headline,
       description = EXCLUDED.description,
       cta = EXCLUDED.cta,
        post_story_id = COALESCE(EXCLUDED.post_story_id, ads.post_story_id),
        spend = CASE WHEN EXCLUDED.spend > 0 THEN EXCLUDED.spend ELSE ads.spend END,
        account_label = COALESCE(EXCLUDED.account_label, ads.account_label),
        meta_account_id = COALESCE(EXCLUDED.meta_account_id, ads.meta_account_id),
        effective_status = COALESCE(EXCLUDED.effective_status, ads.effective_status),
        configured_status = COALESCE(EXCLUDED.configured_status, ads.configured_status),
        recent_spend = EXCLUDED.recent_spend,
        instagram_media_id = COALESCE(EXCLUDED.instagram_media_id, ads.instagram_media_id),
        synced_at = NOW()`,
    [
      row.id,
      row.platform,
      row.adId,
      row.adName,
      row.adsetName,
      row.campaignName,
      row.adsetId,
      row.campaignId,
      row.originalAdUrl,
      row.mediaType,
      row.mediaUrl ?? null,
      row.thumbnailUrl ?? null,
      row.adCopy,
      row.headline ?? null,
      row.description ?? null,
      row.cta ?? null,
      row.postStoryId ?? null,
      row.spend != null && row.spend > 0 ? row.spend : 0,
      row.accountLabel ?? null,
      row.metaAccountId ?? null,
      row.effectiveStatus ?? null,
      row.configuredStatus ?? null,
      row.recentSpend != null && row.recentSpend > 0 ? row.recentSpend : 0,
      row.instagramMediaId ?? null,
    ]
  );
}

export async function markStaleActiveAdsInactive(metaAccountId: string, syncedAfterIso: string): Promise<number> {
  const normalizedAccountId = metaAccountId.replace(/^act_/, '');
  const { rowCount } = await query(
    `UPDATE ads
     SET effective_status = 'INACTIVE',
         configured_status = COALESCE(configured_status, 'INACTIVE'),
         synced_at = NOW()
     WHERE COALESCE(effective_status, 'ACTIVE') IN ('ACTIVE', '')
       AND REPLACE(COALESCE(meta_account_id, ''), 'act_', '') = $1
       AND (synced_at IS NULL OR synced_at < $2::timestamptz)`,
    [normalizedAccountId, syncedAfterIso]
  );
  return rowCount ?? 0;
}

/** One-time / boot repair: normalize labels, deactivate orphan rows missing effective_status. */
export async function repairAdCatalog(): Promise<{ labelsFixed: number; staleDeactivated: number }> {
  const labelFix = await query(`
    UPDATE ads SET account_label = 'FLO'
    WHERE account_label IN ('APP2', 'META2')
       OR (account_label IS NULL AND LOWER(COALESCE(campaign_name,'') || ' ' || COALESCE(ad_name,'')) ~ '(^|[^a-z0-9])flo')
  `);
  const labelFix2 = await query(`
    UPDATE ads SET account_label = 'NOBL'
    WHERE account_label IN ('META3', 'META')
       OR (account_label = 'DEFAULT' AND LOWER(COALESCE(campaign_name,'') || ' ' || COALESCE(ad_name,'')) ~ '(^|[^a-z0-9])nobl')
  `);
  const stale = await query(`
    UPDATE ads
    SET effective_status = 'INACTIVE',
        configured_status = COALESCE(configured_status, 'INACTIVE')
    WHERE effective_status IS NULL
  `);
  return {
    labelsFixed: (labelFix.rowCount ?? 0) + (labelFix2.rowCount ?? 0),
    staleDeactivated: stale.rowCount ?? 0,
  };
}

export async function upsertConnectedPage(row: {
  id: string;
  pageId: string;
  name: string;
  fans: string;
  avatar: string;
  isConnected: boolean;
  accessToken?: string;
}) {
  await query(
    `INSERT INTO connected_pages (id, page_id, name, fans, avatar, is_connected, access_token, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       fans = EXCLUDED.fans,
       avatar = EXCLUDED.avatar,
       is_connected = EXCLUDED.is_connected,
       access_token = EXCLUDED.access_token,
       synced_at = NOW()`,
    [row.id, row.pageId, row.name, row.fans, row.avatar, row.isConnected, row.accessToken ?? null]
  );
}

export async function upsertInstagramAccount(row: {
  id: string;
  accountId: string;
  username: string;
  linkedPageId?: string;
  linkedPageName?: string;
  followers: string;
  avatar: string;
  isConnected: boolean;
  accessToken?: string;
}) {
  await query(
    `INSERT INTO connected_instagram_accounts (id, account_id, username, linked_page_id, linked_page_name, followers, avatar, is_connected, access_token, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        linked_page_id = COALESCE(EXCLUDED.linked_page_id, connected_instagram_accounts.linked_page_id),
        linked_page_name = COALESCE(EXCLUDED.linked_page_name, connected_instagram_accounts.linked_page_name),
        followers = EXCLUDED.followers,
        avatar = EXCLUDED.avatar,
        is_connected = EXCLUDED.is_connected,
        access_token = COALESCE(EXCLUDED.access_token, connected_instagram_accounts.access_token),
        synced_at = NOW()`,
    [row.id, row.accountId, row.username, row.linkedPageId ?? null, row.linkedPageName ?? null, row.followers, row.avatar, row.isConnected, row.accessToken ?? null]
  );
}

export async function getAllConnectedAdAccounts() {
  const { rows } = await query<{
    id: string;
    account_id: string;
    name: string;
    platform: string;
    spend: string | null;
    status: string;
    is_connected: boolean;
    synced_at: string | null;
  }>('SELECT * FROM connected_ad_accounts ORDER BY spend DESC NULLS LAST, name');

  return rows.map(row => ({
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    platform: row.platform,
    spend: row.spend ?? '',
    status: row.status,
    isConnected: row.is_connected,
    syncedAt: row.synced_at,
    label: row.name.includes('NOBL') ? 'NOBL' : row.name.includes('FLO') ? 'FLO' : row.name,
  }));
}

export async function getAllInstagramAccounts() {
  const { rows } = await query<{
    id: string;
    account_id: string;
    username: string;
    followers: string | null;
    avatar: string | null;
    is_connected: boolean;
    synced_at: string | null;
  }>(
    `SELECT * FROM connected_instagram_accounts
     WHERE id LIKE 'meta-ig-%'
     ORDER BY username`
  );

  return rows.map(row => ({
    id: row.id,
    accountId: row.account_id,
    username: row.username,
    followers: row.followers ?? '',
    avatar: row.avatar ?? '',
    isConnected: row.is_connected,
    syncedAt: row.synced_at,
  }));
}

export async function pruneStaleInstagramAccounts(validAccountIds: string[]): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `DELETE FROM connected_instagram_accounts
     WHERE id NOT LIKE 'meta-ig-%'
        OR (
          cardinality($1::text[]) > 0
          AND id LIKE 'meta-ig-%'
          AND NOT (account_id = ANY($1::text[]))
        )
     RETURNING id`,
    [validAccountIds]
  );
  return rows.length;
}

/** Re-align comment platform from linked ads and Instagram URL/username signals. */
export async function realignCommentPlatformsFromAds(): Promise<number> {
  const { rowCount } = await query(`
    UPDATE comments c
    SET platform = 'instagram', updated_at = NOW()
    WHERE c.platform = 'facebook'
      AND (
        c.original_comment_url ILIKE '%instagram.com%'
        OR c.commenter_profile_url ILIKE '%instagram.com%'
        OR c.commenter_name LIKE '@%'
        OR c.instagram_account_id IS NOT NULL
        OR c.instagram_account_name IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM ads a
          WHERE a.ad_id = c.ad_id AND a.platform = 'instagram'
        )
      )
  `);
  return rowCount ?? 0;
}

export async function getTopAdsBySpend(limit = 20) {
  const { rows } = await query<{
    id: string;
    ad_id: string;
    ad_name: string;
    campaign_name: string | null;
    platform: string;
    spend: string | null;
    recent_spend: string | null;
    account_label: string | null;
    media_type: string | null;
    thumbnail_url: string | null;
    media_url: string | null;
    comments_count: number | null;
    post_story_id: string | null;
    instagram_media_id: string | null;
  }>(
    `WITH ranked AS (
       SELECT id, ad_id, ad_name, campaign_name, platform, spend, recent_spend, account_label, media_type, thumbnail_url, media_url, comments_count, post_story_id, instagram_media_id,
              ROW_NUMBER() OVER (
                PARTITION BY COALESCE(NULLIF(account_label, ''), 'UNKNOWN')
                ORDER BY COALESCE(recent_spend, 0) DESC, COALESCE(spend, 0) DESC, COALESCE(comments_count, 0) DESC, ad_name
              ) AS account_rank
       FROM ads
       WHERE effective_status = 'ACTIVE'
     )
     SELECT id, ad_id, ad_name, campaign_name, platform, spend, recent_spend, account_label, media_type, thumbnail_url, media_url, comments_count
     FROM ranked
     WHERE account_rank <= $1
     ORDER BY COALESCE(NULLIF(account_label, ''), 'UNKNOWN'), account_rank`,
    [limit]
  );

  return rows.map(row => ({
    id: row.id,
    adId: row.ad_id,
    adName: row.ad_name,
    campaignName: row.campaign_name ?? '',
    platform: row.platform,
    spend: Number(row.spend ?? 0),
    recentSpend: Number(row.recent_spend ?? 0),
    accountLabel: row.account_label ?? '',
    mediaType: row.media_type ?? 'image',
    thumbnailUrl: row.thumbnail_url ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    commentsCount: row.comments_count ?? 0,
    postStoryId: row.post_story_id ?? undefined,
    instagramMediaId: row.instagram_media_id ?? undefined,
  }));
}

export async function getAllConnectedPages() {
  const { rows } = await query<{
    id: string;
    page_id: string;
    name: string;
    fans: string | null;
    avatar: string | null;
    access_token: string | null;
    is_connected: boolean;
    synced_at: string | null;
  }>('SELECT id, page_id, name, fans, avatar, access_token, is_connected, synced_at FROM connected_pages ORDER BY name');

  return rows.map(row => ({
    id: row.id,
    pageId: row.page_id,
    pageName: row.name,
    fans: row.fans ?? '',
    avatar: row.avatar ?? '',
    pageAccessToken: row.access_token,
    isConnected: row.is_connected,
    syncedAt: row.synced_at,
  }));
}

export async function getPageAccessToken(pageId: string): Promise<string | null> {
  const { rows } = await query<{ access_token: string | null }>(
    'SELECT access_token FROM connected_pages WHERE page_id = $1 AND access_token IS NOT NULL LIMIT 1',
    [pageId]
  );
  return rows[0]?.access_token ?? null;
}

export interface AdLookupRow {
  adId: string;
  adName: string;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  accountLabel: string | null;
  metaAccountId: string | null;
  postStoryId: string | null;
  instagramMediaId: string | null;
}

/** Best-match ad for an organic IG media — prefers ads with matching media, highest recent spend. */
export async function findAdByInstagramMediaId(mediaId: string): Promise<AdLookupRow | null> {
  if (!mediaId?.trim()) return null;
  const { rows } = await query<{
    ad_id: string;
    ad_name: string;
    adset_id: string | null;
    adset_name: string | null;
    campaign_id: string | null;
    campaign_name: string | null;
    account_label: string | null;
    meta_account_id: string | null;
    post_story_id: string | null;
    instagram_media_id: string | null;
  }>(
    `SELECT ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
            account_label, meta_account_id, post_story_id, instagram_media_id
     FROM ads
     WHERE instagram_media_id = $1
     ORDER BY COALESCE(recent_spend, 0) DESC, COALESCE(spend, 0) DESC
     LIMIT 1`,
    [mediaId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    adId: row.ad_id,
    adName: row.ad_name,
    adsetId: row.adset_id,
    adsetName: row.adset_name,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    accountLabel: row.account_label,
    metaAccountId: row.meta_account_id,
    postStoryId: row.post_story_id,
    instagramMediaId: row.instagram_media_id,
  };
}

/** Best-match ad for a Facebook post story ID (pageId_postId). */
export async function findAdByPostStoryId(storyId: string): Promise<AdLookupRow | null> {
  if (!storyId?.trim()) return null;
  const { rows } = await query<{
    ad_id: string;
    ad_name: string;
    adset_id: string | null;
    adset_name: string | null;
    campaign_id: string | null;
    campaign_name: string | null;
    account_label: string | null;
    meta_account_id: string | null;
    post_story_id: string | null;
    instagram_media_id: string | null;
  }>(
    `SELECT ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
            account_label, meta_account_id, post_story_id, instagram_media_id
     FROM ads
     WHERE post_story_id = $1
     ORDER BY COALESCE(recent_spend, 0) DESC, COALESCE(spend, 0) DESC
     LIMIT 1`,
    [storyId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    adId: row.ad_id,
    adName: row.ad_name,
    adsetId: row.adset_id,
    adsetName: row.adset_name,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    accountLabel: row.account_label,
    metaAccountId: row.meta_account_id,
    postStoryId: row.post_story_id,
    instagramMediaId: row.instagram_media_id,
  };
}

/** All connected IG business accounts with usable tokens for organic sync. */
export async function getConnectedInstagramAccountsForSync(): Promise<Array<{
  accountId: string;
  username: string;
  pageId: string | null;
  pageAccessToken: string | null;
}>> {
  const { rows } = await query<{
    account_id: string;
    username: string;
    linked_page_id: string | null;
    access_token: string | null;
  }>(
    `SELECT cia.account_id, cia.username, cia.linked_page_id,
            COALESCE(cia.access_token, cp.access_token) AS access_token
     FROM connected_instagram_accounts cia
     LEFT JOIN connected_pages cp ON cp.page_id = cia.linked_page_id
     WHERE cia.is_connected = true
       AND cia.account_id IS NOT NULL AND cia.account_id <> ''`
  );
  return rows.map(row => ({
    accountId: row.account_id,
    username: row.username,
    pageId: row.linked_page_id,
    pageAccessToken: row.access_token,
  }));
}

/** All connected FB pages with a page access token. */
export async function getConnectedPagesForOrganicSync(): Promise<Array<{
  pageId: string;
  pageName: string;
  pageAccessToken: string | null;
}>> {
  const { rows } = await query<{
    page_id: string;
    name: string;
    access_token: string | null;
  }>(
    `SELECT page_id, name, access_token
     FROM connected_pages
     WHERE is_connected = true
       AND page_id IS NOT NULL AND page_id <> ''`
  );
  return rows.map(row => ({
    pageId: row.page_id,
    pageName: row.name,
    pageAccessToken: row.access_token,
  }));
}

export interface MetaSyncStatusLatest {
  latestAds: Array<{ adId: string; adName: string; campaignName: string }>;
  latestCampaigns: Array<{ campaignId: string; campaignName: string; platform: string; status: string }>;
}

export async function getMetaSyncStatusLatest(): Promise<MetaSyncStatusLatest> {
  const { rows: latestAds } = await query<{
    ad_id: string;
    ad_name: string;
    campaign_name: string | null;
  }>(`
    SELECT ad_id, ad_name, campaign_name
    FROM ads
    ORDER BY COALESCE(synced_at, created_at) DESC
    LIMIT 20
  `);

  const { rows: latestCampaigns } = await query<{
    campaign_id: string;
    campaign_name: string;
    platform: string;
    status: string;
  }>(`
    SELECT campaign_id, campaign_name, platform, status
    FROM campaigns
    ORDER BY COALESCE(synced_at, created_at) DESC
    LIMIT 20
  `);

  return {
    latestAds: latestAds.map(row => ({
      adId: row.ad_id,
      adName: row.ad_name,
      campaignName: row.campaign_name ?? '',
    })),
    latestCampaigns: latestCampaigns.map(row => ({
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      platform: row.platform,
      status: row.status,
    })),
  };
}

export interface MetaSyncStatus {
  adAccountsCount: number;
  campaignsCount: number;
  adSetsCount: number;
  adsCount: number;
  pagesCount: number;
  instagramAccountsCount: number;
  latestAds: Array<{ adId: string; adName: string; campaignName: string }>;
}

export async function getMetaSyncStatus(): Promise<MetaSyncStatus> {
  const { rows: counts } = await query<{
    ad_accounts: string;
    campaigns: string;
    adsets: string;
    ads: string;
    pages: string;
    instagram: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM connected_ad_accounts) AS ad_accounts,
      (SELECT COUNT(*)::int FROM campaigns) AS campaigns,
      (SELECT COUNT(*)::int FROM adsets) AS adsets,
      (SELECT COUNT(*)::int FROM ads) AS ads,
      (SELECT COUNT(*)::int FROM connected_pages) AS pages,
      (SELECT COUNT(*)::int FROM connected_instagram_accounts) AS instagram
  `);

  const { rows: latestAds } = await query<{
    ad_id: string;
    ad_name: string;
    campaign_name: string | null;
  }>(`
    SELECT ad_id, ad_name, campaign_name
    FROM ads
    ORDER BY COALESCE(synced_at, created_at) DESC
    LIMIT 10
  `);

  const c = counts[0];
  return {
    adAccountsCount: Number(c.ad_accounts),
    campaignsCount: Number(c.campaigns),
    adSetsCount: Number(c.adsets),
    adsCount: Number(c.ads),
    pagesCount: Number(c.pages),
    instagramAccountsCount: Number(c.instagram),
    latestAds: latestAds.map(row => ({
      adId: row.ad_id,
      adName: row.ad_name,
      campaignName: row.campaign_name ?? '',
    })),
  };
}
