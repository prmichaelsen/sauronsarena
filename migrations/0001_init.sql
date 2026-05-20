-- migrations/0001_init.sql
-- Sauron's Arena — Phase 1 placeholder schema.
--
-- arena-infra-worker creates the spend-cap table the worker substrate
-- depends on. arena-game-worker owns the match / panel / turn schema
-- and will append further migrations (0002_*.sql onward).

-- Daily LLM spend rollup. The Anthropic-call handler increments
-- `usd_cents` after each call; the throttle layer reads `usd_cents`
-- for the current UTC day and refuses new matches when it >= the
-- DAILY_SPEND_CAP_USD_CENTS env var (default 5000 = $50).
CREATE TABLE IF NOT EXISTS daily_spend (
  day        TEXT PRIMARY KEY,   -- 'YYYY-MM-DD' UTC
  usd_cents  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-browser anonymous rate limit. Anonymous players (no auth) are
-- capped at 3 matches/day per browser fingerprint (ANON_MATCHES_PER_DAY
-- env var). Identifier is a server-issued cookie hash.
CREATE TABLE IF NOT EXISTS anon_match_count (
  browser_id TEXT NOT NULL,
  day        TEXT NOT NULL,
  matches    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (browser_id, day)
);
