import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, isDatabaseConfigured, hasDatabaseUrl } from './db/pool.js';
import { seedIfEmpty } from './db/repository.js';
import { metaWebhookRouter } from './routes/meta-webhook.js';
import { commentsRouter, bootstrapRouter } from './routes/comments.js';
import { adsRouter } from './routes/ads.js';
import { reportsRouter } from './routes/reports.js';
import { metaSyncRouter } from './routes/meta-sync.js';
import { metaDebugRouter } from './routes/meta-debug.js';
import { pagesRouter } from './routes/pages.js';
import { accountsRouter } from './routes/accounts.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { requireAuth } from './middleware/auth.js';
import { removeStaleAdminFromDb } from './db/user-repository.js';
import { getMetaSyncStatus, getMetaSyncStatusLatest } from './db/sync-repository.js';
import { getMetaConfig, isMetaConfigured, isServerDemoMode, validateMetaAccessToken } from './lib/meta.js';
import { startCommentSyncCron } from './lib/meta-comment-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5011);
const isProd = process.env.NODE_ENV === 'production';

const REGISTERED_META_ROUTES = [
  'GET  /api/meta/webhook',
  'POST /api/meta/webhook',
  'GET  /api/meta/status',
  'GET  /api/meta/status/latest',
  'GET  /api/meta/debug',
  'GET  /api/meta/debug-pages',
  'GET  /api/meta/token/status',
  'POST /api/meta/token/exchange',
  'POST /api/meta/sync/ads',
  'POST /api/meta/sync/pages',
  'POST /api/meta/sync/instagram',
  'POST /api/meta/sync/campaigns',
  'POST /api/meta/sync/comments',
  'POST /api/meta/sync/comments/backfill',
  'GET  /api/meta/sync/comments/status',
  'POST /api/meta/sync/all',
  'GET  /api/meta/sync/all/status',
  'GET  /api/pages',
] as const;

function logRegisteredMetaRoutes() {
  console.log('[server] Registered Meta routes:');
  for (const route of REGISTERED_META_ROUTES) {
    console.log(`  ${route}`);
  }
}

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/api/health', async (_req, res) => {
  const cfg = getMetaConfig();
  const tokenStatus = cfg.accessToken ? await validateMetaAccessToken() : null;
  res.json({
    ok: true,
    mode: process.env.NODE_ENV || 'development',
    demoMode: isServerDemoMode(),
    database: isDatabaseConfigured(),
    databaseUrl: hasDatabaseUrl(),
    meta: isMetaConfigured(),
    metaAppId: Boolean(cfg.appId),
    metaAccessToken: Boolean(cfg.accessToken),
    metaVerifyToken: Boolean(cfg.verifyToken),
    metaTokenValid: tokenStatus?.valid ?? false,
    metaTokenExpiresAt: tokenStatus?.expiresAtIso ?? null,
    metaTokenMessage: tokenStatus?.message ?? null,
    metaCanSyncComments: tokenStatus?.canSyncComments ?? false,
    metaHasPagesReadUserContent: tokenStatus?.hasPagesReadUserContent ?? false,
    metaDataAccessExpiresAt: tokenStatus?.dataAccessExpiresAt
      ? new Date(tokenStatus.dataAccessExpiresAt * 1000).toISOString()
      : null,
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

// Auth (public login)
app.use('/api/auth', authRouter);

// Meta webhook (production path) — must stay public
app.use('/api/meta/webhook', metaWebhookRouter);

app.get('/api/meta/status', async (_req, res) => {
  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      error: 'PostgreSQL is not connected. Start the database and restart the server.',
    });
  }

  try {
    const status = await getMetaSyncStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/meta/status/latest', async (_req, res) => {
  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      error: 'PostgreSQL is not connected. Start the database and restart the server.',
    });
  }

  try {
    const latest = await getMetaSyncStatusLatest();
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.use('/api/meta', metaDebugRouter);

// Protected API routes
app.use('/api/users', usersRouter);
app.use('/api/comments', requireAuth, commentsRouter);
app.use('/api/ads', requireAuth, adsRouter);
app.use('/api/accounts', requireAuth, accountsRouter);
app.use('/api/pages', requireAuth, pagesRouter);
app.use('/api/reports', requireAuth, reportsRouter);
app.use('/api', requireAuth, bootstrapRouter);
app.use('/api/meta/sync', requireAuth, metaSyncRouter);
app.use('/api/sync', requireAuth, metaSyncRouter);

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
  const dbOk = await initDatabase();
  if (dbOk) {
    await seedIfEmpty();
    await removeStaleAdminFromDb();
  }

  if (dbOk && !isServerDemoMode()) {
    startCommentSyncCron();
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Meta Dashboard API on port ${PORT} (${isProd ? 'production' : 'development'})`);
    console.log(`[server] Webhook: ${getMetaConfig().webhookUrl}`);
    console.log(`[server] Database: ${isDatabaseConfigured() ? 'connected' : hasDatabaseUrl() ? 'unavailable (check PostgreSQL)' : 'not configured'}`);
    logRegisteredMetaRoutes();
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
