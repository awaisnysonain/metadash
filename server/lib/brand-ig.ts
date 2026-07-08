/** Brand-owned Instagram usernames for organic sync (lowercase, no @). */
const DEFAULT_BRAND_IG_USERNAMES = ['nobltravel', 'myflopilates'];

export function normalizeIgUsername(username: string): string {
  return username.trim().replace(/^@+/, '').toLowerCase();
}

export function getBrandIgUsernames(): string[] {
  const raw = process.env.COMMENT_SYNC_ORGANIC_IG_BRAND_USERNAMES?.trim();
  if (!raw) return [...DEFAULT_BRAND_IG_USERNAMES];
  const parsed = raw.split(',').map(normalizeIgUsername).filter(Boolean);
  return parsed.length > 0 ? parsed : [...DEFAULT_BRAND_IG_USERNAMES];
}

export function isBrandIgUsername(username?: string | null): boolean {
  if (!username?.trim()) return false;
  return getBrandIgUsernames().includes(normalizeIgUsername(username));
}

/** When true, organic IG sweep only polls brand pages — not creator/whitelist accounts. */
export function isOrganicIgBrandOnly(): boolean {
  return process.env.COMMENT_SYNC_ORGANIC_IG_BRAND_ONLY !== 'false';
}
