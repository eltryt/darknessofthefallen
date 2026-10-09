import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {createApp} from '../src/app.mjs';
import {issueSession,startOAuth,finishOAuth} from '../src/auth.mjs';
import {ranks} from '../src/domain.mjs';
import {csv} from '../src/operations.mjs';

async function fixture(){
  const db=openDatabase(':memory:'),sessions={};
  for(const rank of ranks){db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(rank,`Nombre ${rank}`,rank,new Date().toISOString());sessions[rank]=issueSession(db,rank);}
  const server=createServer(createApp(db,{APP_ORIGIN:'http://localhost:3000'}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request=async(path,rank,method='GET',value)=>{const session=sessions[rank],r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Origin:'http://localhost:3000','Content-Type':'application/json',...(session?{Cookie:`session=${session.raw}`,'X-CSRF-Token':session.csrf}:{})},...(value===undefined?{}:{body:JSON.stringify(value)})});return {status:r.status,body:r.headers.get('content-type')?.includes('application/json')?await r.json():await r.text(),headers:r.headers};};
  const character=async(rank,name='Personaje')=>{const r=await request('/api/characters',rank,'POST',{name,class:'Mago',role:'DPS distancia'});assert.equal(r.status,201);return r.body.id;};
  const raid=async()=>{const r=await request('/api/raids','raid_leader','POST',{title:'Raid de prueba',starts_at:'2026-10-01T23:00:00+02:00'});assert.equal(r.status,201);return r.body.id;};
  return {db,request,character,raid,close:async()=>{await new Promise(resolve=>server.close(resolve));db.close();}};
}

test('operations enforce all six ranks and deny anonymous access',async()=>{
  const f=await fixture();try{
    for(const rank of ranks){
      for(const [path,minimum] of [['/api/raids',1],['/api/loot',1],['/api/council',1],['/api/wishlists',1],['/api/wishlists?all=true',3],['/api/progress',3],['/api/members',3],['/api/export/csv?dataset=characters',5]]){
        assert.equal((await f.request(path,rank)).status,ranks.indexOf(rank)>=minimum?200:403,rank+' '+path);
      }
      assert.equal((await f.request('/api/raids',rank,'POST',{title:'Raid',starts_at:'2026-10-01T21:00:00Z'})).status,ranks.indexOf(rank)>=3?201:403);
      assert.equal((await f.request('/api/council',rank,'PUT',{userIds:['member']})).status,rank==='leader'?200:403);
    }
    for(const path of ['/api/loot','/api/council','/api/progress','/api/wishlists','/api/raids'])assert.equal((await f.request(path)).status,401);
  }finally{await f.close();}
});

test('attendance is atomic, owner-filtered, and audited on corrections',async()=>{
  const f=await fixture();try{
    const raid=await f.raid(),a=await f.character('member','Main'),alt=await f.character('member','Alter'),b=await f.character('raider','Otro');
    const route='/api/raids/'+raid+'/attendance';
    assert.equal((await f.request(route,'member','PUT',{entries:[{characterId:a,status:'Asistió'}]})).status,403);
    assert.equal((await f.request(route,'raid_leader','PUT',{entries:[{characterId:a,status:'Asistió'},{characterId:alt,status:'Reserva'}]})).status,400);
    assert.equal(f.db.prepare('SELECT count(*) n FROM attendance').get().n,0);
    assert.equal((await f.request(route,'raid_leader','PUT',{entries:[{characterId:a,status:'Asistió'},{characterId:b,status:'Ausente'}]})).status,200);
    assert.equal((await f.request(route,'officer','PUT',{entries:[{characterId:alt,status:'Llegó tarde'}]})).status,200);
    const mine=(await f.request('/api/attendance','member')).body;assert.equal(mine.rows.length,1);assert.equal(mine.rows[0].character_id,alt);assert.equal(mine.metrics.late,1);
    assert.equal((await f.request('/api/attendance?userId=raider','member')).status,403);
    assert.equal((await f.request('/api/attendance?userId=me','raid_leader')).body.rows.length,0);
    assert.equal((await f.request('/api/attendance?status=Ausente','raid_leader')).body.rows.length,1);
    assert.equal((await f.request('/api/attendance?from=2026-10-02T00:00:00Z','raid_leader')).body.rows.length,0);
    assert.equal((await f.request('/api/attendance?from=invalid','member')).status,400);
    assert.equal((await f.request('/api/raids/'+raid,'raid_leader','DELETE',{})).status,409);
    assert.equal((await f.request(route,'raid_leader','PUT',{entries:[{characterId:a,status:'Incorrecto'}]})).status,400);
    assert.equal(f.db.prepare("SELECT count(*) n FROM audit WHERE action='attendance.updated'").get().n,3);
  }finally{await f.close();}
});

