-- Private message to the winner of a roulette table, as proof of what they won and who
-- owes it. Sent by the same Discord bot as call-ups. Tables played before this migration
-- are 'skipped' and never messaged. Additive only.
ALTER TABLE roulette_tables ADD COLUMN dm_status TEXT NOT NULL DEFAULT 'skipped' CHECK(dm_status IN ('pending','sending','sent','failed','skipped','uncertain'));
ALTER TABLE roulette_tables ADD COLUMN dm_error TEXT NOT NULL DEFAULT '';
ALTER TABLE roulette_tables ADD COLUMN dm_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roulette_tables ADD COLUMN dm_next_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roulette_tables ADD COLUMN dm_sent_at TEXT;
CREATE INDEX roulette_tables_dm ON roulette_tables(dm_status, dm_next_at);
INSERT INTO schema_migrations(version) VALUES(17);
