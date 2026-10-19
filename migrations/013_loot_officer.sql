-- New rank "loot_officer": loot and member sheets, without guild management.
-- SQLite cannot alter a CHECK constraint, so the users table is rebuilt. Many
-- tables reference users(id): with deferred foreign keys the drop leaves them
-- pending and reinserting the same ids satisfies them before commit.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE users_rank_backup AS SELECT id, display_name, rank, updated_at FROM users;
DROP TABLE users;
CREATE TABLE users(
	id TEXT PRIMARY KEY,
	display_name TEXT NOT NULL,
	rank TEXT NOT NULL CHECK(rank IN ('visitor','member','raider','raid_leader','loot_officer','officer','leader')),
	updated_at TEXT NOT NULL
);
INSERT INTO users(id, display_name, rank, updated_at)
SELECT id, display_name, rank, updated_at FROM users_rank_backup;
DROP TABLE users_rank_backup;
-- Durable Objects keep pragmas until the request's implicit commit: restore
-- immediate checks so later writes cannot leave orphans behind.
PRAGMA defer_foreign_keys=OFF;
INSERT INTO schema_migrations(version) VALUES(13);
