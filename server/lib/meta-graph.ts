import { metaGraphGet, metaGraphPaginate, metaGraphPaginateWithRaw, metaGraphPost, getMetaConfig, MetaApiError } from './meta.js';

/* ── Meta Graph API response shapes ── */

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status?: number;
  amount_spent?: string;
  currency?: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  objective?: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  campaign_id?: string;
  status?: string;
}

export interface MetaCreative {
  id?: string;
  name?: string;
  title?: string;
  body?: string;
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  call_to_action_type?: string;
  effective_object_story_id?: string;
  object_story_spec?: {
    link_data?: {
      message?: string;
      name?: string;
      description?: string;
      picture?: string;
      link?: string;
      call_to_action?: { type?: string };
    };
    video_data?: {
      message?: string;
      title?: string;
      image_url?: string;
      video_id?: string;
      call_to_action?: { type?: string };
    };
    photo_data?: {
      caption?: string;
      url?: string;
    };
  };
}

export interface MetaAd {
  id: string;
  name: string;
  status?: string;
  adset?: { id?: string; name?: string };
  campaign?: { id?: string; name?: string };
  creative?: MetaCreative;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
  instagram_business_account?: { id: string } | string;
  fan_count?: number;
  picture?: { data?: { url?: string } };
}

export interface MetaInstagramAccount {
  id: string;
  username?: string;
  profile_picture_url?: string;
  followers_count?: number;
}

export interface ParsedCreative {
  headline?: string;
  adCopy: string;
  description?: string;
  cta?: string;
  mediaType: 'image' | 'video';
  mediaUrl?: string;
  thumbnailUrl?: string;
  originalAdUrl?: string;
}

export interface WebhookSubscribeResult {
  pageId: string;
  pageName: string;
  success: boolean;
  error?: string;
}

/* ── Fetch functions ── */

const AD_ACCOUNT_FIELDS = 'id,name,account_status,amount_spent,currency';
const CAMPAIGN_FIELDS = 'id,name,status,daily_budget,lifetime_budget,objective';
const ADSET_FIELDS = 'id,name,campaign_id,status';
// Keep ad list queries light — object_story_spec on many ads triggers Meta "reduce data" errors.
const AD_LIST_FIELDS = [
  'id',
  'name',
  'status',
  'adset{id,name}',
  'campaign{id,name}',
  'creative{id,name,title,body,thumbnail_url,image_url,video_id,call_to_action_type,effective_object_story_id}',
].join(',');

/** Fields used for Page sync — matches Graph API Explorer. */
export const PAGE_SYNC_FIELDS = 'id,name,access_token';

/** Lightweight page discovery — optional extra fields for IG discovery. */
export const PAGE_ACCOUNT_FIELDS = 'id,name,access_token,instagram_business_account,tasks';

export function extractInstagramBusinessAccountId(
  ref?: MetaPage['instagram_business_account']
): string | undefined {
  if (!ref) return undefined;
  return typeof ref === 'string' ? ref : ref.id;
}

/** 1. Fetch ad accounts for the authenticated user */
export async function fetchAdAccounts(accessToken?: string): Promise<MetaAdAccount[]> {
  return metaGraphPaginate<MetaAdAccount>(
    `/me/adaccounts?fields=${AD_ACCOUNT_FIELDS}&limit=100`,
    accessToken
  );
}

/** 2. Fetch campaigns for an ad account */
export async function fetchCampaigns(adAccountId: string, accessToken?: string): Promise<MetaCampaign[]> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  return metaGraphPaginate<MetaCampaign>(
    `/${actId}/campaigns?fields=${CAMPAIGN_FIELDS}&limit=100`,
    accessToken
  );
}

/** 3. Fetch ad sets for an ad account */
export async function fetchAdSets(adAccountId: string, accessToken?: string): Promise<MetaAdSet[]> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  return metaGraphPaginate<MetaAdSet>(
    `/${actId}/adsets?fields=${ADSET_FIELDS}&limit=100`,
    accessToken
  );
}

/** 4. Fetch ads for an ad account (creative details fetched separately when needed) */
export async function fetchAds(
  adAccountId: string,
  accessToken?: string,
  opts?: { limit?: number; effectiveStatus?: string[] }
): Promise<MetaAd[]> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const limit = opts?.limit ?? 25;
  const statusFilter = opts?.effectiveStatus?.length
    ? `&effective_status=[${opts.effectiveStatus.map(s => `"${s}"`).join(',')}]`
    : '';
  return metaGraphPaginate<MetaAd>(
    `/${actId}/ads?fields=${AD_LIST_FIELDS}&limit=${limit}${statusFilter}`,
    accessToken
  );
}

/** 5. Fetch a single ad creative with full detail */
export async function fetchAdCreative(creativeId: string, accessToken?: string): Promise<MetaCreative> {
  const fields = [
    'id',
    'name',
    'title',
    'body',
    'thumbnail_url',
    'image_url',
    'video_id',
    'call_to_action_type',
    'effective_object_story_id',
    'object_story_spec',
  ].join(',');
  return metaGraphGet<MetaCreative>(`/${creativeId}?fields=${fields}`, accessToken);
}

