#!/usr/bin/env bash
set -euo pipefail
cd /var/www/metadash
if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
\pset format aligned
\pset border 2

\echo '=== INSTAGRAM COMMENTS (last 7 days) ==='
SELECT
  COUNT(*) AS total_ig,
  COUNT(*) FILTER (WHERE campaign_name = 'Organic' OR ad_name LIKE 'Organic%') AS labeled_organic,
  COUNT(*) FILTER (WHERE campaign_name <> 'Organic' AND (ad_name IS NULL OR ad_name NOT LIKE 'Organic%')) AS labeled_ad,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM ads a WHERE a.ad_id = comments.ad_id AND a.platform = 'instagram'
  )) AS matches_ig_ad_row,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM ads a WHERE a.ad_id = comments.ad_id
  )) AS matches_any_ad_row
FROM comments
WHERE platform = 'instagram'
  AND created_at >= NOW() - INTERVAL '7 days';

\echo ''
\echo '=== ALL COMMENTS BY PLATFORM (last 7 days) ==='
SELECT platform,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE campaign_name = 'Organic' OR ad_name LIKE 'Organic%') AS organic_labeled,
  COUNT(*) FILTER (WHERE campaign_name <> 'Organic' AND (ad_name IS NULL OR ad_name NOT LIKE 'Organic%')) AS ad_labeled
FROM comments
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY platform
ORDER BY total DESC;

\echo ''
\echo '=== ACTIVE ADS BY PLATFORM ==='
SELECT platform, COUNT(*) AS ads,
  COUNT(*) FILTER (WHERE instagram_media_id IS NOT NULL AND instagram_media_id <> '') AS has_ig_media_id,
  COUNT(*) FILTER (WHERE post_story_id IS NOT NULL AND post_story_id <> '') AS has_story_id
FROM ads
WHERE effective_status = 'ACTIVE' OR configured_status = 'ACTIVE'
GROUP BY platform
ORDER BY ads DESC;

\echo ''
\echo '=== IG ADS: media id coverage ==='
SELECT
  COUNT(*) FILTER (WHERE platform = 'instagram') AS ig_platform_ads,
  COUNT(*) FILTER (WHERE platform = 'facebook' AND instagram_media_id IS NOT NULL AND instagram_media_id <> '') AS fb_ads_with_ig_media,
  COUNT(*) FILTER (WHERE platform = 'facebook' AND (instagram_media_id IS NULL OR instagram_media_id = '')) AS fb_ads_no_ig_media
FROM ads
WHERE effective_status = 'ACTIVE' OR configured_status = 'ACTIVE';

\echo ''
\echo '=== ORGANIC OVERLAP: IG organic-labeled but ad_id matches an ad ==='
SELECT COUNT(*) AS organic_labeled_but_has_ad_match
FROM comments c
WHERE c.platform = 'instagram'
  AND (c.campaign_name = 'Organic' OR c.ad_name LIKE 'Organic%')
  AND EXISTS (SELECT 1 FROM ads a WHERE a.ad_id = c.ad_id);

\echo ''
\echo '=== TOP IG ORGANIC SOURCES (7d) ==='
SELECT ad_name, COUNT(*) AS n
FROM comments
WHERE platform = 'instagram'
  AND (campaign_name = 'Organic' OR ad_name LIKE 'Organic%')
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY ad_name
ORDER BY n DESC
LIMIT 10;

\echo ''
\echo '=== TOP IG AD-LABELED (7d) ==='
SELECT ad_name, campaign_name, COUNT(*) AS n
FROM comments
WHERE platform = 'instagram'
  AND campaign_name <> 'Organic'
  AND (ad_name IS NULL OR ad_name NOT LIKE 'Organic%')
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY ad_name, campaign_name
ORDER BY n DESC
LIMIT 10;

\echo ''
\echo '=== CONNECTED IG ACCOUNTS ==='
SELECT account_id, username, is_connected, linked_page_name
FROM connected_instagram_accounts
ORDER BY username;

\echo ''
\echo '=== DUPLICATE META COMMENT IDS (ig, 7d) ==='
SELECT COUNT(*) AS total_rows,
  COUNT(DISTINCT comment_id) AS distinct_meta_ids,
  COUNT(*) - COUNT(DISTINCT comment_id) AS duplicate_rows
FROM comments
WHERE platform = 'instagram' AND created_at >= NOW() - INTERVAL '7 days';

\echo ''
\echo '=== IG AD-SYNC COMMENTS (matched ad has instagram_media_id) ==='
SELECT COUNT(*) AS n
FROM comments c
JOIN ads a ON a.ad_id = c.ad_id
WHERE c.platform = 'instagram'
  AND c.created_at >= NOW() - INTERVAL '7 days'
  AND a.instagram_media_id IS NOT NULL AND a.instagram_media_id <> '';

\echo ''
\echo '=== BRAND PAGE ORGANIC (@nobltravel / @myflopilates) ==='
SELECT ad_name, COUNT(*) AS n
FROM comments
WHERE platform = 'instagram'
  AND (ad_name LIKE '%nobltravel%' OR ad_name LIKE '%myflopilates%')
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY ad_name;

SQL
