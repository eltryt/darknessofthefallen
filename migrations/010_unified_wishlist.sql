-- One wishlist per character: former BiS entries join the wishlist with a status.
-- The original bis_lists/bis_entries rows are kept untouched as history.
INSERT OR IGNORE INTO wishlists(id, user_id, data)
SELECT
	'bis-' || e.id,
	c.user_id,
	json_object(
		'characterId', c.id,
		'characterName', c.name,
		'item', e.item_name,
		'itemId', e.item_id,
		'raid', e.source,
		'boss', e.boss,
		'slot', e.slot,
		'priority', e.priority,
		'notes', e.notes,
		'status', CASE WHEN e.is_primary = 1 OR e.status = 'Prioritario' THEN 'BiS' ELSE 'Me interesa' END,
		'obtained', CASE WHEN e.status = 'Conseguido' THEN json('true') ELSE json('false') END,
		'migratedFrom', 'bis:' || l.id
	)
FROM bis_entries e
JOIN bis_lists l ON l.id = e.list_id
JOIN characters c ON c.id = l.character_id;

-- Per-boss participation planned on the web by the event's managers.
-- Raid-Helper has no per-boss data; a missing assignment means "pending".
CREATE TABLE raid_boss_plans(
	event_id TEXT NOT NULL REFERENCES raid_events(id),
	position INTEGER NOT NULL,
	boss TEXT NOT NULL,
	PRIMARY KEY(event_id, position)
);
CREATE TABLE raid_boss_assignments(
	event_id TEXT NOT NULL REFERENCES raid_events(id),
	boss TEXT NOT NULL,
	user_id TEXT NOT NULL,
	status TEXT NOT NULL CHECK(status IN ('in','bench')),
	PRIMARY KEY(event_id, boss, user_id)
);
INSERT INTO schema_migrations(version) VALUES(10);
