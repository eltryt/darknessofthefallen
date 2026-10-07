ALTER TABLE characters ADD COLUMN archived_at TEXT;
CREATE TABLE council_members(user_id TEXT PRIMARY KEY REFERENCES users(id), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), updated_at TEXT NOT NULL);
CREATE INDEX attendance_user_raid ON attendance(user_id,raid_id);
CREATE INDEX raids_start ON raids(starts_at);
INSERT INTO schema_migrations(version) VALUES(2);
