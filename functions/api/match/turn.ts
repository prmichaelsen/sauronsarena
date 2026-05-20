// functions/api/match/turn.ts
// POST /api/match/turn
// Drives ONE round of the match.
//
// Response shape depends on the branch:
//
//   * Non-speech branches (validation error, match-ended, CALL_VOTE,
//     SKIP-only) return regular `application/json`.
//
//   * Speech-generating branches (ASK / DEFEND / EXPEL / START) return
//     a `text/event-stream` SSE response. The N LLM calls run in
//     PARALLEL; each speech is flushed to the client as it completes.
//     Event vocabulary:
//
//       event: round_start
//       data:  { round_no, speakers: [{seat_id, display_name, ...}] }
//
//       event: speech
//       data:  { seat_id, display_name, content, usage_cents,
//                cache_read_tokens, cache_create_tokens }
//
//       event: round_end
//       data:  { match_status, cache: {read_tokens, create_tokens},
//                seats: [{seat_id, display_name, seat_index}] }
//
//       event: error
//       data:  { error: string }
//
// Why parallel + streaming:
//   - Round wall-clock drops from sum-of-3-speech-latencies to
//     max-of-3 (~30-40s → ~12-15s on Opus).
//   - Player sees a progressive reveal — "Gandalf composing..." flips
//     to actual content the instant that one speaker finishes,
//     instead of waiting on the slowest.
//   - Caching tradeoff: with parallel calls, all 3 within ROUND 1 of
//     a match may incur cache-create (or N races resolve to 1 create
//     + N-1 reads depending on Anthropic's internal serialization).
//     ROUND 2+ all hit cache. The UX gain dwarfs the round-1 penalty.
//   - Intra-round awareness: in parallel mode, speakers in the same
//     round do NOT see each other's speech (recent transcript only
//     contains prior rounds). Acceptable for Phase 1 — increases
//     speech-content variety, and the directive prioritized speed.
//
// Request body:
//   { match_id: string,
//     intervention: { kind: 'ASK'|'SAY'|'DEFEND'|'EXPEL'|'CALL_VOTE'|'SKIP'|'START',
//                     target_seat_id?: string,
//                     prompt?: string } }
//
// SAY is the broadcast-to-the-council intervention. It MUST NOT carry
// a target_seat_id (rejected as validation error if present). The
// match engine selects 1–3 organic responders weighted by archetype
// inclination, domain-keyword match, and conviction state — see
// selectSayResponders in _utils/prompt.ts.

import type { Env } from '../../_utils/env';
import {
  throttleState,
  throttleResponse,
  SPEND_THROTTLE_MESSAGE,
  recordSpend,
} from '../../_utils/throttle';
import { resolveAdmin } from '../../_utils/cookies';
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

// SSE helpers.
const ENCODER = new TextEncoder();

