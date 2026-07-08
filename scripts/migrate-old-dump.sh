#!/bin/bash
set -e
cd /var/www/html/metadashboard
DB=$(grep '^DATABASE_URL=' .env | tr -d '\r' | cut -d= -f2-)
pg_dump "$DB" --no-owner --no-acl -F c -f /tmp/metadash_migrate.dump
ls -lh /tmp/metadash_migrate.dump
echo "DUMP_OK"
