-- Application follow-up: a private link for the candidate (no account needed), the
-- normalised Discord name and, when the candidate identified with Discord, their Discord
-- id: together they keep one open application per person and let officers message them.
-- applicant_sessions: a sign-in that only shows a candidate their own applications; it
-- grants nothing else in the web and is not part of the backups. Additive only.
CREATE TABLE application_tracking(
	application_id TEXT PRIMARY KEY REFERENCES applications(id),
	token TEXT NOT NULL UNIQUE,
	discord_key TEXT NOT NULL DEFAULT '',
	discord_id TEXT,
	notice_status TEXT NOT NULL DEFAULT '',
	notified_at TEXT,
	notified_by TEXT REFERENCES users(id)
);
CREATE INDEX application_tracking_discord ON application_tracking(discord_key);
CREATE INDEX application_tracking_discord_id ON application_tracking(discord_id);
CREATE TABLE applicant_sessions(
	hash TEXT PRIMARY KEY,
	discord_id TEXT NOT NULL,
	username TEXT NOT NULL,
	expires INTEGER NOT NULL
);
INSERT INTO application_tracking(application_id,token,discord_key)
	SELECT id, lower(hex(randomblob(24))),
		lower(trim(replace(replace(coalesce(json_extract(data,'$.discord'),''),'@',''),'#0','')))
	FROM applications;
INSERT INTO schema_migrations(version) VALUES(22);