test('wishlist ownership and private notes cannot be bypassed with IDs or query flags',async()=>{
  const f=await fixture();try{
    const a=await f.character('member'),b=await f.character('raider');
    const data={characterId:a,item:'Bastón',priority:1,notes:'nota privada'};
    assert.equal((await f.request('/api/wishlists','raider','POST',data)).status,403);
    assert.equal((await f.request('/api/wishlists','member','POST',{...data,priority:0})).status,400);
    const created=await f.request('/api/wishlists','member','POST',data);assert.equal(created.status,201);
    assert.equal((await f.request('/api/wishlists','raider')).body.length,0);
    assert.equal((await f.request('/api/wishlists?all=true','member')).status,403);
    assert.equal((await f.request('/api/wishlists?all=true','officer')).body.length,1);
    assert.equal((await f.request('/api/wishlists/'+created.body.id,'raider','DELETE',{})).status,404);
    assert.equal((await f.request('/api/wishlists/'+created.body.id,'member','DELETE',{})).status,200);
  }finally{await f.close();}
});

test('loot decisions validate participants, keep council snapshots and hide internal notes',async()=>{
  const f=await fixture();try{
    const raid=await f.raid(),a=await f.character('member','Ganador'),b=await f.character('raider','Candidato');
    const data={raidId:raid,item:'Espada',boss:'Encuentro',recipientCharacterId:a,candidateIds:[a,b],date:'2026-10-01T23:00:00Z',reason:'Decisión acordada',notes:'NOTA_SECRETA',method:'Loot Council',councilIds:['leader']};
    assert.equal((await f.request('/api/loot','member','POST',data)).status,403);
    assert.equal((await f.request('/api/loot','raid_leader','POST',data)).status,404);
    await f.request('/api/council','leader','PUT',{userIds:['leader','officer']});
    assert.equal((await f.request('/api/loot','raid_leader','POST',{...data,candidateIds:[b]})).status,400);
    const created=await f.request('/api/loot','raid_leader','POST',data);assert.equal(created.status,201);
    await f.request('/api/council','leader','PUT',{userIds:['officer']});
    const member=(await f.request('/api/loot','member')).body[0];assert.equal(member.data.council[0].name,'Nombre leader');assert.equal(member.data.notes,undefined);assert.equal(member.data.recipientUserId,undefined);assert.equal(member.data.council[0].id,undefined);
    assert.ok(!JSON.stringify((await f.request('/api/public')).body).includes('NOTA_SECRETA'));
    assert.equal((await f.request('/api/loot/'+created.body.id+'/void','officer','POST',{reason:'Corrección de registro'})).status,200);
    assert.equal((await f.request('/api/loot','member')).body[0].data.status,'Anulado');
    assert.ok(f.db.prepare("SELECT id FROM audit WHERE action='loot.voided'").get());
  }finally{await f.close();}
});

test('progress publishes only the allowed fields and rejects fabricated future first kills',async()=>{
  const f=await fixture();try{
    assert.equal((await f.request('/api/progress','member','POST',{})).status,403);
    const created=await f.request('/api/progress','raid_leader','POST',{name:'Banda de prueba',difficulty:'Normal',bosses:['Primer encuentro','Último encuentro']});assert.equal(created.status,201);
    const p=(await f.request('/api/progress','officer')).body[0],route=`/api/progress/${p.id}/bosses/${p.data.bosses[0].id}`;
    assert.equal((await f.request(route,'raid_leader','PATCH',{status:'Derrotado',firstKill:'2099-01-01T00:00:00Z'})).status,400);
    assert.equal((await f.request(route,'raid_leader','PATCH',{status:'Derrotado',firstKill:'2026-10-01T23:00:00Z',note:'INTERNAL_NOTE'})).status,200);
    const pub=(await f.request('/api/public')).body.progress[0];assert.equal(pub.percentage,50);assert.equal(pub.defeated,1);assert.equal(pub.history[0].note,undefined);assert.equal(pub.history[0].actorId,undefined);assert.ok(!JSON.stringify(pub).includes('INTERNAL_NOTE'));
  }finally{await f.close();}
});

