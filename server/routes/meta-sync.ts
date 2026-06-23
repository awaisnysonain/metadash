import { Router } from 'express';
import { query } from '../db/pool.js';
import { isMetaConfigured } from '../lib/meta.js';
import { mockAds, mockCampaigns, connectedPages } from '../../src/data.js';

export const metaSyncRouter = Router();

metaSyncRouter.post('/ads', async (_req, res) => {
  try {
    let synced = 0;
    for (const a of mockAds) {
      await query(
        `INSERT INTO ads (id,platform,ad_id,ad_name,adset_name,campaign_name,original_ad_url,media_type,media_url,thumbnail_url,ad_copy,headline,description,cta,likes_count,shares_count,comments_count,synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
         ON CONFLICT (id) DO UPDATE SET ad_name=$4, synced_at=NOW()`,
        [a.id, a.platform, a.adId, a.adName, a.adsetName, a.campaignName, a.originalAdUrl, a.mediaType, a.mediaUrl, a.thumbnailUrl, a.adCopy, a.headline, a.description, a.cta, a.likesCount, a.sharesCount, a.commentsCount]
      );
      synced++;
    }
    res.json({ ok: true, synced, message: `Synced ${synced} ads${isMetaConfigured() ? ' (Meta API ready)' : ''}` });
  } catch (err) {
    res.status(500).json({ ok: false, synced: 0, message: String(err) });
  }
});

metaSyncRouter.post('/pages', async (_req, res) => {
  try {
    let synced = 0;
    const pages = connectedPages.filter(p => p.platform === 'facebook');
    for (const p of pages) {
      await query(
        `INSERT INTO connected_pages (id,page_id,name,fans,avatar,is_connected,synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (id) DO UPDATE SET name=$3, is_connected=$6, synced_at=NOW()`,
        [p.id, p.id, p.name, p.fans, p.avatar, p.isConnected]
      );
      synced++;
    }
    res.json({ ok: true, synced, message: `Synced ${synced} Facebook pages` });
  } catch (err) {
    res.status(500).json({ ok: false, synced: 0, message: String(err) });
  }
});

metaSyncRouter.post('/instagram', async (_req, res) => {
  try {
    let synced = 0;
    const accounts = connectedPages.filter(p => p.platform === 'instagram');
    for (const a of accounts) {
      await query(
        `INSERT INTO connected_instagram_accounts (id,account_id,username,followers,avatar,is_connected,synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (id) DO UPDATE SET username=$3, is_connected=$6, synced_at=NOW()`,
        [a.id, a.id, a.name, a.fans, a.avatar, a.isConnected]
      );
      synced++;
    }
    for (const c of mockCampaigns.filter(x => x.platform === 'instagram')) {
      await query(
        `INSERT INTO campaigns (id,platform,campaign_id,campaign_name,status,budget,comments_count,synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT (id) DO UPDATE SET synced_at=NOW()`,
        [c.id, c.platform, c.campaignId, c.campaignName, c.status, c.budget, c.commentsCount]
      );
    }
    res.json({ ok: true, synced, message: `Synced ${synced} Instagram accounts` });
  } catch (err) {
    res.status(500).json({ ok: false, synced: 0, message: String(err) });
  }
});

// Legacy sync paths for Settings UI compatibility
metaSyncRouter.post('/campaigns', async (_req, res) => {
  try {
    for (const c of mockCampaigns) {
      await query(
        `INSERT INTO campaigns (id,platform,campaign_id,campaign_name,status,budget,comments_count,synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT (id) DO UPDATE SET synced_at=NOW()`,
        [c.id, c.platform, c.campaignId, c.campaignName, c.status, c.budget, c.commentsCount]
      );
    }
    res.json({ ok: true, synced: mockCampaigns.length, message: 'Campaigns synced' });
  } catch (err) {
    res.status(500).json({ ok: false, synced: 0, message: String(err) });
  }
});

metaSyncRouter.post('/all', async (_req, res) => {
  res.redirect(307, '/api/meta/sync/ads');
});
