import { query } from '../db/pool.js';
import { analyzeComment, type CommentAnalysis } from './ai-analysis.js';
import { sendSlackCommentAlert } from './slack-alerts.js';

interface EnrichmentJob {
  commentId: string;
  text: string;
  platform: 'facebook' | 'instagram';
  author: string;
  campaignName?: string | null;
  adName?: string | null;
  accountLabel?: string | null;
  alertNewComment: boolean;
  createdAt?: string;
  commentUrl: string;
  adId?: string | null;
}

const MAX_QUEUE = Math.max(Number(process.env.COMMENT_ENRICHMENT_QUEUE_MAX || 500), 0);
const CONCURRENCY = Math.min(Math.max(Number(process.env.COMMENT_ENRICHMENT_CONCURRENCY || 3), 1), 10);

const queue: EnrichmentJob[] = [];
let running = 0;

async function updateCommentAnalysis(commentId: string, analysis: CommentAnalysis): Promise<void> {
  await query(
    `UPDATE comments
     SET priority = $2,
         sentiment = $3,
         tags = $4::jsonb
     WHERE id = $1`,
    [commentId, analysis.priority, analysis.sentiment, JSON.stringify(analysis.tags ?? [])]
  );
}

async function processJob(job: EnrichmentJob): Promise<void> {
  const analysis = await analyzeComment({
    text: job.text,
    platform: job.platform,
    author: job.author,
    campaignName: job.campaignName,
    adName: job.adName,
    accountLabel: job.accountLabel,
  });
  await updateCommentAnalysis(job.commentId, analysis);

  if (job.alertNewComment) {
    const slack = await sendSlackCommentAlert({
      commentId: job.commentId,
      platform: job.platform,
      author: job.author,
      text: job.text,
      createdAt: job.createdAt,
      commentUrl: job.commentUrl,
      adName: job.adName,
      adId: job.adId,
      campaignName: job.campaignName,
      analysis,
    });
    if (!slack.sent) console.warn('[slack] comment alert skipped:', slack.reason);
  }
}

function drainQueue(): void {
  while (running < CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    running++;
    void processJob(job)
      .catch(err => console.warn('[comment-enrichment] job failed:', err instanceof Error ? err.message : String(err)))
      .finally(() => {
        running--;
        drainQueue();
      });
  }
}

export function enqueueCommentEnrichment(job: EnrichmentJob): void {
  if (MAX_QUEUE <= 0) return;
  if (queue.length + running >= MAX_QUEUE) {
    console.warn('[comment-enrichment] queue full, dropping enrichment for', job.commentId);
    return;
  }
  queue.push(job);
  drainQueue();
}

export function getCommentEnrichmentQueueState(): { queued: number; running: number; concurrency: number; maxQueue: number } {
  return { queued: queue.length, running, concurrency: CONCURRENCY, maxQueue: MAX_QUEUE };
}
