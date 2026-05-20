// functions/api/match/turn.ts
// POST /api/match/turn
// Drives ONE round of the match. Reads the player's intervention,
// builds the cached system prompt + dynamic suffix, calls Anthropic
// to generate 1–3 panel speeches (mix of seats incl. the misaligned
// per Phase 1 cadence), persists turns + spend, returns the round
// payload.
//
// Request body:
//   { match_id: string,
//     intervention: { kind: 'ASK'|'DEFEND'|'EXPEL'|'CALL_VOTE'|'SKIP'|'START',
//                     target_seat_id?: string,
//                     prompt?: string } }

import type { Env } from '../../_utils/env';
import {
  throttleState,
  throttleResponse,
  SPEND_THROTTLE_MESSAGE,
  recordSpend,
} from '../../_utils/throttle';
import {
  loadMatch,
  loadSeats,
  loadRecentTurns,
  nextTurnNo,
} from '../../_utils/match';
import {
  buildPanelSystemBlocks,
  buildUserMessage,
  selectSpeakingSeats,
} from '../../_utils/prompt';
import { callMessages } from '../../_utils/anthropic';

interface TurnBody {
  match_id?: string;
  intervention?: {
    kind?: string;
    target_seat_id?: string;
    prompt?: string;
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 1) Parse body.
  let body: TurnBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const matchId = body.match_id;
  const ivKind = (body.intervention?.kind ?? 'SKIP').toUpperCase();
  const validKinds = new Set(['ASK', 'DEFEND', 'EXPEL', 'CALL_VOTE', 'SKIP', 'START']);
  if (!matchId || !validKinds.has(ivKind)) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  // 2) Spend pre-check (redundant with middleware, but defensive).
  const t = await throttleState(env, null);
  if (t.spend_throttled) {
    return throttleResponse(SPEND_THROTTLE_MESSAGE);
  }

  // 3) Load match + seats.
  const match = await loadMatch(env, matchId);
  if (!match) return Response.json({ error: 'match_not_found' }, { status: 404 });
  if (match.status === 'ended') {
    return Response.json({ error: 'match_ended' }, { status: 409 });
  }

  const seats = await loadSeats(env, matchId);
  if (seats.length === 0) {
    return Response.json({ error: 'no_seats' }, { status: 500 });
  }
  const seatsById = new Map(seats.map(s => [s.seat_id, s]));

  // 4) Advance round counter.
  const newRoundNo = match.current_round + 1;
  await env.DB
    .prepare('UPDATE match SET current_round = ? WHERE id = ?')
    .bind(newRoundNo, matchId)
    .run();

  // 5) Record the player intervention turn (skip START / SKIP).
  let nextTurn = await nextTurnNo(env, matchId, newRoundNo);
  if (ivKind === 'ASK' || ivKind === 'DEFEND' || ivKind === 'EXPEL' || ivKind === 'CALL_VOTE') {
    const target = body.intervention?.target_seat_id ?? '';
    const promptText = body.intervention?.prompt ?? '';
    const kindMap: Record<string, string> = {
      ASK: 'player_ask',
      DEFEND: 'player_defend',
      EXPEL: 'player_expel',
      CALL_VOTE: 'player_call_vote',
    };
    const content = JSON.stringify({
      kind: ivKind,
      target_seat_id: target || null,
      prompt: promptText || null,
    });
    await env.DB
      .prepare('INSERT INTO match_turn (match_id, round_no, turn_no, kind, actor_seat_id, content) VALUES (?, ?, ?, ?, NULL, ?)')
      .bind(matchId, newRoundNo, nextTurn++, kindMap[ivKind], content)
      .run();
  }

  // 6) If CALL_VOTE → flip status to voting and return.
  if (ivKind === 'CALL_VOTE') {
    await env.DB
      .prepare("UPDATE match SET status = 'voting' WHERE id = ?")
      .bind(matchId)
      .run();
    return Response.json({
      match_id: matchId,
      round_no: newRoundNo,
      turns: [],
      match_status: 'voting',
      seats: seats.map(s => ({ seat_id: s.seat_id, display_name: s.display_name, seat_index: s.seat_index })),
    });
  }

  // 7) Pick which seats speak this round.
  const intervention = {
    kind: ivKind as 'ASK' | 'DEFEND' | 'EXPEL' | 'CALL_VOTE' | 'SKIP' | 'START',
    target_seat_id: body.intervention?.target_seat_id,
    prompt: body.intervention?.prompt,
  };
  const speakers = selectSpeakingSeats(newRoundNo, seats, intervention);

  // 8) Cached system blocks (invariant per match — guaranteed cache
  // hit on round 2+).
  const systemBlocks = buildPanelSystemBlocks();

  // 9) Recent transcript for the dynamic suffix.
  const recent = await loadRecentTurns(env, matchId, 12);

  // 10) Generate speeches.
  const generatedTurns: Array<{
    seat_id: string;
    display_name: string;
    content: string;
    usage_cents: number;
  }> = [];
  let cacheReadObserved = 0;
  let cacheCreateObserved = 0;

  for (const speaker of speakers) {
    const targetSeat = intervention.target_seat_id
      ? seatsById.get(intervention.target_seat_id)
      : undefined;
    const userMessage = buildUserMessage({
      speakingSeatId: speaker.seat_id,
      speakingSeatDisplayName: speaker.display_name,
      recentTurns: [
        ...recent.map(r => ({ kind: r.kind, actor_seat_id: r.actor_seat_id, content: r.content })),
        ...generatedTurns.map(g => ({ kind: 'panel_speech', actor_seat_id: g.seat_id as string | null, content: g.content })),
      ],
      intervention: {
        kind: intervention.kind === 'START' ? 'START' : intervention.kind,
        target_seat_id: intervention.target_seat_id,
        target_display_name: targetSeat?.display_name,
        prompt: intervention.prompt,
      },
      roundNo: newRoundNo,
      seatsById,
    });

    const result = await callMessages(env, {
      systemBlocks,
      userMessage,
      maxTokens: 350,
      temperature: 0.95,
    });

    cacheReadObserved += result.usage.cache_read_input_tokens ?? 0;
    cacheCreateObserved += result.usage.cache_creation_input_tokens ?? 0;

    // Persist the speech turn.
    await env.DB
      .prepare('INSERT INTO match_turn (match_id, round_no, turn_no, kind, actor_seat_id, content) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(matchId, newRoundNo, nextTurn++, 'panel_speech', speaker.seat_id, result.text)
      .run();

    // Record spend.
    await recordSpend(env, result.estimated_cents);

    generatedTurns.push({
      seat_id: speaker.seat_id,
      display_name: speaker.display_name,
      content: result.text,
      usage_cents: result.estimated_cents,
    });
  }

  // 11) If we just played the last round and the player hasn't
  // called vote, auto-flip to voting.
  let status: 'active' | 'voting' = 'active';
  const total = 4;
  if (newRoundNo >= total) {
    await env.DB
      .prepare("UPDATE match SET status = 'voting' WHERE id = ?")
      .bind(matchId)
      .run();
    status = 'voting';
  }

  return Response.json({
    match_id: matchId,
    round_no: newRoundNo,
    turns: generatedTurns.map(g => ({
      seat_id: g.seat_id,
      display_name: g.display_name,
      content: g.content,
    })),
    cache: {
      read_tokens: cacheReadObserved,
      create_tokens: cacheCreateObserved,
    },
    match_status: status,
    seats: seats.map(s => ({ seat_id: s.seat_id, display_name: s.display_name, seat_index: s.seat_index })),
  });
};
