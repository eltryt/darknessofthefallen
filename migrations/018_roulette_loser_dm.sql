-- Private message to whoever pays at a roulette table: what they owe and to whom. Same
-- delivery as the winner's (migration 017). Earlier tables are 'skipped'. Additive only.
ALTER TABLE roulette_tables ADD COLUMN loser_dm_status TEXT NOT NULL DEFAULT 'skipped' CHECK(loser_dm_status IN ('pending','sending','sent','failed','skipped','uncertain'));
ALTER TABLE roulette_tables ADD COLUMN loser_dm_error TEXT NOT NULL DEFAULT '';
ALTER TABLE roulette_tables ADD COLUMN loser_dm_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roulette_tables ADD COLUMN loser_dm_next_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roulette_tables ADD COLUMN loser_dm_sent_at TEXT;
CREATE INDEX roulette_tables_loser_dm ON roulette_tables(loser_dm_status, loser_dm_next_at);
INSERT INTO schema_migrations(version) VALUES(18);
