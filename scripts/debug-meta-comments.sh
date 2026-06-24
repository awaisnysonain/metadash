#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/html/metadashboard}"
cd "$APP_DIR"
set -a
source .env
set +a

AD="${1:-120222082998280085}"
BASE="https://graph.facebook.com/v21.0"

echo "=== Permissions ==="
curl -s "${BASE}/me/permissions?fields=permission,status&access_token=${META_ACCESS_TOKEN}" | python3 -m json.tool | head -60

echo ""
echo "=== Ad creative story ids ==="
curl -s "${BASE}/${AD}?fields=id,name,creative{id,effective_object_story_id,object_story_id,effective_object_story_id}&access_token=${META_ACCESS_TOKEN}" | python3 -m json.tool

echo ""
echo "=== Ad direct comments edge ==="
curl -s "${BASE}/${AD}/comments?fields=id,message,from,created_time&limit=3&access_token=${META_ACCESS_TOKEN}" | python3 -m json.tool | head -40

STORY=$(curl -s "${BASE}/${AD}?fields=creative{effective_object_story_id}&access_token=${META_ACCESS_TOKEN}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('creative',{}).get('effective_object_story_id',''))")

if [ -n "$STORY" ]; then
  echo ""
  echo "=== Story comments for $STORY ==="
  curl -s "${BASE}/${STORY}/comments?fields=id,message,from,created_time,permalink_url&limit=5&access_token=${META_ACCESS_TOKEN}" | python3 -m json.tool | head -50
fi

echo ""
echo "=== Pages ==="
curl -s "${BASE}/me/accounts?fields=id,name,access_token&limit=3&access_token=${META_ACCESS_TOKEN}" | python3 -m json.tool | head -30
