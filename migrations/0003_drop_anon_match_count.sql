-- migrations/0003_drop_anon_match_count.sql
-- Sauron's Arena — Drop per-user / per-browser daily cap state.
--
-- 2026-05-20: the originator directed that the per-user daily cap
-- be REMOVED entirely (not bypassed). The only remaining daily
-- ceiling is the system-level Anthropic-spend cap in `daily_spend`.
-- `anon_match_count` is no longer read or written by any handler;
-- this migration drops the table so a stale rollback can't
-- accidentally read it. `daily_spend` is untouched.

DROP TABLE IF EXISTS anon_match_count;
