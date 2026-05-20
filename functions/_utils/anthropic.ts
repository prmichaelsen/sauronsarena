// functions/_utils/anthropic.ts
// Anthropic Messages API call layer with mandatory prompt caching.
//
// We call the Anthropic REST API directly via fetch — that's the
// path the official @anthropic-ai/sdk uses internally, and avoids
// pulling the full SDK bundle into the Pages-Functions runtime.
//
// Caching strategy:
// - The static system block (scenario frame + all 9 persona system
//   prompts) is sent as a list of content blocks; the LAST one
//   carries `cache_control: { type: "ephemeral" }`. Anthropic caches
//   everything up to and including that block.
// - Recent-turn transcript + the current speaking-seat directive are
//   the dynamic suffix; they go in the `messages` array, uncached.
// - On the second call within a match (and any subsequent call
//   while the cache is warm), the static block is a CACHE HIT —
//   `usage.cache_read_input_tokens` will be > 0.
//
// Pricing (claude-opus-4-5, USD per 1M tokens):
//   input:                  $15
//   cache write (5m TTL):   $18.75
//   cache read:             $1.50
//   output:                 $75
// We translate usage → cents (integer rounded up) so the spend
// rollup stays denominated in cents.

import type { Env } from './env';

export interface CachedSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface MessagesRequest {
  systemBlocks: CachedSystemBlock[];     // last block should carry cache_control
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export interface MessagesResponse {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  stop_reason: string | null;
  raw_id: string;
  estimated_cents: number;
}

const ANTHROPIC_VERSION = '2023-06-01';
const CACHE_BETA = 'prompt-caching-2024-07-31';

// Pricing in micro-cents per token (i.e. cents * 1e6). Integer math
// avoids float drift in the spend rollup. claude-opus-4-5 rates:
//   $15/M  input  → 0.0015 ¢/tok  → 1500 µ¢/tok
//   $18.75/M cw   → 0.001875 ¢/tok→ 1875 µ¢/tok
//   $1.50/M cr    → 0.00015 ¢/tok →  150 µ¢/tok
//   $75/M  output → 0.0075 ¢/tok  → 7500 µ¢/tok
const PRICE_INPUT_UC_PER_TOKEN = 1500;
const PRICE_CACHE_WRITE_UC_PER_TOKEN = 1875;
const PRICE_CACHE_READ_UC_PER_TOKEN = 150;
const PRICE_OUTPUT_UC_PER_TOKEN = 7500;

export function estimateCentsFromUsage(u: MessagesResponse['usage']): number {
  const microCents =
    (u.input_tokens ?? 0) * PRICE_INPUT_UC_PER_TOKEN +
    (u.cache_creation_input_tokens ?? 0) * PRICE_CACHE_WRITE_UC_PER_TOKEN +
    (u.cache_read_input_tokens ?? 0) * PRICE_CACHE_READ_UC_PER_TOKEN +
    (u.output_tokens ?? 0) * PRICE_OUTPUT_UC_PER_TOKEN;
  // microCents → cents, round UP so we never under-record spend.
  return Math.ceil(microCents / 1_000_000);
}

export async function callMessages(
  env: Env,
  req: MessagesRequest
): Promise<MessagesResponse> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const body = {
    model: env.ANTHROPIC_MODEL || 'claude-opus-4-5',
    max_tokens: req.maxTokens ?? 800,
    temperature: req.temperature ?? 0.9,
    system: req.systemBlocks,
    messages: [{ role: 'user', content: req.userMessage }],
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': CACHE_BETA,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${text}`);
  }

  const data: any = await resp.json();

  // Concatenate all text blocks in the response.
  let text = '';
  for (const block of data.content ?? []) {
    if (block.type === 'text') text += block.text;
  }

  const usage = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
    cache_creation_input_tokens: data.usage?.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: data.usage?.cache_read_input_tokens ?? 0,
  };

  return {
    text: text.trim(),
    usage,
    stop_reason: data.stop_reason ?? null,
    raw_id: data.id ?? '',
    estimated_cents: estimateCentsFromUsage(usage),
  };
}
