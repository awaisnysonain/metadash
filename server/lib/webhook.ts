import type { CommentPriority, CommentSentiment } from '../../src/types';

interface AutoTagResult {
  tags: string[];
  priority?: CommentPriority;
  sentiment?: CommentSentiment;
}

const KEYWORD_RULES: Array<{ keywords: string[]; tag: string; priority?: CommentPriority; sentiment?: CommentSentiment }> = [
  { keywords: ['scam', 'fraud', 'refund'], tag: 'Angry Customer', priority: 'Urgent', sentiment: 'Complaint' },
  { keywords: ['ship', 'tracking', 'delivery'], tag: 'Shipping Delay', priority: 'High', sentiment: 'Complaint' },
  { keywords: ['code', 'coupon', 'discount'], tag: 'Promo Code', priority: 'High', sentiment: 'Question' },
  { keywords: ['price', 'cost', 'expensive'], tag: 'Pricing Inquiry', priority: 'Medium', sentiment: 'Question' },
  { keywords: ['love', 'great', 'recommend', 'awesome'], tag: 'Testimonial', priority: 'Low', sentiment: 'Positive' },
  { keywords: ['?'], tag: 'General Inquiry', priority: 'Medium', sentiment: 'Question' },
];

export function autoTagComment(text: string): AutoTagResult {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  let priority: CommentPriority | undefined;
  let sentiment: CommentSentiment | undefined;

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      if (!tags.includes(rule.tag)) tags.push(rule.tag);
      if (rule.priority === 'Urgent') priority = 'Urgent';
      else if (rule.priority === 'High' && priority !== 'Urgent') priority = 'High';
      else if (rule.priority === 'Medium' && !priority) priority = 'Medium';
      if (rule.sentiment) sentiment = rule.sentiment;
    }
  }

  return {
    tags: tags.length ? tags : ['Webhook'],
    priority: priority ?? 'Medium',
    sentiment: sentiment ?? 'Neutral',
  };
}

export function mapWebhookComment(payload: {
  platform: 'facebook' | 'instagram';
  commentId: string;
  message: string;
  fromName: string;
  fromId?: string;
  createdTime?: string;
  postId?: string;
  pageId?: string;
  pageName?: string;
  instagramAccountId?: string;
  instagramAccountName?: string;
  campaignName?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
}) {
  const tagging = autoTagComment(payload.message);
  const now = payload.createdTime || new Date().toISOString();
  const id = `wh-${payload.platform}-${payload.commentId}`;

  return {
    id,
    platform: payload.platform,
    comment_id: payload.commentId,
    comment_text: payload.message,
    commenter_name: payload.fromName,
    commenter_profile_url: payload.fromId
      ? `https://graph.facebook.com/${payload.fromId}/picture?type=square`
      : '',
    original_comment_url: payload.platform === 'facebook'
      ? `https://facebook.com/${payload.postId}?comment_id=${payload.commentId}`
      : `https://instagram.com/p/${payload.postId}/#${payload.commentId}`,
    campaign_id: payload.campaignName ? `camp-${payload.campaignName.slice(0, 8)}` : null,
    campaign_name: payload.campaignName ?? 'Unknown Campaign',
    adset_id: payload.adsetName ? `adset-${payload.adsetName.slice(0, 8)}` : null,
    adset_name: payload.adsetName ?? 'Unknown Ad Set',
    ad_id: payload.adId ?? null,
    ad_name: payload.adName ?? 'Unknown Ad',
    page_id: payload.pageId ?? null,
    page_name: payload.pageName ?? null,
    instagram_account_id: payload.instagramAccountId ?? null,
    instagram_account_name: payload.instagramAccountName ?? null,
    status: 'Unseen',
    priority: tagging.priority,
    sentiment: tagging.sentiment,
    assigned_to: null,
    tags: tagging.tags,
    created_at: now,
    updated_at: now,
    replied_at: null,
    seen_at: null,
  };
}
