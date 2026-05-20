/* @scry.entry
id: code.arena-ui-app~a5e9f071
kind: code
status: active
weight: 0.95
tags:
  - "scope:arena-ui-worker"
  - "topic:component"
  - "app"
  - "flow"
  - "orchestration"
  - "chat-room"
  - "slash-command-flow"
  - "saurons-arena"
summary: >
  App.tsx — top-level flow orchestrator (chat-room redesign 2026-05-20).
  States: lobby → match (SeatRoster + PanelSpeechStream + SlashCommandInput)
  → voting (still chat-driven: /vote name) → revealed. ThrottleScreen
  interrupts at any layer. Replaces the click-driven InterventionPanel
  surface with the SlashCommandInput. Player commands are echoed into
  the dialogue stream as synthetic 'you' turns so the deliberation log
  reads as a chat transcript. Also: chat-room flow, slash-driven
  match, player echo turns, top-level state machine.
rationale: >
  Per the originator's 2026-05-20 chat-room directive: turn the match
  into a chat-room with a single command bar. The state machine
  shrinks; the dialogue feed dominates the screen.
applies:
  - "orchestrating the chat-room match flow"
  - "handling slash-command submissions"
  - "echoing player commands into the speech stream"
  - "transitioning lobby → match → voting → reveal"
seeded_questions:
  - "How does the chat-room flow work?"
  - "How are player commands echoed into the stream?"
  - "How does /vote transition to the voting phase?"
  - "Chat-room state machine Sauron's Arena"
@scry.entry.end */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  matchStart,
  matchTurn,
  matchVote,
  ThrottledError,
} from './api';
import type {
  Intervention,
  MatchStartResponse,
  MatchVoteResponse,
  PanelTurn,
  Seat,
  ThrottlePayload,
} from './api';
import { SeatRoster } from './components/SeatRoster';
import { PanelSpeechStream } from './components/PanelSpeechStream';
import { SlashCommandInput, type ParseResult } from './components/SlashCommandInput';
import { HelpOverlay } from './components/HelpOverlay';
import { RevealScreen } from './components/RevealScreen';
import { ThrottleScreen } from './components/ThrottleScreen';

type Phase = 'lobby' | 'match' | 'voting' | 'revealed';

// Synthetic turn rendered in the dialogue stream when the player
// issues a command. Echoed as a 'you' speaker so the feed reads as a
// chat transcript.
const PLAYER_SEAT_ID = '__player__';
const PLAYER_DISPLAY_NAME = 'you';

interface MatchState {
  match: MatchStartResponse;
  turns: PanelTurn[];
  expelUsesRemaining: number;
  busy: boolean;
  currentSpeakerSeatId: string | null;
  round_no: number;
}

