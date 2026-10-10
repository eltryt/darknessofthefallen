import {readFileSync,existsSync,openSync,closeSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {restoreRecovery,validateRecovery} from '../src/recovery.mjs';
const [input,output,...extra]=process.argv.slice(2);
if(!input||extra.length){console.error('Uso: npm run restore -- copia.json [NUEVA-base.sqlite]. Sin destino: ensayo en memoria.');process.exit(1);}
let db,created=false;
try{
  const snapshot=JSON.parse(readFileSync(input,'utf8'));validateRecovery(snapshot);
  if(output){if(['-wal','-shm','-journal'].some(s=>existsSync(output+s)))throw new Error('El destino tiene archivos SQLite anteriores.');if(resolve(output)===resolve(input))throw new Error('El destino debe ser distinto de la copia.');closeSync(openSync(output,'wx',0o600));created=true;}
  db=openDatabase(output||':memory:');
  const report=restoreRecovery(db,snapshot);db.close();db=null;
  console.log(JSON.stringify({...report,mode:output?'isolated-file':'in-memory-rehearsal'},null,2));
}catch(e){if(db)db.close();if(created)for(const suffix of ['','-wal','-shm'])rmSync(output+suffix,{force:true});console.error('Restauración rechazada. No se ha modificado ninguna base existente.');process.exitCode=1;}
