#!/bin/bash
set -euo pipefail

NEW_UPSTREAM=https://52.77.228.212
CONF=/etc/nginx/conf.d/metadashboard.conf

sudo cp "$CONF" "${CONF}.bak-migration-$(date +%Y%m%d%H%M%S)"

sudo tee "$CONF" >/dev/null <<'EOF'
# meta-dashboard.nysonik.com — proxied to new server 52.77.228.212
server {
    server_name meta-dashboard.nysonik.com www.meta-dashboard.nysonik.com;

    client_max_body_size 10M;
    proxy_connect_timeout 600s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;

    location /api/meta/sync/ {
        proxy_pass https://52.77.228.212;
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
    }

    location / {
        proxy_pass https://52.77.228.212;
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_verify off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/meta-dashboard.nysonik.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/meta-dashboard.nysonik.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = meta-dashboard.nysonik.com) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name meta-dashboard.nysonik.com www.meta-dashboard.nysonik.com;
    return 404;
}
EOF

sudo nginx -t
sudo systemctl reload nginx

echo "=== Proxy health via old server ==="
curl -sk -o /dev/null -w "HTTPS %{http_code}\n" https://127.0.0.1/api/health -H 'Host: meta-dashboard.nysonik.com'
curl -sk https://127.0.0.1/api/health -H 'Host: meta-dashboard.nysonik.com' | head -c 200
echo
echo PROXY_OK