/** Fetch managed Pages with raw Meta response logging (for sync/debug). */
export async function fetchManagedPages(accessToken?: string): Promise<{
  pages: MetaPage[];
  rawResponses: unknown[];
}> {
  const { items, rawPages } = await metaGraphPaginateWithRaw<MetaPage>(
    `/me/accounts?fields=${PAGE_SYNC_FIELDS}&limit=100`,
    accessToken,
    'sync/pages'
  );
  return { pages: items, rawResponses: rawPages };
}

/** 6. Fetch Facebook Pages the user manages (Page discovery only — no feed/post reads). */
export async function fetchFacebookPages(accessToken?: string): Promise<MetaPage[]> {
  const { pages } = await fetchManagedPages(accessToken);
  return pages;
}

/** 7. Instagram Business accounts linked to managed Pages (from /me/accounts only). */
export async function fetchInstagramBusinessAccounts(accessToken?: string): Promise<
  Array<{ id: string; linkedPageId: string; linkedPageName: string; pageAccessToken?: string }>
> {
  const pages = await fetchFacebookPages(accessToken);
  const accounts: Array<{ id: string; linkedPageId: string; linkedPageName: string; pageAccessToken?: string }> = [];

  for (const page of pages) {
    const igId = extractInstagramBusinessAccountId(page.instagram_business_account);
    if (!igId) continue;
    accounts.push({
      id: igId,
      linkedPageId: page.id,
      linkedPageName: page.name,
      pageAccessToken: page.access_token,
    });
  }

  return accounts;
}