test('archiving a Main preserves raid history and promotes an active Alter atomically',async()=>{
  const f=await fixture();try{
    const raid=await f.raid(),a=await f.character('member','Main'),b=await f.character('member','Alter');
    await f.request('/api/raids/'+raid+'/attendance','raid_leader','PUT',{entries:[{characterId:a,status:'Asistió'}]});
    assert.equal((await f.request('/api/characters/'+a,'raider','DELETE',{})).status,404);
    assert.equal((await f.request('/api/characters/'+a,'member','DELETE',{})).status,200);
    const active=(await f.request('/api/characters','member')).body;assert.equal(active.length,1);assert.equal(active[0].id,b);assert.equal(active[0].is_main,1);
    assert.equal((await f.request('/api/attendance','member')).body.rows[0].character_name,'Main');
    assert.equal((await f.request('/api/public')).body.characters.length,1);
    assert.equal((await f.request('/api/characters/'+a+'/main','member','POST',{})).status,404);
    assert.equal((await f.request('/api/characters/'+a,'member','PATCH',{name:'Resurrección'})).status,404);
    assert.equal((await f.request('/api/characters/'+b,'member','DELETE',{})).status,200);
    const c=await f.character('member','Nuevo');assert.equal((await f.request('/api/characters','member')).body[0].is_main,1);
  }finally{await f.close();}
});

test('CSV exports are leader-only and neutralize spreadsheet formula injection',async()=>{
  const f=await fixture();try{
    await f.character('member','=HYPERLINK("https://example.com")');
    assert.equal((await f.request('/api/export/csv?dataset=characters','officer')).status,403);
    const result=await f.request('/api/export/csv?dataset=characters','leader');assert.equal(result.status,200);assert.match(result.body,/'=HYPERLINK/);assert.match(result.headers.get('content-type'),/text\/csv/);
    assert.equal((await f.request('/api/export/csv?dataset=sessions','leader')).status,400);
    assert.match(csv([{a:'\t=SUM(1)',b:'a,b',c:'"quoted"'}]),/'\t=SUM/);
  }finally{await f.close();}
});

test('migration runs once and preserves existing records on reopening',()=>{
  const dir=mkdtempSync(join(tmpdir(),'darkness-migration-')),file=join(dir,'test.sqlite');let db;
  try{db=openDatabase(file);db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('id','Miembro','member','2026-10-07');db.close();db=openDatabase(file);assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,4);assert.equal(db.prepare('SELECT display_name FROM users WHERE id=?').get('id').display_name,'Miembro');}finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});

test('Discord OAuth success maps guild roles and prevents replay without leaking access tokens',async()=>{
  const db=openDatabase(':memory:'),env={APP_ORIGIN:'http://localhost:3000',DISCORD_CLIENT_ID:'client',DISCORD_CLIENT_SECRET:'secret',DISCORD_GUILD_ID:'guild',DISCORD_ROLE_MAP:'{"role":"officer"}'};
  try{const auth=startOAuth(db,env),req={headers:{cookie:'oauth_state='+auth.state}},url=new URL(`http://localhost/auth/discord/callback?state=${auth.state}&code=code`);let calls=0;
    const fetcher=async path=>{calls++;return {ok:true,json:async()=>path.endsWith('/token')?{access_token:'PRIVATE_ACCESS_TOKEN'}:path.endsWith('/member')?{roles:['role']}:{id:'discord-user',username:'Miembro'}};};
    const session=await finishOAuth(db,req,url,env,fetcher);assert.ok(session.raw);assert.equal(db.prepare('SELECT rank FROM users').get().rank,'officer');assert.equal(calls,3);
    await assert.rejects(()=>finishOAuth(db,req,url,env,fetcher),e=>e.status===400);assert.equal(calls,3);assert.ok(!JSON.stringify(db.prepare('SELECT * FROM sessions').all()).includes('PRIVATE_ACCESS_TOKEN'));
  }finally{db.close();}
});
