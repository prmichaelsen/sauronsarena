/* @scry.entry
id: code.arena-ui-sigils~5c1f9a02
kind: code
status: active
weight: 0.85
tags:
  - "scope:arena-ui-worker"
  - "topic:component"
  - "sigils"
  - "svg"
  - "heraldry"
  - "saurons-arena"
  - "avatars"
summary: >
  Sigils — per-persona SVG heraldic marks rendered as small avatars
  in the chat-room layout. Monochrome line-art, currentColor stroke,
  24x24 viewBox, ~1.5px stroke, consistent abstraction. Lean into
  Tolkien canonical vocabulary (White Tree, G-rune, Ring, Star of
  Eärendil, leaf of Lothlórien) and design original marks for
  disguised personas with subtle tell. License-clear (original SVG,
  no third-party assets). Also: persona sigil registry, council
  avatars, heraldic SVG, disguise tell.
rationale: >
  Per the originator's 2026-05-20 sigils directive: sigils over
  portraits — no Tolkien likeness, vector-clean, period-fidelity.
  Smart for brand-risk and small-size legibility.
applies:
  - "rendering a persona avatar in chat rows"
  - "rendering a persona avatar in the seat roster"
  - "designing a new persona sigil"
seeded_questions:
  - "Where do persona sigils live?"
  - "What does Annatar's disguise tell look like?"
  - "How do I add a new persona sigil?"
  - "saurons-arena sigil registry"
@scry.entry.end */

import type { SVGProps } from 'react';

type SigilProps = SVGProps<SVGSVGElement>;

const base: SigilProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

// White Tree of Gondor — Aragorn (king of Gondor).
// A central trunk with seven branched limbs in a fan; small leaf at
// the crown. Heraldic, not illustrated.
function Aragorn(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21 V8" />
      <path d="M12 8 C9 7 7 5 6 3" />
      <path d="M12 8 C15 7 17 5 18 3" />
      <path d="M12 9 C10 8 8 7 7 5.5" />
      <path d="M12 9 C14 8 16 7 17 5.5" />
      <path d="M12 10 C10.5 9.5 9.5 8.5 9 7.5" />
      <path d="M12 10 C13.5 9.5 14.5 8.5 15 7.5" />
      <circle cx="12" cy="4" r="0.9" />
      <path d="M10.5 21 H13.5" />
    </svg>
  );
}

// Sword of Gondor — Boromir. Steward, captain, sword-bearer.
// Vertical sword with quillons, pommel at top, point at base —
// inverted to read as a council mark, not a threat.
function Boromir(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 V18" />
      <path d="M9 16 H15" />
      <circle cx="12" cy="3.5" r="1.2" />
      <path d="M12 18 L10.5 21" />
      <path d="M12 18 L13.5 21" />
      <path d="M10.5 16 V17" />
      <path d="M13.5 16 V17" />
    </svg>
  );
}

// Star of Eärendil — Elrond, son of Eärendil. Eight-pointed star.
function Elrond(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 V21" />
      <path d="M3 12 H21" />
      <path d="M5.5 5.5 L18.5 18.5" />
      <path d="M18.5 5.5 L5.5 18.5" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}

// The Ring — Frodo. Simple band with the faint suggestion of
// inscription (two small marks at quarter points).
function Frodo(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 5 V7" />
      <path d="M19 12 H17" />
      <path d="M12 19 V17" />
      <path d="M5 12 H7" />
    </svg>
  );
}

// G-rune over staff — Gandalf. Stylized angular G beside the
// wizard's staff.
function Gandalf(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 3 V21" />
      <path d="M14 3 L11 6" />
      <path d="M14 3 L17 6" />
      <path d="M10 8 H6 V16 H10 V13 H8" />
      <circle cx="14" cy="3.5" r="0.6" />
    </svg>
  );
}

// Battle-axe — Gimli. Dwarven double-bit axe, vertical haft.
function Gimli(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 V21" />
      <path d="M12 8 C9 7 7 8 6 10 C7 12 9 13 12 12" />
      <path d="M12 8 C15 7 17 8 18 10 C17 12 15 13 12 12" />
      <path d="M6 10 L4 10" />
      <path d="M18 10 L20 10" />
    </svg>
  );
}

