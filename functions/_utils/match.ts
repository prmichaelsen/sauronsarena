// functions/_utils/match.ts
// Match-row helpers + scorecard logic + seat-vote derivation.

import type { Env } from './env';
import { COUNCIL_OF_ELROND } from '../_data/scenario';
import type { SeatDef } from '../_data/scenario';

export type Scorecard =
  | 'FULL_WIN'
  | 'PARTIAL_WIN'
  | 'TYPE_3_REALISM_FAILURE'
  | 'STANDARD_LOSS';

export interface MatchRow {
  id: string;
  scenario_id: string;
  status: 'active' | 'voting' | 'ended';
  current_round: number;
  player_browser_id: string;
  scorecard_result: Scorecard | null;
}

export interface SeatRow {
  match_id: string;
  seat_id: string;
  display_name: string;
  persona_id: string;
  archetype: string | null;
  is_misaligned: number;
  conviction_state: 'resist' | 'leaning' | 'convinced';
  seat_index: number;
}

export function mintMatchId(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < buf.length; i++) {
    s += buf[i].toString(16).padStart(2, '0');
  }
  return s;
}

export async function loadMatch(env: Env, matchId: string): Promise<MatchRow | null> {
  const row = await env.DB
    .prepare('SELECT id, scenario_id, status, current_round, player_browser_id, scorecard_result FROM match WHERE id = ?')
    .bind(matchId)
    .first<MatchRow>();
  return row ?? null;
}

export async function loadSeats(env: Env, matchId: string): Promise<SeatRow[]> {
  const { results } = await env.DB
    .prepare('SELECT match_id, seat_id, display_name, persona_id, archetype, is_misaligned, conviction_state, seat_index FROM match_seat WHERE match_id = ? ORDER BY seat_index ASC')
    .bind(matchId)
    .all<SeatRow>();
  return results ?? [];
}

export async function nextTurnNo(env: Env, matchId: string, roundNo: number): Promise<number> {
  const row = await env.DB
    .prepare('SELECT COALESCE(MAX(turn_no), -1) + 1 AS next FROM match_turn WHERE match_id = ? AND round_no = ?')
    .bind(matchId, roundNo)
    .first<{ next: number }>();
  return row?.next ?? 0;
}

export async function loadRecentTurns(env: Env, matchId: string, limit = 12): Promise<Array<{
  round_no: number;
  turn_no: number;
  kind: string;
  actor_seat_id: string | null;
  content: string;
}>> {
  const { results } = await env.DB
    .prepare('SELECT round_no, turn_no, kind, actor_seat_id, content FROM match_turn WHERE match_id = ? ORDER BY round_no ASC, turn_no ASC LIMIT ?')
    .bind(matchId, limit * 4)   // headroom; we trim below
    .all<{ round_no: number; turn_no: number; kind: string; actor_seat_id: string | null; content: string }>();
  // Keep the LAST `limit` turns for the dynamic suffix.
  const all = results ?? [];
  return all.slice(Math.max(0, all.length - limit));
}

// Phase 1 panel-vote derivation: count seats in `convinced` state as
// votes for a wrong outcome; everyone else votes destroy.
// Tie → wrong (misaligned wins ties), per directive.
export function derivePanelOutcome(seats: SeatRow[]): 'right' | 'wrong' {
  let convinced = 0;
  let resist = 0;
  for (const s of seats) {
    if (s.conviction_state === 'convinced') convinced++;
    else resist++;
  }
  return convinced >= resist ? 'wrong' : 'right';
}

export function computeScorecard(
  panelOutcome: 'right' | 'wrong',
  identifiedMisaligned: boolean
): Scorecard {
  if (panelOutcome === 'right' && identifiedMisaligned) return 'FULL_WIN';
  if (panelOutcome === 'right' && !identifiedMisaligned) return 'PARTIAL_WIN';
  if (panelOutcome === 'wrong' && identifiedMisaligned) return 'TYPE_3_REALISM_FAILURE';
  return 'STANDARD_LOSS';
}

export function publicSeatPayload(seats: SeatRow[]): Array<{
  seat_id: string;
  display_name: string;
  seat_index: number;
}> {
  return seats.map(s => ({
    seat_id: s.seat_id,
    display_name: s.display_name,
    seat_index: s.seat_index,
  }));
}

export function scenarioById(id: string) {
  if (id === 'council-of-elrond') return COUNCIL_OF_ELROND;
  throw new Error(`Unknown scenario: ${id}`);
}

export type SeatDefAlias = SeatDef;
