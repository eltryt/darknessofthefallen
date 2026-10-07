// Isolated, disposable visual QA. Never imported by src/server.mjs or production.
import {createServer} from 'node:http';
import {openDatabase,defaults} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {issueSession,cookie} from '../src/auth.mjs';
if(process.env.NODE_ENV==='production')throw new Error('QA fixtures cannot run in production.');
const db=openDatabase(':memory:'),env={APP_ORIGIN:'http://localhost:3001'};
const stamp=new Date().toISOString();
db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify({...defaults,name:'QA · Darkness of the Fallen',description:'ENTORNO DE PRUEBAS · Datos sintéticos desechables. No representa el roster real.',recruitmentOpen:true}));
for(const [id,name,rank] of [['qa-leader','Líder de prueba','leader'],['qa-member','Miembro de prueba','member'],['qa-raider','Raider de prueba','raider']])db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,name,rank,stamp);
for(const [id,user,name,role] of [['qa-tank','qa-leader','Tanque de prueba','Tanque'],['qa-healer','qa-member','Sanador de prueba','Sanador'],['qa-dps','qa-raider','Mago de prueba','DPS distancia']])db.prepare('INSERT INTO characters(id,user_id,name,class,role,is_main,created_at) VALUES(?,?,?,?,?,1,?)').run(id,user,name,'Mago',role,stamp);
db.prepare('INSERT INTO raids(id,title,starts_at) VALUES(?,?,?)').run('qa-raid','QA · Convocatoria de prueba','2026-10-09T21:00:00Z');
const app=createApp(db,env);
const server=createServer((req,res)=>{
  if(req.url==='/__qa__/leader'||req.url==='/__qa__/member'){
    const id=req.url.endsWith('leader')?'qa-leader':'qa-member',session=issueSession(db,id);
    res.writeHead(302,{Location:id==='qa-leader'?'/panel':'/perfil','Set-Cookie':cookie('session',session.raw,env,1800)});return res.end();
  }
  return app(req,res);
});
server.listen(3001,'127.0.0.1',()=>console.log('Disposable QA only: http://localhost:3001/__qa__/leader · http://localhost:3001/__qa__/member'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
