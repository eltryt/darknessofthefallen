import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {issueSession} from '../src/auth.mjs';
import {madridInstant} from '../src/raid-time.mjs';
import {raidHelper} from '../src/raid-helper.mjs';
import {ingestRaidEvent,syncRaidEvents} from '../src/raid-sync.mjs';

const env={APP_ORIGIN:'http://localhost:3010',DISCORD_GUILD_ID:'1550000000000000001',RAID_HELPER_CHANNEL_ID:'1550997172982382723',RAID_HELPER_API_KEY:'test-only'};
const ids={member:'1550000000000000011',leader:'1550000000000000012',raid_leader:'1550000000000000013',officer:'1550000000000000014',other:'1550000000000000015',visitor:'1550000000000000016'};
const base=()=>({id:'1550000000000000099',serverId:env.DISCORD_GUILD_ID,channelId:env.RAID_HELPER_CHANNEL_ID,leaderId:ids.raid_leader,leaderName:'Responsable de prueba',title:'Convocatoria de prueba',startTime:1893481200,endTime:1893488400,lastUpdated:1,advancedSettings:{limit:20,allowed_roles:'none',banned_roles:'none'},classes:[{name:'Mage',type:'primary',specs:[{name:'Frost',roleName:'Ranged'}]},{name:'Bench',type:'default',specs:[]},{name:'Absence',type:'default',specs:[]},{name:'Tentative',type:'default',specs:[]}],roles:[{name:'Ranged',limit:20}],signUps:[]});
async function fixture(){
 const db=openDatabase(':memory:'),sessions={};
 for(const [rank,id]of Object.entries(ids)){db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,'QA '+rank,rank==='other'?'raid_leader':rank,new Date().toISOString());sessions[rank]=issueSession(db,id);}
 for(const [id,name]of [['char1','Main'],['char2','Alter']])db.prepare("INSERT INTO characters(id,user_id,name,class,role,spec,created_at) VALUES(?,?,?,'Mago','DPS distancia','Escarcha',?)").run(id,ids.member,name,new Date().toISOString());
 const server=createServer(createApp(db,env));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const request=async(path,rank,method='GET',body,headers={})=>{const s=sessions[rank],r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',...(s?{Cookie:'session='+s.raw,'X-CSRF-Token':s.csrf}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 return {db,request,close:async()=>{await new Promise(r=>server.close(r));db.close();}};
}
function fakeProvider(){
 const events=new Map(),calls=[];let failure=null,afterCreate=false;
 const send=(v,status=200,headers={})=>Response.json(v,{status,headers});
 const transport=async(url,options)=>{
  calls.push({url,method:options.method});assert.equal(options.headers.Authorization,'test-only');assert.equal(new URL(url).hostname,'raid-helper.xyz');
  if(failure){const f=failure;failure=null;if(f==='network')throw new Error('network');return send({retry_after:10},f);}
  const path=new URL(url).pathname,v=options.body?JSON.parse(options.body):{};
  if(path.endsWith('/channels/'+env.RAID_HELPER_CHANNEL_ID+'/event')){
   const event={...base(),id:String(1550000000000000100n+BigInt(events.size)),title:v.title,description:v.description,leaderId:v.leaderId,startTime:Number(v.date),endTime:Number(v.date)+v.advancedSettings.duration*60,advancedSettings:v.advancedSettings};events.set(event.id,event);
   if(afterCreate){afterCreate=false;throw new Error('lost response');}return send({status:'success',event});
  }
  if(path.includes('/servers/'))return send({pages:1,currentPage:1,postedEvents:[...events.values()]});
  const match=path.match(/\/events\/(\d+)(?:\/signups(?:\/(\d+))?)?$/),event=events.get(match?.[1]);if(!event)return send({},404);
  if(path.includes('/signups')){
   if(options.method==='POST')event.signUps.push({...v,id:1,status:'primary',roleName:'Ranged'});
   if(options.method==='PATCH'){const old=event.signUps.find(s=>String(s.id)===match[2]);Object.assign(old,v);}
   if(options.method==='DELETE')event.signUps=event.signUps.filter(s=>String(s.id)!==match[2]);
   event.lastUpdated++;return send({status:'success',event});
  }
  if(options.method==='PATCH'){Object.assign(event,v);event.lastUpdated++;}
  if(options.method==='DELETE'){events.delete(event.id);return send({status:'success'});}
  return send(event);
 };
 return {transport,events,calls,fail:value=>{failure=value;},loseCreate:()=>{afterCreate=true;}};
}
const createInput=()=>({title:'Hyjal Summit',start:'2030-01-02T23:00',end:'2030-01-03T01:00',capacity:20,category:'Oficial',roster:'Grupo 1',requestId:randomUUID()});
const signupInput=()=>({characterId:'char1',className:'Mage',specName:'Frost',requestId:randomUUID()});

