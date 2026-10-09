CREATE TABLE raid_events(
 id TEXT PRIMARY KEY, external_id TEXT UNIQUE, channel_id TEXT NOT NULL,
 organizer_id TEXT NOT NULL, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT,
 category TEXT NOT NULL DEFAULT '', roster TEXT NOT NULL DEFAULT '', public INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'Pendiente de publicación', capacity INTEGER,
 raw TEXT NOT NULL DEFAULT '{}', synced_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE raid_character_links(
 event_id TEXT NOT NULL REFERENCES raid_events(id), signup_id TEXT NOT NULL, user_id TEXT NOT NULL,
 character_id TEXT NOT NULL REFERENCES characters(id), fingerprint TEXT NOT NULL,
 PRIMARY KEY(event_id,signup_id)
);
CREATE TABLE raid_signup_cancellations(
 event_id TEXT NOT NULL REFERENCES raid_events(id), signup_id TEXT NOT NULL, user_id TEXT NOT NULL,
 data TEXT NOT NULL, cancelled_at TEXT NOT NULL, PRIMARY KEY(event_id,signup_id)
);
CREATE TABLE raid_jobs(
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES raid_events(id), actor_id TEXT NOT NULL,
 kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_pending_raid_job ON raid_jobs(event_id) WHERE status IN ('pending','running','uncertain');
CREATE TABLE raid_sync(id INTEGER PRIMARY KEY CHECK(id=1), next_at INTEGER NOT NULL DEFAULT 0, busy_until INTEGER NOT NULL DEFAULT 0, last_success TEXT, error TEXT NOT NULL DEFAULT '', cursor INTEGER NOT NULL DEFAULT 0);
INSERT INTO raid_sync(id) VALUES(1);
INSERT INTO schema_migrations(version) VALUES(5);
