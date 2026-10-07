import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
export const defaults={name:'Darkness of the Fallen',description:'Una hermandad para quedarnos. Progresión PvE, compañerismo y noches en Azeroth.',faction:'Alianza',region:'Europa',server:'Por confirmar',ruleset:'PvP',raidStart:'23:00',raidEnd:'01:00',timezone:'Europe/Madrid',raidDays:['Martes','Miércoles','Jueves'],recruitmentOpen:false,discordUrl:'',rosterTargets:{tanks:5,healers:12,dps:23},lootMethod:'Loot Council',attendanceStates:['Asistió','Ausente','Reserva','Llegó tarde'],about:'Compartimos una idea: construir una hermandad estable, disfrutar del camino y progresar juntos. Jugamos en un servidor PvP, con progresión PvE y compañerismo.',soughtClasses:[],soughtRoles:[]};
export function openDatabase(path='data/guild.sqlite'){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
  if(!db.prepare('SELECT version FROM schema_migrations WHERE version=2').get())transaction(db,()=>db.exec(readFileSync(new URL('../migrations/002_operations.sql',import.meta.url),'utf8')));
  db.prepare('INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)').run(JSON.stringify(defaults));return db;
}
export function settings(db){return JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data);}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
export function audit(db,actor,action,target,changes){db.prepare('INSERT INTO audit(actor_id,action,target,changes,created_at) VALUES(?,?,?,?,?)').run(actor,action,target,JSON.stringify(changes),new Date().toISOString());}
