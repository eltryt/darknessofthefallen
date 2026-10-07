import {backup} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {openDatabase} from '../src/db.mjs';
mkdirSync('backups',{recursive:true});const db=openDatabase(process.env.DATABASE_PATH);const path=`backups/guild-${new Date().toISOString().replaceAll(':','-')}.sqlite`;await backup(db,path);db.close();console.log(path);
