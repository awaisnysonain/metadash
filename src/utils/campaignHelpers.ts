import { Comment, Campaign, Ad } from '../types';

/** Match comments to a campaign by name or Meta campaign ID */
export function getCommentsForCampaign(comments: Comment[], camp: Campaign): Comment[] {
  return comments.filter(
    c =>
      c.campaignName === camp.campaignName ||
      c.campaignId === camp.campaignId ||
      c.campaignId === camp.id
  );
}

/** Match ads to a campaign */
export function getAdsForCampaign(ads: Ad[], camp: Campaign): Ad[] {
  return ads.filter(
    ad =>
      ad.campaignName === camp.campaignName ||
      ad.id === camp.id
  );
}

/** Group campaigns by ad account label (NOBL, FLO, etc.) */
export function groupCampaignsByAccount(campaigns: Campaign[]): Record<string, Campaign[]> {
  const groups: Record<string, Campaign[]> = {};
  for (const camp of campaigns) {
    const key = camp.accountLabel || 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(camp);
  }
  return groups;
}

export function formatSpend(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}
