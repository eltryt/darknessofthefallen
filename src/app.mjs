import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {settings,transaction,audit} from './db.mjs';
import {can,HttpError,text,choice,classes,combatRoles,characterInput,publicCharacter,attendanceMetrics} from './domain.mjs';
import {currentSession,startOAuth,finishOAuth,cookie,cookies,hash,oauthReady} from './auth.mjs';
import {deliverRecruitment} from './integrations.mjs';
import {operations,publicProgress} from './operations.mjs';
const date=()=>new Date().toISOString();
const files={'/assets/guild-logo.png':['assets/guild-logo.png','image/png'],'/branding.css':['branding.css','text/css'],'/operations.css':['operations.css','text/css'],'/operations-ui.js':['operations-ui.js','text/javascript'],'/character-editor.js':['character-editor.js','text/javascript'],'/style.css':['style.css','text/css'],'/app.js':['app.js','text/javascript']};
const pages=new Set(['/','/nosotros','/progreso','/roster','/reclutamiento','/raids','/contacto','/login','/perfil','/panel']);
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32768)throw new HttpError(413,'El formulario es demasiado grande.');}try{const result=JSON.parse(raw);if(!result||typeof result!=='object'||Array.isArray(result))throw new Error();return result;}catch{throw new HttpError(400,'JSON no válido.');}}
export function createApp(db,env){
  env={APP_ORIGIN:'http://localhost:3000',...env};
  const limits=new Map();
  function throttle(req,route){const key=`${req.socket.remoteAddress}:${route}`,now=Date.now();let item=limits.get(key);if(!item||item.until<now)item={count:0,until:now+60000};if(++item.count>15)throw new HttpError(429,'Demasiados intentos. Espera un minuto.');limits.set(key,item);if(limits.size>10000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);}
  return async(req,res)=>{
    const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Cache-Control':'no-store','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
    if(env.APP_ORIGIN.startsWith('https:'))headers['Strict-Transport-Security']='max-age=31536000';
    const send=(status,data,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data));};
    try{
      const url=new URL(req.url,env.APP_ORIGIN),path=url.pathname,method=req.method;
      const user=currentSession(db,req),s=settings(db);
      const requireUser=()=>{if(!user)throw new HttpError(401,'Entra con Discord para continuar.');};
      const requirePermission=p=>{requireUser();if(!can(user,p))throw new HttpError(403,'Tu rango no permite esta acción.');};
      if(!['GET','HEAD'].includes(method)){
        if(req.headers.origin!==env.APP_ORIGIN)throw new HttpError(403,'Origen de solicitud no permitido.');
        if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'Se requiere JSON.');
        if(user&&req.headers['x-csrf-token']!==user.csrf)throw new HttpError(403,'La sesión del formulario ha caducado.');
        throttle(req,path);
      }
      if(path==='/api/health')return send(200,{ok:true,version:'0.1.0'});
      if(path==='/api/public'&&method==='GET')return send(200,{settings:s,characters:db.prepare('SELECT name,surname,class,role FROM characters WHERE archived_at IS NULL ORDER BY name').all().map(publicCharacter),progress:publicProgress(db),raids:db.prepare('SELECT id,title,starts_at,source FROM raids WHERE starts_at>=? ORDER BY starts_at LIMIT 100').all(date()),authConfigured:oauthReady(env)});
      const sendText=(status,value,type,extra={})=>{res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(value);};
      if(await operations({db,user,s,path,method,url,body:()=>body(req),send,sendText,requireUser,requirePermission}))return;
      if(path==='/api/me'&&method==='GET')return send(200,{user:user?{id:user.id,name:user.display_name,rank:user.rank}:null,csrf:user?.csrf,permissions:Object.keys((await import('./domain.mjs')).permissions).filter(p=>can(user,p))});
      if(path==='/auth/discord'&&method==='GET'){throttle(req,path);const auth=startOAuth(db,env);res.writeHead(302,{...headers,Location:auth.url,'Set-Cookie':cookie('oauth_state',auth.state,env,600)});return res.end();}
      if(path==='/auth/discord/callback'&&method==='GET'){const session=await finishOAuth(db,req,url,env);res.writeHead(302,{...headers,Location:'/perfil','Set-Cookie':[cookie('session',session.raw,env,1800),cookie('oauth_state','',env,0)]});return res.end();}
      if(path==='/api/logout'&&method==='POST'){requireUser();db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(cookies(req).session));return send(200,{ok:true},{'Set-Cookie':cookie('session','',env,0)});}
      if(path==='/api/characters'){
        requireUser();
        if(method==='GET')return send(200,db.prepare('SELECT * FROM characters WHERE user_id=? AND archived_at IS NULL ORDER BY is_main DESC,name').all(user.id));
        if(method==='POST'){
          requirePermission('character.write');const v=characterInput(await body(req)),id=randomUUID();
          transaction(db,()=>{const count=db.prepare('SELECT count(*) AS n FROM characters WHERE user_id=? AND archived_at IS NULL').get(user.id).n;if(count>=30)throw new HttpError(400,'Límite de 30 personajes por usuario.');if(v.isMain||!count)db.prepare('UPDATE characters SET is_main=0 WHERE user_id=?').run(user.id);db.prepare('INSERT INTO characters(id,user_id,name,surname,class,role,spec,professions,availability,notes,is_main,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,v.name,v.surname,v.class,v.role,v.spec,v.professions,v.availability,v.notes,v.isMain||!count?1:0,date());audit(db,user.id,'character.created',id,{name:v.name});});return send(201,{id});
        }
      }
      if(/^\/api\/characters\/[^/]+$/.test(path)&&method==='PATCH'){
        requirePermission('character.write');
        const id=path.split('/')[3];
        const previous=db.prepare('SELECT * FROM characters WHERE id=? AND user_id=? AND archived_at IS NULL').get(id,user.id);
        if(!previous)throw new HttpError(404,'Personaje no encontrado.');
        const input=await body(req);
        const v=characterInput({...previous,...input});
        // Main changes use the dedicated atomic endpoint. Ignore client ownership/source fields.
        transaction(db,()=>{
          db.prepare('UPDATE characters SET name=?,surname=?,class=?,role=?,spec=?,professions=?,availability=?,notes=? WHERE id=? AND user_id=?').run(v.name,v.surname,v.class,v.role,v.spec,v.professions,v.availability,v.notes,id,user.id);
          const before={},after={};
          for(const key of ['name','surname','class','role','spec','professions','availability','notes']){
            if(previous[key]!==v[key]){before[key]=previous[key];after[key]=v[key];}
          }
          audit(db,user.id,'character.updated',id,{before,after});
        });
        return send(200,{id});
      }
      if(/^\/api\/characters\/[^/]+\/main$/.test(path)&&method==='POST'){
        requirePermission('character.write');const id=path.split('/')[3];const c=db.prepare('SELECT * FROM characters WHERE id=? AND user_id=? AND archived_at IS NULL').get(id,user.id);if(!c)throw new HttpError(404,'Personaje no encontrado.');transaction(db,()=>{db.prepare('UPDATE characters SET is_main=0 WHERE user_id=?').run(user.id);db.prepare('UPDATE characters SET is_main=1 WHERE id=?').run(id);audit(db,user.id,'character.main',id,{});});return send(200,{ok:true});
      }
      if(path==='/api/roster'&&method==='GET'){requirePermission('roster.read');return send(200,db.prepare('SELECT c.*,u.display_name,u.rank FROM characters c JOIN users u ON u.id=c.user_id WHERE c.archived_at IS NULL ORDER BY c.is_main DESC,c.name').all());}
      if(path==='/api/applications'&&method==='POST'){
        if(!s.recruitmentOpen)throw new HttpError(409,'El reclutamiento todavía no está abierto.');const v=await body(req);if(v.website)throw new HttpError(400,'Formulario no válido.');
        const a={name:text(v.name,'nombre',80),discord:text(v.discord,'Discord',80),character:text(v.character,'personaje',80),class:choice(v.class,classes,'clase'),role:choice(v.role,combatRoles,'rol'),experience:text(v.experience,'experiencia',2000),availability:text(v.availability,'disponibilidad',1000),reason:text(v.reason,'motivación',2000),additional:text(v.additional??'','información adicional',2000,false)};
        if(v.consent!==true)throw new HttpError(400,'Debes aceptar el tratamiento de tu candidatura.');const id=randomUUID();transaction(db,()=>{db.prepare('INSERT INTO applications(id,data,created_at,updated_at) VALUES(?,?,?,?)').run(id,JSON.stringify(a),date(),date());db.prepare('INSERT INTO outbox(id,application_id) VALUES(?,?)').run(randomUUID(),id);audit(db,user?.id||'candidate','application.created',id,{});});return send(201,{id,message:'Candidatura recibida. Los oficiales la revisarán.'});
      }
      if(path==='/api/applications'&&method==='GET'){requirePermission('recruitment.manage');return send(200,db.prepare('SELECT * FROM applications ORDER BY created_at DESC LIMIT 500').all().map(r=>({...r,data:JSON.parse(r.data)})));}
      if(path.startsWith('/api/applications/')&&method==='PATCH'){requirePermission('recruitment.manage');const id=path.split('/')[3],v=await body(req),status=choice(v.status,['Nuevo','Contactado','Prueba','Aceptado','Rechazado'],'estado'),notes=text(v.notes??'','notas',4000,false);transaction(db,()=>{const prev=db.prepare('SELECT status,notes FROM applications WHERE id=?').get(id);if(!prev)throw new HttpError(404,'Candidatura no encontrada.');db.prepare('UPDATE applications SET status=?,notes=?,updated_at=? WHERE id=?').run(status,notes,date(),id);audit(db,user.id,'application.updated',id,{before:prev,after:{status,notes}});});return send(200,{ok:true});}
      if(path==='/api/settings'&&method==='PUT'){
        requirePermission('settings.manage');const v=await body(req),next={...s};
        for(const k of ['name','description','faction','region','server','about'])if(k in v)next[k]=text(v[k],k,k==='about'?4000:500);
        if('ruleset'in v)next.ruleset=choice(v.ruleset,['Por confirmar','PvP','PvE'],'ruleset');
        for(const k of ['raidStart','raidEnd'])if(k in v){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v[k]))throw new HttpError(400,'Horario no válido.');next[k]=v[k];}
        if('raidDays'in v){if(!Array.isArray(v.raidDays)||v.raidDays.length>7)throw new HttpError(400,'Días no válidos.');next.raidDays=[...new Set(v.raidDays.map(d=>choice(d,['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'],'día')))];}
        if('discordUrl'in v){if(v.discordUrl&&!/^https:\/\/(discord\.gg\/|discord\.com\/invite\/)[\w-]+$/.test(v.discordUrl))throw new HttpError(400,'Invitación Discord no válida.');next.discordUrl=v.discordUrl;}
        if('recruitmentOpen'in v){if(typeof v.recruitmentOpen!=='boolean')throw new HttpError(400,'Estado no válido.');next.recruitmentOpen=v.recruitmentOpen;}
        if('rosterTargets'in v){next.rosterTargets={};for(const k of ['tanks','healers','dps']){const n=v.rosterTargets[k];if(!Number.isInteger(n)||n<0||n>100)throw new HttpError(400,'Objetivo no válido.');next.rosterTargets[k]=n;}}
        if('lootMethod'in v)next.lootMethod=choice(v.lootMethod,['Loot Council','Roll','Soft Reserve','DKP','Híbrido'],'loot');
        transaction(db,()=>{db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(next));audit(db,user.id,'settings.updated','guild',{before:s,after:next});});return send(200,next);
      }
      if(path==='/api/audit'&&method==='GET'){requirePermission('audit.read');return send(200,db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all());}
      if(path==='/api/export'&&method==='GET'){requirePermission('backup.export');const data={schemaVersion:1,exportedAt:date(),settings:s};for(const table of ['users','characters','applications','raids','attendance','loot','wishlists','progress','council_members','audit'])data[table]=db.prepare(`SELECT * FROM ${table}`).all();audit(db,user.id,'data.exported','guild',{});return send(200,data,{'Content-Disposition':'attachment; filename="darkness-export.json"'});}
      if(path==='/api/notifications/retry'&&method==='POST'){requirePermission('recruitment.manage');await deliverRecruitment(db,env);return send(200,{ok:true});}
      if(path.startsWith('/api/'))throw new HttpError(404,'Endpoint no encontrado.');
      if(!['GET','HEAD'].includes(method))throw new HttpError(405,'Método no permitido.');
      if(path==='/panel'){requireUser();if(!can(user,'roster.read'))throw new HttpError(403,'Tu rango no permite entrar al panel.');}
      if(path==='/perfil')requireUser();
      if(files[path]||pages.has(path)){const [file,type]=files[path]||['index.html','text/html'];res.writeHead(200,{...headers,'Content-Type':`${type}; charset=utf-8`});return res.end(method==='HEAD'?'':readFileSync(new URL(`../public/${file}`,import.meta.url)));}
      throw new HttpError(404,'Página no encontrada.');
    }catch(e){send(e.status||500,{error:e.status?e.message:'No se pudo completar la operación. Inténtalo de nuevo.'});}
  };
}
