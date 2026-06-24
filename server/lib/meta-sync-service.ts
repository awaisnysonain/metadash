import { isDatabaseConfigured, hasDatabaseUrl } from '../db/pool.js';
import {
  upsertAdAccount,
  upsertCampaign,
  upsertAdSet,
  upsertAd,
  upsertConnectedPage,
  upsertInstagramAccount,
  pruneStaleInstagramAccounts,
  realignCommentPlatformsFromAds,
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
  fetchAdAccountById,
  fetchCampaigns,
  fetchAdSets,
  fetchAds,
  fetchAdCreative,
  fetchManagedPages,
  fetchInstagramProfile,
  fetchAdSpendInsights,
  extractInstagramBusinessAccountId,
  type MetaPage,
  type MetaAdSet,
  parseCreative,
  mapCampaignStatus,
  mapAccountStatus,
  formatBudget,
  formatSpend,
  detectAdPlatform,
  detectAdPlatformForAd,
  PAGE_ACCOUNT_FIELDS,
} from './meta-graph.js';
import { getConfiguredMetaAccounts, getPageSyncTokenSources } from './meta-accounts.js';
import { mockAds, mockCampaigns, connectedPages } from '../../src/data.js';

export interface SyncOutcome {
  ok: boolean;
  synced: number;
  message: string;
  pagesFound?: number;
  pagesSaved?: number;
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

function hasInstagramOnlyPlacement(platforms?: string[]): boolean {
  if (!platforms?.length) return false;
  const normalized = platforms.map(p => p.toLowerCase());
  return normalized.includes('instagram') && !normalized.includes('facebook');
}

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

  const configuredAccounts = getConfiguredMetaAccounts();
  if (!configuredAccounts.length) {
    return { ok: false, synced: 0, message: 'No Meta ad accounts configured. Set NOBL_META_* / FLO_META_* or META_ACCESS_TOKEN in .env' };
  }

  let syncedAccounts = 0;
  let syncedCampaigns = 0;
  let syncedAdSets = 0;
  let syncedAds = 0;

