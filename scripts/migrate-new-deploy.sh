#!/bin/bash
set -e

APP=/var/www/metadash
cd "$APP"

# Extract project
rm -rf "$APP"/*
tar -xzf /tmp/metadash-src.tgz -C "$APP"

# Production env
cp /tmp/tmp-metadash.env "$APP/.env"
sed -i 's/\r$//' "$APP/.env"
# Fix production settings
sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "$APP/.env"
sed -i 's|^APP_URL=.*|APP_URL=https://meta-dashboard.nysonik.com|' "$APP/.env"
grep -q '^COMMENT_SYNC_FULL_COVERAGE=' "$APP/.env" || echo 'COMMENT_SYNC_FULL_COVERAGE=true' >> "$APP/.env"

# Align postgres password with migrated .env
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER erp_meta_dashboard WITH PASSWORD 'erp_meta_dashboard';"

# Restore database (drop/recreate for clean import)
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'erp_meta_dashboard' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS erp_meta_dashboard;
CREATE DATABASE erp_meta_dashboard OWNER erp_meta_dashboard;
SQL

pg_restore -d erp_meta_dashboard -U erp_meta_dashboard --no-owner --no-acl /tmp/tmp-metadash_migrate.dump || true

# Grant schema (pg_restore may leave permissions tight)
sudo -u postgres psql -d erp_meta_dashboard -c "GRANT ALL ON SCHEMA public TO erp_meta_dashboard;"
sudo -u postgres psql -d erp_meta_dashboard -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO erp_meta_dashboard;"
sudo -u postgres psql -d erp_meta_dashboard -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO erp_meta_dashboard;"

echo "=== ROW COUNTS ==="
psql "$DATABASE_URL" -c "SELECT 'comments' AS t, COUNT(*) FROM comments UNION ALL SELECT 'ads', COUNT(*) FROM ads UNION ALL SELECT 'pages', COUNT(*) FROM connected_pages;" 2>/dev/null || \
  psql postgresql://erp_meta_dashboard:erp_meta_dashboard@localhost:5432/erp_meta_dashboard -c "SELECT 'comments' AS t, COUNT(*) FROM comments UNION ALL SELECT 'ads', COUNT(*) FROM ads UNION ALL SELECT 'pages', COUNT(*) FROM connected_pages;"

# PM2 ecosystem
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

echo "=== NPM INSTALL + BUILD ==="
npm ci
npm run build

echo "=== PM2 ==="
pm2 delete metadash 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 6
curl -s http://127.0.0.1:5011/api/health | head -c 500
echo
echo "DEPLOY_OK"
