import {randomUUID} from 'node:crypto';
import {audit,transaction} from './database-core.mjs';
import {HttpError,text,choice,can,attendanceMetrics} from './domain.mjs';

const now=()=>new Date().toISOString();
const requireRecord=(value,message='Registro no encontrado.')=>{if(!value)throw new HttpError(404,message);return value;};
const parse=row=>({...row,data:JSON.parse(row.data)});
const timestamp=(value,label)=>{
  const result=text(value,label,40);
  if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result)||!Number.isFinite(Date.parse(result)))throw new HttpError(400,`${label}: indica fecha, hora y zona horaria.`);
  return new Date(result).toISOString();
};
const list=(value,max,label)=>{if(!Array.isArray(value)||value.length>max)throw new HttpError(400,`${label} no válido.`);return value;};
const progressStates=['No intentado','En progreso','Derrotado'];
const methods=['Loot Council','Roll','Soft Reserve','DKP','Híbrido'];

export function publicProgress(db){
  return db.prepare('SELECT id,data FROM progress ORDER BY rowid DESC').all().map(row=>{
    const p=JSON.parse(row.data),bosses=(p.bosses||[]).map(b=>({id:b.id,name:b.name,status:b.status,firstKill:b.firstKill||null}));
    const defeated=bosses.filter(b=>b.status==='Derrotado').length;
    return {id:row.id,name:p.name,difficulty:p.difficulty,bosses,total:bosses.length,defeated,percentage:bosses.length?Math.round(defeated/bosses.length*100):0,
      history:(p.history||[]).slice(-50).reverse().map(h=>({boss:h.boss,status:h.status,date:h.date}))};
  });
}

function attendance(db,user,url){
  const params=[],where=[];
  const all=can(user,'attendance.manage'),requested=url.searchParams.get('userId');
  if(!all&&requested&&requested!=='me'&&requested!==user.id)throw new HttpError(403,'Solo puedes consultar tu propia asistencia.');
  if(!all||requested){where.push('a.user_id=?');params.push(!all||requested==='me'?user.id:requested);}
  for(const [key,column] of [['raidId','a.raid_id'],['characterId','a.character_id'],['status','a.status']]){
    const v=url.searchParams.get(key);if(v){where.push(`${column}=?`);params.push(v);}
  }
  for(const [key,op] of [['from','>='],['to','<=']]){
    const v=url.searchParams.get(key);if(v){where.push(`r.starts_at${op}?`);params.push(timestamp(v,'Fecha de filtro'));}
  }
  const rows=db.prepare(`SELECT a.*,r.title AS raid_title,r.starts_at,c.name AS character_name,u.display_name FROM attendance a JOIN raids r ON r.id=a.raid_id JOIN users u ON u.id=a.user_id LEFT JOIN characters c ON c.id=a.character_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY r.starts_at DESC,u.display_name`).all(...params);
  return {rows,metrics:attendanceMetrics(rows)};
}

