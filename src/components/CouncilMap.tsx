/* @scry.entry
id: code.arena-ui-council-map~b04d6f12
kind: code
status: active
weight: 0.9
tags:
  - "scope:arena-ui-worker"
  - "topic:component"
  - "council-map"
  - "vote-map"
  - "ellipse-layout"
  - "vote-by-click"
  - "keyboard-navigable"
  - "saurons-arena"
summary: >
  CouncilMap — the council-ellipse vote-interaction surface for
  Sauron's Arena. During the voting phase the ellipse layout
  becomes interactive: each seat is a clickable button keyed off
  seat_id, with arrow-key navigation around the ring and
  Enter-to-confirm. Replaces the prior /vote <name> typed-name
  workflow per the 2026-05-20 amendment from the originator:
  "vote should let the user click on the user map, not a separate
  list of characters." Click selects (one-shot confirm pattern via
  outer-prompt) or Enter confirms the keyboard-highlighted seat.
  Esc cancels vote-mode back to chat. Also: vote interface, council
  ellipse, ring of seats, accusation surface, vote by seat.
rationale: >
  Per the originator's 2026-05-20T10:23Z directive, the council
  ellipse is the deliberation geometry — voting should use the
  same geometry. The accusation reads as "I accuse this seat"
  when you click on a seat, vs. "I type your name" in a sidebar
  modal.
applies:
  - "rendering the council-map vote surface"
  - "mapping seats to ellipse positions"
  - "navigating seats via arrow keys"
  - "casting a vote by clicking or pressing Enter"
seeded_questions:
  - "How does the player vote in Sauron's Arena?"
  - "Where is the council-map vote interface?"
  - "How does keyboard navigation around the ellipse work?"
  - "Vote-on-council-map Sauron's Arena"
  - "Click-a-seat to vote"
@scry.entry.end */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Seat } from '../api';
import { Sigil, personaIdFromDisplayName } from '../sigils';

export interface CouncilMapProps {
  seats: Seat[];
  // Called when the player commits a vote (Enter on highlighted, or
  // a confirm-click on the same seat).
  onConfirm: (seat: Seat) => void;
  // Called when the player presses Esc — return focus to chat input.
  onCancel: () => void;
  // Disable interaction while a vote is in flight.
  disabled?: boolean;
}

// Ring layout: place seats around an ellipse. Top of the ellipse is
// the "head of the table" — seat 0. Seats increase clockwise.
function ringPosition(index: number, total: number): { cx: number; cy: number } {
  // Ellipse parameters (in viewBox units, viewBox = 0 0 100 70).
  const cx0 = 50;
  const cy0 = 36;
  const rx = 42;
  const ry = 26;
  // Start at top (-PI/2) and go clockwise.
  const theta = -Math.PI / 2 + (index / total) * Math.PI * 2;
  return {
    cx: cx0 + rx * Math.cos(theta),
    cy: cy0 + ry * Math.sin(theta),
  };
}

export function CouncilMap({
  seats,
  onConfirm,
  onCancel,
  disabled,
}: CouncilMapProps) {
  // Seats sorted by seat_index so positions are stable.
  const ordered = useMemo(() => {
    return [...seats].sort((a, b) => a.seat_index - b.seat_index);
  }, [seats]);

  const [highlight, setHighlight] = useState<number>(0);
  const [pendingConfirm, setPendingConfirm] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Take focus when mounted — keyboard nav should "just work".
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Keep highlight valid if roster changes.
  useEffect(() => {
    if (highlight >= ordered.length) setHighlight(0);
  }, [ordered.length, highlight]);

  const commit = useCallback(
    (idx: number) => {
      if (disabled) return;
      const seat = ordered[idx];
      if (!seat) return;
      onConfirm(seat);
    },
    [disabled, ordered, onConfirm],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        commit(highlight);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % Math.max(1, ordered.length));
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) =>
          (h - 1 + ordered.length) % Math.max(1, ordered.length),
        );
        return;
      }
      // Number keys 1-9 jump directly to that seat (by seat_index+1).
      if (e.key >= '1' && e.key <= '9') {
        const n = parseInt(e.key, 10) - 1;
        if (n < ordered.length) {
          e.preventDefault();
          setHighlight(n);
        }
      }
    },
    [disabled, highlight, ordered.length, commit, onCancel],
  );

  // Click handling: first click highlights + arms confirm, second
  // click on same seat commits. Or click on already-highlighted seat
  // commits immediately. Keeps "are you sure?" out of the way for
  // keyboard users while preventing accidental mouse misclicks.
  const handleSeatClick = useCallback(
    (idx: number) => {
      if (disabled) return;
      if (pendingConfirm === idx || highlight === idx) {
        commit(idx);
        setPendingConfirm(null);
        return;
      }
      setHighlight(idx);
      setPendingConfirm(idx);
    },
    [disabled, pendingConfirm, highlight, commit],
  );

  const highlighted = ordered[highlight];

  return (
    <div
      ref={containerRef}
      className="council-map"
      tabIndex={0}
      role="radiogroup"
      aria-label="Council vote: choose the misaligned seat"
      onKeyDown={handleKey}
    >
      <div className="council-map-prompt">
        <p className="council-map-question">
          Who at this council does not belong?
        </p>
        <p className="council-map-hint">
          {pendingConfirm !== null && highlighted
            ? `Click ${highlighted.display_name} again to confirm — or press Enter. Esc to cancel.`
            : 'Click a seat or use ← → arrows + Enter. Esc cancels.'}
        </p>
      </div>

      <svg
        className="council-map-svg"
        viewBox="0 0 100 70"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {/* Council table — decorative ellipse */}
        <ellipse
          cx={50}
          cy={36}
          rx={32}
          ry={18}
          className="council-map-table"
        />
        {/* Seat anchor points (rendered first; HTML buttons overlay) */}
        {ordered.map((seat, i) => {
          const { cx, cy } = ringPosition(i, ordered.length);
          return (
            <circle
              key={seat.seat_id}
              cx={cx}
              cy={cy}
              r={0.6}
              className="council-map-anchor"
            />
          );
        })}
      </svg>

      <ul className="council-map-seats" role="presentation">
        {ordered.map((seat, i) => {
          const { cx, cy } = ringPosition(i, ordered.length);
          const persona_id = personaIdFromDisplayName(seat.display_name);
          const isHi = highlight === i;
          const isArmed = pendingConfirm === i;
          return (
            <li
              key={seat.seat_id}
              className="council-map-seat-li"
              style={{ left: `${cx}%`, top: `${(cy / 70) * 100}%` }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isHi}
                aria-label={`Vote ${seat.display_name}, seat ${seat.seat_index + 1}`}
                className={
                  'council-map-seat' +
                  (isHi ? ' is-highlighted' : '') +
                  (isArmed ? ' is-armed' : '')
                }
                disabled={disabled}
                onClick={() => handleSeatClick(i)}
                onMouseEnter={() => setHighlight(i)}
              >
                <Sigil
                  persona_id={persona_id}
                  className="council-map-seat-sigil"
                  width={36}
                  height={36}
                />
                <span className="council-map-seat-name">
                  {seat.display_name}
                </span>
                <span className="council-map-seat-index" aria-hidden="true">
                  {seat.seat_index + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
