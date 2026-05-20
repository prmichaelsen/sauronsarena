// functions/_utils/throttle.ts
// Spend-cap + per-browser-per-day rate limit + spend bookkeeping.
//
// Admin/dev bypass: when `isAdmin: true` is passed, throttleState
// returns both throttled bits as false regardless of underlying
// counters. The actual spent/matches counters are still reported so
// the admin UI can show "you're past the cap but bypassed". Admin
// calls also skip incrementMatchCount (caller's responsibility) so
// originator iteration doesn't burn the anon-user budget.

import type { Env } from './env';
import { todayUTC, secondsToMidnightUTC } from './env';

export interface ThrottleState {
  spent_cents: number;
  cap_cents: number;
  matches_today: number;
  matches_cap: number;
  spend_throttled: boolean;
  rate_throttled: boolean;
  is_admin: boolean;
}

export async function readSpentCents(env: Env): Promise<number> {
  const row = await env.DB
    .prepare('SELECT usd_cents FROM daily_spend WHERE day = ?')
    .bind(todayUTC())
    .first<{ usd_cents: number }>();
  return row?.usd_cents ?? 0;
}

export async function readMatchesToday(env: Env, browserId: string): Promise<number> {
  const row = await env.DB
    .prepare('SELECT matches FROM anon_match_count WHERE browser_id = ? AND day = ?')
    .bind(browserId, todayUTC())
    .first<{ matches: number }>();
  return row?.matches ?? 0;
}

export async function throttleState(
  env: Env,
  browserId: string | null,
  isAdmin: boolean = false,
): Promise<ThrottleState> {
  const cap_cents = Number(env.DAILY_SPEND_CAP_USD_CENTS ?? '5000');
  const matches_cap = Number(env.ANON_MATCHES_PER_DAY ?? '3');
  const spent_cents = await readSpentCents(env);
  const matches_today = browserId ? await readMatchesToday(env, browserId) : 0;
  return {
    spent_cents,
    cap_cents,
    matches_today,
    matches_cap,
    spend_throttled: !isAdmin && spent_cents >= cap_cents,
    rate_throttled: !isAdmin && matches_today >= matches_cap,
    is_admin: isAdmin,
  };
}

export function throttleResponse(message: string): Response {
  return new Response(
    JSON.stringify({
      throttled: true,
      message,
      retry_after_seconds: secondsToMidnightUTC(),
    }),
    { status: 429, headers: { 'Content-Type': 'application/json' } }
  );
}

export const SPEND_THROTTLE_MESSAGE =
  "Sauron has retreated to recover his strength — try again in a few hours.";
export const RATE_THROTTLE_MESSAGE =
  "You have reached the Council's patience for the day. Return on the morrow.";

export async function recordSpend(env: Env, delta_cents: number): Promise<void> {
  if (delta_cents <= 0) return;
  const day = todayUTC();
  await env.DB
    .prepare(`
      INSERT INTO daily_spend (day, usd_cents, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(day) DO UPDATE SET
        usd_cents = usd_cents + excluded.usd_cents,
        updated_at = datetime('now')
    `)
    .bind(day, delta_cents)
    .run();
}

export async function incrementMatchCount(env: Env, browserId: string): Promise<void> {
  const day = todayUTC();
  await env.DB
    .prepare(`
      INSERT INTO anon_match_count (browser_id, day, matches)
      VALUES (?, ?, 1)
      ON CONFLICT(browser_id, day) DO UPDATE SET matches = matches + 1
    `)
    .bind(browserId, day)
    .run();
}
