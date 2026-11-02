-- Chat of the roulette room: short messages from members while they play. The name and
-- class shown are kept as they were when written. Removing a message hides it (soft
-- delete). Additive only.
CREATE TABLE roulette_chat(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id TEXT NOT NULL REFERENCES users(id),
	name TEXT NOT NULL,
	class TEXT NOT NULL DEFAULT '',
	body TEXT NOT NULL,
	created_at TEXT NOT NULL,
	deleted_at TEXT,
	deleted_by TEXT REFERENCES users(id)
);
CREATE INDEX roulette_chat_recent ON roulette_chat(deleted_at, id);
INSERT INTO schema_migrations(version) VALUES(20);
