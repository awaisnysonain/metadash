#!/bin/bash
set -e

# Node 20 + PM2 if missing
if ! command -v pm2 >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  sudo npm install -g pm2 tsx
fi

# App directory
sudo mkdir -p /var/www/metadash
sudo chown ubuntu:ubuntu /var/www/metadash

# PostgreSQL user/db
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_meta_dashboard') THEN
    CREATE USER erp_meta_dashboard WITH PASSWORD 'erp_meta_dashboard_prod_2026';
  END IF;
END
$$;
SELECT 'CREATE DATABASE erp_meta_dashboard OWNER erp_meta_dashboard'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'erp_meta_dashboard')\gexec
GRANT ALL PRIVILEGES ON DATABASE erp_meta_dashboard TO erp_meta_dashboard;
SQL

echo "SETUP_OK"
