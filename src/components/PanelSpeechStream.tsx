/* @scry.entry
id: code.arena-ui-speech-stream~7d31a8c6
kind: code
status: active
weight: 0.85
tags:
  - "scope:arena-ui-worker"
  - "topic:component"
  - "speech-stream"
  - "panel-turns"
  - "chat-room"
  - "player-echo"
  - "saurons-arena"
summary: >
  PanelSpeechStream — the dominant visual surface of the chat-room
  redesign. Renders a chronological feed of PanelTurn entries plus
  synthetic 'you' turns (player slash-command echoes). Each turn:
  speaker badge + round badge + body paragraphs. Auto-scrolls on new
  arrivals. Busy indicator surfaces the panel-deliberating state.
  Player echoes render in a distinct lane (right-aligned, accent
  color) so the transcript reads as a chat. Also: speech feed,
  deliberation log, player echo turn, chat transcript shape.
rationale: >
  Per the 2026-05-20 chat-room directive: the feed dominates the
  screen and reads as a chat transcript with the player as a
  visible participant.
applies:
  - "rendering the dominant deliberation feed"
  - "showing player slash-command echoes"
  - "showing a busy/thinking indicator"
  - "auto-scrolling on new turns"
seeded_questions:
  - "How does the dialogue feed render?"
  - "Where do player /ask commands appear in the stream?"
  - "Is there a busy indicator?"
  - "Chat-style speech feed Sauron's Arena"
@scry.entry.end */

import { useEffect, useRef } from 'react';
import type { PanelTurn } from '../api';
import { Sigil, personaIdFromDisplayName } from '../sigils';

export interface PanelSpeechStreamProps {
  turns: PanelTurn[];
  busy?: boolean;
}

const PLAYER_SEAT_ID = '__player__';

export function PanelSpeechStream({ turns, busy }: PanelSpeechStreamProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, busy]);

  return (
    <div className="speech-stream" aria-live="polite" aria-label="Deliberation">
      <div className="speech-stream-scroll">
        {turns.length === 0 && (
          <p className="speech-stream-empty">
            The Council assembles. Speech will follow.
          </p>
        )}
        {turns.map((turn, i) => {
          const isPlayer = turn.seat_id === PLAYER_SEAT_ID;
          const persona_id = isPlayer
            ? '__player__'
            : personaIdFromDisplayName(turn.display_name);
          return (
            <article
              key={`${turn.round_no}-${turn.seat_id}-${i}`}
              className={
                'speech-turn' + (isPlayer ? ' speech-turn-player' : '')
              }
            >
              <header className="speech-turn-head">
                <Sigil
                  persona_id={persona_id}
                  className="speech-turn-sigil"
                  width={26}
                  height={26}
                />
                <span className="speech-turn-speaker">
                  {turn.display_name}
                </span>
                <span className="speech-turn-round">r{turn.round_no}</span>
              </header>
              {isPlayer ? (
                <p className="speech-turn-body speech-turn-body-cmd">
                  <code>{turn.content}</code>
                </p>
              ) : (
                turn.content.split(/\n\n+/).map((para, j) => (
                  <p key={j} className="speech-turn-body">
                    {para}
                  </p>
                ))
              )}
            </article>
          );
        })}
        {busy && (
          <div className="speech-thinking" aria-label="Council deliberating">
            <span className="speech-thinking-dot" />
            <span className="speech-thinking-dot" />
            <span className="speech-thinking-dot" />
            <span className="speech-thinking-label">the council deliberates</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
