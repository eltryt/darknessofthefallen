-- The raid bot marks sign-ups under level 45 with their level (RAID_MIN_LEVEL in
-- src/raid-bot.mjs). When a signed-up member's character changes level below that line,
-- or crosses it, their open call-ups are drawn again, whichever screen or sync set it.
CREATE TRIGGER IF NOT EXISTS raid_bot_level_update AFTER UPDATE OF level ON characters
WHEN NEW.level IS NOT OLD.level AND (OLD.level IS NULL OR NEW.level IS NULL OR OLD.level < 45 OR NEW.level < 45)
BEGIN
	UPDATE raid_bot_events SET dirty = 1, next_at = 0
	WHERE removed = 0 AND message_id IS NOT NULL AND closed = 0
		AND data LIKE '%"userId":"' || NEW.user_id || '"%';
END;
INSERT INTO schema_migrations(version) VALUES(29);
