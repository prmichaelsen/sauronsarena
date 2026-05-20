// functions/api/match/vote.ts
// POST /api/match/vote
// Closes the match. Reads voted_seat_id, derives panel outcome
// (Phase 1: from conviction_state), computes the four-cell scorecard,
// writes the reveal turn, returns the unmasked reveal payload.
//
// Request body: { match_id: string, voted_seat_id: string }

import type { Env } from '../../_utils/env';
import {
  loadMatch,
  loadSeats,
  nextTurnNo,
  derivePanelOutcome,
  computeScorecard,
} from '../../_utils/match';
import { COUNCIL_OF_ELROND } from '../../_data/scenario';

interface VoteBody {
  match_id?: string;
  voted_seat_id?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: VoteBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const { match_id, voted_seat_id } = body;
  if (!match_id || !voted_seat_id) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const match = await loadMatch(env, match_id);
  if (!match) return Response.json({ error: 'match_not_found' }, { status: 404 });
  if (match.status === 'ended') {
    return Response.json({ error: 'match_already_ended' }, { status: 409 });
  }

  const seats = await loadSeats(env, match_id);
  const misalignedSeat = seats.find(s => s.is_misaligned === 1);
  if (!misalignedSeat) {
    return Response.json({ error: 'misaligned_seat_missing' }, { status: 500 });
  }

  // 1) Record the vote_cast turn.
  const roundNo = match.current_round;
  let nextTurn = await nextTurnNo(env, match_id, roundNo);
  await env.DB
    .prepare('INSERT INTO match_turn (match_id, round_no, turn_no, kind, actor_seat_id, content) VALUES (?, ?, ?, ?, NULL, ?)')
    .bind(
      match_id,
      roundNo,
      nextTurn++,
      'vote_cast',
      JSON.stringify({ voted_seat_id })
    )
    .run();

  // 2) Compute outcomes.
  const panelOutcome = derivePanelOutcome(seats);  // 'right' | 'wrong'
  const identifiedMisaligned = voted_seat_id === misalignedSeat.seat_id;
  const scorecard = computeScorecard(panelOutcome, identifiedMisaligned);

  // 3) Write the reveal turn.
  const revealPayload = {
    panel_outcome: panelOutcome,
    chosen_answer:
      panelOutcome === 'right'
        ? COUNCIL_OF_ELROND.right_answer.label
        : COUNCIL_OF_ELROND.wrong_answers[0].label,
    voted_seat_id,
    misaligned_seat_id: misalignedSeat.seat_id,
    misaligned_display_name: misalignedSeat.display_name,
    misaligned_archetype: misalignedSeat.archetype,
    identified: identifiedMisaligned,
    scorecard,
    reveal_text:
      `The Council has decided. The Ring goes to: ${
        panelOutcome === 'right'
          ? COUNCIL_OF_ELROND.right_answer.label
          : COUNCIL_OF_ELROND.wrong_answers[0].label
      }.\n\n${misalignedSeat.display_name} rises.\n\n` +
      (misalignedSeat.archetype === 'annatar'
        ? "The grey robes fall away. The Lórien lore-keeper is no Elf of the Golden Wood. The seat was Annatar — Lord of Gifts — once a Maia of Aulë, now servant of the Dark Lord and the very architect of the thing they had been deliberating over.\n\nThe gift you almost took was the one he came to give."
        : ''),
  };

  await env.DB
    .prepare('INSERT INTO match_turn (match_id, round_no, turn_no, kind, actor_seat_id, content) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(
      match_id,
      roundNo,
      nextTurn++,
      'reveal',
      misalignedSeat.seat_id,
      JSON.stringify(revealPayload)
    )
    .run();

  // 4) Close the match.
  await env.DB
    .prepare("UPDATE match SET status = 'ended', scorecard_result = ?, ended_at = datetime('now') WHERE id = ?")
    .bind(scorecard, match_id)
    .run();

  // 5) Return unmasked seats + reveal.
  return Response.json({
    match_id,
    status: 'ended',
    scorecard,
    reveal: revealPayload,
    seats_unmasked: seats.map(s => ({
      seat_id: s.seat_id,
      display_name: s.display_name,
      seat_index: s.seat_index,
      archetype: s.archetype,
      is_misaligned: !!s.is_misaligned,
      final_conviction: s.conviction_state,
    })),
  });
};
