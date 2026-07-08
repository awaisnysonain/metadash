/**
 * Configured Meta ad accounts — each has its own access token in .env.
 * Admin credentials stay separate; these are for ads/pages/comments sync.
 */

import { normalizeAccountLabel, resolveBrandCode } from './brand.js';

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
  const cleanLabel = normalizeAccountLabel(label.trim() || `META${accounts.length + 1}`);
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

function isExcludedTokenKey(key: string): boolean {
  return /(^|_)FLO(_|$)|(^|_)NOBL(_|$)/i.test(key);
}

function looksLikeMetaAccessTokenKey(key: string, value: string): boolean {
  if (isExcludedTokenKey(key)) return false;
  if (!value.trim() || value.trim().length < 80) return false;
  if (/VERIFY|SECRET|WEBHOOK|SLACK|OPENAI/i.test(key)) return false;
  if (/^META_?\d+_ACCESS_TOKEN$/i.test(key) || /^META_TOKEN_\d+(_ACCESS_TOKEN)?$/i.test(key)) return false;
  return /(META|FACEBOOK|FB).*TOKEN|TOKEN.*(META|FACEBOOK|FB)|ACCESS_TOKEN/i.test(key);
}

function addIndexedMetaTokens(accounts: MetaAccountConfig[]): void {
  for (let i = 1; i <= 8; i++) {
    const configuredLabel = firstEnv(`META_${i}_LABEL`, `META${i}_LABEL`, `META_TOKEN_${i}_LABEL`);
    const label = configuredLabel && !isExcludedTokenKey(configuredLabel) ? configuredLabel : `META${i}`;
    const accessToken = firstEnv(
      `META_${i}_ACCESS_TOKEN`,
      `META${i}_ACCESS_TOKEN`,
      `META_TOKEN_${i}`,
      `META_TOKEN_${i}_ACCESS_TOKEN`
    );
    const accountIds = splitAccountIds(firstEnv(
      `META_${i}_ACCOUNT_IDS`,
      `META${i}_ACCOUNT_IDS`,
      `META_TOKEN_${i}_ACCOUNT_IDS`
    ));
    addAccountToken(accounts, label, accessToken, accountIds);
  }
}

export function getConfiguredMetaAccounts(): MetaAccountConfig[] {
  const accounts: MetaAccountConfig[] = [];
  const defaultToken = process.env.META_ACCESS_TOKEN?.trim();

  addIndexedMetaTokens(accounts);

  for (const [key, value] of Object.entries(process.env)) {
    if (!looksLikeMetaAccessTokenKey(key, value ?? '')) continue;
    const label = key.replace(/_?ACCESS_TOKEN$/i, '').replace(/_?TOKEN$/i, '') || 'META';
    addAccountToken(accounts, label, value ?? '', []);
  }

  const seen = new Set<string>();
  const unique = accounts.filter(account => {
    const key = `${account.accountId}|${account.accessToken}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0 && defaultToken) {
    unique.push({ label: 'DEFAULT', accountId: '', accessToken: defaultToken });
  }

  return unique.map(account => ({
    ...account,
    label: normalizeAccountLabel(account.label),
  }));
}

/** Labels that should resolve to the same token set (APP2 → FLO, META3 → NOBL). */
function labelLookupKeys(label: string): string[] {
  const upper = label.trim().toUpperCase();
  const code = resolveBrandCode({ accountLabel: upper });
  if (code === 'FLO') return ['FLO', 'APP2', 'META2', upper];
  if (code === 'NOBL') return ['NOBL', 'META3', 'META', upper];
  return [upper];
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

  const lookupKeys = new Set(labelLookupKeys(accountIdOrLabel));
  const byLabel = accounts.filter(a => labelLookupKeys(a.label).some(k => lookupKeys.has(k)));
  if (byLabel.length > 0) return [...new Set(byLabel.map(a => a.accessToken))];

  if (fallbackLabel) {
    const fbKeys = new Set(labelLookupKeys(fallbackLabel));
    const byFallbackLabel = accounts.filter(a => labelLookupKeys(a.label).some(k => fbKeys.has(k)));
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
