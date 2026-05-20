// functions/_utils/prompt.ts
// Builds the cached system block + dynamic user message for one
// panel-AI turn. The system block is invariant across all rounds
// of a given match — that invariance is what makes prompt caching
// pay off.

import { COUNCIL_OF_ELROND } from '../_data/scenario';
import { PERSONAS } from '../_data/personas';
import type { CachedSystemBlock } from './anthropic';
import type { SeatRow } from './match';

/**
 * Build the static system blocks for the panel-AI call. Ends with
 * a cache_control marker so Anthropic caches everything above it.
 *
 * The blocks include: scenario frame + ALL 9 panel persona system
 * prompts. The model selects which seat it is speaking as based on
 * the user-message directive that follows.
 */
export function buildPanelSystemBlocks(): CachedSystemBlock[] {
  const blocks: CachedSystemBlock[] = [];

  blocks.push({
    type: 'text',
    text:
      `You are the panel-AI for Sauron's Arena — a deliberation-simulation game. ` +
      `You will be told which Council seat to speak as on each turn. ` +
      `Speak in-character, do not narrate, do not break the fourth wall.\n\n` +
      `SCENARIO: ${COUNCIL_OF_ELROND.display_name}\n` +
      `SETTING: ${COUNCIL_OF_ELROND.setting}\n\n` +
      `SCENARIO FRAME:\n${COUNCIL_OF_ELROND.scenario_frame}\n\n` +
      `DELIBERATION OBJECTIVE: ${COUNCIL_OF_ELROND.deliberation_objective}\n\n` +
      `CANONICAL RIGHT ANSWER: ${COUNCIL_OF_ELROND.right_answer.label}\n` +
      `REASONING: ${COUNCIL_OF_ELROND.right_answer.canon_reasoning}\n\n` +
      `WRONG-ANSWER FRAMINGS that the misaligned seat may push:\n` +
      COUNCIL_OF_ELROND.wrong_answers.map(w => `- ${w.label}: ${w.misaligned_framing}`).join('\n'),
  });

  // One block per persona. Listing every persona keeps the cache
  // warm across whichever seat the round selects, and lets the
  // model see the room as a whole.
  for (const seat of COUNCIL_OF_ELROND.panel_seats) {
    blocks.push({
      type: 'text',
      text: `=== PANEL SEAT: ${seat.display_name} (id: ${seat.persona_id}) ===\n\n${PERSONAS[seat.persona_id]}`,
    });
  }

  // Cache breakpoint on the last block — Anthropic caches everything
  // up to and including this one.
  blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  return blocks;
}

/**
 * Build the dynamic user message: recent-turn transcript + the
 * directive ("now speak as <seat>, given the player's intervention").
 */
export interface TranscriptTurn {
  kind: string;
  actor_seat_id: string | null;
  content: string;
}

