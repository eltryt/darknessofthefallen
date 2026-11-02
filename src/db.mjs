import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaults, transaction } from './database-core.mjs';
export { defaults, settings, transaction, audit } from './database-core.mjs';
export function openDatabase(path = 'data/guild.sqlite') {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
	db.exec(readFileSync(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'));
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=2').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/002_operations.sql', import.meta.url), 'utf8')),
		);
	db.prepare('INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)').run(JSON.stringify(defaults));
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=3').get())
		transaction(db, () =>
			db.exec(
				readFileSync(new URL('../migrations/003_discord_invite.sql', import.meta.url), 'utf8'),
			),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=4').get())
		transaction(db, () =>
			db.exec(
				readFileSync(new URL('../migrations/004_open_recruitment.sql', import.meta.url), 'utf8'),
			),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=5').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/005_raid_events.sql', import.meta.url), 'utf8')),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=6').get())
		transaction(db, () =>
			db.exec(
				readFileSync(new URL('../migrations/006_gm_notifications.sql', import.meta.url), 'utf8'),
			),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=7').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/007_armory.sql', import.meta.url), 'utf8')),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=8').get())
		transaction(db, () =>
			db.exec(
				readFileSync(new URL('../migrations/008_character_stats.sql', import.meta.url), 'utf8'),
			),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=9').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/009_raid_lineups.sql', import.meta.url), 'utf8')),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=10').get())
		transaction(db, () =>
			db.exec(
				readFileSync(new URL('../migrations/010_unified_wishlist.sql', import.meta.url), 'utf8'),
			),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=11').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/011_achievements.sql', import.meta.url), 'utf8')),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=12').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/012_push.sql', import.meta.url), 'utf8')),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=13').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/013_loot_officer.sql', import.meta.url), 'utf8')),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=14').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/014_level_cap.sql', import.meta.url), 'utf8')),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=15').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/015_roulette.sql', import.meta.url), 'utf8')),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=16').get())
		transaction(db, () =>
			db.exec(
				readFileSync(new URL('../migrations/016_roulette_delete.sql', import.meta.url), 'utf8'),
			),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=17').get())
		transaction(db, () =>
			db.exec(readFileSync(new URL('../migrations/017_roulette_dm.sql', import.meta.url), 'utf8')),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=18').get())
		transaction(db, () =>
			db.exec(
				readFileSync(new URL('../migrations/018_roulette_loser_dm.sql', import.meta.url), 'utf8'),
			),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=19').get())
		transaction(db, () =>
			db.exec(
				readFileSync(new URL('../migrations/019_roulette_rematch.sql', import.meta.url), 'utf8'),
			),
		);
	if (!db.prepare('SELECT version FROM schema_migrations WHERE version=20').get())
		transaction(db, () =>
			db.exec(
				readFileSync(new URL('../migrations/020_roulette_chat.sql', import.meta.url), 'utf8'),
			),
		);
	return db;
}
