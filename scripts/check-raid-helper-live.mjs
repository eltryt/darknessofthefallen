// Explicit manual acceptance test only. Creates one labelled temporary event and
// removes only that event. Uses the production HTTP handlers + sync adapter with
// a disposable local database, never a production login/session or database.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {issueSession} from '../src/auth.mjs';
import {syncRaidEvents} from '../src/raid-sync.mjs';
import {raidHelper,raidHelperReady} from '../src/raid-helper.mjs';
const env={...process.env,APP_ORIGIN:'http://localhost:3010',RAID_HELPER_CHANNEL_ID:'1550997172982382723',RAID_HELPER_TEMPLATE_ID:'wowforever'};
assert.ok(raidHelperReady(env)&&/^\d{17,20}$/.test(env.DISCORD_LEADER_ID||''),'Missing test configuration.');
const db=openDatabase(':memory:'),api=raidHelper(env),actor=env.DISCORD_LEADER_ID;
db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(actor,'Prueba técnica autorizada','leader',new Date().toISOString());
for(const [id,name] of [['qa-main','PRUEBA-Main'],['qa-alt','PRUEBA-Alter']])db.prepare("INSERT INTO characters(id,user_id,name,class,role,spec,created_at) VALUES(?,?,?,'Mago','DPS distancia','Prueba técnica',?)").run(id,actor,name,new Date().toISOString());
const session=issueSession(db,actor),server=createServer(createApp(db,env));await new Promise(r=>server.listen(0,'127.0.0.1',r));
const request=async(path,method='GET',value)=>{
 const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',Cookie:'session='+session.raw,'X-CSRF-Token':session.csrf},...(value?{body:JSON.stringify(value)}:{})});
 assert.ok(r.ok,`Local HTTP handler ${method} failed (${r.status}).`);return r.json();
};
let localId,externalId,marker;let failed=false;
const diagnosticFetch=async(url,options)=>{const response=await fetch(url,options);if(!response.ok){try{const data=await response.clone().json();const reason=data.reason||data.message||data.error;if(typeof reason==='string')console.error('Provider diagnostic: '+reason.replaceAll(env.RAID_HELPER_API_KEY,'[redacted]').replace(/\b\d{17,20}\b/g,'[id]').slice(0,250));}catch{}}return response;};
const tick=async()=>{
 await syncRaidEvents(db,env,diagnosticFetch);
 const job=db.prepare('SELECT status FROM raid_jobs WHERE event_id=? ORDER BY created_at DESC LIMIT 1').get(localId);
 assert.equal(job?.status,'done','Remote write did not confirm; inspect configuration and pending state before retrying.');
};
try{
 const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10),end=new Date(Date.parse(day)+86400000).toISOString().slice(0,10),key=randomUUID();
 const created=await request('/api/events','POST',{title:'[PRUEBA TÉCNICA] Darkness — se retirará al terminar',start:day+'T23:00',end:end+'T01:00',capacity:20,category:'Voluntaria',roster:'Prueba técnica temporal',requestId:key});
 localId=created.id;marker=`[DOTF:${localId}]`;
 await tick();externalId=db.prepare('SELECT external_id FROM raid_events WHERE id=?').get(localId).external_id;
 assert.ok(externalId);console.log('PASS: production web handler queued and published one real Raid-Helper message.');
 await request('/api/events','POST',{title:'[PRUEBA TÉCNICA] Darkness — se retirará al terminar',start:day+'T23:00',end:end+'T01:00',capacity:20,category:'Voluntaria',roster:'Prueba técnica temporal',requestId:key});
 assert.equal((await api.list()).filter(e=>(e.description||'').includes(marker)).length,1);console.log('PASS: repeating the creation request did not duplicate the message.');
 let event=await request('/api/events/'+localId);
 await request('/api/events/'+localId,'PATCH',{title:'[PRUEBA TÉCNICA] Darkness — horario modificado',start:day+'T22:00',end:day+'T23:59',capacity:10,revision:event.revision,requestId:randomUUID()});await tick();
 event=await request('/api/events/'+localId);assert.equal(event.capacity,10);console.log('PASS: real event schedule and capacity changed.');
 const cls=event.classes.find(c=>['mage','mago'].includes(c.name.toLowerCase()));assert.ok(cls,'WoW template must offer Mage to test a registered Mage character.');
 const spec=cls.specs[0]?.name;
 await request('/api/events/'+localId+'/signup','POST',{characterId:'qa-main',className:cls.name,specName:spec,requestId:randomUUID()});await tick();
 event=await request('/api/events/'+localId);assert.equal(event.mine[0]?.characterId,'qa-main');console.log('PASS: real signup linked to an explicitly registered disposable test character.');
 await request('/api/events/'+localId+'/signup','POST',{characterId:'qa-alt',className:cls.name,specName:spec,requestId:randomUUID()});await tick();
 event=await request('/api/events/'+localId);assert.equal(event.mine[0]?.characterId,'qa-alt');assert.equal(event.mine.length,1);console.log('PASS: character selection updated without duplicating the signup.');
 const bench=event.classes.find(c=>c.type==='default'&&['bench','reserve','suplente','reserva'].includes(c.name.toLowerCase()));
 if(bench){await request('/api/events/'+localId+'/signup','POST',{characterId:'qa-alt',className:bench.name,specName:bench.specs[0]?.name,requestId:randomUUID()});await tick();event=await request('/api/events/'+localId);assert.equal(event.mine[0]?.status,'Suplente');console.log('PASS: real substitute option reflected on the web.');}else console.log('NOT TESTED: the selected template has no supported substitute option.');
 await request('/api/events/'+localId+'/signup','POST',{cancel:true,requestId:randomUUID()});await tick();
 event=await request('/api/events/'+localId);assert.equal(event.mine.length,0);assert.ok(event.cancelledSignups.length);console.log('PASS: signup removed remotely; cancellation history retained locally.');
 await request('/api/events/'+localId+'/cancel','POST',{revision:event.revision,requestId:randomUUID()});await tick();
 assert.equal((await request('/api/events/'+localId)).state,'Cancelada');console.log('PASS: real event cancelled; no test message remains.');
}catch(e){failed=true;console.error(`Live acceptance failed (${e.status||'check'}). No secrets or provider payloads logged.`);
 if(localId){const job=db.prepare('SELECT kind,status,error FROM raid_jobs WHERE event_id=? ORDER BY created_at DESC LIMIT 1').get(localId);console.error(JSON.stringify(job));}}
finally{
 try{
  if(!externalId&&localId)externalId=db.prepare('SELECT external_id FROM raid_events WHERE id=?').get(localId)?.external_id;
  if(!externalId&&marker){const matches=(await api.list()).filter(e=>(e.description||'').includes(marker));if(matches.length===1)externalId=matches[0].id;}
  if(externalId){try{await api.remove(externalId);}catch(e){if(e.status!==404)throw e;}console.log('Temporary test event cleanup verified.');}
 }catch{failed=true;console.error('Cleanup could not be confirmed. Review the labelled [PRUEBA TÉCNICA] message in the configured channel.');}
 await new Promise(r=>server.close(r));db.close();
}
if(failed)process.exitCode=1;