function sseFrame(event: string, data: unknown): Uint8Array {
  return ENCODER.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
  const validKinds = new Set(['ASK', 'SAY', 'DEFEND', 'EXPEL', 'CALL_VOTE', 'SKIP', 'START']);
  if (!matchId || !validKinds.has(ivKind)) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  // Schema hygiene: SAY is a broadcast — it MUST NOT carry a target.
  // A SAY payload with target_seat_id is malformed; reject explicitly
  // rather than silently dropping the field.
  if (ivKind === 'SAY' && body.intervention?.target_seat_id) {
    return Response.json(
      { error: 'invalid_say_payload_target_present' },
      { status: 400 },
    );
  }
  if (ivKind === 'SAY' && !body.intervention?.prompt) {
    return Response.json(
      { error: 'invalid_say_payload_prompt_required' },
      { status: 400 },
    );
  }

  // 2) System-level spend pre-check (redundant with middleware, but
  //    defensive). Admin/dev requests skip the cap.
  const admin = resolveAdmin(request, env.ADMIN_DEV_TOKEN);
  const t = await throttleState(env, admin.isAdmin);
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
  if (
    ivKind === 'ASK' ||
    ivKind === 'SAY' ||
    ivKind === 'DEFEND' ||
    ivKind === 'EXPEL' ||
    ivKind === 'CALL_VOTE'
  ) {
    const target = body.intervention?.target_seat_id ?? '';
    const promptText = body.intervention?.prompt ?? '';
    const kindMap: Record<string, string> = {
      ASK: 'player_ask',
      SAY: 'player_say',
      DEFEND: 'player_defend',
      EXPEL: 'player_expel',
      CALL_VOTE: 'player_call_vote',
    };
    // For player_say we persist only the prompt text directly so the
    // transcript renders a clean broadcast line. Other kinds stay on
    // the structured JSON shape for backward compatibility.
    const content =
      ivKind === 'SAY'
        ? promptText
        : JSON.stringify({
            kind: ivKind,
            target_seat_id: target || null,
            prompt: promptText || null,
          });
    await env.DB
      .prepare('INSERT INTO match_turn (match_id, round_no, turn_no, kind, actor_seat_id, content) VALUES (?, ?, ?, ?, NULL, ?)')
      .bind(matchId, newRoundNo, nextTurn++, kindMap[ivKind], content)
      .run();
  }

  // 6) If CALL_VOTE → flip status to voting and return (JSON).
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
    kind: ivKind as 'ASK' | 'SAY' | 'DEFEND' | 'EXPEL' | 'CALL_VOTE' | 'SKIP' | 'START',
    target_seat_id: body.intervention?.target_seat_id,
    prompt: body.intervention?.prompt,
  };
  const speakers = selectSpeakingSeats(newRoundNo, seats, intervention);

  // 8) Cached system blocks (invariant per match — guaranteed cache
  // hit on round 2+).
  const systemBlocks = buildPanelSystemBlocks(seats);

  // 9) Recent transcript (PRIOR rounds only — parallel speakers in
  // this round do not see each other).
  const recent = await loadRecentTurns(env, matchId, 12);

  // 10) Pre-allocate turn_no for each speaker so the DB inserts stay
  // deterministic in iteration order, independent of completion order.
  const turnAllocations = speakers.map((speaker, i) => ({
    speaker,
    turn_no: nextTurn + i,
  }));

  // 11) Open SSE stream and run all speeches in parallel.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const speakerPublic = (s: { seat_id: string; display_name: string; seat_index?: number }) => ({
    seat_id: s.seat_id,
    display_name: s.display_name,
    seat_index: (s as any).seat_index,
  });

  // Kick off — DO NOT await. The stream-producer is fire-and-forget;
  // the Response returns immediately with `readable`.
  (async () => {
    let cacheReadObserved = 0;
    let cacheCreateObserved = 0;
    try {
      // Emit round_start with the upcoming-speakers manifest so the
      // client can render "<name> composing..." placeholders for each.
      await writer.write(
        sseFrame('round_start', {
          match_id: matchId,
          round_no: newRoundNo,
          speakers: turnAllocations.map(({ speaker }) => speakerPublic(speaker)),
        }),
      );

      // Kick all N speeches in parallel. Each task does its own LLM
      // call → INSERT → spend record, then resolves with the payload.
      type SpeechResult = {
        speaker: typeof turnAllocations[number]['speaker'];
        turn_no: number;
        text: string;
        usage_cents: number;
        cache_read_tokens: number;
        cache_create_tokens: number;
      };

      const promises = new Map<number, Promise<SpeechResult>>();
      turnAllocations.forEach(({ speaker, turn_no }, i) => {
        const targetSeat = intervention.target_seat_id
          ? seatsById.get(intervention.target_seat_id)
          : undefined;
        const userMessage = buildUserMessage({
          speakingSeatId: speaker.seat_id,
          speakingSeatDisplayName: speaker.display_name,
          recentTurns: recent.map(r => ({
            kind: r.kind,
            actor_seat_id: r.actor_seat_id,
            content: r.content,
          })),
          intervention: {
            kind: intervention.kind === 'START' ? 'START' : intervention.kind,
            target_seat_id: intervention.target_seat_id,
            target_display_name: targetSeat?.display_name,
            prompt: intervention.prompt,
          },
          roundNo: newRoundNo,
          seatsById,
        });

        const task: Promise<SpeechResult> = (async () => {
          const result = await callMessages(env, {
            systemBlocks,
            userMessage,
            maxTokens: 350,
            temperature: 0.95,
          });

          // Persist + record spend.
          await env.DB
            .prepare('INSERT INTO match_turn (match_id, round_no, turn_no, kind, actor_seat_id, content) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(matchId, newRoundNo, turn_no, 'panel_speech', speaker.seat_id, result.text)
            .run();
          await recordSpend(env, result.estimated_cents);

          return {
            speaker,
            turn_no,
            text: result.text,
            usage_cents: result.estimated_cents,
            cache_read_tokens: result.usage.cache_read_input_tokens ?? 0,
            cache_create_tokens: result.usage.cache_creation_input_tokens ?? 0,
          };
        })().then(
          // Tag the resolved value with its index so the outer
          // race-loop can de-register the winner.
          (v) => ({ ...v, _idx: i } as SpeechResult & { _idx: number }),
        ) as Promise<SpeechResult>;

        promises.set(i, task);
      });

      // Race-then-remove: emit each speech in COMPLETION order.
      while (promises.size > 0) {
        const winner = await Promise.race(promises.values()) as SpeechResult & { _idx: number };
        promises.delete(winner._idx);

        cacheReadObserved += winner.cache_read_tokens;
        cacheCreateObserved += winner.cache_create_tokens;

        await writer.write(
          sseFrame('speech', {
            seat_id: winner.speaker.seat_id,
            display_name: winner.speaker.display_name,
            content: winner.text,
            usage_cents: winner.usage_cents,
            cache_read_tokens: winner.cache_read_tokens,
            cache_create_tokens: winner.cache_create_tokens,
          }),
        );
      }

      // 12) Auto-flip to voting if we just finished the last round.
      let status: 'active' | 'voting' = 'active';
      const totalRounds = 4;
      if (newRoundNo >= totalRounds) {
        await env.DB
          .prepare("UPDATE match SET status = 'voting' WHERE id = ?")
          .bind(matchId)
          .run();
        status = 'voting';
      }

      await writer.write(
        sseFrame('round_end', {
          match_id: matchId,
          round_no: newRoundNo,
          match_status: status,
          cache: {
            read_tokens: cacheReadObserved,
            create_tokens: cacheCreateObserved,
          },
          seats: seats.map(s => ({
            seat_id: s.seat_id,
            display_name: s.display_name,
            seat_index: s.seat_index,
          })),
        }),
      );
    } catch (err) {
      try {
        await writer.write(
          sseFrame('error', {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      } catch {
        // writer may already be closed; swallow.
      }
    } finally {
      try {
        await writer.close();
      } catch {
        // ignore double-close
      }
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Disable proxy buffering (nginx-style hint; harmless if ignored).
      'X-Accel-Buffering': 'no',
    },
  });
};
