#!/bin/bash
set -euo pipefail

APP=/var/www/metadash
DAYS=7

# Stop any pending backfill helper
pkill -f wait-and-backfill 2>/dev/null || true

# Ensure retention env
if ! grep -q '^COMMENT_RETENTION_DAYS=' "$APP/.env" 2>/dev/null; then
  echo "COMMENT_RETENTION_DAYS=30" >> "$APP/.env"
else
  sed -i 's|^COMMENT_RETENTION_DAYS=.*|COMMENT_RETENTION_DAYS=30|' "$APP/.env"
fi

export PGPASSWORD=erp_meta_dashboard

echo "=== Comments before purge ==="
psql -h localhost -U erp_meta_dashboard -d erp_meta_dashboard -t -c "SELECT COUNT(*) FROM comments;"

echo "=== Deleting comments older than ${DAYS} days ==="
DELETED=$(psql -h localhost -U erp_meta_dashboard -d erp_meta_dashboard -t -c \
  "WITH d AS (DELETE FROM comments WHERE created_at < NOW() - INTERVAL '${DAYS} days' RETURNING 1) SELECT COUNT(*) FROM d;" | tr -d ' ')

echo "Deleted: $DELETED"

echo "=== Comments after purge ==="
psql -h localhost -U erp_meta_dashboard -d erp_meta_dashboard -t -c "SELECT COUNT(*) FROM comments;"

# Persist retention config for app
psql -h localhost -U erp_meta_dashboard -d erp_meta_dashboard -c \
  "INSERT INTO app_config (key, value) VALUES ('comment_retention_days', '30')
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;"

echo PURGE_OK
