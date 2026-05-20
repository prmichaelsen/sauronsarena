/* @scry.entry
id: code.arena-ui-vote-phase~5a6f8b21
kind: code
status: active
weight: 0.8
tags: ["scope:arena-ui-worker","topic:component","vote","saurons-arena"]
summary: >
  VotePhase — replaces the InterventionPanel when match_status flips
  to 'voting'. Player picks a seat (clickable list, by seat_id) and
  submits. Phase 1 game-worker contract does not yet accept an
  archetype guess at the API layer — UI displays it for future
  capture but doesn't transmit. Also: vote phase, misaligned-seat
  selection.
rationale: >
  The vote is the player's final commitment — must feel deliberate.
applies: rendering the vote phase, selecting a misaligned seat, submitting the vote
seeded_questions:
  - "How does the vote phase look?"
  - "How is a seat selected in voting?"
@scry.entry.end */

import { useState } from 'react';
import { Vote } from 'lucide-react';
import type { Seat } from '../api';

export interface VotePhaseProps {
  seats: Seat[];
  disabled: boolean;
  onSubmit: (seat_id: string) => void;
}

export function VotePhase({ seats, disabled, onSubmit }: VotePhaseProps) {
  const [pickedSeat, setPickedSeat] = useState<string | null>(null);

  return (
    <div className="vote-phase">
      <h2 className="vote-phase-title">The Vote</h2>
      <p className="vote-phase-prompt">
        Which seat do you believe is the misaligned one?
      </p>
      <ul className="vote-phase-seats">
        {seats.map((s) => (
          <li key={s.seat_id}>
            <button
              type="button"
              className={
                'vote-phase-seat' +
                (pickedSeat === s.seat_id ? ' is-picked' : '')
              }
              onClick={() => setPickedSeat(s.seat_id)}
              aria-pressed={pickedSeat === s.seat_id}
            >
              <span className="vote-phase-seat-name">{s.display_name}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="vote-phase-submit"
        disabled={disabled || pickedSeat === null}
        onClick={() => pickedSeat !== null && onSubmit(pickedSeat)}
      >
        <Vote size={18} /> Submit Vote
      </button>
    </div>
  );
}
