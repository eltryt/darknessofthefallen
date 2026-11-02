-- Officers remove test tables from the roulette. Soft delete: the table, its seats and its
-- spins stay in the database (and in backups) but no longer show, count or owe. Additive only.
ALTER TABLE roulette_tables ADD COLUMN deleted_at TEXT;
ALTER TABLE roulette_tables ADD COLUMN deleted_by TEXT REFERENCES users(id);
INSERT INTO schema_migrations(version) VALUES(16);
