/* @scry.entry
id: code.arena-ui-slash-input~5b3f7c12
kind: code
status: active
weight: 0.95
tags:
  - "scope:arena-ui-worker"
  - "topic:component"
  - "slash-command"
  - "chat-room"
  - "keyboard-first"
  - "tab-complete"
  - "saurons-arena"
  - "intervention-input"
summary: >
  SlashCommandInput — the player's primary interaction surface for
  Sauron's Arena (chat-room redesign 2026-05-20). Single text input
  at the bottom of the screen, Discord/Slack-style. Parses slash
  commands /ask /say /defend /expel /vote /skip /help and resolves
  them to Intervention payloads or a CALL_VOTE-then-vote chain.
  /say is the broadcast-to-council command (no target; 1–3
  characters respond organically). Tab completes character names
  from the seat roster. Up/Down arrows recall history. Esc clears.
  Enter submits. Replaces the old click-driven InterventionPanel
  surface. Also: chat input, command bar, /ask /say /defend
  /expel /vote /help, broadcast command, tab completion, command
  history, keyboard-first, slash parser.
rationale: >
  The originator's first live playthrough revealed click-driven
  interventions break reading flow and waste screen real estate.
  Chat-room UX matches the deliberation mental model — type to
  participate in council, don't click through menus.
applies:
  - "parsing slash commands"
  - "rendering the chat-room input"
  - "tab-completing character names"
  - "recalling command history"
  - "submitting an intervention from text"
  - "displaying /help in-line"
seeded_questions:
  - "How does the player ask Gandalf a question?"
  - "How does tab completion work in the arena UI?"
  - "Where is the slash command parser?"
  - "What commands does the chat input accept?"
  - "How does /vote work in active vs voting phase?"
  - "Slack-style command bar Sauron's Arena"
@scry.entry.end */

import { useEffect, useRef, useState } from 'react';
import type { Intervention } from '../api';

export type ParseError = {
  kind: 'error';
  message: string;
};

export type ParseResult =
  | ({ kind: 'intervention' } & { intervention: Intervention; echo: string })
  | { kind: 'vote'; voted_seat_id: string; voted_seat_name: string; echo: string }
  | { kind: 'help'; echo: string }
  | { kind: 'unknown'; echo: string; message: string }
  | ParseError;

export interface SlashCommandInputProps {
  // Roster of seats currently in the match — used for /ask <name> resolution
  // and tab completion. The map's keys are display_name (case-insensitive
  // substring-matchable).
  seats: Array<{ seat_id: string; display_name: string }>;
  // 'active' = ASK/DEFEND/EXPEL/CALL_VOTE/SKIP available.
  // 'voting' = only /vote <name> is meaningful.
  phase: 'active' | 'voting';
  expelUsesRemaining: number;
  disabled: boolean;
  // Submit parsed result. Active-phase parse may yield 'intervention';
  // voting-phase parse may yield 'vote' (resolved seat_id). 'help' is
  // handled inline (no submission).
  onSubmit: (result: ParseResult) => void;
}

const HISTORY_CAP = 50;

// Substring (case-insensitive) match against display_name. Returns the
// matching seats sorted by best prefix match first.
function resolveSeats(
  seats: Array<{ seat_id: string; display_name: string }>,
  query: string,
): Array<{ seat_id: string; display_name: string }> {
  if (!query) return [];
  const q = query.toLowerCase();
  const prefix: Array<{ seat_id: string; display_name: string }> = [];
  const substr: Array<{ seat_id: string; display_name: string }> = [];
  for (const s of seats) {
    const n = s.display_name.toLowerCase();
    if (n.startsWith(q)) prefix.push(s);
    else if (n.includes(q)) substr.push(s);
  }
  return [...prefix, ...substr];
}

