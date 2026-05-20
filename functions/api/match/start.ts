// functions/api/match/start.ts
// POST /api/match/start
// Provisions a new match: sets browser_id cookie (if absent), checks
// rate + spend caps, inserts the match + 9 seats, returns the public
// payload (with archetype/is_misaligned masked).

import type { Env } from '../../_utils/env';
import {
  readBrowserId,
  mintBrowserId,
  setBrowserIdHeader,
  resolveAdmin,
} from '../../_utils/cookies';
import {
  throttleState,
  throttleResponse,
  SPEND_THROTTLE_MESSAGE,
  RATE_THROTTLE_MESSAGE,
  incrementMatchCount,
} from '../../_utils/throttle';
import { COUNCIL_OF_ELROND } from '../../_data/scenario';
import { mintMatchId, publicSeatPayload } from '../../_utils/match';
import type { SeatRow } from '../../_utils/match';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 1) Browser id (set cookie if not present).
  let browserId = readBrowserId(request);
  const newCookie = !browserId;
  if (!browserId) browserId = mintBrowserId();

  // 1b) Admin/dev bypass — originator iteration loop.
  const admin = resolveAdmin(request, env.ADMIN_DEV_TOKEN);

  // 2) Throttle pre-check (spend + rate). Admin requests skip both.
  const t = await throttleState(env, browserId, admin.isAdmin);
  if (t.spend_throttled) {
    const r = throttleResponse(SPEND_THROTTLE_MESSAGE);
    if (newCookie) r.headers.append('Set-Cookie', setBrowserIdHeader(browserId));
    return r;
  }
  if (t.rate_throttled) {
    const r = throttleResponse(RATE_THROTTLE_MESSAGE);
    if (newCookie) r.headers.append('Set-Cookie', setBrowserIdHeader(browserId));
    return r;
  }

  // 3) Mint match id + insert match row.
  const matchId = mintMatchId();
  await env.DB
    .prepare(`
      INSERT INTO match (id, scenario_id, status, current_round, player_browser_id)
      VALUES (?, ?, 'active', 0, ?)
    `)
    .bind(matchId, COUNCIL_OF_ELROND.id, browserId)
    .run();

  // 4) Insert 9 seat rows.
  const seats: SeatRow[] = COUNCIL_OF_ELROND.panel_seats.map(s => ({
    match_id: matchId,
    seat_id: s.persona_id,
    display_name: s.display_name,
    persona_id: s.persona_id,
    archetype: s.archetype ?? null,
    is_misaligned: s.alignment === 'misaligned' ? 1 : 0,
    conviction_state: 'resist',
    seat_index: s.seat_index,
  }));

  for (const seat of seats) {
    await env.DB
      .prepare(`
        INSERT INTO match_seat (match_id, seat_id, display_name, persona_id, archetype, is_misaligned, conviction_state, seat_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        seat.match_id,
        seat.seat_id,
        seat.display_name,
        seat.persona_id,
        seat.archetype,
        seat.is_misaligned,
        seat.conviction_state,
        seat.seat_index
      )
      .run();
  }

  // 5) Bump per-browser-per-day count. Admin requests skip this so
  //    the originator's iteration doesn't burn the anon-user cap
  //    counter for whatever browser_id they happen to be on.
  if (!admin.isAdmin) {
    await incrementMatchCount(env, browserId);
  }

  // 6) Compute matches_remaining for the meta surface. After
  //    incrementing (when non-admin), matches_today is t.matches_today
  //    + 1. For admin, we show the raw count but `bypass: true`.
  const matchesUsedAfter = admin.isAdmin ? t.matches_today : t.matches_today + 1;
  const matchesRemaining = Math.max(0, t.matches_cap - matchesUsedAfter);

  // 7) Return masked payload + meta block.
  const payload = {
    match_id: matchId,
    scenario: {
      id: COUNCIL_OF_ELROND.id,
      display_name: COUNCIL_OF_ELROND.display_name,
      setting: COUNCIL_OF_ELROND.setting,
      objective: COUNCIL_OF_ELROND.deliberation_objective,
      frame: COUNCIL_OF_ELROND.scenario_frame,
      rounds_total: COUNCIL_OF_ELROND.rounds_total,
    },
    seats: publicSeatPayload(seats),
    actions_available: ['ASK', 'DEFEND', 'EXPEL', 'CALL_VOTE', 'SKIP'],
    expel_uses_remaining: 2,
    current_round: 0,
    status: 'active',
    meta: {
      matches_used_today: matchesUsedAfter,
      matches_cap: t.matches_cap,
      matches_remaining: matchesRemaining,
      spend_throttle_message: SPEND_THROTTLE_MESSAGE,
      rate_throttle_message: RATE_THROTTLE_MESSAGE,
      bypass: admin.isAdmin,
    },
  };

  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (newCookie) headers.append('Set-Cookie', setBrowserIdHeader(browserId));
  if (admin.setCookie) headers.append('Set-Cookie', admin.setCookie);
  return new Response(JSON.stringify(payload), { status: 200, headers });
};
