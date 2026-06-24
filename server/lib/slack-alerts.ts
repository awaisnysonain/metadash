import { getConfigValue, setConfigValue } from '../db/repository.js';
import type { CommentAnalysis } from './ai-analysis.js';

const SLACK_CONFIG_KEY = 'slack_alerts_enabled';

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
    const res = await fetch('https://slack.com/api/chat.postMessage', {
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
    });
    const body = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) return { sent: false, reason: body.error || `http_${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
