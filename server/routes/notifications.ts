import { Router } from 'express';
import { getSlackStatus, setSlackEnabled, sendSlackCommentAlert } from '../lib/slack-alerts.js';
import { fallbackAnalyzeComment } from '../lib/ai-analysis.js';

export const notificationsRouter = Router();

notificationsRouter.get('/slack/status', async (_req, res) => {
  try {
    res.json(await getSlackStatus());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

notificationsRouter.patch('/slack/status', async (req, res) => {
  try {
    res.json(await setSlackEnabled(Boolean(req.body.enabled)));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

notificationsRouter.post('/slack/test', async (_req, res) => {
  try {
    const analysis = fallbackAnalyzeComment({ text: 'Test Slack alert from MetaDash', campaignName: 'MetaDash Test' });
    const result = await sendSlackCommentAlert({
      commentId: `test-${Date.now()}`,
      platform: 'facebook',
      author: 'MetaDash',
      text: 'Test Slack alert from MetaDash. If you see this, alerts are configured correctly.',
      createdAt: new Date().toISOString(),
      commentUrl: process.env.APP_URL || 'https://meta-dashboard.nysonik.com',
      campaignName: 'MetaDash Test',
      adName: 'Slack notification test',
      analysis,
    });
    res.status(result.sent ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
