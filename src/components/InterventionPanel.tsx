/* @scry.entry
id: code.arena-ui-intervention-panel~e9b27f43
kind: code
status: active
weight: 0.85
tags: ["scope:arena-ui-worker","topic:component","intervention","ask","defend","expel","vote","saurons-arena"]
summary: >
  InterventionPanel — four primary action buttons (ASK / DEFEND /
  EXPEL / CALL FOR VOTE) plus SKIP. ASK/DEFEND/EXPEL gate on a
  selected target seat (seat_id). ASK opens a free-text prompt input.
  EXPEL has a max_uses budget (2). CALL FOR VOTE single-click. Uses
  lucide-react icons. Submits an Intervention to onSubmit matching the
  game-worker contract.
rationale: >
  Interventions are the player's only handle on the deliberation —
  the gating logic and the EXPEL budget are load-bearing.
applies: rendering the player action UI, gating actions on target selection, tracking expel uses
seeded_questions:
  - "How does the player ask a question?"
  - "How is the EXPEL budget tracked?"
@scry.entry.end */

import { useState } from 'react';
import {
  MessageSquare,
  Shield,
  UserX,
  Vote,
  SkipForward,
  Send,
} from 'lucide-react';
import type { Intervention } from '../api';

export interface InterventionPanelProps {
  selectedSeatId: string | null;
  selectedSeatName: string | null;
  expelUsesRemaining: number;
  disabled: boolean;
  onSubmit: (intervention: Intervention) => void;
}

type Mode = 'idle' | 'asking';

export function InterventionPanel({
  selectedSeatId,
  selectedSeatName,
  expelUsesRemaining,
  disabled,
  onSubmit,
}: InterventionPanelProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [question, setQuestion] = useState('');

  const requiresTarget = selectedSeatId === null;

  function handleAskOpen() {
    if (!selectedSeatId) return;
    setMode('asking');
  }

  function handleAskSubmit() {
    if (!selectedSeatId || question.trim().length === 0) return;
    onSubmit({
      kind: 'ASK',
      target_seat_id: selectedSeatId,
      prompt: question.trim(),
    });
    setQuestion('');
    setMode('idle');
  }

  function handleDefend() {
    if (!selectedSeatId) return;
    onSubmit({ kind: 'DEFEND', target_seat_id: selectedSeatId });
  }

  function handleExpel() {
    if (!selectedSeatId || expelUsesRemaining <= 0) return;
    onSubmit({ kind: 'EXPEL', target_seat_id: selectedSeatId });
  }

  function handleVote() {
    onSubmit({ kind: 'CALL_VOTE' });
  }

  function handleSkip() {
    onSubmit({ kind: 'SKIP' });
  }

  return (
    <div className="intervention" role="toolbar" aria-label="Interventions">
      <div className="intervention-target">
        {selectedSeatName ? (
          <>
            <span className="intervention-target-label">Target:</span>{' '}
            <strong>{selectedSeatName}</strong>
          </>
        ) : (
          <span className="intervention-target-empty">
            Select a seat to target ASK, DEFEND, or EXPEL.
          </span>
        )}
      </div>

      {mode === 'asking' ? (
        <div className="intervention-ask">
          <input
            type="text"
            className="intervention-ask-input"
            placeholder={`Ask ${selectedSeatName ?? '…'}`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAskSubmit();
              if (e.key === 'Escape') {
                setMode('idle');
                setQuestion('');
              }
            }}
            autoFocus
            maxLength={240}
          />
          <button
            type="button"
            className="intervention-btn intervention-btn-primary"
            onClick={handleAskSubmit}
            disabled={disabled || question.trim().length === 0}
          >
            <Send size={16} /> Send
          </button>
          <button
            type="button"
            className="intervention-btn intervention-btn-ghost"
            onClick={() => {
              setMode('idle');
              setQuestion('');
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="intervention-buttons">
          <button
            type="button"
            className="intervention-btn"
            onClick={handleAskOpen}
            disabled={disabled || requiresTarget}
            title={requiresTarget ? 'Select a seat first' : 'Ask the selected seat a question'}
          >
            <MessageSquare size={18} />
            <span>ASK</span>
          </button>
          <button
            type="button"
            className="intervention-btn"
            onClick={handleDefend}
            disabled={disabled || requiresTarget}
            title={requiresTarget ? 'Select a seat first' : 'Publicly defend the selected seat'}
          >
            <Shield size={18} />
            <span>DEFEND</span>
          </button>
          <button
            type="button"
            className="intervention-btn intervention-btn-danger"
            onClick={handleExpel}
            disabled={disabled || requiresTarget || expelUsesRemaining <= 0}
            title={
              expelUsesRemaining <= 0
                ? 'No EXPEL uses remaining'
                : requiresTarget
                ? 'Select a seat first'
                : 'Publicly accuse the selected seat of misalignment'
            }
          >
            <UserX size={18} />
            <span>
              EXPEL <small>({expelUsesRemaining}/2)</small>
            </span>
          </button>
          <button
            type="button"
            className="intervention-btn intervention-btn-vote"
            onClick={handleVote}
            disabled={disabled}
            title="End deliberation; proceed to vote"
          >
            <Vote size={18} />
            <span>CALL FOR VOTE</span>
          </button>
          <button
            type="button"
            className="intervention-btn intervention-btn-ghost"
            onClick={handleSkip}
            disabled={disabled}
            title="Skip — let the round proceed without intervening"
          >
            <SkipForward size={16} />
            <span>SKIP</span>
          </button>
        </div>
      )}
    </div>
  );
}
