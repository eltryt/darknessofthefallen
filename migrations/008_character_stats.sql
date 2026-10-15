-- Character statistics supplied by a future data provider; manual entries leave it empty.
ALTER TABLE characters ADD COLUMN stats TEXT NOT NULL DEFAULT '{}';
INSERT INTO schema_migrations(version) VALUES(8);
