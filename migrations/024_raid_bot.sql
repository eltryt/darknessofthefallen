-- Sign-ups published by the guild's own Discord bot. Each event says who publishes it.
ALTER TABLE raid_events ADD COLUMN provider TEXT NOT NULL DEFAULT 'raid-helper';
-- data: template and looks edited on the website. app: Discord application id and
-- verify key. emojis: icon name -> application emoji id.
CREATE TABLE raid_bot_config(
 id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL DEFAULT '{}',
 app TEXT NOT NULL DEFAULT '{}', emojis TEXT NOT NULL DEFAULT '{}', updated_at TEXT
);
INSERT INTO raid_bot_config(id) VALUES(1);
-- data is the event as the website owns it (same shape Raid-Helper returns). dirty marks
-- a Discord message that no longer shows it; closes_at is when its buttons switch off.
CREATE TABLE raid_bot_events(
 event_id TEXT PRIMARY KEY REFERENCES raid_events(id), message_id TEXT UNIQUE,
 channel_id TEXT NOT NULL, data TEXT NOT NULL, dirty INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL DEFAULT 0, closes_at INTEGER NOT NULL DEFAULT 0,
 closed INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0,
 error TEXT NOT NULL DEFAULT ''
);
INSERT INTO schema_migrations(version) VALUES(24);
