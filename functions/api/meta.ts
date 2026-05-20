// functions/api/meta.ts
// GET /api/meta — public-readable cap policy + current consumption.
//
// As of 2026-05-20 (originator directive 2026-05-20T11-06-06Z) there
// is NO per-user / per-browser match cap. The only ceiling is the
// system-level $50/day Anthropic-spend cap, which resets at midnight
// UTC. When the cap is reached, ALL users see SPEND_THROTTLE_MESSAGE.
// This endpoint surfaces the policy + current spend so the UI can
// render an explainer without having to start a match first, and so
// the originator can read the policy cold via `curl /api/meta`.
//
// Returns admin bypass status if the caller presents a valid dev
// token — so the originator can verify their bypass cookie is set.

import type { Env } from '../_utils/env';
import { todayUTC, secondsToMidnightUTC } from '../_utils/env';
import {
  throttleState,
  SPEND_THROTTLE_MESSAGE,
} from '../_utils/throttle';
import { resolveAdmin } from '../_utils/cookies';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const admin = resolveAdmin(request, env.ADMIN_DEV_TOKEN);
  const t = await throttleState(env, admin.isAdmin);

  return Response.json({
    day: todayUTC(),
    retry_after_seconds: secondsToMidnightUTC(),
    cap_policy: {
      daily_spend_cap_usd_cents: t.cap_cents,
      rationale:
        "Sauron's Arena is free and ad-free. There is no per-user " +
        "match cap; anyone can play as many matches as they want. " +
        "The only ceiling is the project's daily Anthropic-spend " +
        "cap, set at the configured ceiling. When that cap is " +
        "reached, all new matches pause until the cap resets at " +
        "midnight UTC.",
      messages: {
        spend_cap_hit: SPEND_THROTTLE_MESSAGE,
      },
    },
    current: {
      spent_cents: t.spent_cents,
      spend_throttled: t.spend_throttled,
    },
    bypass: t.is_admin,
  });
};
