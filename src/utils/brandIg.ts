/** Brand-owned Instagram usernames for source tagging (lowercase, no @). */
const DEFAULT_BRAND_IG_USERNAMES = ['nobltravel', 'myflopilates'];

export function normalizeIgUsername(username: string): string {
  return username.trim().replace(/^@+/, '').toLowerCase();
}

export function getBrandIgUsernames(): string[] {
  const raw = import.meta.env.VITE_ORGANIC_IG_BRAND_USERNAMES?.trim();
  if (!raw) return [...DEFAULT_BRAND_IG_USERNAMES];
  const parsed = raw.split(',').map(normalizeIgUsername).filter(Boolean);
  return parsed.length > 0 ? parsed : [...DEFAULT_BRAND_IG_USERNAMES];
}

export function isBrandIgUsername(username?: string | null): boolean {
  if (!username?.trim()) return false;
  return getBrandIgUsernames().includes(normalizeIgUsername(username));
}

export function igHandleFromOrganicLabel(adName?: string | null): string {
  if (!adName) return '';
  const match = adName.match(/Organic\s*·\s*@?([A-Za-z0-9._]+)/i);
  return match ? normalizeIgUsername(match[1]) : '';
}
