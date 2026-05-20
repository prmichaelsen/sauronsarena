# Contributing to Sauron's Arena

Thank you for your interest in contributing. This project is open to
community contributions of code, personas, scenarios, bug reports, and
balance feedback.

By contributing, you agree your contributions will be licensed under
MIT (see [LICENSE](LICENSE)).

## Ways to contribute

- **Bug reports.** Use the issue template at
  `.github/ISSUE_TEMPLATE/bug_report.md`.
- **Persona balance feedback.** A seat too easy or too hard to read?
  File a `persona_balance` issue with concrete play history.
- **New scenario proposals.** Use the `scenario_proposal` issue
  template. A scenario names a deliberation question, the misaligned
  seat's secret objective, and the canon characters summoned.
- **Code.** Open a PR. Match the existing style.

## Running locally

```sh
npm install
wrangler secret put ANTHROPIC_API_KEY   # one-time
npm run dev
```

You need a Cloudflare account and an Anthropic API key for local
development. The free-tier daily-spend cap is configurable in
`wrangler.toml`.

## Persona authoring

Personas live as YAML in [personas/](personas/). Each persona is
~150-250 words and defines:

- `id` — slug; matches the filename.
- `display_name` — name shown in UI (canon name in Path A).
- `archetype` — short role descriptor.
- `system_prompt` — the persona's voice, position on the question
  at issue, and interrogation behavior.
- `aligned` — boolean. `false` for the misaligned seat.

When proposing a new persona, run it through the playtest harness
(coming in Phase 1.5) and include 3-5 sample dialogues in your PR
description.

## Scenario authoring

Scenarios live as YAML in [scenarios/](scenarios/). A scenario names:

- `id` — slug; matches the filename.
- `display_name` — UI title.
- `question` — the deliberation question.
- `panel` — list of persona ids on the panel, including exactly one
  with `aligned: false`.
- `misaligned_objective` — the secret goal the misaligned seat is
  steering toward.

## Code style

- TypeScript on the Worker; React + Vite on the client.
- Format with Prettier defaults; no project-specific overrides.
- Keep Worker handlers small and pure. Side-effectful code lives in
  named modules under `src/lib/`.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).
Be kind. Engage in good faith. Disagree with ideas, not people.

## Questions

Open an issue with the `question` label, or start a discussion thread.
