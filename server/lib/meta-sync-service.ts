import { isDatabaseConfigured, hasDatabaseUrl } from '../db/pool.js';
import {
  upsertAdAccount,
  upsertCampaign,
  upsertAdSet,
  upsertAd,
  upsertConnectedPage,
  upsertInstagramAccount,
} from '../db/sync-repository.js';
import {
  MetaApiError,
  getMetaConfig,
  isServerDemoMode,
  validateMetaSync,
  ORGANIC_FEED_DISABLED_WARNING,
  tokenHasPermission,
} from './meta.js';
import {
  fetchAdAccounts,
  fetchCampaigns,
  fetchAdSets,
  fetchAds,
  fetchAdCreative,
  fetchFacebookPages,
  extractInstagramBusinessAccountId,
  type MetaPage,
  parseCreative,
  mapCampaignStatus,
  mapAccountStatus,
  formatBudget,
  formatSpend,
  detectAdPlatform,
} from './meta-graph.js';
import { mockAds, mockCampaigns, connectedPages } from '../../src/data.js';

export interface SyncOutcome {
  ok: boolean;
  synced: number;
  message: string;
  details?: Record<string, unknown>;
}

function requireDatabase(): SyncOutcome | null {
  if (!isDatabaseConfigured()) {
    const msg = hasDatabaseUrl()
      ? 'PostgreSQL is not reachable. Start the database (npm run db:up) or fix DATABASE_URL in .env.'
      : 'DATABASE_URL is not set. Configure PostgreSQL before syncing live Meta data.';
    return { ok: false, synced: 0, message: msg };
  }
  return null;
}

function validateOrError(): SyncOutcome | null {
  const check = validateMetaSync();
  if (!check.ok) {
    return { ok: false, synced: 0, message: check.message!, details: { status: check.status } };
  }
  return null;
}

/* ── Demo sync (mock data → PostgreSQL) ── */

async function syncAdsDemo(): Promise<SyncOutcome> {
  const dbErr = requireDatabase();
  if (dbErr) return dbErr;

  let synced = 0;
  for (const a of mockAds) {
    await upsertAd({
      id: a.id,
      platform: a.platform,
      adId: a.adId,
      adName: a.adName,
      adsetName: a.adsetName,
      campaignName: a.campaignName,
      adsetId: null,
      campaignId: null,
      originalAdUrl: a.originalAdUrl,
      mediaType: a.mediaType,
      mediaUrl: a.mediaUrl,
      thumbnailUrl: a.thumbnailUrl,
      adCopy: a.adCopy,
      headline: a.headline,
      description: a.description,
      cta: a.cta,
    });
    synced++;
  }
  return { ok: true, synced, message: `Demo mode: synced ${synced} sample ads to PostgreSQL` };
}

async function syncPagesDemo(): Promise<SyncOutcome> {
  const dbErr = requireDatabase();
  if (dbErr) return dbErr;

  let synced = 0;
  for (const p of connectedPages.filter(x => x.platform === 'facebook')) {
    await upsertConnectedPage({
      id: p.id,
      pageId: p.id,
      name: p.name,
      fans: p.fans,
      avatar: p.avatar,
      isConnected: p.isConnected,
    });
    synced++;
  }
  return { ok: true, synced, message: `Demo mode: synced ${synced} sample Facebook pages` };
}

async function syncInstagramDemo(): Promise<SyncOutcome> {
  const dbErr = requireDatabase();
  if (dbErr) return dbErr;

  let synced = 0;
  for (const a of connectedPages.filter(x => x.platform === 'instagram')) {
    await upsertInstagramAccount({
      id: a.id,
      accountId: a.id,
      username: a.name,
      followers: a.fans,
      avatar: a.avatar,
      isConnected: a.isConnected,
    });
    synced++;
  }
  for (const c of mockCampaigns.filter(x => x.platform === 'instagram')) {
    await upsertCampaign({
      id: c.id,
      platform: c.platform,
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      status: c.status,
      budget: c.budget,
    });
  }
  return { ok: true, synced, message: `Demo mode: synced ${synced} sample Instagram accounts` };
}

async function syncCampaignsDemo(): Promise<SyncOutcome> {
  const dbErr = requireDatabase();
  if (dbErr) return dbErr;

  for (const c of mockCampaigns) {
    await upsertCampaign({
      id: c.id,
      platform: c.platform,
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      status: c.status,
      budget: c.budget,
    });
  }
  return { ok: true, synced: mockCampaigns.length, message: `Demo mode: synced ${mockCampaigns.length} sample campaigns` };
}

/* ── Live Meta sync ── */

