-- Raid rules of 22/11/2026: wishlist deadline per tier, change requests outside it,
-- a wishlist history for the loot officers and excused absences. Additive only.
CREATE TABLE wishlist_windows(
	id TEXT PRIMARY KEY,
	opened_at TEXT NOT NULL,
	opened_by TEXT NOT NULL REFERENCES users(id),
	closes_at TEXT NOT NULL,
	closed_at TEXT,
	closed_by TEXT REFERENCES users(id),
	note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX wishlist_windows_opened ON wishlist_windows(opened_at);
-- Every change to a wishlist entry; alert holds the warning shown to the officers.
CREATE TABLE wishlist_changes(
	id TEXT PRIMARY KEY,
	wishlist_id TEXT NOT NULL,
	owner_id TEXT NOT NULL REFERENCES users(id),
	character_id TEXT NOT NULL,
	character_name TEXT NOT NULL,
	item TEXT NOT NULL,
	slot TEXT NOT NULL DEFAULT '',
	action TEXT NOT NULL CHECK(action IN ('added','removed','changed')),
	actor_id TEXT NOT NULL REFERENCES users(id),
	request_id TEXT,
	before TEXT,
	after TEXT,
	alert TEXT,
	alert_seen_at TEXT,
	created_at TEXT NOT NULL
);
CREATE INDEX wishlist_changes_created ON wishlist_changes(created_at);
CREATE INDEX wishlist_changes_character ON wishlist_changes(character_id, created_at);
-- Adding or changing an entry after the deadline: an officer approves or rejects it.
CREATE TABLE wishlist_requests(
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id),
	character_id TEXT NOT NULL,
	character_name TEXT NOT NULL,
	kind TEXT NOT NULL CHECK(kind IN ('add','change')),
	wishlist_id TEXT,
	payload TEXT NOT NULL,
	reason TEXT NOT NULL DEFAULT '',
	alert TEXT,
	status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
	decided_by TEXT REFERENCES users(id),
	decided_at TEXT,
	decision_note TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);
CREATE INDEX wishlist_requests_status ON wishlist_requests(status, created_at);
-- Excused absences (holidays, work, notice in advance) leave the monthly percentage.
-- A table of its own keeps attendance rows and existing backups unchanged, and no
-- foreign key, so removing or resetting attendance works as before.
CREATE TABLE attendance_excuses(
	attendance_id TEXT PRIMARY KEY,
	reason TEXT NOT NULL,
	excused_by TEXT NOT NULL REFERENCES users(id),
	excused_at TEXT NOT NULL
);
-- App notifications learn two new kinds for the loot officers. SQLite cannot alter a
-- CHECK constraint, so the queue is rebuilt with its rows; nothing references it.
CREATE TABLE push_jobs_next(
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL CHECK(kind IN ('recruitment','contact','incident','test','wishlist-alert','wishlist-request')),
	target_id TEXT NOT NULL,
	user_id TEXT,
	dedupe_key TEXT NOT NULL UNIQUE,
	next_at INTEGER NOT NULL DEFAULT 0,
	done_at TEXT,
	created_at TEXT NOT NULL
);
INSERT INTO push_jobs_next(id,kind,target_id,user_id,dedupe_key,next_at,done_at,created_at)
SELECT id,kind,target_id,user_id,dedupe_key,next_at,done_at,created_at FROM push_jobs;
DROP TABLE push_jobs;
ALTER TABLE push_jobs_next RENAME TO push_jobs;
CREATE INDEX push_jobs_due ON push_jobs(done_at,next_at);
INSERT INTO schema_migrations(version) VALUES(26);
