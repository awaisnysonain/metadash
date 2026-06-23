import type {
  Comment,
  CommentNote,
  ActivityLog,
  TeamMember,
  AutoTaggingRule,
  Campaign,
  Ad,
  CommentStatus,
  CommentPriority,
  CommentSentiment,
  Platform,
} from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function commentToRow(c: Comment): Record<string, unknown> {
  return {
    id: c.id,
    platform: c.platform,
    comment_id: c.commentId,
    comment_text: c.commentText,
    commenter_name: c.commenterName,
    commenter_profile_url: c.commenterProfileUrl,
    original_comment_url: c.originalCommentUrl,
    campaign_id: c.campaignId,
    campaign_name: c.campaignName,
    adset_id: c.adsetId,
    adset_name: c.adsetName,
    ad_id: c.adId,
    ad_name: c.adName,
    page_id: c.pageId ?? null,
    page_name: c.pageName ?? null,
    instagram_account_id: c.instagramAccountId ?? null,
    instagram_account_name: c.instagramAccountName ?? null,
    status: c.status,
    priority: c.priority,
    sentiment: c.sentiment,
    assigned_to: c.assignedTo ?? null,
    tags: c.tags,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    replied_at: c.repliedAt ?? null,
    seen_at: c.seenAt ?? null,
  };
}

export function rowToComment(row: any): Comment {
  return {
    id: row.id,
    platform: row.platform as Platform,
    commentId: row.comment_id,
    commentText: row.comment_text,
    commenterName: row.commenter_name,
    commenterProfileUrl: row.commenter_profile_url ?? '',
    originalCommentUrl: row.original_comment_url,
    campaignId: row.campaign_id ?? '',
    campaignName: row.campaign_name ?? '',
    adsetId: row.adset_id ?? '',
    adsetName: row.adset_name ?? '',
    adId: row.ad_id ?? '',
    adName: row.ad_name ?? '',
    pageId: row.page_id ?? undefined,
    pageName: row.page_name ?? undefined,
    instagramAccountId: row.instagram_account_id ?? undefined,
    instagramAccountName: row.instagram_account_name ?? undefined,
    status: row.status as CommentStatus,
    priority: row.priority as CommentPriority,
    sentiment: row.sentiment as CommentSentiment,
    assignedTo: row.assigned_to ?? undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    repliedAt: row.replied_at ?? undefined,
    seenAt: row.seen_at ?? undefined,
  };
}

export function noteToRow(n: CommentNote): Record<string, unknown> {
  return {
    id: n.id,
    comment_id: n.commentId,
    user_id: n.userId,
    user_name: n.userName,
    user_avatar: n.userAvatar,
    note: n.note,
    created_at: n.createdAt,
  };
}

export function rowToNote(row: any): CommentNote {
  return {
    id: row.id,
    commentId: row.comment_id,
    userId: row.user_id,
    userName: row.user_name,
    userAvatar: row.user_avatar ?? '',
    note: row.note,
    createdAt: row.created_at,
  };
}

export function logToRow(l: ActivityLog): Record<string, unknown> {
  return {
    id: l.id,
    comment_id: l.commentId,
    user_id: l.userId,
    user_name: l.userName,
    action: l.action,
    old_value: l.oldValue,
    new_value: l.newValue,
    created_at: l.createdAt,
  };
}

export function rowToLog(row: any): ActivityLog {
  return {
    id: row.id,
    commentId: row.comment_id,
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    oldValue: row.old_value ?? '',
    newValue: row.new_value ?? '',
    createdAt: row.created_at,
  };
}

export function teamToRow(m: TeamMember): Record<string, unknown> {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    avatar_url: m.avatarUrl,
  };
}

export function rowToTeam(row: any): TeamMember {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url,
  };
}

export function ruleToRow(r: AutoTaggingRule): Record<string, unknown> {
  return {
    id: r.id,
    keyword: r.keyword,
    tag: r.tag,
    priority: r.priority,
    is_active: r.isActive,
  };
}

export function rowToRule(row: any): AutoTaggingRule {
  return {
    id: row.id,
    keyword: row.keyword,
    tag: row.tag,
    priority: row.priority as CommentPriority,
    isActive: row.is_active ?? true,
  };
}

export function campaignToRow(c: Campaign): Record<string, unknown> {
  return {
    id: c.id,
    platform: c.platform,
    campaign_id: c.campaignId,
    campaign_name: c.campaignName,
    status: c.status,
    budget: c.budget,
    comments_count: c.commentsCount,
  };
}

export function rowToCampaign(row: any): Campaign {
  return {
    id: row.id,
    platform: row.platform as Platform,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    status: row.status,
    budget: row.budget ?? '',
    commentsCount: row.comments_count ?? 0,
  };
}

export function adToRow(a: Ad): Record<string, unknown> {
  return {
    id: a.id,
    platform: a.platform,
    ad_id: a.adId,
    ad_name: a.adName,
    adset_name: a.adsetName,
    campaign_name: a.campaignName,
    original_ad_url: a.originalAdUrl,
    original_comment_url: a.originalCommentUrl ?? null,
    media_type: a.mediaType,
    media_url: a.mediaUrl ?? null,
    thumbnail_url: a.thumbnailUrl ?? null,
    ad_copy: a.adCopy,
    headline: a.headline ?? null,
    description: a.description ?? null,
    cta: a.cta ?? null,
    likes_count: a.likesCount ?? null,
    shares_count: a.sharesCount ?? null,
    comments_count: a.commentsCount ?? null,
  };
}

export function rowToAd(row: any): Ad {
  return {
    id: row.id,
    platform: row.platform as Platform,
    adId: row.ad_id,
    adName: row.ad_name,
    adsetName: row.adset_name ?? '',
    campaignName: row.campaign_name ?? '',
    originalAdUrl: row.original_ad_url ?? '',
    originalCommentUrl: row.original_comment_url ?? undefined,
    mediaType: row.media_type ?? 'image',
    mediaUrl: row.media_url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    adCopy: row.ad_copy ?? '',
    headline: row.headline ?? undefined,
    description: row.description ?? undefined,
    cta: row.cta ?? undefined,
    likesCount: row.likes_count ?? undefined,
    sharesCount: row.shares_count ?? undefined,
    commentsCount: row.comments_count ?? undefined,
  };
}