async function upsertPagesAndInstagramFromAccounts(pages: MetaPage[]): Promise<{
  syncedPages: number;
  syncedInstagram: number;
}> {
  let syncedPages = 0;
  let syncedInstagram = 0;

  for (const page of pages) {
    await upsertConnectedPage({
      id: `meta-page-${page.id}`,
      pageId: page.id,
      name: page.name,
      fans: '',
      avatar: '📄',
      isConnected: true,
      accessToken: page.access_token,
    });
    syncedPages++;

    const igId = extractInstagramBusinessAccountId(page.instagram_business_account);
    if (!igId) continue;

    await upsertInstagramAccount({
      id: `meta-ig-${igId}`,
      accountId: igId,
      username: `@${page.name.replace(/\s+/g, '').toLowerCase()}`,
      followers: '',
      avatar: '📸',
      isConnected: true,
      accessToken: page.access_token,
    });
    syncedInstagram++;
  }

  return { syncedPages, syncedInstagram };
}

export async function syncAdsFromMeta(): Promise<SyncOutcome> {
  if (isServerDemoMode()) return syncAdsDemo();

  const dbErr = requireDatabase();
  if (dbErr) return dbErr;
  const metaErr = validateOrError();
  if (metaErr) return metaErr;

  const token = getMetaConfig().accessToken;
  const accounts = await fetchAdAccounts(token);

  if (!accounts.length) {
    return {
      ok: true,
      synced: 0,
      message: 'No ad accounts found. Ensure your token has ads_read and business_management permissions.',
    };
  }

  let syncedAccounts = 0;
  let syncedCampaigns = 0;
  let syncedAdSets = 0;
  let syncedAds = 0;

  const campaignIdMap = new Map<string, string>();
  const adsetIdMap = new Map<string, string>();

  for (const account of accounts) {
    const accountDbId = `meta-act-${account.id.replace(/^act_/, '')}`;
    await upsertAdAccount({
      id: accountDbId,
      accountId: account.id,
      name: account.name,
      platform: 'facebook',
      spend: formatSpend(account.amount_spent, account.currency),
      status: mapAccountStatus(account.account_status),
      isConnected: account.account_status === 1,
    });
    syncedAccounts++;

    const campaigns = await fetchCampaigns(account.id, token);
    for (const camp of campaigns) {
      const campDbId = `meta-camp-${camp.id}`;
      campaignIdMap.set(camp.id, campDbId);
      const platform = detectAdPlatform(camp);
      await upsertCampaign({
        id: campDbId,
        platform,
        campaignId: camp.id,
        campaignName: camp.name,
        status: mapCampaignStatus(camp.status),
        budget: formatBudget(camp, account.currency),
        metaAccountId: account.id,
      });
      syncedCampaigns++;
    }

    const adsets = await fetchAdSets(account.id, token);
    for (const adset of adsets) {
      const adsetDbId = `meta-adset-${adset.id}`;
      adsetIdMap.set(adset.id, adsetDbId);
      const campDbId = adset.campaign_id ? campaignIdMap.get(adset.campaign_id) ?? null : null;
      await upsertAdSet({
        id: adsetDbId,
        campaignId: campDbId,
        adsetId: adset.id,
        adsetName: adset.name,
        platform: 'facebook',
      });
      syncedAdSets++;
    }

    let ads: Awaited<ReturnType<typeof fetchAds>>;
    try {
      ads = await fetchAds(account.id, token, { effectiveStatus: ['ACTIVE', 'PAUSED'] });
    } catch (err) {
      const msg = err instanceof MetaApiError ? err.message : String(err);
      console.warn(`[sync] Skipping ads for account ${account.id}: ${msg}`);
      continue;
    }

    for (const ad of ads) {
      let creative = ad.creative;
      if (
        creative?.id &&
        !creative.body &&
        !creative.image_url &&
        !creative.thumbnail_url &&
        !creative.object_story_spec
      ) {
        try {
          creative = await fetchAdCreative(creative.id, token);
        } catch {
          /* use partial creative from ad list query */
        }
      }

      const parsed = parseCreative(creative, ad.id);
      const campMetaId = ad.campaign?.id;
      const adsetMetaId = ad.adset?.id;

      await upsertAd({
        id: `meta-ad-${ad.id}`,
        platform: 'facebook',
        adId: ad.id,
        adName: ad.name,
        adsetName: ad.adset?.name || '',
        campaignName: ad.campaign?.name || '',
        adsetId: adsetMetaId ? adsetIdMap.get(adsetMetaId) ?? null : null,
        campaignId: campMetaId ? campaignIdMap.get(campMetaId) ?? null : null,
        originalAdUrl: parsed.originalAdUrl || '',
        mediaType: parsed.mediaType,
        mediaUrl: parsed.mediaUrl,
        thumbnailUrl: parsed.thumbnailUrl,
        adCopy: parsed.adCopy,
        headline: parsed.headline,
        description: parsed.description,
        cta: parsed.cta,
      });
      syncedAds++;
    }
  }

  const total = syncedAccounts + syncedCampaigns + syncedAdSets + syncedAds;
  return {
    ok: true,
    synced: total,
    message: `Synced from Meta: ${syncedAccounts} ad accounts, ${syncedCampaigns} campaigns, ${syncedAdSets} ad sets, ${syncedAds} ads with creatives`,
    details: { syncedAccounts, syncedCampaigns, syncedAdSets, syncedAds },
  };
}

