#!/usr/bin/env bash
# <!-- @scry.entry
# id: pattern.saurons-arena-deploy-scoped-token~e7b61659
# kind: pattern
# status: active
# weight: 0.65
# tags:
#   - "topic:saurons-arena"
#   - "saurons-arena"
#   - "topic:deploy"
#   - "deploy"
#   - "topic:cloudflare-pages"
#   - "cloudflare-pages"
#   - "topic:secrets"
#   - "secrets"
#   - "topic:scoped-token"
#   - "scoped-token"
#   - "topic:arena-infra-worker"
#   - "arena-infra-worker"
# summary: >
#   Deploy wrapper for sauronsarena.com (Cloudflare Pages project
#   saurons-arena). Loads the scoped CF API token from the reflection
#   secrets directory (per-project file: cloudflare.saurons_arena_pages_token),
#   then runs the standard build + wrangler pages deploy. Caller env
#   var CLOUDFLARE_API_TOKEN wins if set. Falls back to nothing — refuses
#   to deploy with the global CLOUDFLARE_API_KEY because that defeats
#   the defense-in-depth swap of 2026-05-21. Also: arena deploy script,
#   pages:deploy:scoped, scoped Pages token, REFLECTION_DIR override,
#   defense-in-depth, wrangler pages deploy wrapper, saurons-arena CI.
# rationale: >
#   Without this, every deploy either has to inline the secret-loading
#   shell or fall back to the global CF API key. Inlining the secret
#   path in every callsite spreads knowledge of reflection's secrets
#   layout into wrangler/CI invocations; falling back to the global
#   key defeats the defense-in-depth gain of minting the scoped token.
# applies: deploying saurons-arena to Cloudflare Pages, rotating the saurons-arena scoped token, debugging deploy auth failures, adding CI for sauronsarena.com, copying the pattern for another reflection-managed Pages project
# seeded_questions:
#   - "How do I deploy sauronsarena.com?"
#   - "Where does the saurons-arena scoped CF token live?"
#   - "How does the saurons-arena deploy authenticate to Cloudflare?"
#   - "saurons-arena deploy script"
#   - "scoped Pages token deploy wrapper"
#   - "REFLECTION_DIR override deploy"
# @scry.entry.end -->
#
# Usage:
#   ./agent/scripts/deploy.sh
#
# Optional env overrides:
#   CLOUDFLARE_API_TOKEN   — caller-provided token; wins if set.
#   REFLECTION_DIR         — path to reflection repo; defaults to
#                            $HOME/.acp/projects/reflection
#   SKIP_BUILD=1           — skip `npm run build`, deploy current dist/.
#
# Exits non-zero with a clear error if the scoped token cannot be
# located. Never falls through to CLOUDFLARE_API_KEY (global) — that
# defeats the defense-in-depth swap (see
# report.arena-infra-pages-token-minted~d33215cc).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# 1. Resolve the API token.
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  REFLECTION_DIR="${REFLECTION_DIR:-$HOME/.acp/projects/reflection}"
  TOKEN_PATH="$REFLECTION_DIR/agent/secrets/cloudflare.saurons_arena_pages_token"
  if [[ ! -f "$TOKEN_PATH" ]]; then
    echo "error: scoped CF Pages token not found." >&2
    echo "  looked for: $TOKEN_PATH" >&2
    echo "  set CLOUDFLARE_API_TOKEN explicitly or REFLECTION_DIR" >&2
    echo "  to the reflection repo path." >&2
    exit 1
  fi
  CLOUDFLARE_API_TOKEN="$(< "$TOKEN_PATH")"
  export CLOUDFLARE_API_TOKEN
fi

# 2. Refuse to deploy if a global CF API key is also in the env —
#    wrangler's precedence order is fragile; explicit beats implicit.
unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL || true

# 3. Build unless caller already has a fresh dist/.
if [[ -z "${SKIP_BUILD:-}" ]]; then
  echo "==> npm run build"
  npm run build
fi

# 4. Deploy.
echo "==> wrangler pages deploy dist --project-name saurons-arena"
npx wrangler pages deploy dist --project-name saurons-arena