/** 8. Subscribe connected Pages to app webhooks (separate from Page discovery sync). */
export async function subscribePagesToWebhooks(
  pages: MetaPage[],
  subscribedFields = 'comments,messages,mention'
): Promise<WebhookSubscribeResult[]> {
  const results: WebhookSubscribeResult[] = [];

  for (const page of pages) {
    const pageToken = page.access_token;
    if (!pageToken) {
      results.push({
        pageId: page.id,
        pageName: page.name,
        success: false,
        error: 'No page access token — re-authorize with pages_show_list and pages_manage_metadata',
      });
      continue;
    }

    try {
      await metaGraphPost<{ success?: boolean }>(
        `/${page.id}/subscribed_apps`,
        { subscribed_fields: subscribedFields },
        pageToken
      );
      results.push({ pageId: page.id, pageName: page.name, success: true });
    } catch (err) {
      results.push({
        pageId: page.id,
        pageName: page.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

/* ── Creative parsing helpers ── */

function formatCta(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function parseCreative(creative?: MetaCreative, adId?: string): ParsedCreative {
  const result: ParsedCreative = {
    adCopy: creative?.body || '',
    mediaType: 'image',
  };

  if (creative?.title) result.headline = creative.title;
  if (creative?.thumbnail_url) result.thumbnailUrl = creative.thumbnail_url;

  if (creative?.call_to_action_type) {
    result.cta = formatCta(creative.call_to_action_type);
  }

  if (creative?.video_id) {
    result.mediaType = 'video';
    result.mediaUrl = `https://www.facebook.com/video.php?v=${creative.video_id}`;
  } else if (creative?.image_url) {
    result.mediaUrl = creative.image_url;
    result.thumbnailUrl = result.thumbnailUrl || creative.image_url;
  }

  const spec = creative?.object_story_spec;
  if (spec?.link_data) {
    const ld = spec.link_data;
    result.adCopy = ld.message || result.adCopy;
    result.headline = ld.name || result.headline;
    result.description = ld.description;
    if (ld.call_to_action?.type) result.cta = formatCta(ld.call_to_action.type);
    if (ld.picture) {
      result.mediaUrl = ld.picture;
      result.thumbnailUrl = ld.picture;
      result.mediaType = 'image';
    }
    if (ld.link) result.originalAdUrl = ld.link;
  }

  if (spec?.video_data) {
    result.mediaType = 'video';
    result.adCopy = spec.video_data.message || result.adCopy;
    result.headline = spec.video_data.title || result.headline;
    if (spec.video_data.image_url) result.thumbnailUrl = spec.video_data.image_url;
    if (spec.video_data.video_id) {
      result.mediaUrl = `https://www.facebook.com/video.php?v=${spec.video_data.video_id}`;
    }
    if (spec.video_data.call_to_action?.type) result.cta = formatCta(spec.video_data.call_to_action.type);
  }

  if (spec?.photo_data) {
    result.adCopy = spec.photo_data.caption || result.adCopy;
    if (spec.photo_data.url) {
      result.mediaUrl = spec.photo_data.url;
      result.thumbnailUrl = spec.photo_data.url;
      result.mediaType = 'image';
    }
  }

  if (creative?.effective_object_story_id) {
    const parts = creative.effective_object_story_id.split('_');
    if (parts.length >= 2) {
      result.originalAdUrl = `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
    }
  }

  if (!result.originalAdUrl && adId) {
    result.originalAdUrl = `https://www.facebook.com/ads/library/?id=${adId}`;
  }

  return result;
}

export function mapCampaignStatus(status?: string): 'Active' | 'Paused' | 'Ended' {
  const s = (status || '').toUpperCase();
  if (s === 'PAUSED') return 'Paused';
  if (s === 'ARCHIVED' || s === 'DELETED' || s === 'COMPLETED') return 'Ended';
  return 'Active';
}

export function mapAccountStatus(status?: number): string {
  if (status === 1) return 'Active';
  if (status === 2) return 'Disabled';
  if (status === 3) return 'Unsettled';
  if (status === 7) return 'Pending Review';
  if (status === 9) return 'In Grace Period';
  return 'Unknown';
}

export function formatBudget(campaign: MetaCampaign, currency = 'USD'): string {
  if (campaign.daily_budget) {
    const amount = Number(campaign.daily_budget) / 100;
    return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}/day`;
  }
  if (campaign.lifetime_budget) {
    const amount = Number(campaign.lifetime_budget) / 100;
    return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} lifetime`;
  }
  void currency;
  return '';
}

export function formatSpend(amountSpent?: string, currency = 'USD'): string {
  if (!amountSpent) return '';
  const amount = Number(amountSpent) / 100;
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${currency})`;
}

export function formatFollowers(count?: number): string {
  if (count == null) return '';
  return `${count.toLocaleString()} Followers`;
}

export function detectAdPlatform(campaign?: MetaCampaign): 'facebook' | 'instagram' {
  const objective = (campaign?.objective || '').toLowerCase();
  if (objective.includes('instagram')) return 'instagram';
  return 'facebook';
}

/* ── Comment fetch ── */

export interface MetaComment {
  id: string;
  message?: string;
  from?: { id?: string; name?: string };
  created_time?: string;
  permalink_url?: string;
}

export interface ResolvedAdStory {
  storyId: string | null;
  pageId: string | null;
  creativeId: string | null;
}

export function pageIdFromStoryId(storyId: string | null | undefined): string | null {
  if (!storyId || !storyId.includes('_')) return null;
  return storyId.split('_')[0] || null;
}

export async function resolveAdStoryId(adId: string, accessToken?: string): Promise<ResolvedAdStory> {
  const empty: ResolvedAdStory = { storyId: null, pageId: null, creativeId: null };

  try {
    const res = await metaGraphGet<{
      creative?: {
        id?: string;
        effective_object_story_id?: string;
        object_story_id?: string;
      };
    }>(`/${adId}?fields=creative{id,effective_object_story_id,object_story_id}`, accessToken);

    const creative = res.creative;
    let storyId = creative?.effective_object_story_id || creative?.object_story_id || null;

    if (!storyId && creative?.id) {
      const full = await metaGraphGet<{
        effective_object_story_id?: string;
        object_story_id?: string;
      }>(
        `/${creative.id}?fields=effective_object_story_id,object_story_id`,
        accessToken
      );
      storyId = full.effective_object_story_id || full.object_story_id || null;
    }

    return {
      storyId,
      pageId: pageIdFromStoryId(storyId),
      creativeId: creative?.id ?? null,
    };
  } catch (err) {
    if (err instanceof MetaApiError && err.code === 190) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[comments] Could not resolve story for ad ${adId}: ${msg}`);
    return empty;
  }
}

/** @deprecated use resolveAdStoryId */
export async function fetchAdEffectiveStoryId(adId: string, accessToken?: string): Promise<string | null> {
  const resolved = await resolveAdStoryId(adId, accessToken);
  return resolved.storyId;
}

async function fetchStoryCommentsWithToken(
  storyId: string,
  token: string,
  opts?: { since?: number; until?: number; limit?: number }
): Promise<MetaComment[]> {
  const fields = 'id,message,from,created_time,permalink_url';
  let path = `/${storyId}/comments?fields=${fields}&limit=${opts?.limit ?? 100}`;
  if (opts?.since) path += `&since=${opts.since}`;
  if (opts?.until) path += `&until=${opts.until}`;
  return metaGraphPaginate<MetaComment>(path, token);
}

export async function fetchStoryComments(
  storyId: string,
  accessToken?: string,
  opts?: { since?: number; until?: number; limit?: number; pageAccessToken?: string | null }
): Promise<MetaComment[]> {
  const pageToken = opts?.pageAccessToken?.trim();
  const userToken = accessToken || getMetaConfig().accessToken;

  if (pageToken) {
    try {
      return await fetchStoryCommentsWithToken(storyId, pageToken, opts);
    } catch (err) {
      const code = err instanceof MetaApiError ? err.code : undefined;
      console.warn(`[comments] Page token fetch failed for ${storyId}${code ? ` (${code})` : ''}, trying user token`);
    }
  }

  if (!userToken) throw new MetaApiError('No access token available for comment fetch', { status: 400 });
  return fetchStoryCommentsWithToken(storyId, userToken, opts);
}
