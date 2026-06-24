import { Router } from 'express';
import { getMetaConfig, validateMetaAccessToken, exchangeForLongLivedToken } from '../lib/meta.js';
import { PAGE_SYNC_FIELDS } from '../lib/meta-graph.js';

export const metaDebugRouter = Router();

const META_GRAPH_V23 = 'https://graph.facebook.com/v23.0';

async function fetchMetaRaw(path: string, accessToken: string): Promise<{ status: number; body: unknown }> {
  const url = `${META_GRAPH_V23}${path}?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const text = await res.text();

  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

metaDebugRouter.get('/debug', async (_req, res) => {
  const { accessToken } = getMetaConfig();
  if (!accessToken) {
    return res.status(400).json({ error: 'META_ACCESS_TOKEN is not set' });
  }

  try {
    const { status, body } = await fetchMetaRaw('/me/adaccounts', accessToken);
    res.status(status).json(body);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

metaDebugRouter.get('/debug-pages', async (_req, res) => {
  const { accessToken } = getMetaConfig();
  if (!accessToken) {
    return res.status(400).json({ error: 'META_ACCESS_TOKEN is not set' });
  }

  try {
    const { status, body } = await fetchMetaRaw(
      `/me/accounts?fields=${encodeURIComponent(PAGE_SYNC_FIELDS)}`,
      accessToken
    );
    res.status(status).json(body);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

metaDebugRouter.get('/token/status', async (_req, res) => {
  try {
    const status = await validateMetaAccessToken();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

metaDebugRouter.post('/token/exchange', async (req, res) => {
  const shortToken = String(req.body?.shortLivedToken ?? req.body?.token ?? '').trim();
  if (!shortToken) {
    return res.status(400).json({ error: 'shortLivedToken is required' });
  }

  try {
    const exchanged = await exchangeForLongLivedToken(shortToken);
    const status = await validateMetaAccessToken(exchanged.accessToken);
    res.json({
      ...exchanged,
      expiresInDays: Math.round(exchanged.expiresIn / 86400),
      validation: status,
      instructions:
        'Copy accessToken into META_ACCESS_TOKEN in server .env, then run: pm2 restart metadashboard',
    });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