export function App() {
  const [phase, setPhase] = useState<Phase>('lobby');
  const [match, setMatch] = useState<MatchState | null>(null);
  const [reveal, setReveal] = useState<MatchVoteResponse | null>(null);
  const [throttle, setThrottle] = useState<ThrottlePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  // Display transient error/info echoes briefly in the dialogue feed.
  useEffect(() => {
    if (!transcript) return;
    const t = setTimeout(() => setTranscript(null), 4000);
    return () => clearTimeout(t);
  }, [transcript]);

  const seats: Seat[] = useMemo(() => match?.match.seats ?? [], [match]);

  const appendPlayerEcho = useCallback(
    (echo: string, round_no: number) => {
      setMatch((prev) =>
        prev
          ? {
              ...prev,
              turns: [
                ...prev.turns,
                {
                  seat_id: PLAYER_SEAT_ID,
                  display_name: PLAYER_DISPLAY_NAME,
                  content: echo,
                  round_no,
                },
              ],
            }
          : prev,
      );
    },
    [],
  );

  const startMatch = useCallback(async () => {
    setError(null);
    setReveal(null);
    setThrottle(null);
    setTranscript(null);
    try {
      const m = await matchStart();
      setMatch({
        match: m,
        turns: [],
        expelUsesRemaining: m.expel_uses_remaining ?? 2,
        busy: true,
        currentSpeakerSeatId: null,
        round_no: m.current_round ?? 0,
      });
      setPhase('match');

      // Bootstrap opening round via START intervention.
      const first = await matchTurn(m.match_id, { kind: 'START' });
      const opening: PanelTurn[] = first.turns.map((t) => ({
        seat_id: t.seat_id,
        display_name: t.display_name,
        content: t.content,
        round_no: first.round_no,
      }));
      setMatch((prev) =>
        prev
          ? {
              ...prev,
              turns: [...prev.turns, ...opening],
              currentSpeakerSeatId:
                opening[opening.length - 1]?.seat_id ?? null,
              busy: false,
              round_no: first.round_no,
            }
          : prev,
      );
    } catch (e) {
      if (e instanceof ThrottledError) setThrottle(e.payload);
      else setError(String(e));
      setMatch((prev) => (prev ? { ...prev, busy: false } : prev));
    }
  }, []);

  const dispatchIntervention = useCallback(
    async (intervention: Intervention, echo: string) => {
      if (!match || match.busy) return;
      // Echo the player's command into the stream BEFORE the network
      // round-trip so the feed feels responsive.
      appendPlayerEcho(echo, match.round_no);
      setMatch((prev) => (prev ? { ...prev, busy: true } : prev));
      try {
        const resp = await matchTurn(match.match.match_id, intervention);
        if (resp.match_status === 'voting') {
          setPhase('voting');
          setMatch((prev) =>
            prev
              ? {
                  ...prev,
                  busy: false,
                  currentSpeakerSeatId: null,
                  round_no: resp.round_no,
                }
              : prev,
          );
          setTranscript(
            'Voting is open. Type /vote <name> to cast your ballot.',
          );
          return;
        }
        const incoming: PanelTurn[] = resp.turns.map((t) => ({
          seat_id: t.seat_id,
          display_name: t.display_name,
          content: t.content,
          round_no: resp.round_no,
        }));
        setMatch((prev) =>
          prev
            ? {
                ...prev,
                busy: false,
                currentSpeakerSeatId:
                  incoming[incoming.length - 1]?.seat_id ??
                  prev.currentSpeakerSeatId,
                expelUsesRemaining:
                  intervention.kind === 'EXPEL'
                    ? Math.max(0, prev.expelUsesRemaining - 1)
                    : prev.expelUsesRemaining,
                turns: [...prev.turns, ...incoming],
                round_no: resp.round_no,
              }
            : prev,
        );
      } catch (e) {
        if (e instanceof ThrottledError) setThrottle(e.payload);
        else setError(String(e));
        setMatch((prev) => (prev ? { ...prev, busy: false } : prev));
      }
    },
    [match, appendPlayerEcho],
  );

  const submitVote = useCallback(
    async (seat_id: string, seat_name: string) => {
      if (!match) return;
      try {
        appendPlayerEcho(`/vote ${seat_name}`, match.round_no);
        const resp = await matchVote(match.match.match_id, seat_id);
        setReveal(resp);
        setPhase('revealed');
      } catch (e) {
        if (e instanceof ThrottledError) setThrottle(e.payload);
        else setError(String(e));
      }
    },
    [match, appendPlayerEcho],
  );

  const handleSlashSubmit = useCallback(
    (result: ParseResult) => {
      if (result.kind === 'error') {
        setTranscript(result.message);
        return;
      }
      if (result.kind === 'help') {
        setHelpOpen(true);
        return;
      }
      if (result.kind === 'unknown') {
        setTranscript(result.message);
        return;
      }
      if (result.kind === 'vote') {
        void submitVote(result.voted_seat_id, result.voted_seat_name);
        return;
      }
      // intervention
      void dispatchIntervention(result.intervention, result.echo);
    },
    [dispatchIntervention, submitVote],
  );

  const handlePlayAgain = useCallback(() => {
    setMatch(null);
    setReveal(null);
    setError(null);
    setTranscript(null);
    setPhase('lobby');
  }, []);

  const handleThrottleRetry = useCallback(() => {
    setThrottle(null);
  }, []);

  // ---- render ----

  if (throttle) {
    return <ThrottleScreen payload={throttle} onRetry={handleThrottleRetry} />;
  }

  if (phase === 'lobby') {
    return (
      <main className="lobby">
        <h1>Sauron&rsquo;s Arena</h1>
        <p className="tagline">
          Find the misaligned seat at the Council of Elrond before the vote.
        </p>
        <button type="button" className="lobby-start" onClick={startMatch}>
          Enter the Council
        </button>
        {error && <p className="lobby-error">{error}</p>}
        <p className="lobby-status">
          Nine seats. One does not belong.<br />
          Type <code>/help</code> in-match for commands.
        </p>
      </main>
    );
  }

  if (phase === 'revealed' && reveal) {
    return <RevealScreen result={reveal} onPlayAgain={handlePlayAgain} />;
  }

  if (!match) {
    return (
      <main className="lobby">
        <p className="lobby-status">Loading…</p>
      </main>
    );
  }

  const slashPhase: 'active' | 'voting' = phase === 'voting' ? 'voting' : 'active';

  return (
    <main className="chatroom">
      <header className="chatroom-head">
        <div className="chatroom-title-block">
          <h1 className="chatroom-title">
            {match.match.scenario.display_name}
          </h1>
          <p className="chatroom-objective">{match.match.scenario.objective}</p>
        </div>
        <div className="chatroom-status">
          <span className="chatroom-status-round">
            round {match.round_no || 1} of {match.match.scenario.rounds_total}
          </span>
          {phase === 'voting' && (
            <span className="chatroom-status-voting">voting open</span>
          )}
        </div>
      </header>

      <div className="chatroom-body">
        <SeatRoster
          seats={seats}
          currentSpeakerSeatId={match.currentSpeakerSeatId}
          round_no={match.round_no}
          roundsTotal={match.match.scenario.rounds_total}
        />

        <section className="chatroom-stream" aria-label="Deliberation stream">
          <PanelSpeechStream turns={match.turns} busy={match.busy} />
          {transcript && (
            <div className="chatroom-toast" role="status">
              {transcript}
            </div>
          )}
        </section>
      </div>

      <SlashCommandInput
        seats={seats}
        phase={slashPhase}
        expelUsesRemaining={match.expelUsesRemaining}
        disabled={match.busy && phase !== 'voting'}
        onSubmit={handleSlashSubmit}
      />

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      {error && <p className="chatroom-error">{error}</p>}
    </main>
  );
}
