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
}) {
  await query(
    `INSERT INTO campaigns (id, platform, campaign_id, campaign_name, status, budget, meta_account_id, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (id) DO UPDATE SET
       campaign_name = EXCLUDED.campaign_name,
       status = EXCLUDED.status,
       budget = EXCLUDED.budget,
       meta_account_id = EXCLUDED.meta_account_id,
       synced_at = NOW()`,
    [row.id, row.platform, row.campaignId, row.campaignName, row.status, row.budget, row.metaAccountId ?? null]
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
}) {
  await query(
    `INSERT INTO ads (
       id, platform, ad_id, ad_name, adset_name, campaign_name,
       adset_id, campaign_id, original_ad_url, media_type, media_url, thumbnail_url,
       ad_copy, headline, description, cta, synced_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
     ON CONFLICT (id) DO UPDATE SET
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
    ]
  );
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
  followers: string;
  avatar: string;
  isConnected: boolean;
  accessToken?: string;
}) {
  await query(
    `INSERT INTO connected_instagram_accounts (id, account_id, username, followers, avatar, is_connected, access_token, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (id) DO UPDATE SET
       username = EXCLUDED.username,
       followers = EXCLUDED.followers,
       avatar = EXCLUDED.avatar,
       is_connected = EXCLUDED.is_connected,
       access_token = COALESCE(EXCLUDED.access_token, connected_instagram_accounts.access_token),
       synced_at = NOW()`,
    [row.id, row.accountId, row.username, row.followers, row.avatar, row.isConnected, row.accessToken ?? null]
  );
}

export async function getAllConnectedPages() {
  const { rows } = await query<{
    id: string;
    page_id: string;
    name: string;
    access_token: string | null;
    is_connected: boolean;
    synced_at: string | null;
  }>('SELECT id, page_id, name, access_token, is_connected, synced_at FROM connected_pages ORDER BY name');

  return rows.map(row => ({
    id: row.id,
    pageId: row.page_id,
    pageName: row.name,
    pageAccessToken: row.access_token,
    isConnected: row.is_connected,
    syncedAt: row.synced_at,
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
