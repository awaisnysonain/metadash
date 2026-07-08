import type { Comment, Ad } from '../types';
import { getAdForComment } from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(date = new Date()): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isToday(iso: string, now = Date.now()): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t >= startOfLocalDay(new Date(now));
}

export function isYesterday(iso: string, now = Date.now()): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const todayStart = startOfLocalDay(new Date(now));
  return t >= todayStart - DAY_MS && t < todayStart;
}

export function isOpenComment(comment: Comment): boolean {
  return comment.status !== 'Replied' && comment.status !== 'Ignored';
}

export function isWaitingForReply(comment: Comment): boolean {
  return comment.status === 'Unseen' || comment.status === 'Seen';
}

export function matchesStatusTab(comment: Comment, tab: string): boolean {
  if (tab === 'All') return true;
  if (tab === 'Unreplied') return isOpenComment(comment);
  return comment.status === tab;
}

export function commentMatchesAd(comment: Comment, ad: Pick<Ad, 'id' | 'adId' | 'adName'>): boolean {
  return (
    comment.adId === ad.adId ||
    comment.adId === ad.id ||
    (Boolean(ad.adName) && comment.adName === ad.adName)
  );
}

export function getCommentsForAd(comments: Comment[], ad: Pick<Ad, 'id' | 'adId' | 'adName'>, ads: Ad[] = []): Comment[] {
  return comments.filter(c => {
    if (commentMatchesAd(c, ad)) return true;
    const linked = getAdForComment(c, ads);
    return linked ? linked.id === ad.id || linked.adId === ad.adId : false;
  });
}

export function countDelta(today: number, yesterday: number): { delta: number; label: string } {
  const delta = today - yesterday;
  if (delta === 0) return { delta: 0, label: 'same as yesterday' };
  const abs = Math.abs(delta);
  return {
    delta,
    label: `${abs} ${abs === 1 ? 'comment' : 'comments'} ${delta > 0 ? 'more' : 'fewer'} than yesterday`,
  };
}

export function bucketByCalendarDay(
  comments: Comment[],
  filter: (c: Comment) => boolean,
  days = 7,
  now = Date.now()
): number[] {
  const counts = Array<number>(days).fill(0);
  const todayStart = startOfLocalDay(new Date(now));
  for (const c of comments) {
    if (!filter(c)) continue;
    const t = Date.parse(c.createdAt);
    if (Number.isNaN(t)) continue;
    const dayIndex = Math.floor((todayStart - startOfLocalDay(new Date(t))) / DAY_MS);
    if (dayIndex >= 0 && dayIndex < days) {
      counts[days - 1 - dayIndex] += 1;
    }
  }
  return counts;
}