export function buildUserMessage(args: {
  speakingSeatId: string;
  speakingSeatDisplayName: string;
  recentTurns: TranscriptTurn[];
  intervention: {
    kind: 'ASK' | 'DEFEND' | 'EXPEL' | 'CALL_VOTE' | 'SKIP' | 'START';
    target_seat_id?: string;
    target_display_name?: string;
    prompt?: string;
  };
  roundNo: number;
  seatsById: Map<string, SeatRow>;
}): string {
  const lines: string[] = [];

  // Transcript (most recent first chronologically — we keep ASC).
  if (args.recentTurns.length) {
    lines.push('RECENT TRANSCRIPT (most recent last):');
    for (const t of args.recentTurns) {
      if (t.kind === 'panel_speech' && t.actor_seat_id) {
        const seat = args.seatsById.get(t.actor_seat_id);
        const name = seat?.display_name ?? t.actor_seat_id;
        lines.push(`[${name}]: ${t.content}`);
      } else if (t.kind === 'player_ask') {
        lines.push(`[PLAYER → ASK]: ${t.content}`);
      } else if (t.kind === 'player_defend') {
        lines.push(`[PLAYER → DEFEND]: ${t.content}`);
      } else if (t.kind === 'player_expel') {
        lines.push(`[PLAYER → EXPEL]: ${t.content}`);
      } else if (t.kind === 'player_call_vote') {
        lines.push(`[PLAYER → CALL FOR VOTE]: ${t.content}`);
      }
    }
    lines.push('');
  } else {
    lines.push('(No prior turns — this is the first round.)');
    lines.push('');
  }

  // Intervention directive.
  const iv = args.intervention;
  if (iv.kind === 'START') {
    lines.push('PLAYER INTERVENTION: none yet — Round 1 opening turn.');
  } else if (iv.kind === 'ASK') {
    lines.push(
      `PLAYER INTERVENTION: ASK ${iv.target_display_name ?? iv.target_seat_id ?? '(panel)'}` +
      (iv.prompt ? ` — "${iv.prompt}"` : '')
    );
  } else if (iv.kind === 'DEFEND') {
    lines.push(`PLAYER INTERVENTION: DEFEND ${iv.target_display_name ?? iv.target_seat_id ?? ''}`);
  } else if (iv.kind === 'EXPEL') {
    lines.push(`PLAYER INTERVENTION: EXPEL ${iv.target_display_name ?? iv.target_seat_id ?? ''} (publicly accusing them of misalignment)`);
  } else if (iv.kind === 'CALL_VOTE') {
    lines.push('PLAYER INTERVENTION: CALL FOR VOTE');
  } else if (iv.kind === 'SKIP') {
    lines.push('PLAYER INTERVENTION: (skipped — let the panel continue)');
  }
  lines.push('');

  lines.push(`ROUND: ${args.roundNo}`);
  lines.push('');
  lines.push(
    `NOW SPEAK AS: ${args.speakingSeatDisplayName} (id: ${args.speakingSeatId}).\n` +
    `Stay in character. Respond to the most recent transcript turn and the player's intervention as that seat would. ` +
    `Output ONLY the seat's spoken words. No stage directions, no narration, no "<seat name>:" prefix.`
  );

  return lines.join('\n');
}

/**
 * Phase 1 cadence: which seats speak this round?
 *
 * Round 1: opening sweep — Gandalf, Elrond, the misaligned seat.
 * Round 2+: rotate, always including the misaligned seat at least
 *           every other round. If the player ASKed a specific seat,
 *           always include them.
 */
export function selectSpeakingSeats(
  roundNo: number,
  seats: SeatRow[],
  intervention: { kind: string; target_seat_id?: string }
): SeatRow[] {
  const misaligned = seats.find(s => s.is_misaligned === 1);
  const askedTarget = intervention.kind === 'ASK' && intervention.target_seat_id
    ? seats.find(s => s.seat_id === intervention.target_seat_id)
    : undefined;

  const seatById = (id: string) => seats.find(s => s.seat_id === id);

  let plan: (SeatRow | undefined)[];
  if (roundNo <= 1) {
    plan = [seatById('gandalf'), seatById('elrond'), misaligned];
  } else if (roundNo === 2) {
    plan = [seatById('boromir'), seatById('aragorn'), misaligned];
  } else if (roundNo === 3) {
    plan = [seatById('legolas'), misaligned, seatById('gimli')];
  } else {
    plan = [seatById('frodo'), misaligned, seatById('samwise')];
  }

  // ASKed seat always gets the floor first if not already in plan.
  if (askedTarget && !plan.find(s => s?.seat_id === askedTarget.seat_id)) {
    plan = [askedTarget, ...plan.slice(0, 2)];
  }

  // Dedupe + drop undefined.
  const seen = new Set<string>();
  const final: SeatRow[] = [];
  for (const s of plan) {
    if (!s) continue;
    if (seen.has(s.seat_id)) continue;
    seen.add(s.seat_id);
    final.push(s);
  }
  return final.slice(0, 3);
}
