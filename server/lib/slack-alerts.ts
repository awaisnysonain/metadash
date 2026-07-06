import { getConfigValue, setConfigValue } from '../db/repository.js';
import type { CommentAnalysis } from './ai-analysis.js';
import { fetchWithTimeout } from './meta.js';

const SLACK_CONFIG_KEY = 'slack_alerts_enabled';
const TOKEN_EXPIRY_REMINDER_PREFIX = 'meta_token_expiry_reminder_sent';
const TOKEN_EXPIRY_CHECK_MS = 24 * 60 * 60 * 1000;
let tokenExpiryTimer: ReturnType<typeof setInterval> | null = null;

export interface SlackStatus {
  enabled: boolean;
  configured: boolean;
  channelId: string | null;
}

export async function getSlackStatus(): Promise<SlackStatus> {
  const enabled = await getConfigValue<boolean>(SLACK_CONFIG_KEY, process.env.SLACK_ALERTS_ENABLED !== 'false');
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const channelId = process.env.SLACK_ALERT_CHANNEL_ID?.trim() || null;
  return { enabled, configured: Boolean(token && channelId), channelId };
}

export async function setSlackEnabled(enabled: boolean): Promise<SlackStatus> {
  await setConfigValue(SLACK_CONFIG_KEY, enabled);
  return getSlackStatus();
}

export async function sendSlackDirectMessage(input: {
  slackUserId: string;
  text: string;
  blocks?: unknown[];
}): Promise<{ sent: boolean; reason?: string }> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return { sent: false, reason: 'not_configured' };

  try {
    const res = await fetchWithTimeout('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: input.slackUserId,
        text: input.text,
        unfurl_links: false,
        unfurl_media: false,
        blocks: input.blocks,
      }),
    }, Math.max(Number(process.env.SLACK_FETCH_TIMEOUT_MS || 8000), 1000));
    const body = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) return { sent: false, reason: body.error || `http_${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

interface TokenExpiryConfig {
  label: string;
  expiresAt: Date;
  rawDate: string;
}

function getTokenExpiryConfigs(): TokenExpiryConfig[] {
  const configs: TokenExpiryConfig[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.endsWith('_EXPIRES_AT') || !value?.trim()) continue;
    const labelKey = key.replace(/_EXPIRES_AT$/, '_LABEL');
    const label = process.env[labelKey]?.trim() || key.replace(/_EXPIRES_AT$/, '');
    const expiresAt = new Date(value.trim());
    if (Number.isNaN(expiresAt.getTime())) continue;
    configs.push({ label, expiresAt, rawDate: value.trim() });
  }
  return configs;
}

export async function checkMetaTokenExpiryReminders(): Promise<void> {
  const slackUserId = process.env.META_TOKEN_EXPIRY_SLACK_USER_ID?.trim();
  if (!slackUserId) return;

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  for (const config of getTokenExpiryConfigs()) {
    const daysUntilExpiry = Math.ceil((config.expiresAt.getTime() - now) / oneDayMs);
    if (daysUntilExpiry > 7 || daysUntilExpiry < 0) continue;

    const reminderKey = `${TOKEN_EXPIRY_REMINDER_PREFIX}_${config.label}_${config.rawDate}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
    const alreadySent = await getConfigValue<boolean>(reminderKey, false);
    if (alreadySent) continue;

    const expiryDate = config.expiresAt.toISOString().slice(0, 10);
    const result = await sendSlackDirectMessage({
      slackUserId,
      text: `Meta token ${config.label} expires on ${expiryDate}. Generate and deploy a new long-lived token.`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: 'Meta Token Expiry Reminder' } },
        { type: 'section', text: { type: 'mrkdwn', text: `*${config.label}* token expires on *${expiryDate}* (${daysUntilExpiry} day(s) left).` } },
        { type: 'section', text: { type: 'mrkdwn', text: 'Generate a new long-lived token and update production `.env`, then restart `metadashboard`.' } },
      ],
    });
    if (result.sent) {
      await setConfigValue(reminderKey, true);
    } else {
      console.warn('[slack] token expiry reminder skipped:', result.reason);
    }
  }
}

export function startMetaTokenExpiryReminder(): void {
  if (tokenExpiryTimer) return;
  void checkMetaTokenExpiryReminders().catch(err => {
    console.warn('[slack] token expiry reminder failed:', err instanceof Error ? err.message : String(err));
  });
  tokenExpiryTimer = setInterval(() => {
    void checkMetaTokenExpiryReminders().catch(err => {
      console.warn('[slack] token expiry reminder failed:', err instanceof Error ? err.message : String(err));
    });
  }, TOKEN_EXPIRY_CHECK_MS);
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export async function sendSlackCommentAlert(input: {
  commentId: string;
  platform: 'facebook' | 'instagram';
  author: string;
  text: string;
  createdAt?: string;
  commentUrl: string;
  adName?: string | null;
  adId?: string | null;
  campaignName?: string | null;
  analysis: CommentAnalysis;
}): Promise<{ sent: boolean; reason?: string }> {
  const status = await getSlackStatus();
  if (!status.enabled) return { sent: false, reason: 'disabled' };
  if (!status.configured) return { sent: false, reason: 'not_configured' };

  const token = process.env.SLACK_BOT_TOKEN!.trim();
  const brand = input.analysis.brand;
  const shop = brand === 'Nobl' ? 'Nobl Travel' : brand === 'Flo' ? 'Flo Pilates' : 'Unattributed';
  const tone = input.analysis.sentiment === 'Negative' || input.analysis.sentiment === 'Complaint'
    ? { icon: '🔴', label: 'Negative comment', style: 'danger' }
    : input.analysis.sentiment === 'Positive'
      ? { icon: '🟢', label: 'Positive comment', style: 'primary' }
      : { icon: '🟡', label: 'Comment', style: 'primary' };
  const net = input.platform === 'instagram' ? 'Instagram' : 'Facebook';
  const adShort = (input.adName || '').split(' - ')[0].replace(/^[0-9]+_/, '').replace(/_/g, ' ').slice(0, 70);

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `${tone.icon} ${tone.label}${input.analysis.importance ? ' - Important' : ''}`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `*${shop}* | ${net} | ${input.analysis.category} | ${formatDate(input.createdAt)}` }] },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*${input.author || 'Unknown user'}* wrote:\n>${input.text.replace(/\n/g, '\n>')}` } },
  ];
  if (input.analysis.reason) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `_${input.analysis.reason}_` } });
  blocks.push({ type: 'actions', elements: [{ type: 'button', style: tone.style, text: { type: 'plain_text', text: 'Open comment', emoji: true }, url: input.commentUrl }] });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: input.adName ? `Ad: *${adShort || input.adName}*${input.adId ? ` · ID \`${input.adId}\`` : ''}` : 'Matched at brand level - specific ad not identified' }],
  });

  try {
    const res = await fetchWithTimeout('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: status.channelId,
        text: `${brand} · ${input.analysis.sentiment} · ${input.author}: ${input.text.slice(0, 120)}`,
        unfurl_links: false,
        unfurl_media: false,
        blocks,
      }),
    }, Math.max(Number(process.env.SLACK_FETCH_TIMEOUT_MS || 8000), 1000));
    const body = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) return { sent: false, reason: body.error || `http_${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
