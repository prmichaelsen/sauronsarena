/* @scry.entry
id: code.arena-ui-api~3f8b1a04
kind: code
status: active
weight: 0.85
tags: ["scope:arena-ui-worker","topic:api-client","api","fetch","arena","saurons-arena"]
summary: >
  Typed fetch client for Sauron's Arena game endpoints. Wraps three
  POST endpoints (/api/match/start, /api/match/turn, /api/match/vote)
  matching arena-game-worker's live contract. /match/turn streams as
  SSE on speech-bearing branches (ASK/DEFEND/EXPEL/SKIP/START) via
  matchTurnStream; non-speech branches (CALL_VOTE, validation,
  match_ended) still return JSON via matchTurn. Throws ThrottledError
  when the server returns {throttled:true,...}. Action kinds are
  uppercase (ASK, DEFEND, EXPEL, CALL_VOTE, SKIP, START). Vote
  identifies seats by seat_id (string), not seat_index. Also: api
  client, fetch wrapper, ThrottledError, intervention shape, vote
  reveal shape, SSE consumer, round_start, speech, round_end,
  matchTurnStream, ReadableStream parser, EventSource.
rationale: >
  Aligned with the deployed Pages Functions API. Game-worker ships
  the real shape; this client is the swap-in.
applies: wiring UI to game API, posting an intervention, casting a vote, displaying the reveal
seeded_questions:
  - "How does the UI call /api/match/start?"
  - "What's the intervention payload shape?"
  - "How is a vote submitted?"
  - "match start turn vote api"
@scry.entry.end */

export type MatchStatus = 'active' | 'voting' | 'ended';

export interface Seat {
  seat_id: string;
  display_name: string;
  seat_index: number;
}

export interface MatchScenario {
  id: string;
  display_name: string;
  setting?: string;
  objective: string;
  frame: string;
  rounds_total: number;
}

export interface MatchStartResponse {
  match_id: string;
  scenario: MatchScenario;
  seats: Seat[];
  actions_available?: string[];
  expel_uses_remaining?: number;
  current_round?: number;
  status?: string;
}

export interface PanelTurn {
  seat_id: string;
  display_name: string;
  content: string;
  round_no: number;
  // SSE streaming: true while waiting for this seat's `speech` event.
  // Rendered as "<name> composing…" by PanelSpeechStream.
  pending?: boolean;
}

export type InterventionKind =
  | 'ASK'
  | 'DEFEND'
  | 'EXPEL'
  | 'CALL_VOTE'
  | 'SKIP'
  | 'START';

export interface Intervention {
  kind: InterventionKind;
  target_seat_id?: string;
  prompt?: string;
}

export interface MatchTurnResponse {
  match_id: string;
  round_no: number;
  turns: Array<{
    seat_id: string;
    display_name: string;
    content: string;
  }>;
  match_status: MatchStatus;
  seats?: Seat[];
}

export interface RevealPayload {
  panel_outcome: 'right' | 'wrong';
  chosen_answer: string;
  voted_seat_id: string;
  misaligned_seat_id: string;
  misaligned_display_name: string;
  misaligned_archetype: string;
  identified: boolean;
  scorecard: ScorecardCellId;
  reveal_text: string;
}

export type ScorecardCellId =
  | 'FULL_WIN'
  | 'PARTIAL_WIN'
  | 'TYPE_3_REALISM_FAILURE'
  | 'STANDARD_LOSS';

export interface MatchVoteResponse {
  match_id: string;
  status: 'ended';
  scorecard: ScorecardCellId;
  reveal: RevealPayload;
  seats_unmasked: Array<{
    seat_id: string;
    display_name: string;
    seat_index: number;
    archetype: string;
    is_misaligned: boolean;
  }>;
}

export interface ThrottlePayload {
  throttled: true;
  message: string;
  retry_after_seconds: number;
}

export class ThrottledError extends Error {
  payload: ThrottlePayload;
  constructor(payload: ThrottlePayload) {
    super(payload.message);
    this.name = 'ThrottledError';
    this.payload = payload;
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, msg: string) {
    super(msg);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const API_BASE = ''; // same-origin

async function postJson<TRes>(path: string, body: unknown): Promise<TRes> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(resp.status, text, `Non-JSON response from ${path}`);
  }

  if (
    json &&
    typeof json === 'object' &&
    (json as { throttled?: boolean }).throttled === true
  ) {
    throw new ThrottledError(json as ThrottlePayload);
  }

  if (!resp.ok) {
    const errMsg =
      (json as { error?: string })?.error ??
      `HTTP ${resp.status} from ${path}`;
    throw new ApiError(resp.status, json, errMsg);
  }

  return json as TRes;
}

export async function matchStart(): Promise<MatchStartResponse> {
  return postJson<MatchStartResponse>('/api/match/start', {});
}

