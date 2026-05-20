/* @scry.entry
id: code.arena-ui-matches-indicator~bcde2f1a
kind: code
status: active
weight: 0.7
tags:
  - "scope:arena-ui-worker"
  - "topic:component"
  - "matches-remaining"
  - "indicator"
  - "cap-policy"
  - "saurons-arena"
summary: >
  MatchesRemainingIndicator — small clickable counter in the app
  header showing "N matches remaining today" (or "N matches played
  today (admin bypass)" when bypass=true). Hides entirely on the
  fresh-day case (full cap, zero used). Clicking opens the
  CapPolicyModal. Source data is the StartMeta / MetaResponse.current
  block, refreshed on app boot and after every /api/match/start.
  Also: cap indicator, cap counter, rate-cap surface, admin bypass
  counter, header-mounted counter.
rationale: >
  Players need to see the cap before hitting it; the prior UX only
  surfaced the cap after exceeding it. Required by the 2026-05-20
  originator directive on visible-cap UX.
applies:
  - "showing remaining matches in the header"
  - "rendering the admin-bypass counter"
  - "launching the cap-policy modal"
seeded_questions:
  - "Where is the matches-remaining indicator?"
  - "How does the indicator hide on a fresh day?"
  - "How does the admin bypass mode display?"
@scry.entry.end */

import type { CSSProperties } from 'react';

export interface MatchesIndicatorData {
  matches_used_today: number;
  matches_cap: number;
  matches_remaining: number;
  bypass: boolean;
}

interface MatchesRemainingIndicatorProps {
  data: MatchesIndicatorData | null;
  onClick: () => void;
  style?: CSSProperties;
}

export function MatchesRemainingIndicator({
  data,
  onClick,
  style,
}: MatchesRemainingIndicatorProps): JSX.Element | null {
  if (!data) return null;

  // Hide entirely on the fresh-day case (full cap, zero used) — first
  // match of the day is uninteresting noise. Admin bypass mode never
  // hides; the originator wants iteration feedback.
  if (
    !data.bypass &&
    data.matches_used_today === 0 &&
    data.matches_remaining === data.matches_cap
  ) {
    return null;
  }

  const label = data.bypass
    ? `${data.matches_used_today} matches played today (admin bypass)`
    : `${data.matches_remaining} matches remaining today`;

  return (
    <button
      type="button"
      className="matches-indicator"
      onClick={onClick}
      style={style}
      aria-label={`${label}. Click to read the cap policy.`}
    >
      {label}
    </button>
  );
}
