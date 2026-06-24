-- ERP Meta Dashboard — PostgreSQL schema
-- Database: erp_meta_dashboard

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  budget TEXT,
  comments_count INT DEFAULT 0,
  meta_account_id TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS adsets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  adset_id TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  adset_name TEXT,
  campaign_name TEXT,
  adset_id TEXT REFERENCES adsets(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  original_ad_url TEXT,
  original_comment_url TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video')),
  media_url TEXT,
  thumbnail_url TEXT,
  ad_copy TEXT,
  headline TEXT,
  description TEXT,
  cta TEXT,
  likes_count INT,
  shares_count INT,
  comments_count INT,
  post_story_id TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  comment_id TEXT NOT NULL UNIQUE,
  comment_text TEXT NOT NULL,
  commenter_name TEXT NOT NULL,
  commenter_profile_url TEXT,
  original_comment_url TEXT NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  page_id TEXT,
  page_name TEXT,
  instagram_account_id TEXT,
  instagram_account_name TEXT,
  status TEXT NOT NULL DEFAULT 'Unseen',
  priority TEXT NOT NULL DEFAULT 'Medium',
  sentiment TEXT NOT NULL DEFAULT 'Neutral',
  assigned_to TEXT REFERENCES team_members(id) ON DELETE SET NULL,
  tags JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  replied_at TIMESTAMPTZ,
  seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS comment_notes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connected_pages (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  name TEXT NOT NULL,
  fans TEXT,
  avatar TEXT,
  is_connected BOOLEAN DEFAULT FALSE,
  access_token TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connected_instagram_accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  followers TEXT,
  avatar TEXT,
  is_connected BOOLEAN DEFAULT FALSE,
  access_token TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connected_ad_accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'facebook',
  spend TEXT,
  status TEXT DEFAULT 'Active',
  is_connected BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auto_tagging_rules (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  tag TEXT NOT NULL,
  priority TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_platform ON comments(platform);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_comment ON activity_logs(comment_id);

ALTER TABLE ads ADD COLUMN IF NOT EXISTS post_story_id TEXT;
