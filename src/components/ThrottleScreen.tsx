/* @scry.entry
id: code.arena-ui-throttle-screen~d2a1c984
kind: code
status: active
weight: 0.75
tags: ["scope:arena-ui-worker","topic:component","throttle","rate-limit","saurons-arena"]
summary: >
  ThrottleScreen — full-screen treatment when the API returns
  {throttled:true,...}. Displays the literal server message and a
  live countdown to retry_after_seconds. Also: throttle, rate limit,
  Sauron has retreated, daily spend cap, countdown timer.
rationale: >
  Throttling is one of the user-facing failure modes the design
  explicitly calls out (Sauron has retreated to recover his strength).
  Surfacing the literal server message keeps the framing intact;
  the countdown gives the player a concrete next-step.
applies: rendering throttle state, counting down to retry, displaying server-provided message verbatim
seeded_questions:
  - "What happens when the API throttles?"
  - "Where is the retry countdown rendered?"
  - "Sauron has retreated message"
@scry.entry.end */

import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import type { ThrottlePayload } from '../api';

export interface ThrottleScreenProps {
  payload: ThrottlePayload;
  onRetry: () => void;
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec.toString().padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

export function ThrottleScreen({ payload, onRetry }: ThrottleScreenProps) {
  const [remaining, setRemaining] = useState(payload.retry_after_seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = window.setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [remaining]);

  return (
    <div className="throttle">
      <CloudOff className="throttle-icon" size={48} aria-hidden="true" />
      <h2 className="throttle-title">{payload.message}</h2>
      <p className="throttle-countdown">
        Returns in <strong>{formatCountdown(remaining)}</strong>
      </p>
      <button
        type="button"
        className="throttle-retry"
        onClick={onRetry}
        disabled={remaining > 0}
      >
        {remaining > 0 ? 'Waiting…' : 'Try again'}
      </button>
    </div>
  );
}
