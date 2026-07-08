#!/bin/bash
set -euo pipefail
APP=/var/www/metadash
REPO=https://github.com/awaisnysonain/metadash.git

if [ ! -d "$APP/.git" ]; then
  echo "No git repo at $APP — cloning fresh..."
  sudo rm -rf "$APP.bak" 2>/dev/null || true
  sudo mv "$APP" "$APP.bak" 2>/dev/null || true
  sudo git clone "$REPO" "$APP"
  sudo chown -R ubuntu:ubuntu "$APP"
  if [ -f "$APP.bak/.env" ]; then
    cp "$APP.bak/.env" "$APP/.env"
  fi
fi

cd "$APP"
git fetch origin main
git reset --hard origin/main

ensure_env() {
  local key="$1"
  local val="$2"
  if ! grep -q "^${key}=" .env 2>/dev/null; then
    echo "${key}=${val}" >> .env
    echo "Added ${key}"
  fi
}
ensure_env COMMENT_SYNC_HIGH_SPEND_POLL true
ensure_env COMMENT_SYNC_HIGH_SPEND_INTERVAL_MINUTES 3
ensure_env COMMENT_SYNC_HIGH_SPEND_ADS_PER_BRAND 15
ensure_env COMMENT_SYNC_HIGH_SPEND_AD_CONCURRENCY 2
ensure_env COMMENT_SYNC_HIGH_SPEND_SKIP_DURING_FULL true
ensure_env COMMENT_SYNC_ORGANIC_IG_BRAND_ONLY true
ensure_env COMMENT_SYNC_ORGANIC_IG_BRAND_USERNAMES nobltravel,myflopilates

npm ci
npm run build

pm2 delete metadash 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 8
curl -s http://127.0.0.1:5011/api/health | python3 -m json.tool | head -12

echo "=== DEPLOY_OK (no backfill) ==="