export function csv(rows){
  if(!rows.length)return '\uFEFFSin registros\r\n';
  const keys=Object.keys(rows[0]);
  const cell=value=>{
    let s=String(value??'');
    if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+[keys.map(cell).join(','),...rows.map(row=>keys.map(k=>cell(typeof row[k]==='object'?JSON.stringify(row[k]):row[k])).join(','))].join('\r\n')+'\r\n';
}

// Every handler shares the core app's CSRF, origin, size and rate protections.
export async function operations(ctx){
  const {db,user,s,path,method,url,body,send,sendText,requireUser,requirePermission}=ctx;
  const activeCharacter=id=>requireRecord(db.prepare('SELECT * FROM characters WHERE id=? AND archived_at IS NULL').get(id),'Personaje activo no encontrado.');
  const log=(action,target,before,after)=>audit(db,user.id,action,target,{before,after});

  if(path==='/api/raids'){
    requirePermission('community.read');
    if(method==='GET'){send(200,db.prepare('SELECT * FROM raids ORDER BY starts_at DESC LIMIT 500').all());return true;}
    if(method==='POST'){
      requirePermission('attendance.manage');const v=await body(),id=randomUUID();
      const title=text(v.title,'nombre de raid',120),starts=timestamp(v.starts_at,'Fecha de raid');
      transaction(db,()=>{db.prepare('INSERT INTO raids(id,title,starts_at,source) VALUES(?,?,?,?)').run(id,title,starts,'manual');log('raid.created',id,null,{title,starts_at:starts,source:'manual'});});
      send(201,{id});return true;
    }
  }
  const raidMatch=path.match(/^\/api\/raids\/([^/]+)$/);
  if(raidMatch&&['PATCH','DELETE'].includes(method)){
    requirePermission('attendance.manage');const id=raidMatch[1],previous=requireRecord(db.prepare('SELECT * FROM raids WHERE id=?').get(id));
    if(method==='DELETE'){
      if(db.prepare('SELECT 1 FROM attendance WHERE raid_id=? LIMIT 1').get(id)||db.prepare("SELECT 1 FROM loot WHERE json_extract(data,'$.raidId')=? LIMIT 1").get(id))throw new HttpError(409,'La raid tiene asistencia o loot; conserva su historial y corrige sus datos.');
      transaction(db,()=>{db.prepare('DELETE FROM raids WHERE id=?').run(id);log('raid.deleted',id,previous,null);});send(200,{ok:true});return true;
    }
    const v=await body(),next={title:text(v.title??previous.title,'nombre de raid',120),starts_at:timestamp(v.starts_at??previous.starts_at,'Fecha de raid')};
    transaction(db,()=>{db.prepare('UPDATE raids SET title=?,starts_at=? WHERE id=?').run(next.title,next.starts_at,id);log('raid.updated',id,previous,next);});send(200,{id});return true;
  }
  if(path==='/api/attendance'&&method==='GET'){requireUser();send(200,attendance(db,user,url));return true;}
  const attendanceMatch=path.match(/^\/api\/raids\/([^/]+)\/attendance$/);
  if(attendanceMatch&&method==='PUT'){
    requirePermission('attendance.manage');const raidId=attendanceMatch[1];requireRecord(db.prepare('SELECT id FROM raids WHERE id=?').get(raidId));
    const v=await body(),entries=list(v.entries,100,'Asistencias'),seen=new Set();
    if(!entries.length)throw new HttpError(400,'Añade al menos un registro.');
    const normalized=entries.map(e=>{
      if(!e||typeof e!=='object')throw new HttpError(400,'Registro de asistencia no válido.');
      const c=activeCharacter(text(e.characterId,'personaje',80));
      if(seen.has(c.user_id))throw new HttpError(400,'Solo se admite un personaje por miembro en cada raid.');seen.add(c.user_id);
      return {userId:c.user_id,characterId:c.id,status:choice(e.status,s.attendanceStates,'asistencia')};
    });
    transaction(db,()=>{for(const entry of normalized){
      const previous=db.prepare('SELECT * FROM attendance WHERE raid_id=? AND user_id=?').get(raidId,entry.userId);
      db.prepare('INSERT INTO attendance(id,raid_id,user_id,character_id,status) VALUES(?,?,?,?,?) ON CONFLICT(raid_id,user_id) DO UPDATE SET character_id=excluded.character_id,status=excluded.status').run(randomUUID(),raidId,entry.userId,entry.characterId,entry.status);
      log('attendance.updated',raidId,previous||null,entry);
    }});send(200,{updated:normalized.length});return true;
  }
  const attendanceDelete=path.match(/^\/api\/attendance\/([^/]+)$/);
  if(attendanceDelete&&method==='DELETE'){
    requirePermission('attendance.manage');const id=attendanceDelete[1],previous=requireRecord(db.prepare('SELECT * FROM attendance WHERE id=?').get(id));
    transaction(db,()=>{db.prepare('DELETE FROM attendance WHERE id=?').run(id);log('attendance.deleted',id,previous,null);});send(200,{ok:true});return true;
  }
  if(path==='/api/members'&&method==='GET'){
    requirePermission('roster.read');send(200,db.prepare('SELECT id,display_name,rank FROM users ORDER BY display_name').all());return true;
  }
  if(path==='/api/council'){
    requirePermission('community.read');
    if(method==='GET'){
      const rows=db.prepare('SELECT c.user_id,u.display_name,u.rank FROM council_members c JOIN users u ON u.id=c.user_id WHERE c.active=1 ORDER BY u.display_name').all();
      send(200,can(user,'loot.manage')?rows:rows.map(r=>({display_name:r.display_name,rank:r.rank})));return true;
    }
    if(method==='PUT'){
      requirePermission('settings.manage');const v=await body(),ids=[...new Set(list(v.userIds,20,'Consejo'))];
      for(const id of ids){const member=requireRecord(db.prepare('SELECT rank FROM users WHERE id=?').get(text(id,'miembro',80)));if(!can(member,'community.read'))throw new HttpError(400,'El consejo solo puede incluir miembros de la hermandad.');}
      transaction(db,()=>{const previous=db.prepare('SELECT user_id FROM council_members WHERE active=1').all();db.prepare('UPDATE council_members SET active=0,updated_at=?').run(now());for(const id of ids)db.prepare('INSERT INTO council_members(user_id,active,updated_at) VALUES(?,1,?) ON CONFLICT(user_id) DO UPDATE SET active=1,updated_at=excluded.updated_at').run(id,now());log('council.rotated','guild',previous,ids);});send(200,{ok:true});return true;
    }
  }
  if(path==='/api/wishlists'){
    requirePermission('community.read');
    if(method==='GET'){
      const all=url.searchParams.get('all')==='true';if(all)requirePermission('loot.manage');
      const rows=all?db.prepare('SELECT * FROM wishlists ORDER BY rowid DESC').all():db.prepare('SELECT * FROM wishlists WHERE user_id=? ORDER BY rowid DESC').all(user.id);
      send(200,rows.map(parse));return true;
    }
    if(method==='POST'){
      const v=await body(),c=activeCharacter(text(v.characterId,'personaje',80));if(c.user_id!==user.id)throw new HttpError(403,'Solo puedes editar la wishlist de tus personajes.');
      const priority=Number(v.priority);if(!Number.isInteger(priority)||priority<1||priority>5)throw new HttpError(400,'La prioridad debe estar entre 1 y 5.');
      const item={characterId:c.id,characterName:c.name,item:text(v.item,'objeto',160),boss:text(v.boss??'','boss',120,false),priority,notes:text(v.notes??'','notas',1000,false)};
      const id=randomUUID();transaction(db,()=>{db.prepare('INSERT INTO wishlists(id,user_id,data) VALUES(?,?,?)').run(id,user.id,JSON.stringify(item));log('wishlist.created',id,null,item);});send(201,{id});return true;
    }
  }
  const wishMatch=path.match(/^\/api\/wishlists\/([^/]+)$/);
  if(wishMatch&&method==='DELETE'){
    requirePermission('community.read');const id=wishMatch[1],previous=requireRecord(db.prepare('SELECT * FROM wishlists WHERE id=? AND user_id=?').get(id,user.id));
    transaction(db,()=>{db.prepare('DELETE FROM wishlists WHERE id=?').run(id);log('wishlist.deleted',id,JSON.parse(previous.data),null);});send(200,{ok:true});return true;
  }
  if(path==='/api/loot'){
    requirePermission('community.read');
    if(method==='GET'){
      let rows=db.prepare('SELECT * FROM loot ORDER BY created_at DESC LIMIT 500').all().map(parse);
      if(!can(user,'loot.manage'))rows=rows.map(r=>({id:r.id,created_at:r.created_at,data:{item:r.data.item,raidTitle:r.data.raidTitle,boss:r.data.boss,recipientName:r.data.recipientName,reason:r.data.reason,date:r.data.date,method:r.data.method,status:r.data.status,candidates:r.data.candidates.map(c=>({name:c.name})),council:r.data.council.map(c=>({name:c.name}))}}));
      send(200,rows);return true;
    }
    if(method==='POST'){
      requirePermission('loot.manage');const v=await body(),raid=requireRecord(db.prepare('SELECT * FROM raids WHERE id=?').get(text(v.raidId,'raid',80))),recipient=activeCharacter(text(v.recipientCharacterId,'ganador',80));
      const candidateIds=[...new Set(list(v.candidateIds??[recipient.id],100,'Candidatos'))];
      if(!candidateIds.includes(recipient.id))throw new HttpError(400,'El ganador debe figurar entre los candidatos.');
      const candidates=candidateIds.map(id=>{const c=activeCharacter(text(id,'candidato',80));return {id:c.id,name:[c.name,c.surname].filter(Boolean).join(' ')};});
      const methodName=choice(v.method,methods,'método de loot'),council=[];
      if(methodName==='Loot Council'){
        const ids=[...new Set(list(v.councilIds,20,'Consejo participante'))];if(!ids.length)throw new HttpError(400,'Registra quién participó en el consejo.');
        for(const id of ids){const member=requireRecord(db.prepare('SELECT c.user_id,u.display_name FROM council_members c JOIN users u ON u.id=c.user_id WHERE c.active=1 AND c.user_id=?').get(text(id,'consejero',80)),'El participante no forma parte del consejo activo.');council.push({id:member.user_id,name:member.display_name});}
      }
      const record={item:text(v.item,'objeto',160),raidId:raid.id,raidTitle:raid.title,boss:text(v.boss,'boss',120),recipientCharacterId:recipient.id,recipientUserId:recipient.user_id,recipientName:[recipient.name,recipient.surname].filter(Boolean).join(' '),date:timestamp(v.date,'Fecha de reparto'),reason:text(v.reason,'motivo',1000),notes:text(v.notes??'','observaciones internas',2000,false),method:methodName,candidates,council,status:'Asignado'};
      const id=randomUUID();transaction(db,()=>{db.prepare('INSERT INTO loot(id,data,created_at) VALUES(?,?,?)').run(id,JSON.stringify(record),now());log('loot.assigned',id,null,record);});send(201,{id});return true;
    }
  }
  const voidMatch=path.match(/^\/api\/loot\/([^/]+)\/void$/);
  if(voidMatch&&method==='POST'){
    requirePermission('loot.manage');const id=voidMatch[1],row=requireRecord(db.prepare('SELECT data FROM loot WHERE id=?').get(id)),previous=JSON.parse(row.data),v=await body();
    if(previous.status==='Anulado')throw new HttpError(409,'La asignación ya está anulada.');
    const next={...previous,status:'Anulado',voidReason:text(v.reason,'motivo de anulación',1000)};
    transaction(db,()=>{db.prepare('UPDATE loot SET data=? WHERE id=?').run(JSON.stringify(next),id);log('loot.voided',id,previous,next);});send(200,{ok:true});return true;
  }
  if(path==='/api/progress'){
    requirePermission('progress.manage');
    if(method==='GET'){send(200,db.prepare('SELECT * FROM progress ORDER BY rowid DESC').all().map(parse));return true;}
    if(method==='POST'){
      const v=await body(),names=list(v.bosses,40,'Bosses').map(b=>text(b,'boss',100));
      if(!names.length||new Set(names.map(n=>n.toLowerCase())).size!==names.length)throw new HttpError(400,'Añade entre 1 y 40 bosses sin duplicados.');
      const record={name:text(v.name,'raid de progreso',120),difficulty:text(v.difficulty??'','dificultad',80,false),bosses:names.map(name=>({id:randomUUID(),name,status:'No intentado',firstKill:null})),history:[]},id=randomUUID();
      transaction(db,()=>{db.prepare('INSERT INTO progress(id,data) VALUES(?,?)').run(id,JSON.stringify(record));log('progress.created',id,null,record);});send(201,{id});return true;
    }
  }
  const bossMatch=path.match(/^\/api\/progress\/([^/]+)\/bosses\/([^/]+)$/);
  if(bossMatch&&method==='PATCH'){
    requirePermission('progress.manage');const [_,id,bossId]=bossMatch,row=requireRecord(db.prepare('SELECT data FROM progress WHERE id=?').get(id)),record=JSON.parse(row.data),boss=requireRecord(record.bosses.find(b=>b.id===bossId)),v=await body();
    const previous={...boss};boss.status=choice(v.status,progressStates,'estado del boss');boss.firstKill=boss.status==='Derrotado'?timestamp(v.firstKill||boss.firstKill,'Primera victoria'):null;
    if(boss.firstKill&&Date.parse(boss.firstKill)>Date.now())throw new HttpError(400,'La primera victoria no puede estar en el futuro.');
    const note=text(v.note??'','nota interna',1000,false);
    record.history.push({boss:boss.name,status:boss.status,date:now(),actorId:user.id,note});
    transaction(db,()=>{db.prepare('UPDATE progress SET data=? WHERE id=?').run(JSON.stringify(record),id);log('progress.updated',`${id}/${bossId}`,previous,{...boss,note});});send(200,{ok:true});return true;
  }
  const characterMatch=path.match(/^\/api\/characters\/([^/]+)$/);
  if(characterMatch&&method==='DELETE'){
    requirePermission('character.write');const id=characterMatch[1],c=requireRecord(db.prepare('SELECT * FROM characters WHERE id=? AND user_id=? AND archived_at IS NULL').get(id,user.id));
    transaction(db,()=>{db.prepare('UPDATE characters SET archived_at=?,is_main=0 WHERE id=?').run(now(),id);if(c.is_main){const next=db.prepare('SELECT id FROM characters WHERE user_id=? AND archived_at IS NULL ORDER BY created_at,id LIMIT 1').get(user.id);if(next)db.prepare('UPDATE characters SET is_main=1 WHERE id=?').run(next.id);}log('character.archived',id,{name:c.name,is_main:c.is_main},{archived:true});});send(200,{ok:true});return true;
  }
  if(path==='/api/export/csv'&&method==='GET'){
    requirePermission('backup.export');const dataset=choice(url.searchParams.get('dataset'),['characters','attendance','loot','applications','settings'],'exportación');
    let rows=dataset==='settings'?[s]:db.prepare(`SELECT * FROM ${dataset}`).all();
    if(['loot','applications'].includes(dataset))rows=rows.map(r=>{const {data,...rest}=r;return {...rest,...JSON.parse(data)};});
    audit(db,user.id,'data.exported','guild',{format:'csv',dataset});sendText(200,csv(rows),'text/csv; charset=utf-8',{'Content-Disposition':`attachment; filename="darkness-${dataset}.csv"`});return true;
  }
  return false;
}
