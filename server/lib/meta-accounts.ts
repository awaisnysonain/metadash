/**
 * Configured Meta ad accounts — each has its own access token in .env.
 * Admin credentials stay separate; these are for ads/pages/comments sync.
 */

export interface MetaAccountConfig {
  label: string;
  accountId: string;
  accessToken: string;
}

function normalizeAccountId(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

export function getConfiguredMetaAccounts(): MetaAccountConfig[] {
  const accounts: MetaAccountConfig[] = [];

  const noblId = process.env.NOBL_META_ACCOUNT_ID?.trim();
  const noblToken = process.env.NOBL_META_ACCESS_TOKEN?.trim();
  if (noblId && noblToken) {
    accounts.push({ label: 'NOBL', accountId: normalizeAccountId(noblId), accessToken: noblToken });
  }

  const floId = process.env.FLO_META_ACCOUNT_ID?.trim();
  const floToken = process.env.FLO_META_ACCESS_TOKEN?.trim();
  if (floId && floToken) {
    accounts.push({ label: 'FLO', accountId: normalizeAccountId(floId), accessToken: floToken });
  }

  const defaultToken = process.env.META_ACCESS_TOKEN?.trim();
  if (accounts.length === 0 && defaultToken) {
    accounts.push({ label: 'DEFAULT', accountId: '', accessToken: defaultToken });
  }

  return accounts;
}

export function getTokenForAccount(accountIdOrLabel: string): string | null {
  const accounts = getConfiguredMetaAccounts();
  const normalized = accountIdOrLabel.startsWith('act_')
    ? accountIdOrLabel
    : accountIdOrLabel
      ? `act_${accountIdOrLabel}`
      : accountIdOrLabel;

  const byId = accounts.find(
    a => a.accountId === normalized || a.accountId.replace(/^act_/, '') === accountIdOrLabel.replace(/^act_/, '')
  );
  if (byId) return byId.accessToken;

  const byLabel = accounts.find(a => a.label.toUpperCase() === accountIdOrLabel.toUpperCase());
  if (byLabel) return byLabel.accessToken;

  return accounts[0]?.accessToken ?? process.env.META_ACCESS_TOKEN?.trim() ?? null;
}

export function isAnyMetaAccountConfigured(): boolean {
  return getConfiguredMetaAccounts().length > 0;
}
