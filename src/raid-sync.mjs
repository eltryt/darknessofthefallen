import {randomUUID} from 'node:crypto';
import {audit,transaction} from './database-core.mjs';
import {can,HttpError} from './domain.mjs';
import {raidHelper,raidHelperReady,ProviderError} from './raid-helper.mjs';
import {canManageEvent,eventRaw,restricted,signupFingerprint} from './raid-events.mjs';
const stamp=()=>new Date().toISOString();
const snowflake=value=>/^\d{17,20}$/.test(String(value||''));
function unpack(value){return value.event||value;}
export function ingestRaidEvent(db,value,env,localId){
  const raw=unpack(value);
  if(!snowflake(raw.id)||raw.serverId!==env.DISCORD_GUILD_ID||raw.channelId!==env.RAID_HELPER_CHANNEL_ID||!snowflake(raw.leaderId)||typeof raw.title!=='string'||!Number.isFinite(raw.startTime)||!Array.isArray(raw.signUps)||!Array.isArray(raw.classes)||!Array.isArray(raw.roles))throw new ProviderError(502);
  const start=new Date(raw.startTime*1000).toISOString(),end=Number.isFinite(raw.endTime)?new Date(raw.endTime*1000).toISOString():null;
  const state=end&&Date.parse(end)<Date.now()?'Finalizada':'Abierta';
  const existing=db.prepare('SELECT * FROM raid_events WHERE external_id=?').get(raw.id)||(localId?db.prepare('SELECT * FROM raid_events WHERE id=? AND external_id IS NULL').get(localId):null);
  const id=existing?.id||randomUUID(),limit=Number(raw.advancedSettings?.limit),size=Number.isInteger(limit)&&limit>0?limit:null,encoded=JSON.stringify(raw);
  transaction(db,()=>{
    if(existing){
      const changed=encoded!==existing.raw||existing.state!==state;
      db.prepare('UPDATE raid_events SET external_id=?,channel_id=?,organizer_id=?,title=?,starts_at=?,ends_at=?,state=?,capacity=?,raw=?,synced_at=?,updated_at=? WHERE id=?').run(raw.id,raw.channelId,raw.leaderId,raw.title,start,end,state,size,encoded,stamp(),changed?stamp():existing.updated_at,id);
    }else db.prepare('INSERT INTO raid_events(id,external_id,channel_id,organizer_id,title,starts_at,ends_at,state,capacity,raw,synced_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,raw.id,raw.channelId,raw.leaderId,raw.title,start,end,state,size,encoded,stamp(),stamp());
    // Share the stable local raid ID with attendance/loot, without deleting history.
    db.prepare("INSERT INTO raids(id,title,starts_at,source,external_id) VALUES(?,?,?,'raid-helper',?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,starts_at=excluded.starts_at").run(id,raw.title,start,raw.id);
    if(existing){for(const previous of (eventRaw(existing).signUps||[])){
      if(!raw.signUps.some(s=>String(s.id)===String(previous.id))&&previous.userId)db.prepare('INSERT OR REPLACE INTO raid_signup_cancellations VALUES(?,?,?,?,?)').run(id,String(previous.id),previous.userId,JSON.stringify(previous),stamp());
    }}
    for(const signup of raw.signUps)db.prepare('DELETE FROM raid_signup_cancellations WHERE event_id=? AND signup_id=?').run(id,String(signup.id));
    const links=db.prepare('SELECT * FROM raid_character_links WHERE event_id=?').all(id);
    for(const link of links){const current=raw.signUps.find(s=>String(s.id)===link.signup_id);if(!current||signupFingerprint(current)!==link.fingerprint)db.prepare('DELETE FROM raid_character_links WHERE event_id=? AND signup_id=?').run(id,link.signup_id);}
  });
  return db.prepare('SELECT * FROM raid_events WHERE id=?').get(id);
}
function cancelled(db,event){transaction(db,()=>{db.prepare("UPDATE raid_events SET state=?,synced_at=?,updated_at=? WHERE id=?").run(event.ends_at&&Date.parse(event.ends_at)<Date.now()?'Finalizada':'Cancelada',stamp(),stamp(),event.id);audit(db,'raid-helper','raid.removed.remote',event.id,{});});}
function safeError(e){if(e.reason==='locked template')return 'La plantilla de Raid-Helper está bloqueada; utiliza una plantilla disponible.';if(e instanceof HttpError)return e.message;if(e instanceof ProviderError)return `Raid-Helper respondió HTTP ${e.status}. Revisa acceso, configuración o disponibilidad.`;return 'No se pudo confirmar la respuesta de Raid-Helper.';}
async function runJob(db,env,provider,job){
  let row=db.prepare('SELECT * FROM raid_events WHERE id=?').get(job.event_id);
  const payload=JSON.parse(job.payload),actor=db.prepare('SELECT * FROM users WHERE id=?').get(job.actor_id);
  if(job.kind==='create'){
    if(!can(actor,'attendance.manage')||!canManageEvent(actor,row))throw new HttpError(403,'El autor ya no tiene permiso para publicar la convocatoria.');
    const response=await provider.create(payload);let event=unpack(response);
    if(!snowflake(event.id))throw new ProviderError(502);
    // Persist the returned ID before any subsequent read can fail.
    db.prepare('UPDATE raid_events SET external_id=? WHERE id=?').run(event.id,row.id);
    event=await provider.get(event.id);return ingestRaidEvent(db,event,env,row.id);
  }
  row=ingestRaidEvent(db,await provider.get(row.external_id),env,row.id);
  const current=eventRaw(row),base=payload._base;delete payload._base;
  if(['update','cancel'].includes(job.kind)){
    if(!canManageEvent(actor,row))throw new HttpError(403,'El responsable o sus permisos han cambiado.');
    if(base!==undefined&&base!==current.lastUpdated)throw new HttpError(409,'La convocatoria cambió en Discord. Revisa los cambios antes de volver a editar.');
  }else{
    if(!can(actor,'community.read')||restricted(current)||(payload.userId!==actor.id&&!canManageEvent(actor,row)))throw new HttpError(403,'Ya no tienes permiso para cambiar esta inscripción.');
  }
  if(row.state!=='Abierta')throw new HttpError(409,'Esta convocatoria ya no está abierta.');
  if(job.kind==='cancel'){await provider.remove(row.external_id);cancelled(db,row);return;}
  if(job.kind==='update')await provider.update(row.external_id,payload);
  if(['signup','remove_signup'].includes(job.kind)){
    const mine=current.signUps.filter(s=>s.userId===payload.userId);
    if(mine.length>1)throw new HttpError(409,'Hay varias inscripciones del jugador. Revísalas en Discord.');
    const signup=mine[0];
    if(payload.signupId&&(!signup||String(signup.id)!==payload.signupId))throw new HttpError(409,'La inscripción cambió en Discord. Actualiza y vuelve a intentarlo.');
    if(job.kind==='remove_signup'){if(signup)await provider.removeSignup(row.external_id,String(signup.id));}
    else{
      if(!db.prepare('SELECT id FROM characters WHERE id=? AND user_id=? AND archived_at IS NULL').get(payload.characterId,payload.userId))throw new HttpError(409,'El personaje ya no está disponible.');
      if(signup)await provider.editSignup(row.external_id,String(signup.id),payload.value);else await provider.signup(row.external_id,payload.value);
    }
  }
  const updated=ingestRaidEvent(db,await provider.get(row.external_id),env,row.id);
  if(job.kind==='signup')linkCharacter(db,updated,payload);
}
function linkCharacter(db,row,payload){
  const matches=eventRaw(row).signUps.filter(s=>s.userId===payload.userId&&s.name===payload.value.name&&s.className===payload.value.className&&(s.specName||'')===(payload.value.specName||''));
  if(matches.length===1){const s=matches[0];db.prepare('INSERT OR REPLACE INTO raid_character_links VALUES(?,?,?,?,?)').run(row.id,String(s.id),s.userId,payload.characterId,signupFingerprint(s));return true;}return false;
}
function reconcile(db,job,row){
  const p=JSON.parse(job.payload),raw=eventRaw(row);
  let done=job.kind==='create'&&row.external_id;
  if(job.kind==='signup')done=linkCharacter(db,row,p);
  if(job.kind==='update')done=raw.title===p.title&&raw.startTime===p.startTime&&raw.endTime===p.endTime&&Number(raw.advancedSettings?.limit)===p.advancedSettings.limit&&(!p.roles||p.roles.every(r=>(raw.roles||[]).some(x=>x.name===r.name&&Number(x.limit)===r.limit)));
  if(job.kind==='remove_signup')done=!(raw.signUps||[]).some(s=>String(s.id)===p.signupId);
  if(job.kind==='cancel')done=row.state==='Cancelada'||row.state==='Finalizada';
  if(done)db.prepare("UPDATE raid_jobs SET status='done',error='' WHERE id=?").run(job.id);
}
export async function syncRaidEvents(db,env,transport=fetch,{force=false}={}){
  if(!raidHelperReady(env))return;
  const status=db.prepare('SELECT * FROM raid_sync WHERE id=1').get(),time=Date.now();
  const pending=db.prepare("SELECT 1 FROM raid_jobs WHERE status='pending' AND next_at<=? LIMIT 1").get(time);
  if(status.busy_until>time||(!force&&status.next_at>time&&!pending))return;
  db.prepare('UPDATE raid_sync SET busy_until=? WHERE id=1').run(time+180000);
  // A crash after sending a write is ambiguous. Reconcile; never blindly replay POST.
  db.prepare("UPDATE raid_jobs SET status='uncertain',error='Operación interrumpida: comprobando el resultado externo.' WHERE status='running'").run();
  const provider=raidHelper(env,transport);
  try{
    // One outbound write per tick. Reads and job execution share this lease.
    const job=db.prepare("SELECT * FROM raid_jobs WHERE status='pending' AND next_at<=? ORDER BY created_at LIMIT 1").get(time);
    if(job){
      db.prepare("UPDATE raid_jobs SET status='running',attempts=attempts+1 WHERE id=?").run(job.id);
      try{await runJob(db,env,provider,job);db.prepare("UPDATE raid_jobs SET status='done',error='' WHERE id=?").run(job.id);audit(db,job.actor_id,'raid.sync.completed',job.event_id,{jobId:job.id,kind:job.kind});}
      catch(e){
        // 429 and explicit 4xx rejection mean no write was accepted. A network/5xx
        // failure may have occurred after acceptance, so wait for reconciliation.
        const retry=e instanceof ProviderError&&e.status===429;
        const blocked=e instanceof HttpError||(e instanceof ProviderError&&e.status>=400&&e.status<500&&!retry);
        db.prepare('UPDATE raid_jobs SET status=?,next_at=?,error=? WHERE id=?').run(retry?'pending':blocked?'blocked':'uncertain',time+(e.retryAfter||60)*1000,safeError(e),job.id);
        if(retry)throw e;
      }
    }
    const summaries=await provider.list();
    // Adopt an uncertain create only by its unique, saved correlation marker.
    const creates=db.prepare("SELECT j.* FROM raid_jobs j JOIN raid_events e ON e.id=j.event_id WHERE j.kind='create' AND j.status='uncertain' AND e.external_id IS NULL").all();
    for(const job of creates){const matches=summaries.filter(e=>(e.description||'').includes(`[DOTF:${job.event_id}]`));if(matches.length===1)db.prepare('UPDATE raid_events SET external_id=? WHERE id=?').run(matches[0].id,job.event_id);}
    const ids=new Set(summaries.map(e=>e.id));
    // Also verify previously active events absent from the list individually;
    // absence from one list or failed pagination alone never means cancellation.
    for(const e of db.prepare("SELECT external_id FROM raid_events WHERE external_id IS NOT NULL AND state IN ('Abierta','Pendiente de publicación')").all())ids.add(e.external_id);
    const all=[...ids].sort(),cursor=status.cursor<all.length?status.cursor:0,chunk=all.slice(cursor,cursor+16);
    for(const id of chunk){
      try{const row=ingestRaidEvent(db,await provider.get(id),env);for(const j of db.prepare("SELECT * FROM raid_jobs WHERE event_id=? AND status='uncertain'").all(row.id))reconcile(db,j,row);}
      catch(e){
        if(e instanceof ProviderError&&e.status===404){const row=db.prepare('SELECT * FROM raid_events WHERE external_id=?').get(id);if(row){cancelled(db,row);for(const j of db.prepare("SELECT * FROM raid_jobs WHERE event_id=? AND status='uncertain' AND kind='cancel'").all(row.id))reconcile(db,j,{...row,state:'Cancelada'});}}
        else throw e;
      }
    }
    db.prepare("UPDATE raid_sync SET next_at=?,last_success=?,error='',cursor=? WHERE id=1").run(time+300000,stamp(),cursor+16>=all.length?0:cursor+16);
  }catch(e){db.prepare('UPDATE raid_sync SET next_at=?,error=? WHERE id=1').run(time+Math.max(300,(e.retryAfter||0))*1000,safeError(e));}
  finally{db.prepare('UPDATE raid_sync SET busy_until=0 WHERE id=1').run();}
}
