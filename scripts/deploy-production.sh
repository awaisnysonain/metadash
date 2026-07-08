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

npm ci
npm run build

pm2 delete metadash 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 8
curl -s http://127.0.0.1:5011/api/health | python3 -m json.tool | head -12

echo "=== DEPLOY_OK (no backfill) ==="
