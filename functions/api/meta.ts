// functions/api/meta.ts
// GET /api/meta — public-readable cap policy + current consumption.
//
// Lets the UI surface "N matches remaining today" without having to
// start a match first, and gives the originator a single URL to read
// the policy cold (`curl https://sauronsarena.com/api/meta`).
//
// Returns admin bypass status if the caller presents a valid dev
// token — so the originator can verify their bypass cookie is set.

import type { Env } from '../_utils/env';
import { todayUTC, secondsToMidnightUTC } from '../_utils/env';
import {
  throttleState,
  SPEND_THROTTLE_MESSAGE,
  RATE_THROTTLE_MESSAGE,
} from '../_utils/throttle';
import { readBrowserId, resolveAdmin } from '../_utils/cookies';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const browserId = readBrowserId(request);
  const admin = resolveAdmin(request, env.ADMIN_DEV_TOKEN);
  const t = await throttleState(env, browserId, admin.isAdmin);
  const matchesRemaining = Math.max(0, t.matches_cap - t.matches_today);

  return Response.json({
    day: todayUTC(),
    retry_after_seconds: secondsToMidnightUTC(),
    cap_policy: {
      matches_per_browser_per_day: t.matches_cap,
      daily_spend_cap_usd_cents: t.cap_cents,
      rationale:
        "We cap matches per browser per day, and we cap the project's daily Anthropic spend at the configured ceiling. Both caps reset at midnight UTC. The caps exist because the game is free and ad-free, so the only constraint on play is operating cost. When either cap is reached, new matches are paused until the next reset.",
      messages: {
        spend_cap_hit: SPEND_THROTTLE_MESSAGE,
        rate_cap_hit: RATE_THROTTLE_MESSAGE,
      },
    },
    current: {
      matches_used_today: t.matches_today,
      matches_remaining: matchesRemaining,
      spent_cents: t.spent_cents,
      spend_throttled: t.spend_throttled,
      rate_throttled: t.rate_throttled,
    },
    bypass: t.is_admin,
  });
};
