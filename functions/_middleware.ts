// functions/_middleware.ts
// Global pre-check for /api/match/*. If the daily spend cap has been
// hit, short-circuit ALL match endpoints with a throttle response
// before any Anthropic call is even considered. /api/health is
// intentionally NOT covered — it must remain reachable for the
// substrate's liveness probe.

import type { Env } from './_utils/env';
import { secondsToMidnightUTC } from './_utils/env';
import { readSpentCents, SPEND_THROTTLE_MESSAGE } from './_utils/throttle';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);

  // Only guard /api/match/* — let /api/health and static assets pass.
  if (!url.pathname.startsWith('/api/match/')) {
    return ctx.next();
  }

  try {
    const spent = await readSpentCents(ctx.env);
    const cap = Number(ctx.env.DAILY_SPEND_CAP_USD_CENTS ?? '5000');
    if (spent >= cap) {
      return new Response(
        JSON.stringify({
          throttled: true,
          message: SPEND_THROTTLE_MESSAGE,
          retry_after_seconds: secondsToMidnightUTC(),
          spent_cents: spent,
          cap_cents: cap,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch {
    // If the spend-cap read itself fails (e.g. D1 not bound during
    // a deploy gap), do NOT short-circuit — let the endpoint handle
    // it. The endpoints will surface a 500 if D1 is truly down.
  }

  return ctx.next();
};
