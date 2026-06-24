#!/usr/bin/env node
/**
 * Exchange a short-lived Meta user token for a long-lived token.
 * Usage: node scripts/exchange-meta-token.mjs "SHORT_LIVED_TOKEN"
 */
import 'dotenv/config';

const shortToken = process.argv[2]?.trim();
if (!shortToken) {
  console.error('Usage: node scripts/exchange-meta-token.mjs "SHORT_LIVED_TOKEN"');
  process.exit(1);
}

const appId = process.env.META_APP_ID;
const appSecret = process.env.META_APP_SECRET;
if (!appId || !appSecret) {
  console.error('META_APP_ID and META_APP_SECRET must be set in .env');
  process.exit(1);
}

const url =
  `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
  `&client_id=${encodeURIComponent(appId)}` +
  `&client_secret=${encodeURIComponent(appSecret)}` +
  `&fb_exchange_token=${encodeURIComponent(shortToken)}`;

const res = await fetch(url);
const body = await res.json();

if (!res.ok || body.error) {
  console.error('Exchange failed:', body.error?.message || JSON.stringify(body));
  process.exit(1);
}

console.log('Long-lived token (add to META_ACCESS_TOKEN in .env):');
console.log(body.access_token);
console.log(`\nExpires in ~${Math.round((body.expires_in || 0) / 86400)} days`);
