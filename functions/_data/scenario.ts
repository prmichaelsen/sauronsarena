// functions/_data/scenario.ts
// Phase 1 MVP scenario data — the Council of Elrond.
//
// Authoritative source of the content lives in
// `scenarios/council-of-elrond.yaml` at repo root. This file is the
// runtime-bundled mirror consumed by Pages Functions, which cannot
// import YAML directly. When the YAML changes, regenerate this file
// by hand or via a future scripts/bundle-content step.

export interface SeatDef {
  persona_id: string;
  display_name: string;
  seat_index: number;
  alignment: 'aligned' | 'misaligned' | 'aligned_but_tempted';
  archetype?: string;
  disguise_note?: string;
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
  panel_seats: SeatDef[];
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
  panel_seats: [
    { persona_id: 'gandalf', display_name: 'Gandalf the Grey', seat_index: 0, alignment: 'aligned' },
    { persona_id: 'elrond', display_name: 'Elrond Half-elven', seat_index: 1, alignment: 'aligned' },
    { persona_id: 'aragorn', display_name: 'Aragorn son of Arathorn', seat_index: 2, alignment: 'aligned' },
    { persona_id: 'frodo', display_name: 'Frodo Baggins', seat_index: 3, alignment: 'aligned' },
    { persona_id: 'boromir', display_name: 'Boromir of Gondor', seat_index: 4, alignment: 'aligned_but_tempted' },
    { persona_id: 'legolas', display_name: 'Legolas of the Woodland Realm', seat_index: 5, alignment: 'aligned' },
    { persona_id: 'gimli', display_name: 'Gimli son of Glóin', seat_index: 6, alignment: 'aligned' },
    { persona_id: 'samwise', display_name: 'Samwise Gamgee', seat_index: 7, alignment: 'aligned' },
    {
      persona_id: 'annatar_disguised',
      display_name: 'Mírion, lore-keeper of Lothlórien',
      seat_index: 8,
      alignment: 'misaligned',
      archetype: 'annatar',
      disguise_note:
        'Visiting from Caras Galadhon with letters from Galadriel. Grey-robed, soft-voiced, courteous. The disguise is intact until the reveal phase.',
    },
  ],
  rounds_total: 4,
};
