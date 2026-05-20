/* @scry.entry
id: code.arena-ui-reveal-screen~c8d7e2a3
kind: code
status: active
weight: 0.85
tags: ["scope:arena-ui-worker","topic:component","reveal","scorecard","four-cell","saurons-arena"]
summary: >
  RevealScreen — the four-cell scorecard reveal. Cells: Full Win,
  Partial Win, Type 3 Realism Failure, Standard Loss. Player's actual
  cell is highlighted; the server-provided reveal_text is rendered.
  Play-again button restarts the match. Also: scorecard, four-cell
  reveal, realism failure.
rationale: >
  The reveal IS the game's pedagogical moment — the four-cell shape
  encodes the core teaching.
applies: rendering the reveal, displaying the four-cell scorecard, replay
seeded_questions:
  - "What does the reveal screen show?"
  - "How are the four scorecard cells laid out?"
@scry.entry.end */

import { RefreshCw } from 'lucide-react';
import type { MatchVoteResponse, ScorecardCellId } from '../api';

const CELLS: Array<{
  id: ScorecardCellId;
  title: string;
  shortLabel: string;
}> = [
  { id: 'FULL_WIN',                title: 'Full Win',               shortLabel: 'right answer + identified imposter' },
  { id: 'PARTIAL_WIN',             title: 'Partial Win',            shortLabel: 'right answer + missed imposter' },
  { id: 'TYPE_3_REALISM_FAILURE',  title: 'Type 3 Realism Failure', shortLabel: 'wrong answer despite identifying' },
  { id: 'STANDARD_LOSS',           title: 'Standard Loss',          shortLabel: 'wrong answer + missed imposter' },
];

export interface RevealScreenProps {
  result: MatchVoteResponse;
  onPlayAgain: () => void;
}

export function RevealScreen({ result, onPlayAgain }: RevealScreenProps) {
  const r = result.reveal;
  return (
    <div className="reveal">
      <h2 className="reveal-title">The Council has decided.</h2>
      <p className="reveal-summary">
        The Ring goes to <em>{r.chosen_answer}</em>.<br />
        The misaligned seat was{' '}
        <strong>{r.misaligned_display_name}</strong> —{' '}
        <span className="reveal-real-id">{r.misaligned_archetype}</span>.
      </p>

      <div className="reveal-scorecard" role="grid" aria-label="Scorecard">
        {CELLS.map((cell) => {
          const active = cell.id === result.scorecard;
          return (
            <div
              key={cell.id}
              className={'reveal-cell' + (active ? ' is-active' : '')}
              role="gridcell"
              aria-current={active ? 'true' : undefined}
            >
              <h3 className="reveal-cell-title">{cell.title}</h3>
              <p className="reveal-cell-label">{cell.shortLabel}</p>
              {active && r.reveal_text.split(/\n\n+/).map((para, i) => (
                <p key={i} className="reveal-cell-copy">{para}</p>
              ))}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="reveal-play-again"
        onClick={onPlayAgain}
      >
        <RefreshCw size={16} /> Play again
      </button>
    </div>
  );
}
