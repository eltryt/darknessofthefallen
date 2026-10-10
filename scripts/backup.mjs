import {backup,DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync,chmodSync} from 'node:fs';
const source=process.env.DATABASE_PATH||'data/guild.sqlite';
if(!existsSync(source))throw new Error('No existe la base local. Para Cloudflare, descarga la copia desde Panel → Exportación.');
mkdirSync('backups',{recursive:true,mode:0o700});
const db=new DatabaseSync(source,{readOnly:true});
const path=`backups/guild-${new Date().toISOString().replaceAll(':','-')}.sqlite`;
try{await backup(db,path);chmodSync(path,0o600);}finally{db.close();}
const copy=new DatabaseSync(path,{readOnly:true});
try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw new Error('La copia no supera la comprobación de integridad.');}finally{copy.close();}
console.log(path);
