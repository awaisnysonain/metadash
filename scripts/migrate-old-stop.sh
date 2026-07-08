#!/bin/bash
set -e
pm2 stop metadashboard
pm2 delete metadashboard
pm2 save
echo "OLD_METADASH_STOPPED"
pm2 list | grep -E 'metadash|meta-dashboard' || echo "No metadashboard processes"
