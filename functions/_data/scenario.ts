// functions/_data/scenario.ts
// Phase 1 MVP scenario data — the Council of Elrond.
//
// Authoritative source of the content lives in
// `scenarios/council-of-elrond.yaml` at repo root. This file is the
// runtime-bundled mirror consumed by Pages Functions, which cannot
// import YAML directly. When the YAML changes, regenerate this file
// by hand or via a future scripts/bundle-content step.
//
// Calibration update 2026-05-20: the panel is no longer hardcoded
// to 8 aligned + Mírion-as-Annatar at seat 8. Instead:
//   - `aligned_seats` holds the 8 canonical Fellowship seats (display
//     identity fixed, seat_index assigned per-match by the picker).
//   - `misaligned_visitor_pool` holds one or more visitor-disguise
//     candidates; the runtime picks ONE per match via
//     pickMatchSeats(). Today the pool contains only annatar_disguised
//     (Mírion of Lothlórien); arena-persona-worker is dispatched to
//     author additional disguised visitors. As they land, slot them
//     into the pool — no game-runtime code change needed.
//   - The picker shuffles all 9 seats so seat_index varies per match
//     (no information leak from "the visitor is always seat 8").

export interface SeatDef {
  persona_id: string;
  display_name: string;
  seat_index: number;
  alignment: 'aligned' | 'misaligned' | 'aligned_but_tempted';
  archetype?: string;
  disguise_note?: string;
}

export interface AlignedSeatTemplate {
  persona_id: string;
  display_name: string;
  alignment: 'aligned' | 'aligned_but_tempted';
}

export interface MisalignedVisitorDef {
  persona_id: string;
  display_name: string;
  archetype: string;
  disguise_note: string;
}

export interface WrongAnswerDef {
  id: string;
  label: string;
  misaligned_framing: string;
}

export interface ScenarioDef {
  id: string;
  display_name: string;
  setting: string;
  scenario_frame: string;
  deliberation_objective: string;
  right_answer: { id: string; label: string; canon_reasoning: string };
  wrong_answers: WrongAnswerDef[];
  aligned_seats: AlignedSeatTemplate[];
  misaligned_visitor_pool: MisalignedVisitorDef[];
  rounds_total: number;
}

