export type BrandLabel = 'Nobl' | 'Flo' | 'Unattributed';

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

  if (value.includes('nobl')) return 'Nobl';
  if (value.includes('flo')) return 'Flo';
  return 'Unattributed';
}
