import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {defaults,transaction} from './database-core.mjs';
export {defaults,settings,transaction,audit} from './database-core.mjs';
export function openDatabase(path='data/guild.sqlite'){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
  if(!db.prepare('SELECT version FROM schema_migrations WHERE version=2').get())transaction(db,()=>db.exec(readFileSync(new URL('../migrations/002_operations.sql',import.meta.url),'utf8')));
  db.prepare('INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)').run(JSON.stringify(defaults));
  if(!db.prepare('SELECT version FROM schema_migrations WHERE version=3').get())transaction(db,()=>db.exec(readFileSync(new URL('../migrations/003_discord_invite.sql',import.meta.url),'utf8')));
  if(!db.prepare('SELECT version FROM schema_migrations WHERE version=4').get())transaction(db,()=>db.exec(readFileSync(new URL('../migrations/004_open_recruitment.sql',import.meta.url),'utf8')));
  return db;
}
