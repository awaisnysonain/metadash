#!/usr/bin/env bash
set -euo pipefail
cd /var/www/html/metadashboard
set -a && source .env && set +a
AD=120222082998280085
curl -s "https://graph.facebook.com/v21.0/${AD}?fields=creative{id,effective_object_story_id,object_story_id}&access_token=${META_ACCESS_TOKEN}"
echo
STORY=$(curl -s "https://graph.facebook.com/v21.0/${AD}?fields=creative{effective_object_story_id}&access_token=${META_ACCESS_TOKEN}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('creative',{}).get('effective_object_story_id',''))")
echo "STORY=$STORY"
if [ -n "$STORY" ]; then
  curl -s "https://graph.facebook.com/v21.0/${STORY}/comments?fields=id,message,from,created_time&limit=3&access_token=${META_ACCESS_TOKEN}"
  echo
fi
