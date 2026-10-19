-- Devices of GM and officers that receive app notifications for new applications,
-- contact messages and incidents. One row per browser push subscription.
CREATE TABLE push_subscriptions(
	endpoint TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id),
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	failures INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
CREATE TABLE push_jobs(
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL CHECK(kind IN ('recruitment','contact','incident','test')),
	target_id TEXT NOT NULL,
	user_id TEXT,
	dedupe_key TEXT NOT NULL UNIQUE,
	next_at INTEGER NOT NULL DEFAULT 0,
	done_at TEXT,
	created_at TEXT NOT NULL
);
CREATE INDEX push_jobs_due ON push_jobs(done_at,next_at);
INSERT INTO schema_migrations(version) VALUES(12);
