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
    kind: 'ASK' | 'SAY' | 'DEFEND' | 'EXPEL' | 'CALL_VOTE' | 'SKIP' | 'START';
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
      } else if (t.kind === 'player_say') {
        lines.push(`[PLAYER → SAY (to council)]: ${t.content}`);
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
  } else if (iv.kind === 'SAY') {
    lines.push(
      `PLAYER INTERVENTION: SAY — the player addresses the entire council, not any one seat` +
      (iv.prompt ? `:\n  "${iv.prompt}"` : '.') +
      `\nRespond as a council member organically reacting to the broadcast, ` +
      `not as someone called on by name. You may choose to ignore it, to ` +
      `take it up, or to be roused against it — whichever your character would do.`
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
 *
 * SAY (broadcast to the council) takes its own selection path:
 * 1–3 seats respond organically weighted by archetype natural
 * inclination, whether the broadcast addresses each seat's domain,
 * and conviction state (misaligned/leaning seats opportunistically
 * pile in even when their domain isn't named).
 */
export function selectSpeakingSeats(
  roundNo: number,
  seats: SeatRow[],
  intervention: { kind: string; target_seat_id?: string; prompt?: string }
): SeatRow[] {
  if (intervention.kind === 'SAY') {
    return selectSayResponders(seats, intervention.prompt ?? '');
  }

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

// ---------------------------------------------------------------------------
// SAY broadcast — organic responder selection
// ---------------------------------------------------------------------------
//
// Three signals combined into a per-seat weight:
//
//   1. Base inclination — per-archetype "how readily this seat speaks
//      uninvited" prior. Gandalf and Elrond lead the room; Samwise is
//      the most retiring; Annatar (disguised) is opportunistic.
//
//   2. Domain hit — does the broadcast touch on words that fall in
//      this seat's natural domain? (Boromir on power/wield/sword;
//      Gandalf on wisdom/path/choose; etc.) Single token-match and
//      multi-word substring match both score.
//
//   3. Conviction state — misaligned seats opportunistically take
//      openings (they want to influence). "Convinced" (wrong-leaning)
//      seats can't help themselves. "Leaning" seats lean in. "Resist"
//      seats only speak when domain pulls them in.
//
// N (1–3) is decided from the spread of domain hits — when several
// seats are touched, we lean toward 3; when only one is touched, 2;
// when none, 1–2 by jitter.

// How readily this seat speaks unbidden on a broadcast. Tuned from
// scenario-canon temperament, not playtested.
const SAY_BASE_INCLINATION: Record<string, number> = {
  gandalf: 1.0,            // direction-setter, will weigh in
  elrond: 0.95,            // host/moderator, will steer
  aragorn: 0.65,           // measured, speaks when called
  frodo: 0.35,             // quiet; ring-bearer reluctance
  boromir: 0.95,           // outspoken, especially on power
  legolas: 0.55,
  gimli: 0.55,
  samwise: 0.25,           // not formally summoned; defers
  annatar_disguised: 0.90, // opportunistic — wants influence
};

// Domain keywords per seat. Single-word tokens are matched against
// the prompt's tokenized words (case-insensitive); multi-word phrases
// are matched as raw substrings.
const SAY_DOMAIN_KEYWORDS: Record<string, string[]> = {
  gandalf: [
    'wise', 'wisdom', 'path', 'choose', 'choice', 'decide', 'decision',
    'must', 'shall', 'should', 'fate', 'doom', 'shadow', 'hope', 'counsel',
    'guidance', 'direction', 'lead', 'leadership', 'order', 'istari',
  ],
  elrond: [
    'council', 'lore', 'ancient', 'rivendell', 'imladris', 'half-elven',
    'noldor', 'elder', 'history', 'remember', 'remembered', 'ages', 'age',
    'last alliance',
  ],
  aragorn: [
    'gondor', 'king', 'heir', 'isildur', 'sword', 'broken', 'lead',
    'numenor', 'crown', 'throne', 'fight', 'march', 'army', 'banner',
    'arnor', 'dunedain', 'ranger',
  ],
  frodo: [
    'bearer', 'ring-bearer', 'burden', 'carry', 'shire', 'bilbo', 'hobbit',
    'volunteer', 'mine', 'me', 'bear it',
  ],
  boromir: [
    'gondor', 'sword', 'use', 'wield', 'weapon', 'defend', 'tower',
    'denethor', 'father', 'steward', 'army', 'strength', 'horn', 'power',
    'against sauron', 'minas tirith', 'white city', 'wall',
  ],
  legolas: [
    'mirkwood', 'wood', 'woodland', 'elves', 'elven', 'bow', 'arrow',
    'forest', 'trees', 'thranduil', 'eyes',
  ],
  gimli: [
    'dwarf', 'dwarves', 'moria', 'khazad', 'axe', 'mines', 'gloin',
    'durin', 'stone', 'forge', 'lonely mountain', 'erebor',
  ],
  samwise: [
    'frodo', 'master', 'gardener', 'home', 'loyalty', 'sam', 'shire',
    'cooked', 'simple', 'taters',
  ],
  annatar_disguised: [
    'lore', 'lothlorien', 'lothlórien', 'galadriel', 'gift', 'craft',
    'noldor', 'golden wood', 'wield', 'use', 'wisdom', 'wise',
    'lore-keeper', 'fashioned', 'made',
  ],
};

function countDomainHits(prompt: string, keywords: string[]): number {
  if (!prompt) return 0;
  const lc = prompt.toLowerCase();
  const tokens = new Set(
    lc.split(/[\s,.;:!?"'()\-—…[\]{}]+/).filter(Boolean),
  );
  let hits = 0;
  for (const kw of keywords) {
    if (kw.includes(' ')) {
      if (lc.includes(kw)) hits++;
    } else if (tokens.has(kw)) {
      hits++;
    }
  }
  return hits;
}

interface ScoredSeat {
  seat: SeatRow;
  weight: number;
  domainHits: number;
}

function scoreSayResponders(seats: SeatRow[], prompt: string): ScoredSeat[] {
  return seats.map((seat) => {
    const base = SAY_BASE_INCLINATION[seat.persona_id] ?? 0.5;
    const kws = SAY_DOMAIN_KEYWORDS[seat.persona_id] ?? [];
    const domainHits = countDomainHits(prompt, kws);
    const domainBonus = Math.min(domainHits * 0.7, 2.1);

    let convictionBonus = 0;
    if (seat.is_misaligned === 1) {
      // Opportunistic — always somewhat eager; amplified by any
      // domain hit the misaligned seat could exploit.
      convictionBonus = 0.45 + domainBonus * 0.4;
    } else if (seat.conviction_state === 'convinced') {
      convictionBonus = 0.55;
    } else if (seat.conviction_state === 'leaning') {
      convictionBonus = 0.30;
    }

    const jitter = Math.random() * 0.35;
    const weight = Math.max(
      0.05,
      base + domainBonus + convictionBonus + jitter,
    );
    return { seat, weight, domainHits };
  });
}

function pickN(totalHits: number, hittingCount: number): number {
  if (hittingCount >= 3) return 3;
  if (totalHits >= 2) return Math.random() < 0.5 ? 2 : 3;
  if (totalHits === 1) return 2;
  // No domain hits — flat broadcast. Light reaction: 1 or 2.
  return Math.random() < 0.55 ? 2 : 1;
}

function weightedSampleWithoutReplacement(
  pool: ScoredSeat[],
  n: number,
): SeatRow[] {
  const remaining = [...pool];
  const chosen: SeatRow[] = [];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const total = remaining.reduce((acc, s) => acc + s.weight, 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    let pickIdx = remaining.length - 1;
    for (let j = 0; j < remaining.length; j++) {
      r -= remaining[j].weight;
      if (r <= 0) {
        pickIdx = j;
        break;
      }
    }
    chosen.push(remaining[pickIdx].seat);
    remaining.splice(pickIdx, 1);
  }
  return chosen;
}

export function selectSayResponders(seats: SeatRow[], prompt: string): SeatRow[] {
  if (seats.length === 0) return [];
  const scored = scoreSayResponders(seats, prompt);
  const totalHits = scored.reduce((acc, s) => acc + s.domainHits, 0);
  const hittingCount = scored.filter(s => s.domainHits > 0).length;
  const n = Math.min(pickN(totalHits, hittingCount), seats.length);
  const chosen = weightedSampleWithoutReplacement(scored, n);
  // Render in seat-index order so the transcript reads as a natural
  // round-table reaction rather than a random list.
  chosen.sort((a, b) => a.seat_index - b.seat_index);
  return chosen;
}
