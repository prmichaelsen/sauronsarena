/* @scry.entry
id: code.arena-ui-speech-stream~7d31a8c6
kind: code
status: active
weight: 0.75
tags: ["scope:arena-ui-worker","topic:component","speech-stream","panel-turns","saurons-arena"]
summary: >
  PanelSpeechStream renders a chronological feed of PanelTurn entries:
  speaker badge + content, latest turn slides in via CSS animation,
  scrollable container auto-scrolls on new arrival. Also: turn feed,
  speech bubbles, deliberation log.
rationale: >
  The speech stream is where the deliberation unfolds for the player.
applies: rendering panel turns, auto-scrolling on new arrivals, displaying speaker attribution
seeded_questions:
  - "How are panel turns displayed?"
  - "Where do new panel speeches appear?"
@scry.entry.end */

import { useEffect, useRef } from 'react';
import type { PanelTurn } from '../api';

export interface PanelSpeechStreamProps {
  turns: PanelTurn[];
}

export function PanelSpeechStream({ turns }: PanelSpeechStreamProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length]);

  return (
    <div className="speech-stream" aria-live="polite" aria-label="Deliberation">
      <div className="speech-stream-scroll">
        {turns.length === 0 && (
          <p className="speech-stream-empty">
            The Council assembles. Speech will follow.
          </p>
        )}
        {turns.map((turn, i) => (
          <article
            key={`${turn.round_no}-${turn.seat_id}-${i}`}
            className="speech-turn"
          >
            <header className="speech-turn-head">
              <span className="speech-turn-speaker">{turn.display_name}</span>
              <span className="speech-turn-round">round {turn.round_no}</span>
            </header>
            {turn.content.split(/\n\n+/).map((para, j) => (
              <p key={j} className="speech-turn-body">{para}</p>
            ))}
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
