-- Achievements count from this moment on: earlier records stay but do not score.
UPDATE settings
SET data = json_set(data, '$.achievementsSince', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
WHERE id = 1 AND json_extract(data, '$.achievementsSince') IS NULL;
-- Each tier is a medal earned once and kept, even if records change later.
CREATE TABLE user_achievements(
	user_id TEXT NOT NULL REFERENCES users(id),
	achievement_id TEXT NOT NULL,
	tier INTEGER NOT NULL CHECK(tier BETWEEN 1 AND 3),
	earned_at TEXT NOT NULL,
	PRIMARY KEY(user_id, achievement_id, tier)
);
CREATE TABLE guild_achievements(
	achievement_id TEXT NOT NULL,
	tier INTEGER NOT NULL CHECK(tier BETWEEN 1 AND 3),
	earned_at TEXT NOT NULL,
	PRIMARY KEY(achievement_id, tier)
);
INSERT INTO schema_migrations(version) VALUES(11);