function parseCommand(
  raw: string,
  seats: Array<{ seat_id: string; display_name: string }>,
  phase: 'active' | 'voting',
  expelUsesRemaining: number,
): ParseResult {
  const echo = raw.trim();
  if (!echo.startsWith('/')) {
    return {
      kind: 'error',
      message:
        'Commands begin with a slash. Try /help for the list of commands.',
    };
  }

  const body = echo.slice(1).trim();
  const firstSpace = body.indexOf(' ');
  const verb = (firstSpace === -1 ? body : body.slice(0, firstSpace))
    .toLowerCase();
  const rest = firstSpace === -1 ? '' : body.slice(firstSpace + 1).trim();

  if (verb === 'help' || verb === 'h' || verb === '?') {
    return { kind: 'help', echo };
  }

  if (verb === 'vote') {
    if (phase === 'voting') {
      // /vote <name> submits the vote.
      if (!rest) {
        return {
          kind: 'error',
          message: 'Voting is open. Type /vote <name> to cast your ballot.',
        };
      }
      const matches = resolveSeats(seats, rest);
      if (matches.length === 0) {
        return {
          kind: 'error',
          message: `No council seat matches "${rest}". Try /vote <name>.`,
        };
      }
      const seat = matches[0];
      return {
        kind: 'vote',
        voted_seat_id: seat.seat_id,
        voted_seat_name: seat.display_name,
        echo,
      };
    }
    // active phase /vote = CALL_VOTE
    return {
      kind: 'intervention',
      intervention: { kind: 'CALL_VOTE' },
      echo,
    };
  }

  if (phase === 'voting') {
    return {
      kind: 'error',
      message:
        'Voting is open. Type /vote <name> to cast your ballot. (Other commands are disabled.)',
    };
  }

  if (verb === 'skip' || verb === 's') {
    return {
      kind: 'intervention',
      intervention: { kind: 'SKIP' },
      echo,
    };
  }

  if (verb === 'say') {
    // /say <message> — broadcast to the full council. No target seat;
    // the game engine selects 1–3 responders organically.
    if (!rest) {
      return {
        kind: 'error',
        message:
          '/say requires a message. Try /say <what you want the council to hear>.',
      };
    }
    return {
      kind: 'intervention',
      intervention: { kind: 'SAY', prompt: rest },
      echo: `/say ${rest}`,
    };
  }

  if (verb === 'ask' || verb === 'defend' || verb === 'expel') {
    // /ask <name> <question?>, /defend <name>, /expel <name>
    if (!rest) {
      return {
        kind: 'error',
        message: `/${verb} requires a character. Try /${verb} <name>.`,
      };
    }
    // For /ask: first token is character; rest is the question.
    // For /defend & /expel: rest is just the character.
    let charQuery = rest;
    let question = '';
    if (verb === 'ask') {
      const sp = rest.indexOf(' ');
      if (sp !== -1) {
        charQuery = rest.slice(0, sp);
        question = rest.slice(sp + 1).trim();
      }
    }
    const matches = resolveSeats(seats, charQuery);
    if (matches.length === 0) {
      return {
        kind: 'error',
        message: `No council seat matches "${charQuery}". Tab-complete to see options.`,
      };
    }
    const seat = matches[0];

    if (verb === 'expel') {
      if (expelUsesRemaining <= 0) {
        return {
          kind: 'error',
          message: 'No EXPEL uses remaining (limit: 2 per match).',
        };
      }
      return {
        kind: 'intervention',
        intervention: { kind: 'EXPEL', target_seat_id: seat.seat_id },
        echo: `/expel ${seat.display_name}`,
      };
    }

    if (verb === 'defend') {
      return {
        kind: 'intervention',
        intervention: { kind: 'DEFEND', target_seat_id: seat.seat_id },
        echo: `/defend ${seat.display_name}`,
      };
    }

    // verb === 'ask'
    if (!question) {
      return {
        kind: 'error',
        message: `/ask requires a question. Try /ask ${seat.display_name} <your question>`,
      };
    }
    return {
      kind: 'intervention',
      intervention: {
        kind: 'ASK',
        target_seat_id: seat.seat_id,
        prompt: question,
      },
      echo: `/ask ${seat.display_name} ${question}`,
    };
  }

  return {
    kind: 'unknown',
    echo,
    message: `Unknown command: /${verb}. Try /help.`,
  };
}

