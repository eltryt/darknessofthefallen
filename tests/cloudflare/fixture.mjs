// Compiled only by the integration test. Never use this as the deployment entrypoint.
import worker, {Guild as ProductionGuild} from '../../src/cloudflare-worker.mjs';
import {issueSession} from '../../src/auth.mjs';
import {transaction} from '../../src/database-core.mjs';
export class Guild extends ProductionGuild {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/__test/seed') {
      const sessions = {};
      for (const rank of ['member', 'leader']) {
        this.db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?)').run(rank, rank, rank, new Date().toISOString());
        sessions[rank] = issueSession(this.db, rank);
      }
      return Response.json(sessions);
    }
    if (path === '/__test/rollback') {
      try {
        transaction(this.db, () => {
          this.db.prepare("UPDATE users SET display_name='rolled back' WHERE id='leader'").run();
          throw new Error('Deliberate transaction failure');
        });
      } catch {}
      return Response.json(this.db.prepare("SELECT display_name FROM users WHERE id='leader'").get());
    }
    return super.fetch(request);
  }
}
export default worker;
