import type { CommentPriority, CommentSentiment } from '../../src/types.js';
import { autoTagComment } from './webhook.js';
import { inferBrand, type BrandLabel } from './brand.js';
import { fetchWithTimeout } from './meta.js';

export interface CommentAnalysis {
  sentiment: CommentSentiment;
  priority: CommentPriority;
  tags: string[];
  category: string;
  importance: boolean;
  reason: string;
  brand: BrandLabel;
}

const MODEL = process.env.OPENAI_COMMENT_MODEL || 'gpt-4o-mini';

function normalizeSentiment(value: unknown): CommentSentiment {
  const v = String(value || '').toLowerCase();
  if (v.includes('positive')) return 'Positive';
  if (v.includes('negative')) return 'Negative';
  if (v.includes('complaint')) return 'Complaint';
  if (v.includes('question')) return 'Question';
  return 'Neutral';
}

function normalizePriority(value: unknown): CommentPriority {
  const v = String(value || '').toLowerCase();
  if (v.includes('urgent')) return 'Urgent';
  if (v.includes('high')) return 'High';
  if (v.includes('low')) return 'Low';
  return 'Medium';
}

export function fallbackAnalyzeComment(input: {
  text: string;
  campaignName?: string | null;
  adName?: string | null;
  pageName?: string | null;
  accountLabel?: string | null;
}): CommentAnalysis {
  const tagged = autoTagComment(input.text);
  const lower = input.text.toLowerCase();
  const category = lower.includes('ship') || lower.includes('tracking') || lower.includes('delivery')
    ? 'shipping_issue'
    : lower.includes('refund') || lower.includes('scam') || lower.includes('fraud')
      ? 'complaint'
      : lower.includes('?') || lower.includes('price') || lower.includes('size')
        ? 'product_question'
        : lower.includes('love') || lower.includes('great')
          ? 'praise'
          : 'other';

  return {
    sentiment: tagged.sentiment ?? 'Neutral',
    priority: tagged.priority ?? 'Medium',
    tags: tagged.tags,
    category,
    importance: tagged.priority === 'Urgent' || tagged.priority === 'High',
    reason: 'Classified with local rules.',
    brand: inferBrand(input),
  };
}

export async function analyzeComment(input: {
  text: string;
  platform: 'facebook' | 'instagram';
  author?: string;
  campaignName?: string | null;
  adName?: string | null;
  pageName?: string | null;
  accountLabel?: string | null;
}): Promise<CommentAnalysis> {
  const fallback = fallbackAnalyzeComment(input);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.OPENAI_COMMENT_ANALYSIS === 'false') return fallback;

  try {
    const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Classify social ad comments for a support/marketing inbox. Return JSON only with sentiment, priority, category, importance, reason, tags, and brand. sentiment must be Positive, Neutral, Negative, Question, or Complaint. priority must be Low, Medium, High, or Urgent. category must be purchase_intent, complaint, shipping_issue, product_question, praise, spam_or_troll, or other. brand must be Nobl, Flo, or Unattributed.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              text: input.text,
              platform: input.platform,
              author: input.author,
              campaignName: input.campaignName,
              adName: input.adName,
              pageName: input.pageName,
              guessedBrand: fallback.brand,
            }),
          },
        ],
      }),
    }, Math.max(Number(process.env.OPENAI_FETCH_TIMEOUT_MS || 8000), 1000));

    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned no content');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map(String).filter(Boolean).slice(0, 5)
      : fallback.tags;

    return {
      sentiment: normalizeSentiment(parsed.sentiment),
      priority: normalizePriority(parsed.priority),
      tags: tags.length ? tags : fallback.tags,
      category: String(parsed.category || fallback.category),
      importance: Boolean(parsed.importance) || normalizePriority(parsed.priority) === 'Urgent',
      reason: String(parsed.reason || fallback.reason).slice(0, 240),
      brand: parsed.brand === 'Nobl' || parsed.brand === 'Flo' ? parsed.brand : fallback.brand,
    };
  } catch (err) {
    console.warn('[ai-analysis] using fallback:', err instanceof Error ? err.message : String(err));
    return fallback;
  }
}
