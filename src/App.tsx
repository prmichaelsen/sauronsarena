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
  App.tsx — top-level flow orchestrator. States: lobby → match
  (SeatRoster + PanelSpeechStream + SlashCommandInput, speeches
  streamed via matchTurnStream / SSE) → voting (CouncilMap overlay
  is the vote surface — click a seat or arrow-key + Enter) →
  revealed. ThrottleScreen interrupts at any layer. Pending
  placeholders seed on round_start and resolve in-place on each
  speech event. CALL_VOTE flips match_status via the JSON path.
  Player commands echo into the dialogue stream as synthetic 'you'
  turns. Also: chat-room flow, slash-driven match, SSE streaming
  consumer, vote-on-map, click-to-accuse, council ellipse vote UI.
rationale: >
  Per the originator's 2026-05-20 chat-room directive + the 10:23Z
  vote-on-map amendment + arena-game-worker 0ef843b (SSE streaming).
  The chat-room dialogue feed dominates the screen; voting uses the
  same council geometry the player has been reading all match.
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
  matchTurnStream,
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
import { CouncilMap } from './components/CouncilMap';
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

  // Runs a streaming /match/turn call, seeding placeholders on
  // round_start, replacing them in-place on each speech event, and
  // settling state on round_end. Used for ASK/DEFEND/EXPEL/SKIP/START
  // — every speech-bearing branch. CALL_VOTE still goes through the
  // legacy JSON path (handleCallVote below).
  const runStreamingTurn = useCallback(
    async (match_id: string, intervention: Intervention) => {
      await matchTurnStream(match_id, intervention, {
        onRoundStart: (ev) => {
          const placeholders: PanelTurn[] = ev.speakers.map((s) => ({
            seat_id: s.seat_id,
            display_name: s.display_name,
            content: '',
            round_no: ev.round_no,
            pending: true,
          }));
          setMatch((prev) =>
            prev
              ? {
                  ...prev,
                  turns: [...prev.turns, ...placeholders],
                  round_no: ev.round_no,
                  currentSpeakerSeatId:
                    placeholders[0]?.seat_id ?? prev.currentSpeakerSeatId,
                }
              : prev,
          );
        },
        onSpeech: (ev) => {
          setMatch((prev) => {
            if (!prev) return prev;
            // Replace the latest pending placeholder for this seat.
            const turns = [...prev.turns];
            for (let i = turns.length - 1; i >= 0; i--) {
              if (turns[i].seat_id === ev.seat_id && turns[i].pending) {
                turns[i] = {
                  ...turns[i],
                  content: ev.content,
                  display_name: ev.display_name,
                  pending: false,
                };
                break;
              }
            }
            return {
              ...prev,
              turns,
              currentSpeakerSeatId: ev.seat_id,
            };
          });
        },
        onRoundEnd: (ev) => {
          setMatch((prev) => {
            if (!prev) return prev;
            // Defensive: ensure no placeholder is left pending.
            const turns = prev.turns.map((t) =>
              t.pending ? { ...t, pending: false } : t,
            );
            return {
              ...prev,
              turns,
              busy: false,
              round_no: ev.round_no,
              currentSpeakerSeatId: null,
              expelUsesRemaining:
                intervention.kind === 'EXPEL'
                  ? Math.max(0, prev.expelUsesRemaining - 1)
                  : prev.expelUsesRemaining,
            };
          });
          if (ev.match_status === 'voting') {
            setPhase('voting');
            setTranscript('Voting is open. Choose a seat on the council.');
          }
        },
        onError: (ev) => {
          setError(ev.error);
          setMatch((prev) =>
            prev
              ? {
                  ...prev,
                  busy: false,
                  turns: prev.turns.map((t) =>
                    t.pending ? { ...t, pending: false } : t,
                  ),
                }
              : prev,
          );
        },
      });
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

      // Bootstrap opening round via START intervention (streaming).
      await runStreamingTurn(m.match_id, { kind: 'START' });
    } catch (e) {
      if (e instanceof ThrottledError) setThrottle(e.payload);
      else setError(String(e));
      setMatch((prev) => (prev ? { ...prev, busy: false } : prev));
    }
  }, [runStreamingTurn]);

  const dispatchIntervention = useCallback(
    async (intervention: Intervention, echo: string) => {
      if (!match || match.busy) return;
      // Echo the player's command into the stream BEFORE the network
      // round-trip so the feed feels responsive.
      appendPlayerEcho(echo, match.round_no);
      setMatch((prev) => (prev ? { ...prev, busy: true } : prev));

      // CALL_VOTE doesn't stream — it returns JSON and flips
      // match_status to 'voting'.
      if (intervention.kind === 'CALL_VOTE') {
        try {
          const resp = await matchTurn(match.match.match_id, intervention);
          setPhase(resp.match_status === 'voting' ? 'voting' : 'match');
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
          if (resp.match_status === 'voting') {
            setTranscript('Voting is open. Choose a seat on the council.');
          }
        } catch (e) {
          if (e instanceof ThrottledError) setThrottle(e.payload);
          else setError(String(e));
          setMatch((prev) => (prev ? { ...prev, busy: false } : prev));
        }
        return;
      }

      try {
        await runStreamingTurn(match.match.match_id, intervention);
      } catch (e) {
        if (e instanceof ThrottledError) setThrottle(e.payload);
        else setError(String(e));
        setMatch((prev) =>
          prev
            ? {
                ...prev,
                busy: false,
                turns: prev.turns.map((t) =>
                  t.pending ? { ...t, pending: false } : t,
                ),
              }
            : prev,
        );
      }
    },
    [match, appendPlayerEcho, runStreamingTurn],
  );

  const [voteSubmitting, setVoteSubmitting] = useState(false);

  const submitVoteBySeat = useCallback(
    async (seat: Seat) => {
      if (!match || voteSubmitting) return;
      setVoteSubmitting(true);
      try {
        appendPlayerEcho(`/vote ${seat.display_name}`, match.round_no);
        const resp = await matchVote(match.match.match_id, seat.seat_id);
        setReveal(resp);
        setPhase('revealed');
      } catch (e) {
        if (e instanceof ThrottledError) setThrottle(e.payload);
        else setError(String(e));
      } finally {
        setVoteSubmitting(false);
      }
    },
    [match, appendPlayerEcho, voteSubmitting],
  );

  const handleVoteCancel = useCallback(() => {
    setTranscript(
      'Vote cancelled. Use the council map or type /vote to reopen it.',
    );
    // Stay in voting phase — server still has match_status='voting'.
    // The map is dismissed only on a confirmed vote.
  }, []);

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
        // Per the 2026-05-20 amendment, voting is click-on-map / arrow-
        // key-on-map; the typed `/vote <name>` path is retired. If the
        // player typed it anyway, fall through and submit via the
        // resolved seat id — the map UI is the primary surface, but
        // keyboard-typists shouldn't be punished.
        const seat = seats.find((s) => s.seat_id === result.voted_seat_id);
        if (seat) void submitVoteBySeat(seat);
        return;
      }
      // intervention
      void dispatchIntervention(result.intervention, result.echo);
    },
    [dispatchIntervention, submitVoteBySeat, seats],
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

      {phase === 'voting' && (
        <CouncilMap
          seats={seats}
          onConfirm={(seat) => void submitVoteBySeat(seat)}
          onCancel={handleVoteCancel}
          disabled={voteSubmitting}
        />
      )}

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
