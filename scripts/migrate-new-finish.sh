#!/bin/bash
set -e
APP=/var/www/metadash
cd "$APP"

cat > "$APP/ecosystem.config.cjs" <<'EOF'
module.exports = {
  apps: [{
    name: 'metadash',
    script: 'tsx',
    args: 'server/index.ts',
    cwd: '/var/www/metadash',
    env: {
      NODE_ENV: 'production',
      PORT: 5011,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    exp_backoff_restart_delay: 5000,
    max_restarts: 25,
    min_uptime: '30s',
  }],
};
EOF

npm ci
npm run build

pm2 delete metadash 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 8
curl -s http://127.0.0.1:5011/api/health | python3 -m json.tool | head -15

TOKEN=$(curl -s -X POST http://127.0.0.1:5011/api/auth/login -H 'Content-Type: application/json' -d '{"username":"oh.awais","password":"@Nysonian.0"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
echo "token_len=${#TOKEN}"
curl -s "http://127.0.0.1:5011/api/accounts/brand-assets?brand=FLO&refresh=1" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('FLO assets', d.get('count'))"
curl -s "http://127.0.0.1:5011/api/accounts/brand-assets?brand=NOBL&refresh=1" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('NOBL assets', d.get('count'))"

echo FINISH_OK
