export type BrandLabel = 'Nobl' | 'Flo' | 'Unattributed';
export type BrandCode = 'NOBL' | 'FLO';

/** Env token labels that map to Flo Pilates ads. */
const FLO_LABEL_ALIASES = new Set(['FLO', 'APP2', 'META2', 'FLOPILATES', 'FLO-PILATES']);

/** Env token labels that map to Nobl Travel ads. */
const NOBL_LABEL_ALIASES = new Set(['NOBL', 'META3', 'NOBLTRAVEL']);

const NOBL_TOKEN_RE = /\bnobl[a-z]*\b/;
const FLO_TOKEN_RE = /\bflo(?:pilates|living|works|hq)?\b/;

export function inferBrand(input: {
  accountLabel?: string | null;
  campaignName?: string | null;
  adName?: string | null;
  pageName?: string | null;
}): BrandLabel {
  const value = [input.accountLabel, input.campaignName, input.adName, input.pageName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (NOBL_TOKEN_RE.test(value)) return 'Nobl';
  if (FLO_TOKEN_RE.test(value)) return 'Flo';
  return 'Unattributed';
}

/** Canonical brand code for sync lanes, SQL filters, and UI grouping. */
export function resolveBrandCode(input: {
  accountLabel?: string | null;
  campaignName?: string | null;
  adName?: string | null;
  pageName?: string | null;
}): BrandCode | null {
  const label = String(input.accountLabel || '').trim().toUpperCase();
  if (NOBL_LABEL_ALIASES.has(label) || label.includes('NOBL')) return 'NOBL';
  if (FLO_LABEL_ALIASES.has(label) || label.includes('FLO')) return 'FLO';

  const inferred = inferBrand(input);
  if (inferred === 'Nobl') return 'NOBL';
  if (inferred === 'Flo') return 'FLO';
  return null;
}

/** Normalize a Meta token label to FLO / NOBL when we can infer the brand. */
export function normalizeAccountLabel(
  rawLabel: string,
  hints?: { campaignName?: string | null; adName?: string | null }
): string {
  const code = resolveBrandCode({
    accountLabel: rawLabel,
    campaignName: hints?.campaignName,
    adName: hints?.adName,
  });
  if (code) return code;
  const trimmed = rawLabel.trim();
  return trimmed || 'DEFAULT';
}

/** SQL fragment: `$1` must be `'FLO'` or `'NOBL'`. */
export function brandAdSqlPredicate(alias: string): string {
  const text = `LOWER(COALESCE(${alias}.account_label, '') || ' ' || COALESCE(${alias}.campaign_name, '') || ' ' || COALESCE(${alias}.ad_name, ''))`;
  return `(CASE
    WHEN $1 = 'NOBL' THEN (
      ${alias}.account_label IN ('NOBL', 'META3', 'META')
      OR ${text} ~ '(^|[^a-z0-9])nobl[a-z]*([^a-z0-9]|$)'
    )
    WHEN $1 = 'FLO' THEN (
      ${alias}.account_label IN ('FLO', 'APP2', 'META2')
      OR ${text} ~ '(^|[^a-z0-9])flo(pilates|living|works|hq)?([^a-z0-9]|$)'
    )
    ELSE false
  END)`;
}
