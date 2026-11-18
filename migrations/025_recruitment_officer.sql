-- New rank "recruitment_officer": reviews applications, without guild management.
-- Same rebuild as 013: SQLite cannot alter a CHECK constraint, and deferred foreign
-- keys let the tables that reference users(id) survive the drop and reinsert.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE users_rank_backup AS SELECT id, display_name, rank, updated_at FROM users;
DROP TABLE users;
CREATE TABLE users(
	id TEXT PRIMARY KEY,
	display_name TEXT NOT NULL,
	rank TEXT NOT NULL CHECK(rank IN ('visitor','member','raider','raid_leader','loot_officer','recruitment_officer','officer','leader')),
	updated_at TEXT NOT NULL
);
INSERT INTO users(id, display_name, rank, updated_at)
SELECT id, display_name, rank, updated_at FROM users_rank_backup;
DROP TABLE users_rank_backup;
PRAGMA defer_foreign_keys=OFF;
INSERT INTO schema_migrations(version) VALUES(25);
