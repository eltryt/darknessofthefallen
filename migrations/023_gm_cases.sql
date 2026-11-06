-- Messages and incidents handled as cases: a status, a priority, an officer in charge and
-- an internal thread among the team. A message without a row here is a new, normal case.
-- Notes are never deleted, only hidden. Additive only.
CREATE TABLE gm_cases(
	message_id TEXT PRIMARY KEY REFERENCES gm_messages(id),
	status TEXT NOT NULL DEFAULT 'Nueva' CHECK(status IN ('Nueva','En curso','Resuelta','Descartada')),
	priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Normal','Urgente')),
	assignee_id TEXT REFERENCES users(id),
	resolved_at TEXT,
	updated_at TEXT NOT NULL,
	updated_by TEXT NOT NULL REFERENCES users(id)
);
-- kind 'event' records a change of status, priority or officer in the thread itself.
CREATE TABLE gm_case_notes(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	message_id TEXT NOT NULL REFERENCES gm_messages(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	kind TEXT NOT NULL DEFAULT 'note' CHECK(kind IN ('note','event')),
	body TEXT NOT NULL,
	created_at TEXT NOT NULL,
	deleted_at TEXT
);
CREATE INDEX gm_case_notes_message ON gm_case_notes(message_id, id);
-- "Vaciar la lista" in Asistencia: a raid's marks move here instead of being deleted, with
-- who cleared them and when, so they can be recovered.
CREATE TABLE attendance_archive(
	id TEXT PRIMARY KEY,
	raid_id TEXT NOT NULL REFERENCES raids(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	character_id TEXT REFERENCES characters(id),
	status TEXT NOT NULL,
	archived_at TEXT NOT NULL,
	archived_by TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX attendance_archive_raid ON attendance_archive(raid_id);
INSERT INTO schema_migrations(version) VALUES(23);
