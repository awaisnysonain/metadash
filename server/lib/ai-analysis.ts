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

const OPENAI_COMMENT_MODEL = process.env.OPENAI_COMMENT_MODEL || 'gpt-4o-mini';
const OPENAI_REPLY_MODEL = process.env.OPENAI_REPLY_MODEL || OPENAI_COMMENT_MODEL;
const GROQ_COMMENT_MODEL = process.env.GROQ_COMMENT_MODEL || 'llama-3.3-70b-versatile';
const GROQ_REPLY_MODEL = process.env.GROQ_REPLY_MODEL || GROQ_COMMENT_MODEL;

type AiPurpose = 'analysis' | 'reply';
type ChatMessage = { role: 'system' | 'user'; content: string };

interface AiProvider {
  name: 'groq' | 'openai';
  apiKey: string;
  url: string;
  model: string;
}

function providersFor(purpose: AiPurpose): AiProvider[] {
  const providers: AiProvider[] = [];
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    providers.push({
      name: 'groq',
      apiKey: groqKey,
      url: process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions',
      model: purpose === 'reply' ? GROQ_REPLY_MODEL : GROQ_COMMENT_MODEL,
    });
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    providers.push({
      name: 'openai',
      apiKey: openAiKey,
      url: process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1/chat/completions',
      model: purpose === 'reply' ? OPENAI_REPLY_MODEL : OPENAI_COMMENT_MODEL,
    });
  }

  return providers;
}

async function requestJsonFromAi(
  purpose: AiPurpose,
  temperature: number,
  messages: ChatMessage[]
): Promise<Record<string, unknown>> {
  const providers = providersFor(purpose);
  let lastError: unknown;

  for (const provider of providers) {
    try {
      const res = await fetchWithTimeout(provider.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: provider.model,
          temperature,
          response_format: { type: 'json_object' },
          messages,
        }),
      }, Math.max(Number(process.env.AI_FETCH_TIMEOUT_MS || process.env.OPENAI_FETCH_TIMEOUT_MS || 8000), 1000));

      if (!res.ok) throw new Error(`${provider.name} ${res.status}`);
      const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${provider.name} returned no content`);
      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      lastError = err;
      console.warn(`[ai-${purpose}] ${provider.name} failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  throw lastError ?? new Error('No AI provider configured');
}

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

function brandWebsite(brand?: string | null): string | null {
  const normalized = String(brand || '').trim().toLowerCase();
  if (normalized === 'flo') return 'https://pilatesflo.com';
  if (normalized === 'nobl') return 'https://nobltravel.com';
  return null;
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
  if (process.env.AI_COMMENT_ANALYSIS === 'false' || process.env.OPENAI_COMMENT_ANALYSIS === 'false') return fallback;

  try {
    const parsed = await requestJsonFromAi('analysis', 0.1, [
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
    ]);
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

export interface ReplySuggestionResult {
  suggestion: string;
  confidence: number;
}

function fallbackReplySuggestion(input: { commenterName?: string; text: string; brand?: string | null }): ReplySuggestionResult {
  const lower = input.text.toLowerCase();
  const website = brandWebsite(input.brand) || 'our website';
  if (lower.includes('price') || lower.includes('cost')) {
    return { suggestion: `Thanks for asking. You can find the latest pricing, offer details, and product information at ${website}.`, confidence: 0.68 };
  }
  if (lower.includes('size') || lower.includes('dimension') || lower.includes('fit')) {
    return { suggestion: `Thanks for asking. The product page at ${website} has the full size and specification details so you can confirm the right fit.`, confidence: 0.72 };
  }
  if (lower.includes('ship') || lower.includes('delivery') || lower.includes('tracking')) {
    return { suggestion: 'Happy to help. Please send us your order details through DM or support so we can check the shipping status for you.', confidence: 0.7 };
  }
  return { suggestion: `Thanks for reaching out. You can find the full details at ${website}, and our team is happy to help if you have any other questions.`, confidence: 0.62 };
}

export async function suggestCommentReplies(input: {
  text: string;
  platform: 'facebook' | 'instagram';
  commenterName?: string;
  brand?: string | null;
  campaignName?: string | null;
  adName?: string | null;
  ad?: {
    adName?: string;
    campaignName?: string;
    adsetName?: string;
    accountLabel?: string;
    headline?: string;
    description?: string;
    adCopy?: string;
    cta?: string;
    originalAdUrl?: string;
  } | null;
  existingReplies?: Array<{ author?: string; text?: string }>;
}): Promise<ReplySuggestionResult> {
  const fallback = fallbackReplySuggestion(input);
  if (process.env.AI_REPLY_SUGGESTIONS === 'false' || process.env.OPENAI_REPLY_SUGGESTIONS === 'false') return fallback;

  try {
    const parsed = await requestJsonFromAi('reply', 0.45, [
      {
        role: 'system',
        content:
          'You write the single best customer-support reply for a social ad comment. Return JSON only: {"suggestion":"...","confidence":0.0}. Before writing, infer what the commenter is referring to from the comment plus ad context: product, offer, headline, ad copy, campaign/ad set, and prior replies. Answer the specific question when the context supports it. Do not invent exact prices, dimensions, shipping dates, guarantees, or policies not present in the context. If details are missing, direct them to the correct brand website, product page, DM, or support. Flo website: https://pilatesflo.com. Nobl travel website: https://nobltravel.com. Do not include @mentions; the app adds the mention separately. Keep the reply under 240 characters. Set confidence from 0 to 1 based on how directly the context supports the reply.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          comment: input.text,
          platform: input.platform,
          commenterName: input.commenterName,
          brand: input.brand,
          brandWebsite: brandWebsite(input.brand),
          campaignName: input.campaignName,
          adName: input.adName,
          adContext: input.ad,
          existingReplies: input.existingReplies?.slice(0, 6),
        }),
      },
    ]);
    const suggestion = String(parsed.suggestion || (Array.isArray(parsed.suggestions) ? parsed.suggestions[0] : '') || '').trim();
    const confidence = Math.min(Math.max(Number(parsed.confidence ?? 0.75), 0), 1);
    return suggestion ? { suggestion, confidence } : fallback;
  } catch (err) {
    console.warn('[ai-replies] using fallback:', err instanceof Error ? err.message : String(err));
    return fallback;
  }
}
