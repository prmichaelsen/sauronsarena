/* @scry.entry
id: code.arena-ui-app~a5e9f071
kind: code
status: active
weight: 0.9
tags: ["scope:arena-ui-worker","topic:component","app","flow","orchestration","saurons-arena"]
summary: >
  App.tsx — top-level flow orchestrator. States: lobby → match (council
  table + speech stream + intervention panel) → voting → revealed.
  ThrottleScreen is an interrupt-state surfacing from any layer when a
  ThrottledError lands. Tracks selectedSeatId, cumulative turns, expel
  uses. Bootstraps the opening round via a START intervention. Also:
  app flow, top-level state machine, match lifecycle, throttle
  interrupt.
rationale: >
  This is the file that turns the seven components into a playable
  game. State machine is small enough to live in one component.
applies: orchestrating the match flow, handling throttle interrupts, transitioning between lobby and match and voting and reveal
seeded_questions:
  - "How does the app flow transition between states?"
  - "Where is selectedSeatId tracked?"
  - "How is a throttle interrupt handled?"
  - "match start to reveal flow"
@scry.entry.end */

import { useCallback, useMemo, useState } from 'react';
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
import { CouncilTable } from './components/CouncilTable';
import { PanelSpeechStream } from './components/PanelSpeechStream';
import { InterventionPanel } from './components/InterventionPanel';
import { VotePhase } from './components/VotePhase';
import { RevealScreen } from './components/RevealScreen';
import { ThrottleScreen } from './components/ThrottleScreen';

type Phase = 'lobby' | 'match' | 'voting' | 'revealed';

interface MatchState {
  match: MatchStartResponse;
  turns: PanelTurn[];
  selectedSeatId: string | null;
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

  const seats: Seat[] = useMemo(() => match?.match.seats ?? [], [match]);

  const startMatch = useCallback(async () => {
    setError(null);
    setReveal(null);
    setThrottle(null);
    try {
      const m = await matchStart();
      setMatch({
        match: m,
        turns: [],
        selectedSeatId: null,
        expelUsesRemaining: m.expel_uses_remaining ?? 2,
        busy: true,
        currentSpeakerSeatId: null,
        round_no: m.current_round ?? 0,
      });
      setPhase('match');

      // bootstrap opening round via START intervention
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

  const handleSelectSeat = useCallback((seat_id: string) => {
    setMatch((prev) =>
      prev
        ? {
            ...prev,
            selectedSeatId:
              prev.selectedSeatId === seat_id ? null : seat_id,
          }
        : prev,
    );
  }, []);

  const handleAction = useCallback(
    async (intervention: Intervention) => {
      if (!match || match.busy) return;
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
                  selectedSeatId: null,
                  currentSpeakerSeatId: null,
                  round_no: resp.round_no,
                }
              : prev,
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
                selectedSeatId: null,
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
    [match],
  );

  const handleVoteSubmit = useCallback(
    async (seat_id: string) => {
      if (!match) return;
      try {
        const resp = await matchVote(match.match.match_id, seat_id);
        setReveal(resp);
        setPhase('revealed');
      } catch (e) {
        if (e instanceof ThrottledError) setThrottle(e.payload);
        else setError(String(e));
      }
    },
    [match],
  );

  const handlePlayAgain = useCallback(() => {
    setMatch(null);
    setReveal(null);
    setError(null);
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
          Start Match
        </button>
        {error && <p className="lobby-error">{error}</p>}
        <p className="lobby-status">
          Nine seats. One does not belong.
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

  const selectedSeatName =
    match.selectedSeatId !== null
      ? seats.find((s) => s.seat_id === match.selectedSeatId)?.display_name ??
        null
      : null;

  return (
    <main className="arena">
      <header className="arena-head">
        <h1 className="arena-title">{match.match.scenario.display_name}</h1>
        <p className="arena-objective">{match.match.scenario.objective}</p>
      </header>

      <section className="arena-stage">
        <CouncilTable
          seats={seats}
          selectedSeatId={match.selectedSeatId}
          currentSpeakerSeatId={match.currentSpeakerSeatId}
          onSelectSeat={handleSelectSeat}
        />
        <PanelSpeechStream turns={match.turns} />
      </section>

      {phase === 'match' && (
        <InterventionPanel
          selectedSeatId={match.selectedSeatId}
          selectedSeatName={selectedSeatName}
          expelUsesRemaining={match.expelUsesRemaining}
          disabled={match.busy}
          onSubmit={handleAction}
        />
      )}

      {phase === 'voting' && (
        <VotePhase
          seats={seats}
          disabled={false}
          onSubmit={handleVoteSubmit}
        />
      )}

      {error && <p className="arena-error">{error}</p>}
    </main>
  );
}
