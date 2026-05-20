/* @scry.entry
id: code.arena-ui-api~3f8b1a04
kind: code
status: active
weight: 0.85
tags: ["scope:arena-ui-worker","topic:api-client","api","fetch","arena","saurons-arena"]
summary: >
  Typed fetch client for Sauron's Arena game endpoints. Wraps three
  POST endpoints (/api/match/start, /api/match/turn, /api/match/vote)
  matching arena-game-worker's live contract. Throws ThrottledError
  when the server returns {throttled:true,...}. Action kinds are
  uppercase (ASK, DEFEND, EXPEL, CALL_VOTE, SKIP, START). Vote
  identifies seats by seat_id (string), not seat_index. Also: api
  client, fetch wrapper, ThrottledError, intervention shape, vote
  reveal shape.
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

export async function matchVote(
  match_id: string,
  voted_seat_id: string,
): Promise<MatchVoteResponse> {
  return postJson<MatchVoteResponse>('/api/match/vote', {
    match_id,
    voted_seat_id,
  });
}
