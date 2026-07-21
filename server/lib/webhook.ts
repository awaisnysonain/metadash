import type { CommentPriority, CommentSentiment } from '../../src/types.js';

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

function buildCommentRow(payload: {
  platform: 'facebook' | 'instagram';
  commentId: string;
  message: string;
  fromName: string;
  fromId?: string;
  profileUrl?: string;
  createdTime?: string;
  postId?: string;
  permalinkUrl?: string;
  pageId?: string;
  pageName?: string;
  instagramAccountId?: string;
  instagramAccountName?: string;
  parentCommentId?: string;
  campaignName?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  campaignMetaId?: string;
  adsetMetaId?: string;
  idPrefix?: string;
}) {
  const tagging = autoTagComment(payload.message);
  const now = payload.createdTime || new Date().toISOString();
  const prefix = payload.idPrefix ?? 'wh';
  const id = `${prefix}-${payload.platform}-${payload.commentId}`;

  let originalCommentUrl = payload.permalinkUrl ?? '';
  if (!originalCommentUrl) {
    originalCommentUrl = payload.platform === 'facebook'
      ? `https://www.facebook.com/${payload.postId}?comment_id=${payload.commentId}`
      : '';
  }

  return {
    id,
    platform: payload.platform,
    comment_id: payload.commentId,
    comment_text: payload.message,
    commenter_name: payload.fromName,
    commenter_profile_url:
      payload.profileUrl ||
      (payload.fromId ? `https://www.facebook.com/profile.php?id=${payload.fromId}` : ''),
    original_comment_url: originalCommentUrl,
    campaign_id: payload.campaignMetaId ?? null,
    campaign_name: payload.campaignName ?? 'Unknown Campaign',
    adset_id: payload.adsetMetaId ?? null,
    adset_name: payload.adsetName ?? 'Unknown Ad Set',
    ad_id: payload.adId ?? null,
    ad_name: payload.adName ?? 'Unknown Ad',
    page_id: payload.pageId ?? null,
    page_name: payload.pageName ?? null,
    instagram_account_id: payload.instagramAccountId ?? null,
    instagram_account_name: payload.instagramAccountName ?? null,
    parent_comment_id: payload.parentCommentId ?? null,
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

export function mapWebhookComment(payload: {
  platform: 'facebook' | 'instagram';
  commentId: string;
  message: string;
  fromName: string;
  fromId?: string;
  profileUrl?: string;
  createdTime?: string;
  postId?: string;
  permalinkUrl?: string;
  pageId?: string;
  pageName?: string;
  instagramAccountId?: string;
  instagramAccountName?: string;
  parentCommentId?: string;
  campaignName?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  campaignMetaId?: string;
  adsetMetaId?: string;
}) {
  return buildCommentRow(payload);
}

export function mapSyncedComment(payload: {
  platform: 'facebook' | 'instagram';
  commentId: string;
  message: string;
  fromName: string;
  fromId?: string;
  profileUrl?: string;
  createdTime?: string;
  postId?: string;
  permalinkUrl?: string;
  adId: string;
  adName: string;
  adsetName: string;
  campaignName: string;
  pageId?: string;
  pageName?: string;
  instagramAccountId?: string;
  instagramAccountName?: string;
  parentCommentId?: string;
  campaignMetaId?: string;
  adsetMetaId?: string;
}) {
  return buildCommentRow({ ...payload, idPrefix: 'sync' });
}