  for (const config of configuredAccounts) {
    const token = config.accessToken;
    let accounts = config.accountId
      ? [await fetchAdAccountById(config.accountId, token)].filter(Boolean)
      : await fetchAdAccounts(token);

    if (config.accountId && !accounts.length) {
      accounts = [{ id: config.accountId, name: config.label, account_status: 1 }];
    }

    for (const account of accounts) {
      if (!account) continue;
      const accountDbId = `meta-act-${account.id.replace(/^act_/, '')}`;
      await upsertAdAccount({
        id: accountDbId,
        accountId: account.id,
        name: `${config.label} — ${account.name}`,
        platform: 'facebook',
        spend: formatSpend(account.amount_spent, account.currency),
        status: mapAccountStatus(account.account_status),
        isConnected: account.account_status === 1,
      });
      syncedAccounts++;

      const campaignIdMap = new Map<string, string>();
      const adsetIdMap = new Map<string, string>();
      const adsetByMetaId = new Map<string, MetaAdSet>();

      const spendMap = await fetchAdSpendInsights(account.id, token);

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
          accountLabel: config.label,
        });
        syncedCampaigns++;
      }

      const adsets = await fetchAdSets(account.id, token);
      const instagramActorIds = new Set(
        adsets.map(a => a.instagram_actor_id).filter((id): id is string => Boolean(id))
      );
      for (const adset of adsets) {
        const adsetDbId = `meta-adset-${adset.id}`;
        adsetIdMap.set(adset.id, adsetDbId);
        adsetByMetaId.set(adset.id, adset);
        const campDbId = adset.campaign_id ? campaignIdMap.get(adset.campaign_id) ?? null : null;
        const adsetPlatform = hasInstagramOnlyPlacement(adset.publisher_platforms) ? 'instagram' : 'facebook';
        await upsertAdSet({
          id: adsetDbId,
          campaignId: campDbId,
          adsetId: adset.id,
          adsetName: adset.name,
          platform: adsetPlatform,
        });
        syncedAdSets++;
      }

      let ads: Awaited<ReturnType<typeof fetchAds>>;
      try {
        ads = await fetchAds(account.id, token, { effectiveStatus: ['ACTIVE', 'PAUSED'] });
      } catch (err) {
        const msg = err instanceof MetaApiError ? err.message : String(err);
        console.warn(`[sync] Skipping ads for ${config.label} ${account.id}: ${msg}`);
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
            /* use partial creative */
          }
        }

        const parsed = parseCreative(creative, ad.id);
        const campMetaId = ad.campaign?.id;
        const adsetMetaId = ad.adset?.id;
        const postStoryId = creative?.effective_object_story_id ?? null;
        const campaign = campMetaId ? campaigns.find(c => c.id === campMetaId) : undefined;
        const adset = adsetMetaId ? adsetByMetaId.get(adsetMetaId) : undefined;
        const platform = detectAdPlatformForAd({
          campaign,
          adset,
          creative,
          storyId: postStoryId,
          instagramPageIds: instagramActorIds,
        });
        const adSpend = spendMap.get(ad.id);

        await upsertAd({
          id: `meta-ad-${ad.id}`,
          platform,
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
          postStoryId,
          spend: adSpend,
          accountLabel: config.label,
          metaAccountId: account.id,
        });
        syncedAds++;
      }
    }
  }

  const total = syncedAccounts + syncedCampaigns + syncedAdSets + syncedAds;
  const realigned = await realignCommentPlatformsFromAds();
  if (realigned > 0) {
    console.log(`[sync/ads] Reclassified ${realigned} comment(s) as Instagram`);
  }
  return {
    ok: true,
    synced: total,
    message: `Synced from Meta: ${syncedAccounts} ad accounts, ${syncedCampaigns} campaigns, ${syncedAdSets} ad sets, ${syncedAds} ads (${configuredAccounts.map(a => a.label).join(', ')})`,
    details: { syncedAccounts, syncedCampaigns, syncedAdSets, syncedAds, accounts: configuredAccounts.map(a => a.label) },
  };
}

