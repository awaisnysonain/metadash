import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, isDatabaseConfigured } from './db/pool.js';
import { seedIfEmpty } from './db/repository.js';
import { metaWebhookRouter } from './routes/meta-webhook.js';
import { commentsRouter, bootstrapRouter } from './routes/comments.js';
import { adsRouter } from './routes/ads.js';
import { reportsRouter } from './routes/reports.js';
import { metaSyncRouter } from './routes/meta-sync.js';
import { getMetaConfig, isMetaConfigured } from './lib/meta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5011);
const isProd = process.env.NODE_ENV === 'production';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: process.env.NODE_ENV || 'development',
    database: isDatabaseConfigured(),
    meta: isMetaConfigured(),
    domain: 'meta-dashboard.nysonik.com',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/config/public', (_req, res) => {
  const cfg = getMetaConfig();
  res.json({
    metaAppId: cfg.appId,
    webhookUrl: cfg.webhookUrl,
    metaConfigured: isMetaConfigured(),
    databaseConfigured: isDatabaseConfigured(),
  });
});

// Meta webhook (production path)
app.use('/api/meta/webhook', metaWebhookRouter);

// Comments API
app.use('/api/comments', commentsRouter);

// Ads, reports, bootstrap
app.use('/api/ads', adsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api', bootstrapRouter);

// Meta sync
app.use('/api/meta/sync', metaSyncRouter);
app.use('/api/sync', metaSyncRouter); // legacy alias

// Serve Vite build in production
if (isProd) {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'), err => {
      if (err) res.status(404).json({ error: 'Not found' });
    });
  });
}

async function start() {
  await initDatabase();
  await seedIfEmpty();

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Meta Dashboard API on port ${PORT} (${isProd ? 'production' : 'development'})`);
    console.log(`[server] Webhook: ${getMetaConfig().webhookUrl}`);
    console.log(`[server] Database: ${isDatabaseConfigured() ? 'connected' : 'not configured'}`);
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${PORT} is already in use. Stop the other process or run:`);
      console.error(`  npx kill-port ${PORT}`);
    } else {
      console.error('[server] listen error', err);
    }
    process.exit(1);
  });
}

start().catch(err => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
