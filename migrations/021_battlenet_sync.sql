-- Battle.net refresh: the hidden Forever realm of each imported character, read from the
-- account at import, lets the web look the character up again every few hours with its
-- own application token (level and professions) without keeping the member's token.
-- Derived data: a new import fills it again, so it is not part of the backups. Additive only.
CREATE TABLE battlenet_characters(
	character_id TEXT PRIMARY KEY REFERENCES characters(id),
	realm_id INTEGER,
	checked_at TEXT,
	status TEXT NOT NULL DEFAULT ''
);
-- Characters imported before this migration: their realm arrives with the next import.
INSERT INTO battlenet_characters(character_id)
	SELECT id FROM characters WHERE source='battlenet' AND external_id IS NOT NULL;
INSERT INTO schema_migrations(version) VALUES(21);