export async function syncPagesFromMeta(): Promise<SyncOutcome> {
  if (isServerDemoMode()) return syncPagesDemo();

  const dbErr = requireDatabase();
  if (dbErr) return dbErr;
  const metaErr = validateOrError();
  if (metaErr) return metaErr;

  const configuredAccounts = getPageSyncTokenSources();
  if (!configuredAccounts.length) {
    return { ok: false, synced: 0, pagesFound: 0, pagesSaved: 0, message: 'No Meta tokens configured.' };
  }

  const seenPageIds = new Set<string>();
  const syncedIgAccountIds: string[] = [];
  let pagesFound = 0;
  let pagesSaved = 0;
  const saveErrors: string[] = [];
  const rawResponses: unknown[] = [];

  for (const config of configuredAccounts) {
    const token = config.accessToken;
    console.log(`[sync/pages] Syncing pages for ${config.label}, token length: ${token.length}`);

    const { pages, rawResponses: raw } = await fetchManagedPages(token);
    rawResponses.push(...raw);
    pagesFound += pages.length;

    for (const page of pages) {
      if (seenPageIds.has(page.id)) continue;
      seenPageIds.add(page.id);

      try {
        await upsertConnectedPage({
          id: `meta-page-${page.id}`,
          pageId: page.id,
          name: `${page.name}`,
          fans: page.fan_count ? String(page.fan_count) : '',
          avatar: page.picture?.data?.url ? page.picture.data.url : '📄',
          isConnected: true,
          accessToken: page.access_token,
        });
        pagesSaved++;

        const igId = extractInstagramBusinessAccountId(page.instagram_business_account);
        if (igId) {
          let username = `@${page.name.replace(/\s+/g, '').toLowerCase()}`;
          let followers = '';
          const igProfile = await fetchInstagramProfile(igId, page.access_token || token);
          if (igProfile?.username) username = `@${igProfile.username}`;
          if (igProfile?.followers_count) followers = `${igProfile.followers_count.toLocaleString()} followers`;

          await upsertInstagramAccount({
            id: `meta-ig-${igId}`,
            accountId: igId,
            username,
            followers,
            avatar: igProfile?.profile_picture_url ? igProfile.profile_picture_url : '📸',
            isConnected: true,
            accessToken: page.access_token,
          });
          syncedIgAccountIds.push(igId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        saveErrors.push(`${page.id}: ${msg}`);
      }
    }
  }

  const warnings: string[] = [];
  const primaryToken = configuredAccounts[0]?.accessToken;
  if (primaryToken) {
    const hasFeedContent = await tokenHasPermission('pages_read_user_content', primaryToken);
    if (!hasFeedContent) warnings.push(ORGANIC_FEED_DISABLED_WARNING);
  }

  if (pagesFound === 0) {
    return {
      ok: true,
      synced: 0,
      pagesFound: 0,
      pagesSaved: 0,
      message: 'No Facebook Pages returned. Ensure tokens have pages_show_list permission.',
      details: { rawMetaResponses: rawResponses, accounts: configuredAccounts.map(a => a.label) },
    };
  }

  const pruned = await pruneStaleInstagramAccounts(syncedIgAccountIds);
  if (pruned > 0) {
    console.log(`[sync/pages] Removed ${pruned} stale Instagram account row(s)`);
  }

  let message = `Synced ${pagesSaved}/${pagesFound} Facebook Page(s) from ${configuredAccounts.map(a => a.label).join(', ')}.`;
  if (saveErrors.length) message += ` ${saveErrors.length} save error(s).`;
  if (warnings.length) message += ` ${warnings.join(' ')}`;

  return {
    ok: true,
    synced: pagesSaved,
    pagesFound,
    pagesSaved,
    message,
    details: { saveErrors, warnings, rawMetaResponses: rawResponses },
  };
}

export async function syncInstagramFromMeta(): Promise<SyncOutcome> {
  if (isServerDemoMode()) return syncInstagramDemo();

  const dbErr = requireDatabase();
  if (dbErr) return dbErr;
  const metaErr = validateOrError();
  if (metaErr) return metaErr;

  const configuredAccounts = getPageSyncTokenSources();
  if (!configuredAccounts.length) {
    return { ok: false, synced: 0, message: 'No Meta tokens configured.' };
  }

  const seenPageIds = new Set<string>();
  const syncedIgAccountIds: string[] = [];
  let syncedInstagram = 0;

  for (const config of configuredAccounts) {
    const { pages } = await fetchManagedPages(config.accessToken);
    for (const page of pages) {
      if (seenPageIds.has(page.id)) continue;
      seenPageIds.add(page.id);

      const igId = extractInstagramBusinessAccountId(page.instagram_business_account);
      if (!igId) continue;

      let username = `@${page.name.replace(/\s+/g, '').toLowerCase()}`;
      let followers = '';
      const igProfile = await fetchInstagramProfile(igId, page.access_token || config.accessToken);
      if (igProfile?.username) username = `@${igProfile.username}`;
      if (igProfile?.followers_count) followers = `${igProfile.followers_count.toLocaleString()} followers`;

      await upsertInstagramAccount({
        id: `meta-ig-${igId}`,
        accountId: igId,
        username,
        followers,
        avatar: igProfile?.profile_picture_url ? igProfile.profile_picture_url : '📸',
        isConnected: true,
        accessToken: page.access_token,
      });
      syncedIgAccountIds.push(igId);
      syncedInstagram++;
    }
  }

  await pruneStaleInstagramAccounts(syncedIgAccountIds);

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
    message: `Synced ${syncedInstagram} Instagram Business account(s) from linked Pages (${configuredAccounts.map(a => a.label).join(', ')}).`,
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
