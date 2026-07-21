/* eslint-disable @typescript-eslint/no-explicit-any */

export function rowToComment(row: any) {
  const rawViews = row.views ?? [];
  const views = Array.isArray(rawViews) ? rawViews : typeof rawViews === 'string' ? JSON.parse(rawViews) : [];
  return {
    id: row.id,
    platform: row.platform,
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
    parentCommentId: row.parent_comment_id ?? undefined,
    status: row.status,
    priority: row.priority,
    sentiment: row.sentiment,
    assignedTo: row.assigned_to ?? undefined,
    tags: Array.isArray(row.tags) ? row.tags : typeof row.tags === 'string' ? JSON.parse(row.tags) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    repliedAt: row.replied_at ?? undefined,
    seenAt: row.seen_at ?? undefined,
    views: views.map((view: any) => ({
      userId: view.userId ?? view.user_id,
      userName: view.userName ?? view.user_name,
      viewedAt: view.viewedAt ?? view.viewed_at,
    })),
  };
}

export function rowToNote(row: any) {
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

export function rowToLog(row: any) {
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

export function rowToTeam(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url,
  };
}

export function rowToRule(row: any) {
  return {
    id: row.id,
    keyword: row.keyword,
    tag: row.tag,
    priority: row.priority,
    isActive: row.is_active ?? true,
  };
}

export function rowToCampaign(row: any) {
  return {
    id: row.id,
    platform: row.platform,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    status: row.status,
    budget: row.budget ?? '',
    commentsCount: row.comments_count ?? 0,
    accountLabel: row.account_label ?? undefined,
    metaAccountId: row.meta_account_id ?? undefined,
  };
}

export function rowToAd(row: any) {
  return {
    id: row.id,
    platform: row.platform,
    adId: row.ad_id,
    adName: row.ad_name,
    adsetId: row.adset_id ?? undefined,
    adsetName: row.adset_name ?? '',
    campaignId: row.campaign_id ?? undefined,
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
    effectiveStatus: row.effective_status ?? undefined,
    configuredStatus: row.configured_status ?? undefined,
    instagramMediaId: row.instagram_media_id ?? undefined,
    postStoryId: row.post_story_id ?? undefined,
    spend: row.spend != null ? Number(row.spend) : undefined,
    recentSpend: row.recent_spend != null ? Number(row.recent_spend) : undefined,
    accountLabel: row.account_label ?? undefined,
    metaAccountId: row.meta_account_id ?? undefined,
  };
}
