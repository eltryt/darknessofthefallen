import {randomUUID} from 'node:crypto';
import {audit,transaction} from './database-core.mjs';
import {can,HttpError,text,choice} from './domain.mjs';
import {raidHelperReady} from './raid-helper.mjs';
import {madridInstant} from './raid-time.mjs';
export const categories=['Oficial','Extraordinaria','Voluntaria'];
const now=()=>new Date().toISOString();
const groupRoles={tank:'Tanque',healer:'Sanador',melee:'DPS melee',ranged:'DPS distancia'};
const classNames={Guerrero:'Warrior','Paladín':'Paladin',Cazador:'Hunter','Pícaro':'Rogue',Sacerdote:'Priest','Chamán':'Shaman',Mago:'Mage',Brujo:'Warlock',Druida:'Druid'};

export const eventRaw=row=>JSON.parse(row.raw);
export const canManageEvent=(user,event)=>can(user,'recruitment.manage')||(can(user,'attendance.manage')&&event.organizer_id===user.id);
export const restricted=raw=>['allowed_roles','banned_roles'].some(key=>{const value=raw.advancedSettings?.[key];return Array.isArray(value)?value.length>0:Boolean(value)&&String(value).trim().toLowerCase()!=='none';});
export function mayView(user,row){return canManageEvent(user,row)||(can(user,'community.read')&&!restricted(eventRaw(row)));}
export function signupStatus(signup,raw){
  const cls=(raw.classes||[]).find(c=>c.name===signup.className);
  if(signup.status==='queued')return 'Suplente';
  if(cls?.type==='default'){
    const name=signup.className.toLowerCase();
    if(['bench','reserve','suplente','reserva'].includes(name))return 'Suplente';
    if(['absence','absent','ausente'].includes(name))return 'Ausente';
    return 'Pendiente de confirmación';
  }
  return signup.status==='primary'?'Confirmado':'Pendiente de confirmación';
}
export const signupFingerprint=s=>JSON.stringify([s.userId,s.name,s.className,s.specName||'']);
export function projectEvent(db,row,user,env){
  const raw=eventRaw(row),member=mayView(user,row),manage=canManageEvent(user,row),signups=raw.signUps||[];
  const confirmed=signups.filter(s=>signupStatus(s,raw)==='Confirmado'),roles={};
  for(const signup of confirmed){const role=signup.roleName||'Sin rol indicado';roles[role]=(roles[role]||0)+1;}
  const result={id:row.id,title:row.title,starts_at:row.starts_at,ends_at:row.ends_at,category:row.category||'Sin clasificar',roster:row.roster||'Sin roster fijo',state:row.state,capacity:row.capacity,occupied:confirmed.length,available:row.capacity===null?null:Math.max(0,row.capacity-confirmed.length),roles,revision:row.updated_at,syncedAt:row.synced_at,canManage:manage};
  if(!member)return result;
  result.organizer=raw.leaderName||db.prepare('SELECT display_name FROM users WHERE id=?').get(row.organizer_id)?.display_name||'Responsable de la convocatoria';
  result.organizerId=manage?row.organizer_id:undefined;
  result.public=Boolean(row.public);result.externalId=row.external_id;
  result.discordUrl=row.external_id?`https://discord.com/channels/${env.DISCORD_GUILD_ID}/${row.channel_id}/${row.external_id}`:null;
  result.classes=(raw.classes||[]).map(c=>({name:c.name,type:c.type,limit:c.limit,specs:(c.specs||[]).map(s=>({name:s.name,roleName:s.roleName||''}))}));
  result.roleLimits=(raw.roles||[]).map(r=>({name:r.name,limit:r.limit}));
  result.signups=signups.map(s=>{
    const own=s.userId===user.id,link=db.prepare('SELECT l.*,c.name,c.surname,c.class,c.archived_at FROM raid_character_links l JOIN characters c ON c.id=l.character_id WHERE event_id=? AND signup_id=?').get(row.id,String(s.id));
    const linked=link&&!link.archived_at&&link.user_id===s.userId&&link.fingerprint===signupFingerprint(s);
    return {id:String(s.id),name:s.name,className:s.className,specName:s.specName||'',role:s.roleName||'',status:signupStatus(s,raw),own,userId:manage||own?s.userId:undefined,characterId:linked&&(own||manage)?link.character_id:null,characterName:linked?[link.name,link.surname].filter(Boolean).join(' '):null,registeredCharacter:Boolean(linked),registeredClass:linked?link.class:null};
  });
  result.cancelledSignups=db.prepare('SELECT * FROM raid_signup_cancellations WHERE event_id=? ORDER BY cancelled_at DESC LIMIT 100').all(row.id).filter(s=>manage||s.user_id===user.id).map(s=>{const data=JSON.parse(s.data);return {name:data.name,className:data.className,specName:data.specName||'',status:'Cancelado',cancelledAt:s.cancelled_at};});
  result.mine=result.signups.filter(s=>s.own);
  result.job=db.prepare("SELECT id,kind,status,error FROM raid_jobs WHERE event_id=? ORDER BY created_at DESC LIMIT 1").get(row.id)||null;
  if(result.job?.status==='done')result.job=null;
  if(!manage&&result.job&&!['signup','remove_signup'].includes(result.job.kind))result.job={status:result.job.status,error:'Hay una actualización pendiente de sincronización.'};
  return result;
}
function getEvent(db,id){const row=db.prepare('SELECT * FROM raid_events WHERE id=?').get(id);if(!row)throw new HttpError(404,'Convocatoria no encontrada.');return row;}
const capacity=value=>{if(!Number.isInteger(value)||value<1||value>1000)throw new HttpError(400,'Capacidad no válida (1–1000).');return value;};
function requireManage(user,row){if(!canManageEvent(user,row))throw new HttpError(403,'Solo el responsable autorizado, los oficiales y el Líder pueden gestionar esta convocatoria.');}
export function enqueueRaidJob(db,user,row,kind,payload,key){
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(key||''))throw new HttpError(400,'Falta la referencia única de la operación.');
  const existing=db.prepare('SELECT * FROM raid_jobs WHERE id=?').get(key);
  if(existing){if(existing.actor_id!==user.id||existing.event_id!==row.id||existing.kind!==kind||existing.payload!==JSON.stringify(payload))throw new HttpError(409,'Referencia de operación ya utilizada.');return existing.id;}
  if(db.prepare("SELECT id FROM raid_jobs WHERE event_id=? AND status IN ('pending','running','uncertain')").get(row.id))throw new HttpError(409,'Espera a que se sincronice la operación pendiente de esta convocatoria.');
  db.prepare('INSERT INTO raid_jobs(id,event_id,actor_id,kind,payload,created_at) VALUES(?,?,?,?,?,?)').run(key,row.id,user.id,kind,JSON.stringify(payload),now());
  audit(db,user.id,'raid.sync.queued',row.id,{kind,jobId:key});
  return key;
}
export async function raidEventsApi(ctx){
  const {db,user,path,method,url,body,send,env,requirePermission,requireUser}=ctx;
  if(path==='/api/events'&&method==='GET'){
    const rows=db.prepare('SELECT * FROM raid_events ORDER BY starts_at DESC LIMIT 500').all().filter(r=>mayView(user,r)||r.public===1);
    const sync=db.prepare('SELECT last_success,error,next_at,busy_until FROM raid_sync WHERE id=1').get();
    send(200,{events:rows.map(r=>projectEvent(db,r,user,env)),configured:raidHelperReady(env),sync:can(user,'attendance.manage')?sync:{last_success:sync.last_success,healthy:!sync.error,nextSyncAt:sync.next_at,diagnostic:sync.error,providerStatus:Number(sync.error.match(/HTTP (\d+)/)?.[1])||null}});return true;
  }
  if(path==='/api/events'&&method==='POST'){
    requirePermission('attendance.manage');if(!raidHelperReady(env))throw new HttpError(503,'Falta activar Raid-Helper. Consulta la configuración del proyecto.');
    const v=await body(),title=text(v.title,'nombre',120),start=madridInstant(v.start),end=madridInstant(v.end);
    if(end<=start)throw new HttpError(400,'El fin debe ser posterior al inicio.');
    const meta={category:choice(v.category,categories,'categoría'),roster:text(v.roster??'','roster',80,false),public:v.public===true};
    const size=capacity(v.capacity),organizer=v.organizerId||user.id;
    if(organizer!==user.id&&!can(user,'recruitment.manage'))throw new HttpError(403,'Solo puedes crear tus propias convocatorias.');
    if(!can(db.prepare('SELECT * FROM users WHERE id=?').get(organizer),'attendance.manage'))throw new HttpError(400,'El responsable debe ser un raid leader, oficial o Líder registrado.');
    const prior=db.prepare('SELECT * FROM raid_jobs WHERE id=?').get(v.requestId||'');
    if(prior){if(prior.actor_id!==user.id||prior.kind!=='create')throw new HttpError(409,'Referencia ya utilizada.');send(202,{id:prior.event_id});return true;}
    const id=randomUUID(),stamp=now();
    transaction(db,()=>{
      db.prepare('INSERT INTO raid_events(id,channel_id,organizer_id,title,starts_at,ends_at,category,roster,public,capacity,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,env.RAID_HELPER_CHANNEL_ID,organizer,title,start,end,meta.category,meta.roster,Number(meta.public),size,stamp);
      const description=`${meta.category} · ${meta.roster||'Sin roster fijo'}\n[DOTF:${id}]`;
      enqueueRaidJob(db,user,{id},'create',{leaderId:organizer,templateId:env.RAID_HELPER_TEMPLATE_ID||'wowforever',title,description,date:String(Date.parse(start)/1000),time:String(Date.parse(start)/1000),advancedSettings:{duration:(Date.parse(end)-Date.parse(start))/60000,limit:size,limit_per_user:1,allow_duplicate:false,mentions:'',mention_leader:false}},v.requestId);
    });send(202,{id});return true;
  }
  const match=path.match(/^\/api\/events\/([^/]+)(?:\/(signup|cancel|metadata|retry))?$/);
  if(!match)return false;
  requireUser();const row=getEvent(db,match[1]),action=match[2],raw=eventRaw(row);
  if(!mayView(user,row))throw new HttpError(403,'No tienes acceso a esta convocatoria. Las convocatorias con restricciones de roles se gestionan en Discord.');
  if(method==='GET'&&!action){send(200,projectEvent(db,row,user,env));return true;}
  if(!['POST','PATCH'].includes(method))return false;
  const v=await body();
  if(action==='metadata'&&method==='PATCH'){
    requireManage(user,row);if(v.revision!==row.updated_at)throw new HttpError(409,'La convocatoria ha cambiado. Actualiza antes de editar.');
    transaction(db,()=>{db.prepare('UPDATE raid_events SET category=?,roster=?,public=?,updated_at=? WHERE id=?').run(choice(v.category,categories,'categoría'),text(v.roster??'','roster',80,false),Number(v.public===true),now(),row.id);audit(db,user.id,'raid.classified',row.id,{category:v.category,roster:v.roster,public:v.public===true});});send(200,{ok:true});return true;
  }
  if(!raidHelperReady(env))throw new HttpError(503,'Raid-Helper no está configurado.');
  if(action==='retry'){
    requireManage(user,row);const job=db.prepare("SELECT * FROM raid_jobs WHERE event_id=? AND status IN ('blocked','uncertain') ORDER BY created_at DESC LIMIT 1").get(row.id);
    if(!job)throw new HttpError(409,'No hay una operación bloqueada.');
    if(job.status==='uncertain')throw new HttpError(409,'Resultado externo desconocido. Se reconciliará automáticamente si aparece en Raid-Helper; no se reenviará para evitar duplicados.');
    transaction(db,()=>{db.prepare("UPDATE raid_jobs SET status='pending',next_at=0,error='' WHERE id=?").run(job.id);audit(db,user.id,'raid.sync.retry',row.id,{jobId:job.id});});send(202,{ok:true});return true;
  }
  if(!row.external_id||row.state!=='Abierta')throw new HttpError(409,'La convocatoria no está abierta o aún no se ha publicado.');
  let kind,payload;
  if(action==='signup'){
    requirePermission('community.read');if(restricted(raw))throw new HttpError(403,'Esta convocatoria limita roles: gestiona la inscripción en Discord.');
    const target=v.userId||user.id;if(target!==user.id)requireManage(user,row);
    const previous=(raw.signUps||[]).filter(s=>s.userId===target);
    if(previous.length>1)throw new HttpError(409,'Tienes varias inscripciones en Raid-Helper. Revísalas en Discord antes de modificarlas aquí.');
    if(v.cancel===true){if(!previous.length)throw new HttpError(404,'No hay inscripción activa.');kind='remove_signup';payload={signupId:String(previous[0].id),userId:target};}
    else{
      const character=db.prepare('SELECT * FROM characters WHERE id=? AND user_id=? AND archived_at IS NULL').get(v.characterId,target);
      if(!character)throw new HttpError(400,'Selecciona un personaje registrado de este jugador.');
      const cls=(raw.classes||[]).find(c=>c.name===v.className);if(!cls)throw new HttpError(400,'Selecciona una opción disponible en la plantilla de Raid-Helper.');
      if(cls.type!=='default'){const groupRole=groupRoles[cls.name.toLowerCase()];if(groupRole?character.role!==groupRole:![character.class,classNames[character.class]].some(name=>name?.toLowerCase()===cls.name.toLowerCase()))throw new HttpError(400,'La clase o el rol seleccionado no coincide con el personaje registrado.');}
      const specs=cls.specs||[];if(specs.length&&!specs.some(s=>s.name===v.specName))throw new HttpError(400,'Selecciona una especialización de Raid-Helper.');
      kind='signup';payload={userId:target,characterId:character.id,signupId:previous[0]?String(previous[0].id):null,value:{userId:target,name:[character.name,character.surname].filter(Boolean).join(' '),className:cls.name,...(specs.length?{specName:v.specName}:{})}};
    }
  }else{
    requireManage(user,row);if(v.revision!==row.updated_at)throw new HttpError(409,'La convocatoria ha cambiado. Actualiza antes de editar.');
    if(action==='cancel'){kind='cancel';payload={};}
    else if(!action&&method==='PATCH'){
      const start=madridInstant(v.start),end=madridInstant(v.end);if(end<=start)throw new HttpError(400,'El fin debe ser posterior al inicio.');
      const roleLimits=v.roleLimits||[];if(!Array.isArray(roleLimits)||roleLimits.length>30)throw new HttpError(400,'Límites de roles no válidos.');
      const roles=roleLimits.map(r=>{if(!(raw.roles||[]).some(x=>x.name===r.name))throw new HttpError(400,'Rol no disponible en Raid-Helper.');return {name:r.name,limit:capacity(r.limit)};});
      kind='update';payload={title:text(v.title,'nombre',120),startTime:Date.parse(start)/1000,endTime:Date.parse(end)/1000,advancedSettings:{limit:capacity(v.capacity)},...(roles.length?{roles}:{})};
    }else return false;
  }
  if(['update','cancel'].includes(kind)&&raw.lastUpdated!==undefined)payload._base=raw.lastUpdated;
  transaction(db,()=>enqueueRaidJob(db,user,row,kind,payload,v.requestId));send(202,{ok:true,message:'Operación guardada. Pendiente de confirmación de Raid-Helper.'});return true;
}
