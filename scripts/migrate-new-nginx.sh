#!/bin/bash
set -e

sudo cp /tmp/metadash-nginx.conf /etc/nginx/sites-available/metadash
sudo ln -sf /etc/nginx/sites-available/metadash /etc/nginx/sites-enabled/metadash
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx

# PM2 auto-start on boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash || true
pm2 save

echo "=== NGINX TEST ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1/api/health
curl -s http://127.0.0.1/api/health | head -c 200
echo
echo NGINX_OK
