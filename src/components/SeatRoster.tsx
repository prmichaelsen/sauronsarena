/* @scry.entry
id: code.arena-ui-seat-roster~7a82bf04
kind: code
status: active
weight: 0.7
tags:
  - "scope:arena-ui-worker"
  - "topic:component"
  - "seat-roster"
  - "sidebar"
  - "chat-room"
  - "saurons-arena"
summary: >
  SeatRoster — compact sidebar/header visualization of the 9 council
  seats for the chat-room redesign. Replaces the dominant ellipse
  layout (CouncilTable) which now lives only on the lobby / vote /
  reveal screens. The roster shows display_name + speaking indicator
  + round number; on desktop renders as a vertical sidebar, on
  mobile collapses to a horizontal strip. No click-to-target — the
  slash-command surface (e.g. /ask gandalf) is the target mechanism.
  Also: roster, council sidebar, who's-here panel, speaking
  indicator.
rationale: >
  Per the originator's 2026-05-20 chat-room directive: the council
  ellipse stays but is reduced to a secondary visualization so the
  dialogue feed can dominate.
applies:
  - "rendering the compact council in chat-room mode"
  - "showing the currently-speaking seat"
  - "displaying round number"
seeded_questions:
  - "Where is the compact council roster?"
  - "How is the speaking seat highlighted in chat-room mode?"
  - "Sidebar of council seats Sauron's Arena"
@scry.entry.end */

import type { Seat } from '../api';
import { Sigil, personaIdFromDisplayName } from '../sigils';

export interface SeatRosterProps {
  seats: Seat[];
  currentSpeakerSeatId: string | null;
  round_no: number;
  roundsTotal: number;
}

export function SeatRoster({
  seats,
  currentSpeakerSeatId,
  round_no,
  roundsTotal,
}: SeatRosterProps) {
  return (
    <aside className="roster" aria-label="Council roster">
      <header className="roster-head">
        <span className="roster-title">Council of Elrond</span>
        <span className="roster-round">
          round {round_no || 1} / {roundsTotal}
        </span>
      </header>
      <ul className="roster-list">
        {seats.map((seat) => {
          const speaking = currentSpeakerSeatId === seat.seat_id;
          const persona_id = personaIdFromDisplayName(seat.display_name);
          return (
            <li
              key={seat.seat_id}
              className={'roster-seat' + (speaking ? ' is-speaking' : '')}
            >
              <Sigil
                persona_id={persona_id}
                className="roster-seat-sigil"
                width={22}
                height={22}
              />
              <span className="roster-seat-name">{seat.display_name}</span>
              {speaking && (
                <span className="roster-seat-speaking" aria-label="speaking">
                  ▸
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="roster-hint">
        Address a seat by name: <code>/ask gandalf …</code>
      </p>
    </aside>
  );
}