test('Madrid dates handle summer, winter, midnight and reject missing/repeated DST hours',()=>{
 assert.equal(madridInstant('2030-01-02T23:00'),'2030-01-02T22:00:00.000Z');
 assert.equal(madridInstant('2026-07-02T23:00'),'2026-07-02T21:00:00.000Z');
 assert.throws(()=>madridInstant('2026-03-29T02:30'));assert.throws(()=>madridInstant('2026-10-25T02:30'));assert.throws(()=>madridInstant('2026-02-30T23:00'));
});
test('Discord events import once, with private projections and no invented character links',async()=>{
 const f=await fixture();try{
  const p=fakeProvider(),raw=base();raw.signUps=[{id:1,userId:ids.member,name:'Private player',className:'Mage',specName:'Frost',roleName:'Ranged',status:'primary'}];p.events.set(raw.id,raw);
  await syncRaidEvents(f.db,env,p.transport,{force:true});await syncRaidEvents(f.db,env,p.transport,{force:true});
  assert.equal(f.db.prepare('SELECT count(*) n FROM raid_events').get().n,1);
  assert.equal((await f.request('/api/events')).body.events.length,0);
  const row=(await f.request('/api/events','member')).body.events[0];assert.equal(row.occupied,1);assert.equal(row.signups[0].registeredCharacter,false);
  const meta={category:'Oficial',roster:'Grupo 1',public:true,revision:row.revision};
  assert.equal((await f.request('/api/events/'+row.id+'/metadata','other','PATCH',meta)).status,403);
  assert.equal((await f.request('/api/events/'+row.id+'/metadata','leader','PATCH',meta)).status,200);
  const publicEvent=(await f.request('/api/events')).body.events[0];assert.equal(publicEvent.signups,undefined);assert.equal(publicEvent.discordUrl,undefined);assert.ok(!JSON.stringify(publicEvent).includes(ids.member));
  assert.ok(!JSON.stringify((await f.request('/api/public')).body).includes('Private player'));
  assert.equal((await f.request('/api/raids/'+row.id,'leader','DELETE',{})).status,409);
  p.events.delete(raw.id);await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal((await f.request('/api/events','leader')).body.events[0].state,'Cancelada');
 }finally{await f.close();}
});
test('web creation queues one event, protects rank and CSRF, and reconciles lost POST response without duplicates',async()=>{
 const f=await fixture();try{
  const p=fakeProvider(),v=createInput();
  for(const rank of [undefined,'visitor','member'])assert.equal((await f.request('/api/events',rank,'POST',v)).status,rank?403:401);
  assert.equal((await f.request('/api/events','leader','POST',v,{'X-CSRF-Token':'wrong'})).status,403);
  const r=await f.request('/api/events','raid_leader','POST',v);assert.equal(r.status,202);assert.equal((await f.request('/api/events','raid_leader','POST',v)).body.id,r.body.id);
  p.loseCreate();await syncRaidEvents(f.db,env,p.transport,{force:true});await syncRaidEvents(f.db,env,p.transport,{force:true});
  assert.equal(p.events.size,1);assert.equal(p.calls.filter(c=>c.method==='POST').length,1);
  assert.equal(f.db.prepare('SELECT status FROM raid_jobs WHERE id=?').get(v.requestId).status,'done');
  assert.equal((await f.request('/api/events','member')).body.events[0].state,'Abierta');
 }finally{await f.close();}
});
test('signup, character changes, cancellation and event edits sync; ownership and concurrent changes are enforced',async()=>{
 const f=await fixture();try{
  const p=fakeProvider(),raw=base();p.events.set(raw.id,raw);const e=ingestRaidEvent(f.db,raw,env),path='/api/events/'+e.id;
  assert.equal((await f.request(path+'/signup','member','POST',{...signupInput(),userId:ids.leader})).status,403);
  assert.equal((await f.request(path+'/signup','member','POST',{...signupInput(),characterId:'absent'})).status,400);
  assert.equal((await f.request(path+'/signup','member','POST',signupInput())).status,202);await syncRaidEvents(f.db,env,p.transport,{force:true});
  let event=(await f.request(path,'member')).body;assert.equal(event.mine[0].characterId,'char1');assert.equal(event.occupied,1);
  await f.request(path+'/signup','member','POST',{...signupInput(),characterId:'char2'});await syncRaidEvents(f.db,env,p.transport,{force:true});event=(await f.request(path,'member')).body;assert.equal(event.mine[0].characterId,'char2');assert.equal(event.signups.length,1);
  raw.signUps[0].name='Changed in Discord';raw.lastUpdated++;await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal((await f.request(path,'member')).body.mine[0].registeredCharacter,false);
  await f.request(path+'/signup','member','POST',{cancel:true,requestId:randomUUID()});await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal((await f.request(path,'member')).body.signups.length,0);
  event=(await f.request(path,'leader')).body;
  const edit={title:'New hour',start:'2030-01-03T23:00',end:'2030-01-04T01:00',capacity:40,revision:event.revision,requestId:randomUUID()};
  assert.equal((await f.request(path,'other','PATCH',edit)).status,403);
  assert.equal((await f.request(path,'raid_leader','PATCH',edit)).status,202);await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal((await f.request(path,'member')).body.capacity,40);
  event=(await f.request(path,'leader')).body;await f.request(path,'leader','PATCH',{...edit,revision:event.revision,requestId:randomUUID()});raw.lastUpdated++;await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal(f.db.prepare("SELECT status FROM raid_jobs ORDER BY created_at DESC LIMIT 1").get().status,'blocked');
  event=(await f.request(path,'leader')).body;assert.equal((await f.request(path+'/cancel','leader','POST',{revision:event.revision,requestId:randomUUID()})).status,202);await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal((await f.request(path,'member')).body.state,'Cancelada');
 }finally{await f.close();}
});
test('temporary API failures preserve data; rate limits defer retries, no inferred cancellations',async()=>{
 const f=await fixture();try{
  const p=fakeProvider();p.events.set(base().id,base());await syncRaidEvents(f.db,env,p.transport,{force:true});p.fail(503);await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal(f.db.prepare('SELECT state FROM raid_events').get().state,'Abierta');
  await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal(f.db.prepare('SELECT error FROM raid_sync').get().error,'');
  const v=createInput();await f.request('/api/events','leader','POST',v);p.fail(429);await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal(f.db.prepare('SELECT status FROM raid_jobs WHERE id=?').get(v.requestId).status,'pending');
  f.db.prepare('UPDATE raid_jobs SET next_at=0 WHERE id=?').run(v.requestId);await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal(f.db.prepare('SELECT status FROM raid_jobs WHERE id=?').get(v.requestId).status,'done');
 }finally{await f.close();}
});
test('template states and restrictions stay authoritative; remote owner changes revoke queued rights',async()=>{
 const f=await fixture();try{
  const raw=base();raw.signUps=[{id:1,userId:ids.member,className:'Bench',status:'primary'},{id:2,userId:ids.other,className:'Absence',status:'primary'},{id:3,userId:ids.leader,className:'Tentative',status:'primary'}];const p=fakeProvider();p.events.set(raw.id,raw);const row=ingestRaidEvent(f.db,raw,env),path='/api/events/'+row.id;
  let event=(await f.request(path,'leader')).body;assert.deepEqual(event.signups.map(s=>s.status),['Suplente','Ausente','Pendiente de confirmación']);assert.equal(event.occupied,0);
  await f.request(path+'/cancel','raid_leader','POST',{revision:event.revision,requestId:randomUUID()});raw.leaderId=ids.other;await syncRaidEvents(f.db,env,p.transport,{force:true});assert.equal(p.events.size,1);assert.equal(f.db.prepare('SELECT status FROM raid_jobs').get().status,'blocked');
  raw.advancedSettings.allowed_roles='Secret Team';ingestRaidEvent(f.db,raw,env);assert.equal((await f.request(path,'member')).status,403);
 }finally{await f.close();}
});
test('official list pagination is followed and partial responses fail safely',async()=>{
 const calls=[];const provider=raidHelper(env,async(url,options)=>{calls.push(options.headers.Page);return Response.json({pages:2,postedEvents:[{id:options.headers.Page}]});});assert.equal((await provider.list()).length,2);assert.deepEqual(calls,['1','2']);
 await assert.rejects(()=>raidHelper(env,async()=>Response.json({postedEvents:[]})).list());
});


test('WoW Forever role-group template accepts matching roles and rejects mismatched characters',async()=>{
 const f=await fixture();try{
  const raw=base();raw.classes=[{name:'Ranged',type:'primary',specs:[{name:'Frost',roleName:'Ranged'}]},{name:'Healer',type:'primary',specs:[{name:'Holy',roleName:'Healer'}]}];const row=ingestRaidEvent(f.db,raw,env);
  assert.equal((await f.request('/api/events/'+row.id+'/signup','member','POST',{...signupInput(),className:'Healer',specName:'Holy'})).status,400);
  assert.equal((await f.request('/api/events/'+row.id+'/signup','member','POST',{...signupInput(),className:'Ranged'})).status,202);
 }finally{await f.close();}
});
