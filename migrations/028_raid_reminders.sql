-- Private reminders from the raid bot to members with the Raider role in Discord who
-- have not signed up to an event yet. One row per event and member; the same queue
-- rules as call-ups (pending → sending → sent / failed / uncertain).
CREATE TABLE IF NOT EXISTS raid_reminders (
	id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL REFERENCES raid_events(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL,
	name TEXT NOT NULL DEFAULT '',
	dm_status TEXT NOT NULL DEFAULT 'pending' CHECK(dm_status IN ('pending','sending','sent','failed','skipped','uncertain')),
	dm_error TEXT NOT NULL DEFAULT '',
	attempts INTEGER NOT NULL DEFAULT 0,
	next_at INTEGER NOT NULL DEFAULT 0,
	sent_at TEXT,
	created_by TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE(event_id, user_id)
);
CREATE INDEX IF NOT EXISTS raid_reminders_due ON raid_reminders(dm_status, next_at);
INSERT INTO schema_migrations(version) VALUES(28);
