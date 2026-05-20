/* @scry.entry
id: code.arena-ui-cap-policy-modal~9af3c021
kind: code
status: active
weight: 0.7
tags:
  - "scope:arena-ui-worker"
  - "topic:component"
  - "cap-policy"
  - "modal"
  - "saurons-arena"
summary: >
  CapPolicyModal — inline modal launched from the lobby/header
  "cap policy" button. Renders the verbatim cap_policy.rationale
  text fetched from /api/meta as the source of truth, plus the
  system-wide daily spend ceiling and spent-today numbers. The
  per-user daily cap was removed 2026-05-20; only the system-wide
  spend ceiling remains. Closes on backdrop click, Escape, or the
  close button. Also: cap rationale modal, policy modal, honest
  cap explanation, system spend cap surface, free game cap surface.
rationale: >
  The directive requires the rationale text live on the server so
  cap changes propagate without a UI redeploy. The modal is the
  primary in-app surface that satisfies "make the policy readable
  without grepping code."
applies:
  - "explaining the cap policy in-app"
  - "rendering the rationale text verbatim from the server"
  - "linking out to /about for the persistent paragraph"
seeded_questions:
  - "How is the cap policy surfaced in-app?"
  - "Where does the rationale text come from?"
  - "Cap policy modal Sauron's Arena"
@scry.entry.end */

import { useEffect } from 'react';
import type { MetaResponse } from '../api';

interface CapPolicyModalProps {
  meta: MetaResponse | null;
  onClose: () => void;
}

export function CapPolicyModal({
  meta,
  onClose,
}: CapPolicyModalProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="cap-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Cap policy"
      onClick={onClose}
    >
      <div
        className="cap-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cap-modal-head">
          <h2>Why is there a cap?</h2>
          <button
            type="button"
            className="cap-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {meta ? (
          <div className="cap-modal-body">
            <p className="cap-modal-rationale">{meta.cap_policy.rationale}</p>
            <dl className="cap-modal-numbers">
              <div>
                <dt>Daily project spend ceiling</dt>
                <dd>
                  ${(meta.cap_policy.daily_spend_cap_usd_cents / 100).toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>Spent today</dt>
                <dd>
                  ${(meta.current.spent_cents / 100).toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>Resets</dt>
                <dd>Midnight UTC</dd>
              </div>
            </dl>
            <p className="cap-modal-footnote">
              The full policy is also at{' '}
              <a href="/about">sauronsarena.com/about</a>.
            </p>
          </div>
        ) : (
          <div className="cap-modal-body">
            <p className="cap-modal-rationale">Loading policy…</p>
          </div>
        )}
      </div>
    </div>
  );
}
