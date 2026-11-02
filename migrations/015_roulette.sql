-- Ruleta de la hermandad: the guild's High-Low game played on a European roulette (0–36).
-- Everyone at a table spins once; the lowest number pays the highest the difference times
-- the table's gold per number. Gold changes hands in the game: the web only records who
-- owes whom. Tables are never deleted: cancelled ones keep their status. Additive only.
CREATE TABLE roulette_tables(
	id TEXT PRIMARY KEY,
	created_by TEXT NOT NULL REFERENCES users(id),
	stake INTEGER NOT NULL CHECK(stake >= 1),
	status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','spun','cancelled')),
	created_at TEXT NOT NULL,
	closed_at TEXT,
	closed_by TEXT REFERENCES users(id),
	winner_id TEXT REFERENCES users(id),
	loser_id TEXT REFERENCES users(id),
	high INTEGER,
	low INTEGER,
	amount INTEGER,
	settled_at TEXT,
	settled_by TEXT REFERENCES users(id)
);
CREATE INDEX roulette_tables_status ON roulette_tables(status, created_at);
-- Who sat at the table, with the character name and class shown when they joined.
-- Leaving an open table sets left_at; joining again clears it.
CREATE TABLE roulette_players(
	table_id TEXT NOT NULL REFERENCES roulette_tables(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	name TEXT NOT NULL,
	class TEXT NOT NULL DEFAULT '',
	joined_at TEXT NOT NULL,
	left_at TEXT,
	PRIMARY KEY(table_id, user_id)
);
-- Every spin in order: round 1 is everyone; later rounds break ties at the top ('high')
-- or the bottom ('low'), or repeat everyone ('main') when all numbers came out equal.
CREATE TABLE roulette_spins(
	table_id TEXT NOT NULL REFERENCES roulette_tables(id),
	seq INTEGER NOT NULL,
	round INTEGER NOT NULL,
	kind TEXT NOT NULL CHECK(kind IN ('main','high','low')),
	user_id TEXT NOT NULL REFERENCES users(id),
	number INTEGER NOT NULL CHECK(number BETWEEN 0 AND 36),
	PRIMARY KEY(table_id, seq)
);
INSERT INTO schema_migrations(version) VALUES(15);
