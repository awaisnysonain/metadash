#!/bin/bash
set -euo pipefail
TOKEN=$(curl -s -X POST http://127.0.0.1:5011/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"oh.awais","password":"@Nysonian.0"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

for i in $(seq 1 20); do
  RUNNING=$(curl -s http://127.0.0.1:5011/api/meta/sync/comments/status -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('isRunning'))")
  MSG=$(curl -s http://127.0.0.1:5011/api/meta/sync/comments/status -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lastMessage','')[:100])")
  echo "check $i: running=$RUNNING msg=$MSG"
  if [ "$RUNNING" = "False" ]; then break; fi
  sleep 30
done

echo "=== Starting backfill ==="
curl -s -X POST http://127.0.0.1:5011/api/meta/sync/comments/backfill \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' | python3 -m json.tool | head -25
