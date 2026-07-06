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
  publisher_platforms?: string[];
  instagram_actor_id?: string;
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
  effective_instagram_media_id?: string;
  object_story_spec?: {
    instagram_user_id?: string;
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
  effective_status?: string;
  configured_status?: string;
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
const ADSET_FIELDS = 'id,name,campaign_id,status,publisher_platforms,instagram_actor_id';
// Keep ad list queries light — object_story_spec on many ads triggers Meta "reduce data" errors.
const AD_LIST_FIELDS = [
  'id',
  'name',
  'status',
  'effective_status',
  'configured_status',
  'adset{id,name}',
  'campaign{id,name}',
  'creative{id,name,title,body,thumbnail_url,image_url,video_id,call_to_action_type,effective_object_story_id,effective_instagram_media_id}',
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
    'effective_instagram_media_id',
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
    `/me/accounts?fields=${PAGE_ACCOUNT_FIELDS}&limit=100`,
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
  subscribedFields = 'feed,mention'
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

function hasInstagramPlacement(platforms?: string[]): boolean {
  return Boolean(platforms?.some(p => p.toLowerCase() === 'instagram'));
}

/** Best-effort platform for an ad using campaign objective, ad set placements, and creative signals. */
export function detectAdPlatformForAd(opts: {
  campaign?: MetaCampaign;
  adset?: MetaAdSet;
  creative?: MetaCreative;
  storyId?: string | null;
  instagramPageIds?: Set<string>;
}): 'facebook' | 'instagram' {
  const { campaign, adset, creative, storyId, instagramPageIds } = opts;

  if (detectAdPlatform(campaign) === 'instagram') return 'instagram';
  if (hasInstagramPlacement(adset?.publisher_platforms)) return 'instagram';
  if (adset?.instagram_actor_id) return 'instagram';

  const spec = creative?.object_story_spec;
  if (spec?.instagram_user_id) return 'instagram';

  const storyPageId = pageIdFromStoryId(storyId ?? creative?.effective_object_story_id ?? null);
  if (storyPageId && instagramPageIds?.has(storyPageId)) return 'instagram';

  const url = (creative?.object_story_spec?.link_data?.link || '').toLowerCase();
  if (url.includes('instagram.com')) return 'instagram';

  return 'facebook';
}

export function inferCommentPlatform(
  adPlatform: 'facebook' | 'instagram',
  comment?: { permalink_url?: string; username?: string }
): 'facebook' | 'instagram' {
  const link = (comment?.permalink_url || '').toLowerCase();
  if (link.includes('instagram.com')) return 'instagram';
  if (comment?.username?.trim()) return 'instagram';
  return adPlatform;
}

/** Fetch per-ad spend for an ad account (paginated; tries last_30d then maximum). */
export async function fetchAdSpendInsights(
  adAccountId: string,
  accessToken?: string,
  datePresets: string[] = ['last_30d', 'maximum']
): Promise<Map<string, number>> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const spendMap = new Map<string, number>();

  for (const preset of datePresets) {
    try {
      const rows = await metaGraphPaginate<{ ad_id?: string; spend?: string }>(
        `/${actId}/insights?level=ad&fields=ad_id,spend&date_preset=${preset}&limit=500`,
        accessToken
      );
      for (const row of rows) {
        if (row.ad_id && row.spend) {
          const amount = parseFloat(row.spend);
          if (amount > 0) {
            spendMap.set(row.ad_id, Math.max(spendMap.get(row.ad_id) ?? 0, amount));
          }
        }
      }
      if (spendMap.size > 0) break;
    } catch (err) {
      console.warn(
        `[insights] Could not fetch spend for ${actId} (${preset}):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return spendMap;
}

/** Fetch spend for the last 7 days, used for active top-spend filtering. */
export async function fetchRecentAdSpendInsights(
  adAccountId: string,
  accessToken?: string
): Promise<Map<string, number>> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const spendMap = new Map<string, number>();

  try {
    const rows = await metaGraphPaginate<{ ad_id?: string; spend?: string }>(
      `/${actId}/insights?level=ad&fields=ad_id,spend&date_preset=last_7d&limit=500`,
      accessToken
    );
    for (const row of rows) {
      if (row.ad_id && row.spend) {
        spendMap.set(row.ad_id, parseFloat(row.spend));
      }
    }
  } catch (err) {
    console.warn(
      `[insights] Could not fetch 7-day spend for ${actId}:`,
      err instanceof Error ? err.message : err
    );
  }

  return spendMap;
}

/** Fetch single ad account details by ID */
export async function fetchAdAccountById(
  accountId: string,
  accessToken?: string
): Promise<MetaAdAccount | null> {
  const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  try {
    return await metaGraphGet<MetaAdAccount>(`/${actId}?fields=${AD_ACCOUNT_FIELDS}`, accessToken);
  } catch {
    return null;
  }
}

/** Fetch Instagram profile for a business account ID */
export async function fetchInstagramProfile(
  igAccountId: string,
  accessToken?: string
): Promise<MetaInstagramAccount | null> {
  try {
    return await metaGraphGet<MetaInstagramAccount>(
      `/${igAccountId}?fields=id,username,profile_picture_url,followers_count`,
      accessToken
    );
  } catch {
    return null;
  }
}

export interface MetaComment {
  id: string;
  message?: string;
  from?: { id?: string; name?: string; picture?: { data?: { url?: string } } };
  username?: string;
  created_time?: string;
  permalink_url?: string;
}

export interface MetaInstagramComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  permalink?: string;
}

export interface MetaInstagramMediaDetails {
  id: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
}

function logMetaCommentDebug(message: string): void {
  if (process.env.META_COMMENT_DEBUG === 'true') console.warn(message);
}

export async function fetchInstagramMediaDetails(
  mediaId: string,
  accessToken?: string
): Promise<MetaInstagramMediaDetails | null> {
  const token = accessToken || getMetaConfig().accessToken;
  if (!token) return null;

  try {
    return await metaGraphGet<MetaInstagramMediaDetails>(
      `/${mediaId}?fields=id,media_type,media_url,thumbnail_url,permalink`,
      token
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logMetaCommentDebug(`[comments] Could not resolve Instagram media details for ${mediaId}: ${msg}`);
    return null;
  }
}

/** Recent media on a connected IG business account — used for organic-post comment sync. */
export async function fetchInstagramAccountRecentMedia(
  igAccountId: string,
  accessToken?: string,
  opts?: { limit?: number; sinceUnix?: number }
): Promise<Array<{ id: string; timestamp?: string; permalink?: string; mediaType?: string }>> {
  const token = accessToken || getMetaConfig().accessToken;
  if (!token) return [];

  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  const path = `/${igAccountId}/media?fields=id,timestamp,permalink,media_type&limit=${limit}`;

  try {
    const rows = await metaGraphPaginate<{ id: string; timestamp?: string; permalink?: string; media_type?: string }>(
      path,
      token
    );
    const cutoff = opts?.sinceUnix ?? 0;
    return rows
      .filter(row => {
        if (!row.id) return false;
        if (!cutoff || !row.timestamp) return true;
        const ts = Math.floor(new Date(row.timestamp).getTime() / 1000);
        return ts >= cutoff;
      })
      .map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        permalink: row.permalink,
        mediaType: row.media_type,
      }));
  } catch (err) {
    logMetaCommentDebug(`[organic] IG media list failed for ${igAccountId}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** Recent posts on a connected FB page — used for organic-post comment sync. */
export async function fetchPageRecentPosts(
  pageId: string,
  accessToken: string,
  opts?: { limit?: number; sinceUnix?: number }
): Promise<Array<{ id: string; createdTime?: string; permalinkUrl?: string }>> {
  if (!accessToken) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 100);
  const parts = [`fields=id,created_time,permalink_url`, `limit=${limit}`];
  if (opts?.sinceUnix) parts.push(`since=${opts.sinceUnix}`);
  // /published_posts requires pages_read_user_content; /posts falls back to a scoped set.
  const buildPath = (edge: 'published_posts' | 'posts') => `/${pageId}/${edge}?${parts.join('&')}`;

  try {
    const rows = await metaGraphPaginate<{ id: string; created_time?: string; permalink_url?: string }>(
      buildPath('published_posts'),
      accessToken
    );
    return rows.filter(r => r.id).map(row => ({
      id: row.id,
      createdTime: row.created_time,
      permalinkUrl: row.permalink_url,
    }));
  } catch (err) {
    if (err instanceof MetaApiError && (err.code === 100 || err.code === 200 || err.code === 10)) {
      try {
        const rows = await metaGraphPaginate<{ id: string; created_time?: string; permalink_url?: string }>(
          buildPath('posts'),
          accessToken
        );
        return rows.filter(r => r.id).map(row => ({
          id: row.id,
          createdTime: row.created_time,
          permalinkUrl: row.permalink_url,
        }));
      } catch (fallbackErr) {
        logMetaCommentDebug(`[organic] Page feed fallback failed for ${pageId}: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
        return [];
      }
    }
    logMetaCommentDebug(`[organic] Page feed fetch failed for ${pageId}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** Resolve an IG public shortcode (e.g. DadQnUbsRoY) to a media_id — used for diagnostics only. */
export async function resolveInstagramShortcode(
  shortcode: string,
  igAccountId: string,
  accessToken?: string
): Promise<string | null> {
  const token = accessToken || getMetaConfig().accessToken;
  if (!token || !shortcode?.trim() || !igAccountId?.trim()) return null;
  try {
    const res = await metaGraphGet<{ id?: string; media?: { id?: string } }>(
      `/ig_hashtag_search?user_id=${encodeURIComponent(igAccountId)}&shortcode=${encodeURIComponent(shortcode.trim())}`,
      token
    );
    return res.media?.id ?? res.id ?? null;
  } catch {
    return null;
  }
}

export async function fetchInstagramMediaPermalink(
  mediaId: string,
  accessToken?: string
): Promise<string | null> {
  const token = accessToken || getMetaConfig().accessToken;
  if (!token) return null;

  try {
    const media = await metaGraphGet<{ permalink?: string }>(`/${mediaId}?fields=permalink`, token);
    return media.permalink || null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logMetaCommentDebug(`[comments] Could not resolve Instagram permalink for media ${mediaId}: ${msg}`);
    return null;
  }
}

function instagramCommentPermalink(mediaPermalink: string | undefined | null, commentId: string): string | undefined {
  if (!mediaPermalink?.trim() || !commentId) return mediaPermalink || undefined;
  try {
    const parsed = new URL(mediaPermalink);
    if (!parsed.hostname.includes('instagram.com')) return mediaPermalink;
    parsed.searchParams.set('comment_id', commentId);
    return parsed.toString();
  } catch {
    return mediaPermalink;
  }
}

export function resolveCommenterInfo(from?: MetaComment['from'], username?: string): {
  name: string;
  profileUrl: string;
  id?: string;
} {
  const id = from?.id;
  const profileUrl =
    from?.picture?.data?.url || (id ? `https://graph.facebook.com/${encodeURIComponent(id)}/picture?type=large` : '');
  const name = from?.name?.trim() || username?.trim() || (id ? 'Facebook User' : 'Commenter');
  return { name, profileUrl, id };
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

export async function resolveAdInstagramMediaId(adId: string, accessToken?: string): Promise<string | null> {
  try {
    const res = await metaGraphGet<{
      creative?: {
        effective_instagram_media_id?: string;
      };
    }>(`/${adId}?fields=creative{effective_instagram_media_id}`, accessToken);
    return res.creative?.effective_instagram_media_id || null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logMetaCommentDebug(`[comments] Could not resolve Instagram media for ad ${adId}: ${msg}`);
    return null;
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
  const fields = 'id,message,from{id,name,picture},username,created_time,permalink_url,parent{id}';
  // filter=stream returns replies flattened alongside top-level comments — otherwise nested
  // replies never appear in the sync (the reply-thread edge is only queried on demand).
  const params = [`fields=${fields}`, `limit=${opts?.limit ?? 100}`, 'filter=stream', 'order=reverse_chronological'];
  if (opts?.since) params.push(`since=${opts.since}`);
  if (opts?.until) params.push(`until=${opts.until}`);
  const path = `/${storyId}/comments?${params.join('&')}`;
  try {
    return await metaGraphPaginate<MetaComment>(path, token);
  } catch (err) {
    // Some very old / archived posts reject filter=stream — fall back to the flat edge.
    if (err instanceof MetaApiError && (err.code === 100 || err.code === 12)) {
      const fallbackParams = [`fields=${fields}`, `limit=${opts?.limit ?? 100}`];
      if (opts?.since) fallbackParams.push(`since=${opts.since}`);
      if (opts?.until) fallbackParams.push(`until=${opts.until}`);
      return metaGraphPaginate<MetaComment>(`/${storyId}/comments?${fallbackParams.join('&')}`, token);
    }
    throw err;
  }
}

/** Re-fetch a single comment when the list response omits author fields. */
export async function enrichMetaCommentAuthor(
  comment: MetaComment,
  pageAccessToken: string | null | undefined
): Promise<MetaComment> {
  if (comment.from?.name?.trim() || comment.username?.trim()) return comment;
  if (!comment.id || !pageAccessToken?.trim()) return comment;

  try {
    const res = await metaGraphGet<MetaComment>(
      `/${comment.id}?fields=id,message,from{id,name,picture},username,permalink_url`,
      pageAccessToken
    );
    return { ...comment, ...res, message: res.message ?? comment.message };
  } catch {
    return comment;
  }
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

interface MetaInstagramCommentWithReplies extends MetaInstagramComment {
  replies?: { data?: MetaInstagramComment[] };
}

export async function fetchInstagramMediaComments(
  mediaId: string,
  accessToken?: string,
  opts?: { since?: number; until?: number; limit?: number; mediaPermalink?: string | null }
): Promise<MetaComment[]> {
  const token = accessToken || getMetaConfig().accessToken;
  if (!token) throw new MetaApiError('No access token available for Instagram comment fetch', { status: 400 });

  // Expand reply threads inline — IG's /comments edge does NOT include replies by default,
  // so without this every non-root comment is silently dropped by the sync.
  const replyFields = 'id,text,timestamp,username';
  const fields = `id,text,timestamp,username,permalink,replies.limit(50){${replyFields}}`;
  const limit = opts?.limit ?? 100;
  const buildPath = (withRange: boolean) => {
    const parts = [`fields=${fields}`, `limit=${limit}`];
    if (withRange && opts?.since) parts.push(`since=${opts.since}`);
    if (withRange && opts?.until) parts.push(`until=${opts.until}`);
    return `/${mediaId}/comments?${parts.join('&')}`;
  };

  let rows: MetaInstagramCommentWithReplies[];
  try {
    rows = await metaGraphPaginate<MetaInstagramCommentWithReplies>(buildPath(true), token);
  } catch (err) {
    // IG rejects since/until on some assets (code 100) — retry without the range.
    if (!(err instanceof MetaApiError) || err.code !== 100) throw err;
    rows = await metaGraphPaginate<MetaInstagramCommentWithReplies>(buildPath(false), token);
  }

  const mediaPermalink = opts?.mediaPermalink?.trim() || await fetchInstagramMediaPermalink(mediaId, token);
  const seen = new Set<string>();
  const out: MetaComment[] = [];

  const push = (row: MetaInstagramComment) => {
    if (!row?.id || seen.has(row.id)) return;
    seen.add(row.id);
    out.push({
      id: row.id,
      message: row.text,
      username: row.username,
      created_time: row.timestamp,
      permalink_url: instagramCommentPermalink(row.permalink || mediaPermalink, row.id),
    });
  };

  for (const row of rows) {
    push(row);
    for (const reply of row.replies?.data ?? []) push(reply);
  }

  return out;
}