export async function syncPagesFromMeta(): Promise<SyncOutcome> {
  if (isServerDemoMode()) return syncPagesDemo();

  const dbErr = requireDatabase();
  if (dbErr) return dbErr;
  const metaErr = validateOrError();
  if (metaErr) return metaErr;

  const token = getMetaConfig().accessToken;
  const pages = await fetchFacebookPages(token);

  if (!pages.length) {
    return {
      ok: true,
      synced: 0,
      message: 'No Facebook Pages found. Ensure your token has pages_show_list permission.',
    };
  }

  const warnings: string[] = [];
  const hasFeedContent = await tokenHasPermission('pages_read_user_content', token);
  if (!hasFeedContent) {
    warnings.push(ORGANIC_FEED_DISABLED_WARNING);
    console.warn(`[sync/pages] ${ORGANIC_FEED_DISABLED_WARNING}`);
  }

  const { syncedPages, syncedInstagram } = await upsertPagesAndInstagramFromAccounts(pages);

  let message = `Synced ${syncedPages} Facebook Page(s) via /me/accounts`;
  if (syncedInstagram > 0) {
    message += ` and ${syncedInstagram} linked Instagram Business account(s)`;
  }
  message += '. Webhook subscription is separate — use comment webhooks, not feed sync.';
  if (warnings.length) {
    message += ` Warning: ${warnings.join(' ')}`;
  }

  return {
    ok: true,
    synced: syncedPages + syncedInstagram,
    message,
    details: { syncedPages, syncedInstagram, warnings, pagesDiscovered: pages.length },
  };
}

export async function syncInstagramFromMeta(): Promise<SyncOutcome> {
  if (isServerDemoMode()) return syncInstagramDemo();

  const dbErr = requireDatabase();
  if (dbErr) return dbErr;
  const metaErr = validateOrError();
  if (metaErr) return metaErr;

  const token = getMetaConfig().accessToken;
  const pages = await fetchFacebookPages(token);

  if (!pages.length) {
    return {
      ok: true,
      synced: 0,
      message: 'No Facebook Pages found. Sync Pages first — Instagram accounts are discovered from /me/accounts.',
    };
  }

  const { syncedInstagram } = await upsertPagesAndInstagramFromAccounts(pages);

  if (!syncedInstagram) {
    return {
      ok: true,
      synced: 0,
      message: 'No Instagram Business accounts linked to your Pages. Link IG to a Facebook Page in Meta Business Settings.',
    };
  }

  return {
    ok: true,
    synced: syncedInstagram,
    message: `Synced ${syncedInstagram} Instagram Business account(s) from /me/accounts (via linked Pages).`,
  };
}

export async function syncCampaignsFromMeta(): Promise<SyncOutcome> {
  if (isServerDemoMode()) return syncCampaignsDemo();

  const adsResult = await syncAdsFromMeta();
  if (!adsResult.ok) return adsResult;

  const campaigns = adsResult.details?.syncedCampaigns as number | undefined;
  return {
    ok: true,
    synced: campaigns ?? 0,
    message: campaigns != null
      ? `Synced ${campaigns} campaigns from Meta (via ad account sync)`
      : adsResult.message,
  };
}

export async function syncAllFromMeta(): Promise<SyncOutcome> {
  const pages = await syncPagesFromMeta();
  if (!pages.ok) return pages;

  const instagram = await syncInstagramFromMeta();
  if (!instagram.ok) return instagram;

  const ads = await syncAdsFromMeta();
  if (!ads.ok) return ads;

  return {
    ok: true,
    synced: pages.synced + instagram.synced + ads.synced,
    message: `Full sync complete. ${pages.message} ${instagram.message} ${ads.message}`,
    details: { pages, instagram, ads },
  };
}

export function syncErrorMessage(err: unknown): { message: string; status: number } {
  if (err instanceof MetaApiError) {
    return { message: err.message, status: err.status };
  }
  return { message: String(err), status: 500 };
}
