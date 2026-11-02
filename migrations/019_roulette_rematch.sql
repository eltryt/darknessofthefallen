-- "Otra ronda": a new table opened from a played one, with the same bet and players.
-- rematch_of links it to the table it repeats, so each table has at most one rematch.
-- Additive only.
ALTER TABLE roulette_tables ADD COLUMN rematch_of TEXT REFERENCES roulette_tables(id);
CREATE INDEX roulette_tables_rematch ON roulette_tables(rematch_of);
INSERT INTO schema_migrations(version) VALUES(19);
