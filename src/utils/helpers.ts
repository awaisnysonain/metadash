import { Comment, Ad, CommentStatus, CommentPriority, CommentSentiment, Platform } from '../types';
import { igHandleFromOrganicLabel, isBrandIgUsername, normalizeIgUsername } from './brandIg';

export const getAdForComment = (comment: Comment, ads: Ad[]): Ad | undefined =>
  ads.find(ad =>
    ad.id === comment.adId ||
    ad.adId === comment.adId ||
    ad.postStoryId === comment.adId ||
    ad.instagramMediaId === comment.adId
  );

export function safeExternalUrl(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function commentExternalUrl(comment: Comment): string | undefined {
  const safe = safeExternalUrl(comment.originalCommentUrl);
  if (!safe) return undefined;

  if (comment.platform !== 'instagram' || !comment.commentId) return safe;

  try {
    const parsed = new URL(safe);
    if (!parsed.hostname.includes('instagram.com')) return safe;
    if (!parsed.searchParams.has('comment_id')) {
      parsed.searchParams.set('comment_id', comment.commentId);
    }
    return parsed.toString();
  } catch {
    return safe;
  }
}

export function commentLinkLabel(platform: Platform): string {
  return platform === 'instagram' ? 'Open Instagram comment' : 'Open on Facebook';
}

export function adLinkLabel(url?: string | null): string {
  const safe = safeExternalUrl(url);
  if (!safe) return 'Ad link unavailable';
  if (safe.includes('facebook.com/ads/library')) return 'Open in Ads Library';
  if (safe.includes('facebook.com')) return 'Open Meta post';
  return 'Open landing page';
}

export type BrandLabel = 'Nobl' | 'Flo' | 'Unattributed';
export type SourceCategory = 'Brand page' | 'Creator / Whitelist' | 'Third-party page' | 'Organic';

// Word-boundary matching so 'nobl' inside 'noble' still counts but 'flo' doesn't fire on
// 'workflow'/'flower'/'florist'/'flourish'.
const NOBL_TOKEN_RE = /\bnobl[a-z]*\b/;
const FLO_TOKEN_RE = /\bflo(?:pilates|living|works|hq)?\b/;
// Common brand-owned page-name substrings (case-insensitive). Same defensive rules.
const NOBL_PAGE_RE = /\bnobl[a-z]*\b|\bnyson[a-z]*\b|trusted[- ]?luggage/;
const FLO_PAGE_RE = /\bflo(?:pilates|living|works|hq)?\b/;

function joinLower(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function inferBrandLabel(comment?: Comment, ad?: Ad): BrandLabel {
  // Prefer the account label — normalized token aliases from production env.
  const label = (ad?.accountLabel || '').toUpperCase();
  if (label === 'NOBL' || label === 'META3' || label === 'META') return 'Nobl';
  if (label === 'FLO' || label === 'APP2' || label === 'META2') return 'Flo';

  const text = joinLower(
    comment?.campaignName,
    ad?.campaignName,
    comment?.adName,
    ad?.adName,
    comment?.pageName,
    comment?.instagramAccountName,
  );
  if (NOBL_TOKEN_RE.test(text)) return 'Nobl';
  if (FLO_TOKEN_RE.test(text)) return 'Flo';
  return 'Unattributed';
}

export function brandChipClass(brand: BrandLabel): string {
  if (brand === 'Nobl') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (brand === 'Flo') return 'bg-pink-50 text-pink-700 border-pink-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

// Explicit ad-name markers put there by media buyers.
const WHITELIST_MARKERS = /\b(wl|whitelist(?:ed|ing)?|spark[- ]?ad|dark[- ]?post|partnership)\b/;
const CREATOR_MARKERS = /\b(ugc|creator|influencer|content[- ]?creator|athlete|ambassador)\b/;
// Adset naming pattern many brands use for organic-styled placements.
const ORGANIC_MARKERS = /\borganic\b/;

function pageLooksBrandOwned(brand: BrandLabel, sourceName: string): boolean {
  if (!sourceName) return true; // no page info yet — assume brand until proven otherwise
  if (brand === 'Nobl') return NOBL_PAGE_RE.test(sourceName);
  if (brand === 'Flo') return FLO_PAGE_RE.test(sourceName);
  return false;
}

function igHandleFromComment(comment?: Comment): string {
  const fromAccount = comment?.instagramAccountName?.trim();
  if (fromAccount) return normalizeIgUsername(fromAccount);
  return igHandleFromOrganicLabel(comment?.adName);
}

function isOrganicLabeledComment(comment?: Comment, ad?: Ad): boolean {
  if (!ad) return true;
  return comment?.campaignName === 'Organic' || Boolean(comment?.adName?.startsWith('Organic'));
}

export function inferSourceCategory(comment?: Comment, ad?: Ad): SourceCategory {
  const linkedAd = ad;
  const isOrganicRow = isOrganicLabeledComment(comment, linkedAd);
  const handle = igHandleFromComment(comment);

  if (isOrganicRow) {
    if (handle && !isBrandIgUsername(handle)) return 'Creator / Whitelist';
    return 'Organic';
  }

  const brand = inferBrandLabel(comment, linkedAd);
  const adText = joinLower(linkedAd!.adName, linkedAd!.campaignName, linkedAd!.adsetName, comment?.adName, comment?.campaignName);
  const sourceName = joinLower(comment?.pageName, comment?.instagramAccountName);
  const brandOwned = pageLooksBrandOwned(brand, sourceName);

  if (sourceName && !brandOwned) {
    if (WHITELIST_MARKERS.test(adText) || CREATOR_MARKERS.test(adText)) return 'Creator / Whitelist';
    return 'Third-party page';
  }

  if (WHITELIST_MARKERS.test(adText) || CREATOR_MARKERS.test(adText)) return 'Creator / Whitelist';
  if (ORGANIC_MARKERS.test(adText)) return 'Organic';

  return 'Brand page';
}

export function sourceChipClass(source: SourceCategory): string {
  if (source === 'Creator / Whitelist') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (source === 'Third-party page') return 'bg-cyan-50 text-cyan-700 border-cyan-200';
  if (source === 'Organic') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

const GENERIC_COMMENTER_LABELS = new Set(['Unknown User', 'Commenter', 'Facebook User', 'Facebook commenter']);

export function displayCommenterName(name: string): string {
  if (!name || GENERIC_COMMENTER_LABELS.has(name)) return 'Facebook commenter';
  return name;
}

export function isGenericCommenterName(name: string): boolean {
  return !name || GENERIC_COMMENTER_LABELS.has(name);
}

export function commenterAvatarUrl(comment: Comment): string | undefined {
  const url = comment.commenterProfileUrl?.trim();
  if (url) {
    try {
      const parsed = new URL(url);
      const facebookId = parsed.hostname.includes('facebook.com') && parsed.pathname.endsWith('/profile.php')
        ? parsed.searchParams.get('id')
        : undefined;
      if (facebookId) return `https://graph.facebook.com/${encodeURIComponent(facebookId)}/picture?type=large`;
      return url;
    } catch {
      return url;
    }
  }

  if (comment.platform === 'instagram') {
    const username = displayCommenterName(comment.commenterName).replace(/^@/, '').trim();
    if (username && !isGenericCommenterName(username)) {
      return `https://unavatar.io/instagram/${encodeURIComponent(username)}`;
    }
  }

  return undefined;
}

export function commenterInitial(name: string): string {
  return displayCommenterName(name).charAt(0).toUpperCase();
}

const PAKISTAN_TIME_ZONE = 'Asia/Karachi';

function parseDate(timeStr?: string): Date | null {
  if (!timeStr) return null;
  const date = new Date(timeStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const formatRelativeTime = (timeStr?: string): string => {
  const date = parseDate(timeStr);
  if (!date) return 'Unknown time';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 45) return 'just now';

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const [unit, seconds] = units.find(([, unitSeconds]) => absSeconds >= unitSeconds) ?? ['second', 1];
  const value = Math.round(diffSeconds / seconds);
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit);
};

export const formatCommentTime = (timeStr: string): string => formatRelativeTime(timeStr);

export const formatFullTime = (timeStr?: string): string => {
  const date = parseDate(timeStr);
  if (!date) return 'N/A';
  const pkTime = date.toLocaleString('en-US', {
    timeZone: PAKISTAN_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${pkTime} PKT`;
};

export const statusStyles: Record<CommentStatus, string> = {
  Unseen: 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-100',
  Seen: 'bg-sky-50 text-sky-700 border-sky-200',
  Replied: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Ignored: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const priorityStyles: Record<CommentPriority, string> = {
  Urgent: 'bg-red-50 text-red-700 border-red-200',
  High: 'bg-amber-50 text-amber-700 border-amber-200',
  Medium: 'bg-blue-50 text-blue-700 border-blue-200',
  Low: 'bg-slate-50 text-slate-600 border-slate-200',
};

export const sentimentStyles: Record<CommentSentiment, string> = {
  Positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Question: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  Complaint: 'bg-red-50 text-red-700 border-red-200',
  Negative: 'bg-orange-50 text-orange-700 border-orange-200',
};

export const platformStyles: Record<Platform, { badge: string; icon: string; label: string }> = {
  facebook: {
    badge: 'bg-[#1877F2]/10 text-[#1877F2] border-[#1877F2]/20',
    icon: 'text-[#1877F2]',
    label: 'Facebook',
  },
  instagram: {
    badge: 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-pink-600 border-pink-200',
    icon: 'text-pink-600',
    label: 'Instagram',
  },
};

export const groupCommentsByDate = (comments: Comment[]): { date: string; count: number }[] => {
  const map = new Map<string, number>();
  comments.forEach(c => {
    const key = new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .slice(-7);
};
