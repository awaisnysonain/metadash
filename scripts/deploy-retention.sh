#!/bin/bash
set -euo pipefail
APP=/var/www/metadash
cd "$APP"

pkill -f wait-and-backfill 2>/dev/null || true

git fetch origin main
git reset --hard origin/main

if ! grep -q '^COMMENT_RETENTION_DAYS=' .env; then
  echo "COMMENT_RETENTION_DAYS=30" >> .env
else
  sed -i 's|^COMMENT_RETENTION_DAYS=.*|COMMENT_RETENTION_DAYS=30|' .env
fi

bash scripts/purge-comments-7d.sh

npm ci
npm run build

pm2 restart metadash
pm2 save

sleep 6
curl -s http://127.0.0.1:5011/api/health | python3 -m json.tool | head -8

echo RETENTION_DEPLOY_OK
