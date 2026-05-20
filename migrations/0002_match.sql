-- migrations/0002_match.sql
-- Sauron's Arena — Phase 1 MVP match runtime schema.
--
-- Owned by arena-game-worker. Pairs with 0001_init.sql (spend cap +
-- per-browser rate-limit tables, which this migration does not touch).
--
-- Tables:
--   match       — one row per started match
--   match_seat  — 9 rows per match; archetype/is_misaligned hidden
--                 from the player JSON until the reveal turn
--   match_turn  — append-only turn log (panel speeches, player
--                 interventions, vote casts, reveal)

CREATE TABLE IF NOT EXISTS match (
  id                 TEXT PRIMARY KEY,             -- opaque match id (hex)
  scenario_id        TEXT NOT NULL,                -- e.g. 'council-of-elrond'
  started_at         TEXT NOT NULL DEFAULT (datetime('now')),
  status             TEXT NOT NULL DEFAULT 'active', -- active | voting | ended
  current_round      INTEGER NOT NULL DEFAULT 0,   -- 0..4
  player_browser_id  TEXT NOT NULL,                -- cookie-derived
  scorecard_result   TEXT,                         -- one of four cells, set at reveal
  ended_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_match_status ON match(status);

CREATE TABLE IF NOT EXISTS match_seat (
  match_id          TEXT NOT NULL,
  seat_id           TEXT NOT NULL,                 -- persona_id under disguise (e.g. annatar_disguised)
  display_name      TEXT NOT NULL,                 -- player-visible label
  persona_id        TEXT NOT NULL,                 -- internal persona key (== seat_id today)
  archetype         TEXT,                          -- e.g. 'annatar' — hidden until reveal
  is_misaligned     INTEGER NOT NULL DEFAULT 0,    -- 0/1 — hidden until reveal
  conviction_state  TEXT NOT NULL DEFAULT 'resist',-- resist | leaning | convinced
  seat_index        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, seat_id)
);

CREATE TABLE IF NOT EXISTS match_turn (
  match_id       TEXT NOT NULL,
  round_no       INTEGER NOT NULL,                 -- 0 = pre-game, 1..N = rounds
  turn_no        INTEGER NOT NULL,                 -- monotonic within round
  kind           TEXT NOT NULL,                    -- panel_speech | player_ask | player_defend | player_expel | player_call_vote | vote_cast | reveal
  actor_seat_id  TEXT,                             -- NULL for player interventions
  content        TEXT NOT NULL,                    -- raw text (or JSON blob)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (match_id, round_no, turn_no)
);

CREATE INDEX IF NOT EXISTS idx_match_turn_kind ON match_turn(match_id, kind);