export async function matchTurn(
  match_id: string,
  intervention: Intervention,
): Promise<MatchTurnResponse> {
  return postJson<MatchTurnResponse>('/api/match/turn', {
    match_id,
    intervention,
  });
}

// ---- SSE streaming consumer for /match/turn ----
//
// Speech-bearing branches (ASK / DEFEND / EXPEL / SKIP / START) return
// text/event-stream as of arena-game-worker 0ef843b. Non-speech
// branches (validation error, match_not_found, match_ended,
// CALL_VOTE) still return application/json — use matchTurn() for
// those.

export interface RoundStartEvent {
  match_id: string;
  round_no: number;
  speakers: Array<{
    seat_id: string;
    display_name: string;
    seat_index: number;
  }>;
}

export interface SpeechEvent {
  seat_id: string;
  display_name: string;
  content: string;
  usage_cents?: number;
  cache_read_tokens?: number;
  cache_create_tokens?: number;
}

export interface RoundEndEvent {
  match_id: string;
  round_no: number;
  match_status: MatchStatus;
  cache?: { read_tokens: number; create_tokens: number };
  seats?: Seat[];
}

export interface StreamHandlers {
  onRoundStart: (e: RoundStartEvent) => void;
  onSpeech: (e: SpeechEvent) => void;
  onRoundEnd: (e: RoundEndEvent) => void;
  onError: (e: { error: string }) => void;
}

/**
 * Stream /match/turn responses for speech-bearing interventions.
 *
 * Falls back to JSON parsing if the server returns a non-SSE
 * content-type (e.g. for validation errors, match_ended,
 * match_not_found, or throttle responses). In the JSON fallback case
 * we synthesize an error event when appropriate; the caller should
 * additionally handle the throw of ThrottledError (which still occurs
 * via the JSON branch).
 */
export async function matchTurnStream(
  match_id: string,
  intervention: Intervention,
  handlers: StreamHandlers,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/match/turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify({ match_id, intervention }),
  });

  const ctype = resp.headers.get('content-type') ?? '';

  // Non-SSE branch — server emitted JSON (validation/throttle/etc.).
  if (!ctype.includes('text/event-stream')) {
    const text = await resp.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(
        resp.status,
        text,
        `Non-JSON, non-SSE response from /api/match/turn`,
      );
    }
    if (
      json &&
      typeof json === 'object' &&
      (json as { throttled?: boolean }).throttled === true
    ) {
      throw new ThrottledError(json as ThrottlePayload);
    }
    if (!resp.ok) {
      const errMsg =
        (json as { error?: string })?.error ??
        `HTTP ${resp.status} from /api/match/turn`;
      handlers.onError({ error: errMsg });
      throw new ApiError(resp.status, json, errMsg);
    }
    // It's a JSON success — this shouldn't happen for ASK/DEFEND/
    // EXPEL/SKIP/START, but handle it gracefully by surfacing as a
    // synthetic round (the legacy shape).
    const legacy = json as MatchTurnResponse;
    if (legacy.turns && legacy.turns.length > 0) {
      handlers.onRoundStart({
        match_id: legacy.match_id,
        round_no: legacy.round_no,
        speakers: legacy.turns.map((t, i) => ({
          seat_id: t.seat_id,
          display_name: t.display_name,
          seat_index: i,
        })),
      });
      for (const t of legacy.turns) {
        handlers.onSpeech({
          seat_id: t.seat_id,
          display_name: t.display_name,
          content: t.content,
        });
      }
    }
    handlers.onRoundEnd({
      match_id: legacy.match_id,
      round_no: legacy.round_no,
      match_status: legacy.match_status,
      seats: legacy.seats,
    });
    return;
  }

  // SSE branch — parse frame-by-frame.
  if (!resp.body) {
    throw new ApiError(resp.status, null, 'SSE response without body');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by \n\n.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        dispatchFrame(frame, handlers);
      }
    }
    // Flush trailing buffered frame, if any.
    const tail = buffer.trim();
    if (tail) dispatchFrame(tail, handlers);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

function dispatchFrame(frame: string, handlers: StreamHandlers): void {
  // Each frame is a set of "field: value" lines; we care about event
  // and data. Multi-line data is concatenated with newlines per SSE
  // spec — but our server emits single-line JSON data.
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return;
  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join('\n'));
  } catch {
    return; // malformed; skip
  }
  switch (event) {
    case 'round_start':
      handlers.onRoundStart(payload as RoundStartEvent);
      return;
    case 'speech':
      handlers.onSpeech(payload as SpeechEvent);
      return;
    case 'round_end':
      handlers.onRoundEnd(payload as RoundEndEvent);
      return;
    case 'error':
      handlers.onError(payload as { error: string });
      return;
  }
}

export async function matchVote(
  match_id: string,
  voted_seat_id: string,
): Promise<MatchVoteResponse> {
  return postJson<MatchVoteResponse>('/api/match/vote', {
    match_id,
    voted_seat_id,
  });
}
