// functions/api/health.ts
// Liveness probe + spend-cap status for Phase 1 MVP.
//
// arena-game-worker will add the actual match / panel / turn endpoints
// under functions/api/. This file proves the Functions runtime is wired
// to D1 and the env vars from wrangler.toml.

interface Env {
  DB: D1Database;
  DAILY_SPEND_CAP_USD_CENTS: string;
  ANON_MATCHES_PER_DAY: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_API_KEY?: string;
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const today = new Date().toISOString().slice(0, 10);
  let spent_cents = 0;
  let d1_ok = false;
  try {
    const row = await env.DB
      .prepare('SELECT usd_cents FROM daily_spend WHERE day = ?')
      .bind(today)
      .first<{ usd_cents: number }>();
    spent_cents = row?.usd_cents ?? 0;
    d1_ok = true;
  } catch (err) {
    // table not yet migrated, or D1 not bound
    d1_ok = false;
  }

  const cap_cents = Number(env.DAILY_SPEND_CAP_USD_CENTS ?? '5000');
  const throttled = spent_cents >= cap_cents;
  const has_anthropic_key = Boolean(env.ANTHROPIC_API_KEY);

  return Response.json({
    status: 'ok',
    day: today,
    spent_cents,
    cap_cents,
    throttled,
    throttle_message: throttled
      ? 'Sauron has retreated to recover his strength — try again tomorrow.'
      : null,
    d1_ok,
    has_anthropic_key,
    anthropic_model: env.ANTHROPIC_MODEL ?? null,
    anon_matches_per_day: Number(env.ANON_MATCHES_PER_DAY ?? '3'),
  });
};
