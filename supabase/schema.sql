-- Unified Ads Comment Inbox — Supabase schema
-- Run in Supabase SQL Editor or via CLI migration

create extension if not exists "uuid-ossp";

-- Team
create table if not exists team_members (
  id text primary key,
  name text not null,
  email text not null,
  role text not null,
  avatar_url text not null,
  created_at timestamptz default now()
);

-- Campaign hierarchy (synced from Meta)
create table if not exists campaigns (
  id text primary key,
  platform text not null check (platform in ('facebook', 'instagram')),
  campaign_id text not null,
  campaign_name text not null,
  status text not null default 'Active',
  budget text,
  comments_count int default 0,
  meta_account_id text,
  synced_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists ad_sets (
  id text primary key,
  campaign_id text references campaigns(id) on delete set null,
  adset_id text not null,
  adset_name text not null,
  platform text not null,
  synced_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists ads (
  id text primary key,
  platform text not null,
  ad_id text not null,
  ad_name text not null,
  adset_name text,
  campaign_name text,
  ad_set_id text references ad_sets(id) on delete set null,
  campaign_id text references campaigns(id) on delete set null,
  original_ad_url text,
  original_comment_url text,
  media_type text check (media_type in ('image', 'video')),
  media_url text,
  thumbnail_url text,
  ad_copy text,
  headline text,
  description text,
  cta text,
  likes_count int,
  shares_count int,
  comments_count int,
  synced_at timestamptz,
  created_at timestamptz default now()
);

-- Comments inbox
create table if not exists comments (
  id text primary key,
  platform text not null check (platform in ('facebook', 'instagram')),
  comment_id text not null unique,
  comment_text text not null,
  commenter_name text not null,
  commenter_profile_url text,
  original_comment_url text not null,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  page_id text,
  page_name text,
  instagram_account_id text,
  instagram_account_name text,
  status text not null default 'Unseen',
  priority text not null default 'Medium',
  sentiment text not null default 'Neutral',
  assigned_to text references team_members(id) on delete set null,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  replied_at timestamptz,
  seen_at timestamptz
);

create table if not exists comment_notes (
  id text primary key,
  comment_id text not null references comments(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  user_avatar text,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists activity_logs (
  id text primary key,
  comment_id text not null references comments(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  action text not null,
  old_value text default '',
  new_value text default '',
  created_at timestamptz not null default now()
);

create table if not exists auto_tagging_rules (
  id text primary key,
  keyword text not null,
  tag text not null,
  priority text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Meta OAuth token storage (server-side writes via service role)
create table if not exists meta_connections (
  id uuid primary key default uuid_generate_v4(),
  platform text not null,
  account_id text not null,
  account_name text,
  access_token text,
  token_expires_at timestamptz,
  page_id text,
  instagram_business_id text,
  is_connected boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (platform, account_id)
);

create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create index if not exists idx_comments_status on comments(status);
create index if not exists idx_comments_platform on comments(platform);
create index if not exists idx_comments_created_at on comments(created_at desc);
create index if not exists idx_activity_logs_comment on activity_logs(comment_id);

-- Internal demo: permissive policies (tighten for production)
alter table team_members disable row level security;
alter table campaigns disable row level security;
alter table ad_sets disable row level security;
alter table ads disable row level security;
alter table comments disable row level security;
alter table comment_notes disable row level security;
alter table activity_logs disable row level security;
alter table auto_tagging_rules disable row level security;
alter table meta_connections disable row level security;
alter table app_config disable row level security;

-- Realtime for live inbox updates
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table activity_logs;
