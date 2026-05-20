/* @scry.entry
id: code.arena-ui-council-table~b2c4e591
kind: code
status: active
weight: 0.8
tags: ["scope:arena-ui-worker","topic:component","council-table","panel-seat-layout","ellipse","saurons-arena"]
summary: >
  CouncilTable renders panel-seats around an ellipse via CSS transforms
  (no external layout libs). Each seat shows display_name, a click
  handler for target selection, and a subtle pulse when its seat_id
  matches currentSpeakerSeatId. Stacks responsively on narrow viewports.
  Also: panel layout, circular seat arrangement, speaker highlight,
  target selection, ring pedestal centerpiece.
rationale: >
  The council-table layout IS the game's visual identity — the round
  shape of the Council communicates the deliberation frame at a glance.
applies: rendering the council, selecting a target seat, highlighting current speaker, mobile responsive stacking
seeded_questions:
  - "Where is the council layout component?"
  - "How are seats positioned around the ellipse?"
  - "How does target selection work?"
@scry.entry.end */

import type { Seat } from '../api';

export interface CouncilTableProps {
  seats: Seat[];
  selectedSeatId: string | null;
  currentSpeakerSeatId: string | null;
  onSelectSeat: (seat_id: string) => void;
}

export function CouncilTable({
  seats,
  selectedSeatId,
  currentSpeakerSeatId,
  onSelectSeat,
}: CouncilTableProps) {
  const count = seats.length || 1;

  return (
    <div className="council-table" role="group" aria-label="Council seats">
      <div className="council-ring">
        <div className="council-pedestal" aria-hidden="true">
          <span className="council-pedestal-glyph">⦿</span>
          <span className="council-pedestal-label">the One</span>
        </div>
        {seats.map((seat, i) => {
          const angle = (360 / count) * i - 90;
          const isSpeaking = currentSpeakerSeatId === seat.seat_id;
          const isSelected = selectedSeatId === seat.seat_id;
          return (
            <button
              key={seat.seat_id}
              type="button"
              className={
                'council-seat' +
                (isSpeaking ? ' is-speaking' : '') +
                (isSelected ? ' is-selected' : '')
              }
              style={
                {
                  ['--seat-angle' as string]: `${angle}deg`,
                } as React.CSSProperties
              }
              onClick={() => onSelectSeat(seat.seat_id)}
              aria-pressed={isSelected}
            >
              <span className="council-seat-inner">
                <span className="council-seat-name">{seat.display_name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
