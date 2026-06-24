import { Comment, Ad, CommentStatus, CommentPriority, CommentSentiment, Platform } from '../types';

export const getAdForComment = (comment: Comment, ads: Ad[]): Ad | undefined =>
  ads.find(ad => ad.id === comment.adId || ad.adId === comment.adId);

export type BrandLabel = 'Nobl' | 'Flo' | 'Unattributed';

export function inferBrandLabel(comment?: Comment, ad?: Ad): BrandLabel {
  const text = [ad?.accountLabel, comment?.campaignName, ad?.campaignName, comment?.adName, ad?.adName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (text.includes('nobl')) return 'Nobl';
  if (text.includes('flo')) return 'Flo';
  return 'Unattributed';
}

export function brandChipClass(brand: BrandLabel): string {
  if (brand === 'Nobl') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (brand === 'Flo') return 'bg-pink-50 text-pink-700 border-pink-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
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
  if (!url || url.includes('profile.php')) return undefined;
  return url;
}

export function commenterInitial(name: string): string {
  return displayCommenterName(name).charAt(0).toUpperCase();
}

export const formatCommentTime = (timeStr: string): string => {
  const d = new Date(timeStr);
  return (
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' · ' +
    d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  );
};

export const formatFullTime = (timeStr?: string): string => {
  if (!timeStr) return 'N/A';
  return new Date(timeStr).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
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
