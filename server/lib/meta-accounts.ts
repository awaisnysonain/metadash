/**
 * Configured Meta ad accounts — each has its own access token in .env.
 * Admin credentials stay separate; these are for ads/pages/comments sync.
 */

export interface MetaAccountConfig {
  label: string;
  accountId: string;
  accessToken: string;
}

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

function normalizeAccountId(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function addAccountToken(
  accounts: MetaAccountConfig[],
  label: string,
  accessToken: string,
  accountIds: string[]
): void {
  const cleanToken = accessToken.trim();
  if (!cleanToken) return;
  const cleanLabel = label.trim() || `META${accounts.length + 1}`;
  const ids = accountIds.map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    accounts.push({ label: cleanLabel, accountId: '', accessToken: cleanToken });
    return;
  }
  for (const id of ids) {
    accounts.push({ label: cleanLabel, accountId: normalizeAccountId(id), accessToken: cleanToken });
  }
}

function splitAccountIds(value: string): string[] {
  return value.split(',').map(id => id.trim()).filter(Boolean);
}

function addIndexedMetaTokens(accounts: MetaAccountConfig[]): void {
  for (let i = 2; i <= 8; i++) {
    const label = firstEnv(`META_${i}_LABEL`, `META${i}_LABEL`) || `META${i}`;
    const accessToken = firstEnv(`META_${i}_ACCESS_TOKEN`, `META${i}_ACCESS_TOKEN`);
    const accountIds = splitAccountIds(firstEnv(`META_${i}_ACCOUNT_IDS`, `META${i}_ACCOUNT_IDS`));
    addAccountToken(accounts, label, accessToken, accountIds);
  }
}

export function getConfiguredMetaAccounts(): MetaAccountConfig[] {
  const accounts: MetaAccountConfig[] = [];
  const defaultToken = process.env.META_ACCESS_TOKEN?.trim();

  const noblId = process.env.NOBL_META_ACCOUNT_ID?.trim();
  const noblToken = process.env.NOBL_META_ACCESS_TOKEN?.trim() || defaultToken;
  if (noblId && noblToken) {
    accounts.push({ label: 'NOBL', accountId: normalizeAccountId(noblId), accessToken: noblToken });
  }

  const floId = process.env.FLO_META_ACCOUNT_ID?.trim();
  const floToken = process.env.FLO_META_ACCESS_TOKEN?.trim() || defaultToken;
  if (floId && floToken) {
    accounts.push({ label: 'FLO', accountId: normalizeAccountId(floId), accessToken: floToken });
  }

  addIndexedMetaTokens(accounts);

  if (accounts.length === 0 && defaultToken) {
    accounts.push({ label: 'DEFAULT', accountId: '', accessToken: defaultToken });
  }

  return accounts;
}

export function getTokenForAccount(accountIdOrLabel: string, fallbackLabel?: string): string | null {
  return getTokensForAccount(accountIdOrLabel, fallbackLabel)[0] ?? null;
}

export function getTokensForAccount(accountIdOrLabel: string, fallbackLabel?: string): string[] {
  const accounts = getConfiguredMetaAccounts();
  const normalized = accountIdOrLabel.startsWith('act_')
    ? accountIdOrLabel
    : accountIdOrLabel
      ? `act_${accountIdOrLabel}`
      : accountIdOrLabel;

  const byId = accounts.filter(
    a => a.accountId === normalized || a.accountId.replace(/^act_/, '') === accountIdOrLabel.replace(/^act_/, '')
  );
  if (byId.length > 0) return [...new Set(byId.map(a => a.accessToken))];

  const byLabel = accounts.filter(a => a.label.toUpperCase() === accountIdOrLabel.toUpperCase());
  if (byLabel.length > 0) return [...new Set(byLabel.map(a => a.accessToken))];

  if (fallbackLabel) {
    const byFallbackLabel = accounts.filter(a => a.label.toUpperCase() === fallbackLabel.toUpperCase());
    if (byFallbackLabel.length > 0) return [...new Set(byFallbackLabel.map(a => a.accessToken))];
  }

  return [...new Set(accounts.map(a => a.accessToken).filter(Boolean))];
}

export function isAnyMetaAccountConfigured(): boolean {
  return getConfiguredMetaAccounts().length > 0;
}

/** Tokens to use for /me/accounts page discovery (includes META_ACCESS_TOKEN when distinct from NOBL/FLO). */
export function getPageSyncTokenSources(): Array<{ label: string; accessToken: string }> {
  const sources = getConfiguredMetaAccounts().map(a => ({ label: a.label, accessToken: a.accessToken }));
  const defaultToken = process.env.META_ACCESS_TOKEN?.trim();
  if (defaultToken && !sources.some(s => s.accessToken === defaultToken)) {
    sources.push({ label: 'META', accessToken: defaultToken });
  }
  return sources.filter((source, index, all) => all.findIndex(s => s.accessToken === source.accessToken) === index);
}
