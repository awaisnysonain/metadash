#!/bin/bash
set -e

export PGPASSWORD=erp_meta_dashboard

sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'erp_meta_dashboard' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS erp_meta_dashboard;
CREATE DATABASE erp_meta_dashboard OWNER erp_meta_dashboard;
SQL

pg_restore -h localhost -U erp_meta_dashboard -d erp_meta_dashboard --no-owner --no-acl /tmp/tmp-metadash_migrate.dump

sudo -u postgres psql -d erp_meta_dashboard -c "GRANT ALL ON SCHEMA public TO erp_meta_dashboard;"
sudo -u postgres psql -d erp_meta_dashboard -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO erp_meta_dashboard;"
sudo -u postgres psql -d erp_meta_dashboard -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO erp_meta_dashboard;"

psql -h localhost -U erp_meta_dashboard -d erp_meta_dashboard -c "SELECT 'comments' AS t, COUNT(*) FROM comments UNION ALL SELECT 'ads', COUNT(*) FROM ads UNION ALL SELECT 'pages', COUNT(*) FROM connected_pages;"

echo RESTORE_OK
