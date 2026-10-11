CREATE TABLE gm_messages(
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('contact','incident')),
 user_id TEXT REFERENCES users(id), subject TEXT NOT NULL, message TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE gm_notifications(
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('recruitment','contact','incident')),
 target_id TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','delivered','failed','uncertain')),
 attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '', message_id TEXT, created_at TEXT NOT NULL, delivered_at TEXT
);
CREATE INDEX gm_delivery_due ON gm_notifications(status,next_at);
INSERT INTO schema_migrations(version) VALUES(6);
