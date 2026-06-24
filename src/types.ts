export type Platform = 'facebook' | 'instagram';

export type CommentStatus = 'Unseen' | 'Seen' | 'Replied' | 'Ignored';

export type CommentPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type CommentSentiment = 'Positive' | 'Neutral' | 'Negative' | 'Question' | 'Complaint';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  title?: string;
  bio?: string;
  username?: string;
}

export type Permission =
  | 'inbox.view'
  | 'inbox.manage'
  | 'comments.reply'
  | 'comments.assign'
  | 'comments.notes'
  | 'comments.tags'
  | 'campaigns.view'
  | 'reports.view'
  | 'team.view'
  | 'team.manage'
  | 'settings.view'
  | 'settings.manage'
  | 'sync.run';

export interface AppUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  title: string;
  bio: string;
  avatarUrl: string;
  permissions: Permission[];
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface CommentView {
  userId: string;
  userName: string;
  viewedAt: string;
}

export interface CommentNote {
  id: string;
  commentId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  note: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  commentId: string;
  userId: string;
  userName: string;
  action: string;
  oldValue: string;
  newValue: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  platform: Platform;
  campaignId: string;
  campaignName: string;
  status: 'Active' | 'Paused' | 'Ended';
  budget: string;
  commentsCount: number;
  accountLabel?: string;
  metaAccountId?: string;
}

export interface Ad {
  id: string;
  platform: Platform;
  adId: string;
  adName: string;
  adsetName: string;
  campaignName: string;
  originalAdUrl: string;
  originalCommentUrl?: string;
  mediaType: 'video' | 'image';
  mediaUrl?: string;
  thumbnailUrl?: string;
  adCopy: string;
  headline?: string;
  description?: string;
  cta?: string;
  likesCount?: number;
  sharesCount?: number;
  commentsCount?: number;
  postStoryId?: string;
  spend?: number;
  accountLabel?: string;
  metaAccountId?: string;
}

export interface Comment {
  id: string;
  platform: Platform;
  commentId: string;
  commentText: string;
  commenterName: string;
  commenterProfileUrl: string;
  originalCommentUrl: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  pageId?: string;
  pageName?: string;
  instagramAccountId?: string;
  instagramAccountName?: string;
  status: CommentStatus;
  priority: CommentPriority;
  sentiment: CommentSentiment;
  assignedTo?: string; // team_member id
  tags: string[];
  createdAt: string;
  updatedAt: string;
  repliedAt?: string;
  seenAt?: string;
}

export interface AutoTaggingRule {
  id: string;
  keyword: string;
  tag: string;
  priority: CommentPriority;
  isActive: boolean;
}
