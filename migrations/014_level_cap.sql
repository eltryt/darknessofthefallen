-- "Camino al 60" podium: when each character reached the level cap, and whether an
-- officer verified it. Levels are typed by hand until an API covers Forever, so only
-- verified arrivals count for the Pioneros de Azeroth medal. Additive only.
ALTER TABLE characters ADD COLUMN cap_reached_at TEXT;
ALTER TABLE characters ADD COLUMN cap_verified_at TEXT;
ALTER TABLE characters ADD COLUMN cap_verified_by TEXT REFERENCES users(id);
UPDATE characters SET cap_reached_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE level >= 60;
-- The moment is recorded by the database, whichever screen or import sets the level.
CREATE TRIGGER characters_cap_insert AFTER INSERT ON characters
WHEN NEW.level >= 60 AND NEW.cap_reached_at IS NULL
BEGIN
	UPDATE characters SET cap_reached_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
-- Reaching 60 keeps the first moment; going back below 60 (a correction) clears it
-- and its verification.
CREATE TRIGGER characters_cap_update AFTER UPDATE OF level ON characters
BEGIN
	UPDATE characters SET
		cap_reached_at = CASE WHEN NEW.level >= 60
			THEN COALESCE(cap_reached_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE NULL END,
		cap_verified_at = CASE WHEN NEW.level >= 60 THEN cap_verified_at ELSE NULL END,
		cap_verified_by = CASE WHEN NEW.level >= 60 THEN cap_verified_by ELSE NULL END
	WHERE id = NEW.id;
END;
INSERT INTO schema_migrations(version) VALUES(14);