// Mallorn leaf — Legolas (and Lórien in general). Pointed almond
// with a centerline, stem at base.
function Legolas(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 C7 8 7 14 12 19 C17 14 17 8 12 3 Z" />
      <path d="M12 5 V18" />
      <path d="M12 8 L9.5 10" />
      <path d="M12 8 L14.5 10" />
      <path d="M12 12 L9 14" />
      <path d="M12 12 L15 14" />
      <path d="M12 19 V21" />
    </svg>
  );
}

// Star + Shire-leaf — Samwise. Loyal star above the small leaf of
// Hobbiton soil. Two marks stacked.
function Samwise(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 L13 6 L16 6 L13.5 8 L14.5 11 L12 9.5 L9.5 11 L10.5 8 L8 6 L11 6 Z" />
      <path d="M12 13 C9 15 9 18 12 20 C15 18 15 15 12 13 Z" />
      <path d="M12 14 V19" />
    </svg>
  );
}

// Annatar disguised — a Lórien leaf with one half subtly broken:
// the right ribs are intact, the left ribs are a dotted shadow.
// Reads as a leaf at a glance; on closer look, the wilt is visible.
function AnnatarDisguised(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 C7 8 7 14 12 19 C17 14 17 8 12 3 Z" />
      <path d="M12 5 V18" />
      {/* right side ribs — intact */}
      <path d="M12 8 L14.5 10" />
      <path d="M12 12 L15 14" />
      {/* left side ribs — broken / dashed (the tell) */}
      <path d="M12 8 L9.5 10" strokeDasharray="1 1.5" />
      <path d="M12 12 L9 14" strokeDasharray="1 1.5" />
      {/* small ring at the heart — the gift-giver's mark */}
      <circle cx="12" cy="11" r="0.9" />
      <path d="M12 19 V21" />
    </svg>
  );
}

// Fallback — empty seat / unnamed persona. Plain ring.
function Fallback(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

// Player's own seat — a small upturned eye / observer mark.
// Rendered when the dialogue echoes a player intervention.
function Player(props: SigilProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12 C6 7 10 5 12 5 C14 5 18 7 21 12 C18 17 14 19 12 19 C10 19 6 17 3 12 Z" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

const REGISTRY: Record<string, (p: SigilProps) => JSX.Element> = {
  aragorn: Aragorn,
  boromir: Boromir,
  elrond: Elrond,
  frodo: Frodo,
  gandalf: Gandalf,
  gimli: Gimli,
  legolas: Legolas,
  samwise: Samwise,
  annatar_disguised: AnnatarDisguised,
  // disguise aliases — game-worker may surface annatar under different ids
  annatar: AnnatarDisguised,
  __player__: Player,
};

export interface SigilByIdProps extends SigilProps {
  /** Persona id matching a YAML file in personas/. */
  persona_id?: string | null;
}

/**
 * Render a persona's heraldic sigil. Falls back to a plain ring if
 * the persona is unknown. Inherits color via `currentColor` so the
 * caller controls hue via CSS (e.g. .seat-active sets gold).
 */
export function Sigil({ persona_id, ...rest }: SigilByIdProps) {
  const Component = (persona_id && REGISTRY[persona_id]) || Fallback;
  return <Component {...rest} />;
}

export const sigilIds = Object.keys(REGISTRY);

/**
 * Map a seat's display_name to a persona_id for sigil lookup. The
 * server's Seat object doesn't carry persona_id directly; we infer
 * from display_name substrings. Order matters — Annatar's disguise
 * name ("Mírion, lore-keeper of Lothlórien") must match before
 * generic Lothlórien checks.
 */
export function personaIdFromDisplayName(name: string): string {
  const n = name.toLowerCase();
  // Disguised personas first — the disguise name doesn't include the
  // canonical persona id, so match the disguise tells.
  if (n.includes('mírion') || n.includes('mirion') || n.includes('annatar')) {
    return 'annatar_disguised';
  }
  if (n.includes('aragorn')) return 'aragorn';
  if (n.includes('boromir')) return 'boromir';
  if (n.includes('elrond')) return 'elrond';
  if (n.includes('frodo')) return 'frodo';
  if (n.includes('gandalf')) return 'gandalf';
  if (n.includes('gimli')) return 'gimli';
  if (n.includes('legolas')) return 'legolas';
  if (n.includes('samwise') || n.includes('sam ')) return 'samwise';
  return '';
}
