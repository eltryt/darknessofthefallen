-- Armory: additive only. Existing characters keep every value; new columns start empty.
ALTER TABLE characters ADD COLUMN game_version TEXT NOT NULL DEFAULT 'forever';
ALTER TABLE characters ADD COLUMN realm TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN region TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN faction TEXT NOT NULL DEFAULT '' CHECK(faction IN ('','Alianza','Horda'));
ALTER TABLE characters ADD COLUMN race TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN secondary_spec TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN level INTEGER CHECK(level IS NULL OR level BETWEEN 1 AND 100);
-- Filled only by a future data provider; manual entries never set it.
ALTER TABLE characters ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN updated_at TEXT;
ALTER TABLE characters ADD COLUMN synced_at TEXT;

-- Current equipment. origin separates manual input from provider data.
CREATE TABLE character_equipment(
	id TEXT PRIMARY KEY,
	character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	slot TEXT NOT NULL,
	item_id TEXT,
	item_name TEXT NOT NULL DEFAULT '',
	quality TEXT NOT NULL DEFAULT '',
	item_level INTEGER CHECK(item_level IS NULL OR item_level BETWEEN 1 AND 1000),
	icon TEXT NOT NULL DEFAULT '',
	enchant TEXT NOT NULL DEFAULT '',
	gems TEXT NOT NULL DEFAULT '[]',
	stats TEXT NOT NULL DEFAULT '{}',
	source_label TEXT NOT NULL DEFAULT '',
	state TEXT NOT NULL DEFAULT 'equipped',
	origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual','provider')),
	provider TEXT NOT NULL DEFAULT '',
	updated_at TEXT NOT NULL,
	UNIQUE(character_id, slot)
);

-- One list per character, specialization, content and phase.
CREATE TABLE bis_lists(
	id TEXT PRIMARY KEY,
	character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	spec TEXT NOT NULL DEFAULT '',
	content TEXT NOT NULL DEFAULT 'General',
	phase TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE(character_id, spec, content, phase)
);
-- item_id stays empty until a verified item catalogue exists.
CREATE TABLE bis_entries(
	id TEXT PRIMARY KEY,
	list_id TEXT NOT NULL REFERENCES bis_lists(id) ON DELETE CASCADE,
	slot TEXT NOT NULL,
	item_id TEXT,
	item_name TEXT NOT NULL,
	source TEXT NOT NULL DEFAULT '',
	boss TEXT NOT NULL DEFAULT '',
	priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
	status TEXT NOT NULL DEFAULT 'Pendiente' CHECK(status IN ('Pendiente','Prioritario','Conseguido','Alternativa')),
	is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
	notes TEXT NOT NULL DEFAULT '',
	updated_at TEXT NOT NULL
);
CREATE INDEX bis_entries_list_slot ON bis_entries(list_id, slot);
CREATE UNIQUE INDEX bis_one_primary_per_slot ON bis_entries(list_id, slot) WHERE is_primary=1;

-- External guide providers and verified links. URLs are never derived automatically.
CREATE TABLE guide_providers(
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	homepage TEXT NOT NULL,
	allowed_hosts TEXT NOT NULL,
	active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
	sort INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL
);
CREATE TABLE guide_links(
	id TEXT PRIMARY KEY,
	provider_id TEXT NOT NULL REFERENCES guide_providers(id),
	game_version TEXT NOT NULL,
	class TEXT NOT NULL,
	spec TEXT NOT NULL DEFAULT '',
	content_type TEXT NOT NULL CHECK(content_type IN ('general','talents','rotation','gear','bis','stats','consumables')),
	phase TEXT NOT NULL DEFAULT '',
	url TEXT NOT NULL,
	notes TEXT NOT NULL DEFAULT '',
	verified_at TEXT,
	verified_by TEXT REFERENCES users(id),
	updated_at TEXT NOT NULL,
	UNIQUE(provider_id, game_version, class, spec, content_type, phase)
);
CREATE INDEX guide_links_lookup ON guide_links(game_version, class, spec);

-- Officer review: who reviewed, when, and whether it is complete.
CREATE TABLE character_reviews(
	id TEXT PRIMARY KEY,
	character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	reviewer_id TEXT NOT NULL REFERENCES users(id),
	status TEXT NOT NULL DEFAULT 'En curso' CHECK(status IN ('En curso','Completada')),
	summary TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	completed_at TEXT,
	completed_by TEXT REFERENCES users(id)
);
CREATE INDEX character_reviews_character ON character_reviews(character_id, created_at);
-- Internal officer notes, kept apart from the player's own notes.
CREATE TABLE character_officer_notes(
	id TEXT PRIMARY KEY,
	character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
	author_id TEXT NOT NULL REFERENCES users(id),
	body TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE INDEX character_officer_notes_character ON character_officer_notes(character_id, created_at);

INSERT INTO guide_providers(id,name,homepage,allowed_hosts,active,sort,updated_at) VALUES
	('wowhead','Wowhead','https://www.wowhead.com/','["wowhead.com"]',1,1,'2026-10-15T00:00:00Z'),
	('icy-veins','Icy Veins','https://www.icy-veins.com/','["icy-veins.com"]',1,2,'2026-10-15T00:00:00Z'),
	('archon','Archon','https://www.archon.gg/','["archon.gg"]',1,3,'2026-10-15T00:00:00Z');
INSERT INTO schema_migrations(version) VALUES(7);
