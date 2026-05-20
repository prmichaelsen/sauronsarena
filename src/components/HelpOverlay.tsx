/* @scry.entry
id: code.arena-ui-help-overlay~9c4e1a78
kind: code
status: active
weight: 0.6
tags:
  - "scope:arena-ui-worker"
  - "topic:component"
  - "help"
  - "slash-command-reference"
  - "chat-room"
  - "saurons-arena"
summary: >
  HelpOverlay — modal panel surfaced when the player types /help.
  Lists the slash-command surface (/ask, /say, /defend, /expel,
  /vote, /skip, /help) with usage hints, and notes keyboard
  shortcuts (Tab, ArrowUp/Down, Esc). /say is the broadcast-to-
  council command (no target). Closes on overlay click or Esc.
  Also: command reference, /help, /say broadcast, keyboard
  reference.
rationale: >
  The slash-command surface needs a discoverable command list; /help
  is the canonical entry point per the chat-room redesign directive.
applies:
  - "rendering the /help command reference"
  - "showing keyboard shortcuts"
seeded_questions:
  - "What commands does the arena accept?"
  - "How do I close the help overlay?"
@scry.entry.end */

import { useEffect } from 'react';

export interface HelpOverlayProps {
  onClose: () => void;
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="help-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command reference"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="help-overlay-card">
        <header className="help-overlay-head">
          <h2>Commands</h2>
          <button
            type="button"
            className="help-overlay-close"
            onClick={onClose}
            aria-label="Close help"
          >
            ✕
          </button>
        </header>

        <dl className="help-overlay-list">
          <div className="help-overlay-row">
            <dt><code>/ask &lt;name&gt; &lt;question&gt;</code></dt>
            <dd>Ask a council seat a direct question.</dd>
          </div>
          <div className="help-overlay-row">
            <dt><code>/say &lt;message&gt;</code></dt>
            <dd>
              Address the full council. One to three seats may answer,
              depending on the room.
            </dd>
          </div>
          <div className="help-overlay-row">
            <dt><code>/defend &lt;name&gt;</code></dt>
            <dd>Publicly defend a seat against accusation.</dd>
          </div>
          <div className="help-overlay-row">
            <dt><code>/expel &lt;name&gt;</code></dt>
            <dd>
              Accuse a seat of misalignment. Limited to two uses per
              match.
            </dd>
          </div>
          <div className="help-overlay-row">
            <dt><code>/vote</code></dt>
            <dd>End deliberation and open the vote.</dd>
          </div>
          <div className="help-overlay-row">
            <dt><code>/vote &lt;name&gt;</code></dt>
            <dd>(During voting) cast your ballot.</dd>
          </div>
          <div className="help-overlay-row">
            <dt><code>/skip</code></dt>
            <dd>Let the round proceed without intervening.</dd>
          </div>
          <div className="help-overlay-row">
            <dt><code>/help</code></dt>
            <dd>Show this reference.</dd>
          </div>
        </dl>

        <section className="help-overlay-keys">
          <h3>Keyboard</h3>
          <ul>
            <li><kbd>Tab</kbd> complete a character name</li>
            <li><kbd>↑</kbd> / <kbd>↓</kbd> recall previous commands</li>
            <li><kbd>Esc</kbd> clear the input (or close this)</li>
            <li><kbd>Enter</kbd> send</li>
          </ul>
        </section>

        <p className="help-overlay-footer">
          Names match by substring, case-insensitive — <code>/ask gan</code>
          {' '}resolves to Gandalf.
        </p>
      </div>
    </div>
  );
}
