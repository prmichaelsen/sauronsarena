// functions/_utils/env.ts
// Shared Env type for Pages Functions — bindings + vars from wrangler.toml.

export interface Env {
  DB: D1Database;
  DAILY_SPEND_CAP_USD_CENTS: string;
  DAILY_USD_CAP: string;
  ANON_MATCHES_PER_DAY: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_API_KEY?: string;
}

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function secondsToMidnightUTC(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return Math.max(60, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
}
