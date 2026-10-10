import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db.mjs';
import { exportRecovery, restoreRecovery, recoveryTables } from '../src/recovery.mjs';

function seed(db) {
	db.exec(`INSERT INTO users VALUES('leader','Líder','leader','2026-10-11');
 INSERT INTO characters(id,user_id,name,class,role,created_at) VALUES('c','leader','Main','Mago','DPS distancia','2026-10-11');
 INSERT INTO applications VALUES('a','{"name":"Candidato"}','Nuevo','Nota privada','2026-10-11','2026-10-11');
 INSERT INTO raids VALUES('r','Hyjal','2026-10-14','manual',NULL);
 INSERT INTO attendance VALUES('at','r','leader','c','Asistió');
 INSERT INTO loot VALUES('l','{"item":"Espada"}','2026-10-11');
 INSERT INTO wishlists VALUES('w','leader','{"item":"Bastón"}');
 INSERT INTO progress VALUES('p','{}');
 INSERT INTO council_members VALUES('leader',1,'2026-10-11');
 INSERT INTO audit(actor_id,action,target,changes,created_at) VALUES('leader','test','guild','{}','2026-10-11');
 INSERT INTO raid_events(id,channel_id,organizer_id,title,starts_at,updated_at) VALUES('e','channel','leader','Hyjal','2026-10-14','2026-10-11');
 INSERT INTO raid_character_links VALUES('e','s','leader','c','fingerprint');
 INSERT INTO raid_signup_cancellations VALUES('e','old','leader','{}','2026-10-11');
 INSERT INTO raid_jobs(id,event_id,actor_id,kind,payload,created_at) VALUES('j','e','leader','create','{}','2026-10-11');
 INSERT INTO outbox(id,application_id) VALUES('o','a');
 INSERT INTO sessions VALUES('secret-session','leader','secret-csrf',9999999999999);
 INSERT INTO oauth_states VALUES('secret-state',9999999999999);`);
}
test('backup restores all guild tables and relationships, without authentication or replaying Discord writes', () => {
	const source = openDatabase(':memory:'),
		target = openDatabase(':memory:');
	try {
		seed(source);
		const snapshot = JSON.parse(JSON.stringify(exportRecovery(source)));
		assert.ok(!JSON.stringify(snapshot).includes('secret-'));
		const report = restoreRecovery(target, snapshot);
		assert.equal(report.verified, true);
		for (const t of recoveryTables) {
			assert.equal(report.counts[t], snapshot[t].length);
			if (!['raid_jobs', 'raid_sync', 'outbox'].includes(t))
				assert.deepEqual(
					target.prepare(`SELECT * FROM ${t}`).all(),
					source.prepare(`SELECT * FROM ${t}`).all(),
				);
		}
		assert.equal(target.prepare('SELECT status FROM raid_jobs').get().status, 'blocked');
		assert.equal(target.prepare('SELECT attempts FROM outbox').get().attempts, 5);
		assert.equal(target.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
		assert.equal(target.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 0);
		assert.deepEqual(
			target.prepare('SELECT * FROM settings').get(),
			source.prepare('SELECT * FROM settings').get(),
		);
		assert.throws(() => restoreRecovery(target, snapshot), /vacía/);
	} finally {
		source.close();
		target.close();
	}
});
test('corruption and incomplete backups are rejected before writing, invalid references roll back', () => {
	const source = openDatabase(':memory:'),
		target = openDatabase(':memory:');
	try {
		seed(source);
		const snapshot = exportRecovery(source);
		snapshot.users[0].rank = 'visitor';
		assert.throws(() => restoreRecovery(target, snapshot), /checksum/);
		assert.throws(() => restoreRecovery(target, { schemaVersion: 1 }), /compatible/);
		source.exec("PRAGMA foreign_keys=OFF; UPDATE characters SET user_id='missing';");
		assert.throws(() => restoreRecovery(target, exportRecovery(source)));
		assert.equal(target.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
		assert.equal(target.prepare('SELECT COUNT(*) AS n FROM raid_sync').get().n, 1);
	} finally {
		source.close();
		target.close();
	}
});
test('recovery CLI rehearses offline, creates a private new file and refuses to overwrite it', () => {
	const dir = mkdtempSync(join(tmpdir(), 'guild-recovery-')),
		db = openDatabase(':memory:');
	try {
		seed(db);
		const input = join(dir, 'copy.json'),
			output = join(dir, 'new.sqlite');
		writeFileSync(input, JSON.stringify(exportRecovery(db)), { mode: 0o600 });
		const run = (...args) =>
			spawnSync(process.execPath, ['scripts/restore.mjs', ...args], { encoding: 'utf8' });
		assert.equal(run(input).status, 0);
		assert.equal(run(input, output).status, 0);
		const original = readFileSync(output);
		assert.equal(run(input, output).status, 1);
		assert.deepEqual(readFileSync(output), original);
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test('native local backup preserves WAL data and rejects a missing database', () => {
	const dir = mkdtempSync(join(tmpdir(), 'guild-native-')),
		source = join(dir, 'source.sqlite');
	const db = openDatabase(source),
		script = fileURLToPath(new URL('../scripts/backup.mjs', import.meta.url));
	try {
		seed(db);
		const run = spawnSync(process.execPath, [script], {
			cwd: dir,
			env: { ...process.env, DATABASE_PATH: source },
			encoding: 'utf8',
		});
		assert.equal(run.status, 0);
		const copied = new DatabaseSync(join(dir, run.stdout.trim()), { readOnly: true });
		try {
			assert.equal(copied.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 1);
			assert.equal(copied.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
		} finally {
			copied.close();
		}
		assert.equal(
			spawnSync(process.execPath, [script], {
				cwd: dir,
				env: { ...process.env, DATABASE_PATH: join(dir, 'missing.sqlite') },
				encoding: 'utf8',
			}).status,
			1,
		);
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});
