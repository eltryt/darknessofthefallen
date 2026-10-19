import { deliverGM } from '../../src/gm-notifications.mjs';
// Compiled only by the integration test. Never use this as the deployment entrypoint.
import worker, { Guild as ProductionGuild } from '../../src/cloudflare-worker.mjs';
import { issueSession } from '../../src/auth.mjs';
import { syncRaidEvents } from '../../src/raid-sync.mjs';
import { transaction } from '../../src/database-core.mjs';
import lootOfficerSchema from '../../migrations/013_loot_officer.sql';
export class Guild extends ProductionGuild {
	async fetch(request) {
		const path = new URL(request.url).pathname;
		if (path === '/__test/gm-deliver') {
			await deliverGM(this.db, this.env);
			return Response.json(this.db.prepare('SELECT status,last_error FROM gm_notifications').all());
		}
		if (path === '/__test/seed') {
			const sessions = {};
			for (const rank of ['member', 'leader']) {
				this.db
					.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?)')
					.run(rank, rank, rank, new Date().toISOString());
				sessions[rank] = issueSession(this.db, rank);
			}
			this.db
				.prepare(
					"INSERT OR IGNORE INTO raid_events(id,channel_id,organizer_id,title,starts_at,ends_at,updated_at) VALUES('runtime-event','test-channel','leader','Private runtime raid','2030-01-01T22:00:00Z','2030-01-02T00:00:00Z','2026-10-10T00:00:00Z')",
				)
				.run();
			return Response.json(sessions);
		}
		if (path === '/__test/raid-sync') {
			await syncRaidEvents(this.db, {
				...this.env,
				RAID_HELPER_API_KEY: 'runtime-test',
				DISCORD_GUILD_ID: '1550000000000000001',
				RAID_HELPER_CHANNEL_ID: '1550997172982382723',
			});
			return Response.json(
				this.db.prepare('SELECT last_success,error FROM raid_sync WHERE id=1').get(),
			);
		}
		if (path === '/__test/rerun-loot-officer-migration') {
			// Production already has users referenced by sessions and raids when 013 runs.
			const before = this.db.prepare('SELECT count(*) n FROM sessions').get().n;
			transaction(this.db, () => {
				this.db.prepare('DELETE FROM schema_migrations WHERE version=13').run();
				this.db.exec(lootOfficerSchema);
			});
			this.db.prepare("UPDATE users SET rank='loot_officer' WHERE id='member'").run();
			let orphanRejected = false;
			try {
				this.db
					.prepare('INSERT INTO sessions VALUES(?,?,?,?)')
					.run('orphan', 'ghost', 'csrf', Date.now());
			} catch {
				orphanRejected = true;
			}
			const rank = this.db.prepare("SELECT rank FROM users WHERE id='member'").get().rank;
			this.db.prepare("UPDATE users SET rank='member' WHERE id='member'").run();
			return Response.json({
				before,
				after: this.db.prepare('SELECT count(*) n FROM sessions').get().n,
				organizer: this.db
					.prepare("SELECT organizer_id FROM raid_events WHERE id='runtime-event'")
					.get().organizer_id,
				rank,
				orphanRejected,
			});
		}
		if (path === '/__test/rollback') {
			try {
				transaction(this.db, () => {
					this.db.prepare("UPDATE users SET display_name='rolled back' WHERE id='leader'").run();
					throw new Error('Deliberate transaction failure');
				});
			} catch {}
			return Response.json(
				this.db.prepare("SELECT display_name FROM users WHERE id='leader'").get(),
			);
		}
		return super.fetch(request);
	}
}
export default worker;
