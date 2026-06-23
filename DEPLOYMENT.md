# Deployment Guide — meta-dashboard.nysonik.com

Production stack: **Ubuntu · Nginx · PM2 · PostgreSQL · Node.js**

## 1. Server prerequisites

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx postgresql postgresql-contrib curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. PostgreSQL database

```bash
sudo -u postgres psql
```

```sql
CREATE USER erp_meta_dashboard WITH PASSWORD 'your-secure-password';
CREATE DATABASE erp_meta_dashboard OWNER erp_meta_dashboard;
GRANT ALL PRIVILEGES ON DATABASE erp_meta_dashboard TO erp_meta_dashboard;
\q
```

Apply schema:

```bash
sudo -u postgres psql -d erp_meta_dashboard -f /var/www/meta-dashboard/database/schema.sql
```

## 3. Deploy application

```bash
sudo mkdir -p /var/www/meta-dashboard
sudo chown $USER:$USER /var/www/meta-dashboard
cd /var/www/meta-dashboard
git clone <your-repo-url> .
npm ci
npm run build
```

## 4. Environment variables

Create `/var/www/meta-dashboard/.env` (never commit this file):

```bash
PORT=5011
NODE_ENV=production
APP_URL=https://meta-dashboard.nysonik.com

DATABASE_URL=postgresql://erp_meta_dashboard:YOUR_PASSWORD@localhost:5432/erp_meta_dashboard

META_APP_ID=your-app-id
META_APP_SECRET=your-app-secret
META_VERIFY_TOKEN=your-verify-token
META_WEBHOOK_URL=https://meta-dashboard.nysonik.com/api/meta/webhook

VITE_DEMO_MODE=false
```

Build frontend with demo flag baked in:

```bash
VITE_DEMO_MODE=false npm run build
```

## 5. PM2 process manager

Create `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'meta-dashboard',
    script: 'tsx',
    args: 'server/index.ts',
    cwd: '/var/www/meta-dashboard',
    env: {
      NODE_ENV: 'production',
      PORT: 5011,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
  }],
};
```

Start:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## 6. Nginx reverse proxy

Create `/etc/nginx/sites-available/meta-dashboard`:

```nginx
server {
    listen 80;
    server_name meta-dashboard.nysonik.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name meta-dashboard.nysonik.com;

    ssl_certificate     /etc/letsencrypt/live/meta-dashboard.nysonik.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/meta-dashboard.nysonik.com/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:5011;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/meta-dashboard /etc/nginx/sites-enabled/
sudo certbot --nginx -d meta-dashboard.nysonik.com
sudo nginx -t && sudo systemctl reload nginx
```

## 7. Meta webhook setup

In Meta App Dashboard → Webhooks:

| Field | Value |
|-------|-------|
| Callback URL | `https://meta-dashboard.nysonik.com/api/meta/webhook` |
| Verify Token | Same as `META_VERIFY_TOKEN` in `.env` |
| Subscriptions | `feed`, `comments` (Page + Instagram) |

Test verification:

```bash
curl "https://meta-dashboard.nysonik.com/api/meta/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
# Should return: test123
```

## 8. API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meta/webhook` | Meta verification |
| POST | `/api/meta/webhook` | Receive comment events |
| GET | `/api/comments` | List all comments |
| PATCH | `/api/comments/:id/status` | Update status |
| PATCH | `/api/comments/:id/assign` | Assign team member |
| POST | `/api/comments/:id/notes` | Add internal note |
| GET | `/api/ads` | List ad creatives |
| GET | `/api/reports/summary` | Dashboard stats |
| POST | `/api/meta/sync/ads` | Sync ads from Meta |
| POST | `/api/meta/sync/pages` | Sync Facebook pages |
| POST | `/api/meta/sync/instagram` | Sync Instagram accounts |
| GET | `/api/health` | Health check |

## 9. Demo mode (local/staging)

Set in `.env` before build:

```bash
VITE_DEMO_MODE=true npm run build
```

Demo mode uses in-memory dummy data — no database required.

## 10. Useful commands

```bash
# Logs
pm2 logs meta-dashboard

# Restart after deploy
git pull && npm ci && npm run build && pm2 restart meta-dashboard

# Health check
curl https://meta-dashboard.nysonik.com/api/health
```