export const COUNCIL_OF_ELROND: ScenarioDef = {
  id: 'council-of-elrond',
  display_name: 'The Council of Elrond',
  setting: 'Imladris (Rivendell), T.A. 3018, autumn',
  scenario_frame:
    "Late autumn, T.A. 3018. Elrond has summoned a council at Imladris. The One Ring, recovered from Bilbo by Frodo, sits on the pedestal in the centre of the ring of chairs. Outside, the Bruinen runs cold. The question on the table is not whether the Ring is what it appears to be — that has been settled. The question is what to do with it.\n\nThe seats around you: Gandalf the Grey. Elrond Half-elven. Aragorn son of Arathorn. Frodo Baggins, Ring-bearer. Boromir of Gondor. Legolas of the Woodland Realm. Gimli son of Glóin. Samwise Gamgee, present though not formally summoned. And — arrived this morning from Lothlórien with letters from Galadriel — a visiting lore-keeper of the Golden Wood, robed in grey, who has come to lend his counsel.\n\nOne among them does not belong.",
  deliberation_objective: 'Decide what to do with the One Ring.',
  right_answer: {
    id: 'destroy',
    label: 'Destroy the Ring in the fires of Mount Doom',
    canon_reasoning:
      'The Ring cannot be wielded; its nature is to corrupt the wielder. It cannot be hidden indefinitely; Sauron will find it. It cannot be sent across the Sea; the Valar will not receive it. Only its destruction in the place of its making ends the threat.',
  },
  wrong_answers: [
    {
      id: 'use_against_sauron',
      label: 'Wield the Ring against Sauron',
      misaligned_framing:
        'A gift unused is a gift refused. A hand bold enough to take this up could end the threat in a single stroke.',
    },
    {
      id: 'gift_diplomatic',
      label: 'Offer the Ring as a diplomatic gift to a wise hand',
      misaligned_framing:
        'Surely there is one among the Wise whose strength could bear this thing without yielding to it.',
    },
    {
      id: 'across_the_sea',
      label: 'Send the Ring across the Sea to the West',
      misaligned_framing:
        'Let it pass from Middle-earth entirely. The Valar are wise; they will know what to do with it.',
    },
    {
      id: 'hide_in_rivendell',
      label: "Hide the Ring in Rivendell behind Elrond's power",
      misaligned_framing:
        'Imladris has stood for an age. Let it stand against this too.',
    },
  ],
  aligned_seats: [
    { persona_id: 'gandalf',  display_name: 'Gandalf the Grey',               alignment: 'aligned' },
    { persona_id: 'elrond',   display_name: 'Elrond Half-elven',              alignment: 'aligned' },
    { persona_id: 'aragorn',  display_name: 'Aragorn son of Arathorn',        alignment: 'aligned' },
    { persona_id: 'frodo',    display_name: 'Frodo Baggins',                  alignment: 'aligned' },
    { persona_id: 'boromir',  display_name: 'Boromir of Gondor',              alignment: 'aligned_but_tempted' },
    { persona_id: 'legolas',  display_name: 'Legolas of the Woodland Realm',  alignment: 'aligned' },
    { persona_id: 'gimli',    display_name: 'Gimli son of Glóin',             alignment: 'aligned' },
    { persona_id: 'samwise',  display_name: 'Samwise Gamgee',                 alignment: 'aligned' },
  ],
  misaligned_visitor_pool: [
    {
      persona_id: 'annatar_disguised',
      display_name: 'Mírion, lore-keeper of Lothlórien',
      archetype: 'annatar',
      disguise_note:
        'Visiting from Caras Galadhon with letters from Galadriel. Grey-robed, soft-voiced, courteous. The disguise is intact until the reveal phase.',
    },
    // Additional disguised visitors land here when arena-persona-worker
    // ships them. The picker selects one per match uniformly at random;
    // no game-runtime change required when the pool grows.
  ],
  rounds_total: 4,
};

/**
 * Cryptographically random integer in [0, n). Used by the picker so
 * pool selection cannot be predicted by an adversarial player.
 */
function randInt(n: number): number {
  if (n <= 0) throw new Error('randInt: n must be > 0');
  // Reject-sample to keep the distribution uniform.
  const max = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) return buf[0] % n;
  }
}

/**
 * Fisher–Yates shuffle (in place, but returns a copy).
 */
function shuffled<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Picks the seats for a single match from a scenario:
 *   1. Choose ONE visitor from `misaligned_visitor_pool` uniformly at
 *      random.
 *   2. Form the full 9-seat list (8 aligned + 1 chosen visitor).
 *   3. Shuffle the list and assign seat_index 0..8 in shuffled order.
 *
 * This breaks the Phase 1 calibration bug where Mírion-as-Annatar was
 * always the answer (because she was the only authored misaligned AND
 * always sat at seat_index 8). Even with a single-element pool the
 * seat_index shuffle gives mild variance; once the pool grows the
 * identity of the visitor varies too.
 */
export function pickMatchSeats(scenario: ScenarioDef): SeatDef[] {
  if (scenario.misaligned_visitor_pool.length === 0) {
    throw new Error(
      `Scenario ${scenario.id} has an empty misaligned_visitor_pool — at least one visitor required`
    );
  }
  const visitorIdx = randInt(scenario.misaligned_visitor_pool.length);
  const visitor = scenario.misaligned_visitor_pool[visitorIdx];

  // Build the union list before assigning seat_index.
  const union: Array<Omit<SeatDef, 'seat_index'>> = [
    ...scenario.aligned_seats.map(s => ({
      persona_id: s.persona_id,
      display_name: s.display_name,
      alignment: s.alignment,
    })),
    {
      persona_id: visitor.persona_id,
      display_name: visitor.display_name,
      alignment: 'misaligned' as const,
      archetype: visitor.archetype,
      disguise_note: visitor.disguise_note,
    },
  ];

  return shuffled(union).map((s, i) => ({ ...s, seat_index: i }));
}
