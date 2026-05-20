// functions/_utils/throttle.ts
// System-level $50/day spend cap + spend bookkeeping.
//
// As of 2026-05-20 (originator directive 2026-05-20T11-06-06Z) the
// per-user / per-browser daily cap has been REMOVED entirely (not
// bypassed — removed). Anyone can play unlimited matches. The
// $50/day system-level Anthropic-spend cap is the sole ceiling.
// When the system cap is hit, ALL users see SPEND_THROTTLE_MESSAGE
// until midnight UTC.
//
// Admin/dev bypass: when `isAdmin: true` is passed, throttleState
// returns `spend_throttled: false` regardless of the underlying
// counter. The raw spent_cents is still reported so the admin UI
// can show "you're past the cap but bypassed".

import type { Env } from './env';
import { todayUTC, secondsToMidnightUTC } from './env';

export interface ThrottleState {
  spent_cents: number;
  cap_cents: number;
  spend_throttled: boolean;
  is_admin: boolean;
}

export async function readSpentCents(env: Env): Promise<number> {
  const row = await env.DB
    .prepare('SELECT usd_cents FROM daily_spend WHERE day = ?')
    .bind(todayUTC())
    .first<{ usd_cents: number }>();
  return row?.usd_cents ?? 0;
}

export async function throttleState(
  env: Env,
  isAdmin: boolean = false,
): Promise<ThrottleState> {
  const cap_cents = Number(env.DAILY_SPEND_CAP_USD_CENTS ?? '5000');
  const spent_cents = await readSpentCents(env);
  return {
    spent_cents,
    cap_cents,
    spend_throttled: !isAdmin && spent_cents >= cap_cents,
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

// System-level "budget reached" message. Fires for ALL users when
// the $50/day system cap is exhausted. Resets at midnight UTC.
export const SPEND_THROTTLE_MESSAGE =
  "Today's compute budget has been reached. The Council reconvenes tomorrow.";

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
