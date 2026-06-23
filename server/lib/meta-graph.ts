import { metaGraphGet, metaGraphPaginate, metaGraphPost } from './meta.js';

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
  fan_count?: number;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: MetaInstagramAccount;
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
const AD_FIELDS = [
  'id',
  'name',
  'status',
  'adset{id,name}',
  'campaign{id,name}',
  'creative{id,name,title,body,thumbnail_url,image_url,video_id,call_to_action_type,effective_object_story_id,object_story_spec}',
].join(',');

const PAGE_FIELDS = [
  'id',
  'name',
  'fan_count',
  'access_token',
  'picture{url}',
  'instagram_business_account{id,username,profile_picture_url,followers_count}',
].join(',');

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

/** 4. Fetch ads for an ad account (includes embedded creative) */
export async function fetchAds(adAccountId: string, accessToken?: string): Promise<MetaAd[]> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  return metaGraphPaginate<MetaAd>(
    `/${actId}/ads?fields=${AD_FIELDS}&limit=100`,
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

/** 6. Fetch Facebook Pages the user manages */
export async function fetchFacebookPages(accessToken?: string): Promise<MetaPage[]> {
  return metaGraphPaginate<MetaPage>(`/me/accounts?fields=${PAGE_FIELDS}&limit=100`, accessToken);
}

/** 7. Fetch Instagram Business accounts linked to managed Pages */
export async function fetchInstagramBusinessAccounts(accessToken?: string): Promise<
  Array<MetaInstagramAccount & { linkedPageId: string; linkedPageName: string; pageAccessToken?: string }>
> {
  const pages = await fetchFacebookPages(accessToken);
  const accounts: Array<
    MetaInstagramAccount & { linkedPageId: string; linkedPageName: string; pageAccessToken?: string }
  > = [];

  for (const page of pages) {
    if (page.instagram_business_account?.id) {
      accounts.push({
        ...page.instagram_business_account,
        linkedPageId: page.id,
        linkedPageName: page.name,
        pageAccessToken: page.access_token,
      });
      continue;
    }

    try {
      const detail = await metaGraphGet<{ instagram_business_account?: MetaInstagramAccount }>(
        `/${page.id}?fields=instagram_business_account{id,username,profile_picture_url,followers_count}`,
        page.access_token || accessToken
      );
      if (detail.instagram_business_account?.id) {
        accounts.push({
          ...detail.instagram_business_account,
          linkedPageId: page.id,
          linkedPageName: page.name,
          pageAccessToken: page.access_token,
        });
      }
    } catch {
      /* page may not have linked IG account */
    }
  }

  return accounts;
}

/** 8. Subscribe connected Pages to app webhooks */
export async function subscribePagesToWebhooks(
  pages: MetaPage[],
  subscribedFields = 'feed,mention,comments,messages'
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
