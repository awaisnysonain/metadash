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

echo "=== Triggering comment backfill to recover any missed comments ==="
TOKEN=$(curl -s -X POST http://127.0.0.1:5011/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"oh.awais","password":"@Nysonian.0"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

if [ -z "$TOKEN" ]; then
  echo "WARN: login failed — backfill not triggered"
  exit 0
fi

# Start backfill in background (can take 30+ min for 2238 ads)
nohup curl -s -X POST http://127.0.0.1:5011/api/meta/sync/comments/backfill \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  > /tmp/metadash-backfill.log 2>&1 &

echo "Backfill started in background (log: /tmp/metadash-backfill.log)"
sleep 3
curl -s http://127.0.0.1:5011/api/meta/sync/comments/status \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20

echo DEPLOY_OK
