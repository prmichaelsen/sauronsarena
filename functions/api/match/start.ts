// functions/api/match/start.ts
// POST /api/match/start
// Provisions a new match: sets browser_id cookie (if absent), checks
// the system-level spend cap, inserts the match + 9 seats, returns
// the public payload (with archetype/is_misaligned masked).
//
// As of 2026-05-20 there is NO per-user / per-browser match cap.
// Anyone can start as many matches as they want; the only ceiling
// is the system-level $50/day Anthropic-spend cap, which short-
// circuits ALL matches once exhausted (resets at midnight UTC).

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
} from '../../_utils/throttle';
import { COUNCIL_OF_ELROND, pickMatchSeats } from '../../_data/scenario';
import { mintMatchId, publicSeatPayload } from '../../_utils/match';
import type { SeatRow } from '../../_utils/match';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 1) Browser id (set cookie if not present). Still issued because
  //    the match row stores player_browser_id for audit; not used
  //    for any rate-limit decision.
  let browserId = readBrowserId(request);
  const newCookie = !browserId;
  if (!browserId) browserId = mintBrowserId();

  // 1b) Admin/dev bypass — originator iteration loop.
  const admin = resolveAdmin(request, env.ADMIN_DEV_TOKEN);

  // 2) System-level spend pre-check. Admin requests skip it.
  const t = await throttleState(env, admin.isAdmin);
  if (t.spend_throttled) {
    const r = throttleResponse(SPEND_THROTTLE_MESSAGE);
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
  //    pickMatchSeats() picks ONE visitor from the misaligned pool at
  //    random and shuffles all 9 seats so seat_index varies per match.
  //    Fixes the Phase 1 calibration bug (Mírion-as-Annatar was always
  //    the answer because she was the only authored misaligned AND
  //    always sat at seat_index 8).
  const seats: SeatRow[] = pickMatchSeats(COUNCIL_OF_ELROND).map(s => ({
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

  // 5) Return masked payload + minimal meta block (system-cap only).
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
      spend_throttle_message: SPEND_THROTTLE_MESSAGE,
      bypass: admin.isAdmin,
    },
  };

  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (newCookie) headers.append('Set-Cookie', setBrowserIdHeader(browserId));
  if (admin.setCookie) headers.append('Set-Cookie', admin.setCookie);
  return new Response(JSON.stringify(payload), { status: 200, headers });
};
