import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/public-address.mjs';
test('public gateway preserves origin, body and session cookies through service binding',async()=>{
 const request=new Request('https://public.example/api/settings',{method:'PUT',headers:{Origin:'https://public.example',Cookie:'session=test','Content-Type':'application/json'},body:'{"name":"Guild"}'});
 const result=await worker.fetch(request,{BACKEND:{async fetch(received){assert.equal(received.url,request.url);assert.equal(received.headers.get('origin'),'https://public.example');assert.equal(received.headers.get('cookie'),'session=test');assert.equal(await received.text(),'{"name":"Guild"}');return new Response('ok',{headers:{'Set-Cookie':'session=new; Secure; HttpOnly'}});}}});
 assert.equal(result.status,200);assert.equal(result.headers.get('set-cookie'),'session=new; Secure; HttpOnly');
});
test('rollout fallback has fixed legacy origin and never masks application validation failures',async()=>{
 const request=new Request('https://public.example//evil.example/login?q=x');
 const result=await worker.fetch(request,{BACKEND:{fetch:async()=>new Response('Application origin mismatch.',{status:400})}});
 assert.equal(new URL(result.headers.get('Location')).origin,'https://darknessofthefallen-backend.eltryt-darknessofthefallen.workers.dev');
 const invalid=await worker.fetch(request,{BACKEND:{fetch:async()=>Response.json({error:'Invalid form'},{status:400})}});
 assert.equal(invalid.status,400);assert.equal(invalid.headers.get('Location'),null);
});