// Tab-completion engine. Returns the suggested completed text, or null
// if no completion applies.
function completeAt(
  value: string,
  caret: number,
  seats: Array<{ seat_id: string; display_name: string }>,
): { next: string; nextCaret: number } | null {
  // Only complete at end of string for simplicity.
  if (caret !== value.length) return null;
  if (!value.startsWith('/')) return null;

  const body = value.slice(1);
  // Find verb
  const firstSpace = body.indexOf(' ');
  if (firstSpace === -1) {
    // Completing the verb itself
    const verbs = ['ask', 'say', 'defend', 'expel', 'vote', 'skip', 'help'];
    const prefix = body.toLowerCase();
    const matches = verbs.filter((v) => v.startsWith(prefix));
    if (matches.length === 0) return null;
    const next = '/' + matches[0] + ' ';
    return { next, nextCaret: next.length };
  }

  const verb = body.slice(0, firstSpace).toLowerCase();
  if (!['ask', 'defend', 'expel', 'vote'].includes(verb)) return null;

  // Find the character-name token. For /ask, it's the first arg only;
  // subsequent tokens are the question (don't autocomplete).
  const rest = body.slice(firstSpace + 1);
  if (verb === 'ask') {
    // Only complete the FIRST word after /ask
    const secondSpace = rest.indexOf(' ');
    if (secondSpace !== -1) return null; // already past the name
    const matches = resolveSeats(seats, rest);
    if (matches.length === 0) return null;
    const completed = matches[0].display_name;
    const next = `/ask ${completed} `;
    return { next, nextCaret: next.length };
  }

  // /defend, /expel, /vote — single name argument
  const matches = resolveSeats(seats, rest);
  if (matches.length === 0) return null;
  const completed = matches[0].display_name;
  const next = `/${verb} ${completed}`;
  return { next, nextCaret: next.length };
}

export function SlashCommandInput({
  seats,
  phase,
  expelUsesRemaining,
  disabled,
  onSubmit,
}: SlashCommandInputProps) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Refocus the input whenever phase changes / disabled clears.
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled, phase]);

  // Recompute a soft ghost-hint for tab-completion preview as the
  // player types.
  useEffect(() => {
    if (!value.startsWith('/')) {
      setHint(null);
      return;
    }
    const completion = completeAt(value, value.length, seats);
    if (!completion || completion.next === value) {
      setHint(null);
      return;
    }
    if (completion.next.startsWith(value)) {
      setHint(completion.next.slice(value.length));
    } else {
      setHint(null);
    }
  }, [value, seats]);

  function handleSubmit() {
    if (disabled) return;
    const trimmed = value.trim();
    if (!trimmed) return;

    const result = parseCommand(trimmed, seats, phase, expelUsesRemaining);

    // Always record in history (even errors — player may want to recall
    // and fix).
    setHistory((h) => {
      const next = [...h, trimmed];
      if (next.length > HISTORY_CAP) next.shift();
      return next;
    });
    setHistoryIndex(null);

    onSubmit(result);
    setValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const caret = inputRef.current?.selectionStart ?? value.length;
      const completion = completeAt(value, caret, seats);
      if (completion) {
        setValue(completion.next);
        // Restore caret on next tick.
        queueMicrotask(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = completion.nextCaret;
            inputRef.current.selectionEnd = completion.nextCaret;
          }
        });
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setValue('');
      setHistoryIndex(null);
      return;
    }
    if (e.key === 'ArrowUp') {
      if (history.length === 0) return;
      e.preventDefault();
      const nextIdx =
        historyIndex === null
          ? history.length - 1
          : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setValue(history[nextIdx] ?? '');
      return;
    }
    if (e.key === 'ArrowDown') {
      if (historyIndex === null) return;
      e.preventDefault();
      const nextIdx = historyIndex + 1;
      if (nextIdx >= history.length) {
        setHistoryIndex(null);
        setValue('');
      } else {
        setHistoryIndex(nextIdx);
        setValue(history[nextIdx] ?? '');
      }
      return;
    }
  }

  const placeholder =
    phase === 'voting'
      ? 'Vote by clicking a seat on the map, or arrow keys + Enter.'
      : 'Type a command (e.g. /ask gandalf why? — or /say to address the council). /help for list.';

  return (
    <form
      className="slash-input"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="slash-input-row">
        <span className="slash-input-caret" aria-hidden="true">›</span>
        <div className="slash-input-field">
          <input
            ref={inputRef}
            type="text"
            className="slash-input-text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            aria-label="Command input"
          />
          {hint && (
            <span className="slash-input-hint" aria-hidden="true">
              <span className="slash-input-hint-shadow">{value}</span>
              <span className="slash-input-hint-completion">{hint}</span>
            </span>
          )}
        </div>
        <span className="slash-input-affordance" aria-hidden="true">
          {phase === 'voting' ? 'VOTE' : `expel ${expelUsesRemaining}/2`}
        </span>
      </div>
    </form>
  );
}
