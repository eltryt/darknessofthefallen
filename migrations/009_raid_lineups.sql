-- Raid lineups built on the web from Raid-Helper sign-ups, and the call-ups sent to players.
CREATE TABLE raid_lineups(
	event_id TEXT PRIMARY KEY REFERENCES raid_events(id),
	status TEXT NOT NULL DEFAULT 'Borrador' CHECK(status IN ('Borrador','Enviada')),
	revision INTEGER NOT NULL DEFAULT 0,
	sent_revision INTEGER,
	sent_at TEXT,
	sent_by TEXT REFERENCES users(id),
	updated_at TEXT NOT NULL,
	updated_by TEXT NOT NULL REFERENCES users(id)
);
-- slot: 'group:1'..'group:8' or 'bench'. user_id is the Discord id from Raid-Helper,
-- which may belong to someone without a web account, so it carries no foreign key.
CREATE TABLE raid_lineup_slots(
	event_id TEXT NOT NULL REFERENCES raid_events(id),
	signup_id TEXT NOT NULL,
	user_id TEXT NOT NULL,
	slot TEXT NOT NULL,
	position INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY(event_id, signup_id)
);
CREATE UNIQUE INDEX raid_lineup_one_slot_per_user ON raid_lineup_slots(event_id, user_id);
-- One call-up per player and event, with the private-message delivery state.
CREATE TABLE raid_callups(
	id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL REFERENCES raid_events(id),
	user_id TEXT NOT NULL,
	signup_id TEXT NOT NULL,
	name TEXT NOT NULL,
	slot TEXT NOT NULL,
	revision INTEGER NOT NULL,
	dm_status TEXT NOT NULL DEFAULT 'pending' CHECK(dm_status IN ('pending','sending','sent','failed','skipped','uncertain')),
	dm_error TEXT NOT NULL DEFAULT '',
	attempts INTEGER NOT NULL DEFAULT 0,
	next_at INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	sent_at TEXT,
	UNIQUE(event_id, user_id)
);
CREATE INDEX raid_callups_queue ON raid_callups(dm_status, next_at);
CREATE INDEX raid_callups_user ON raid_callups(user_id);
INSERT INTO schema_migrations(version) VALUES(9);
