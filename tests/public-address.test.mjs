import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/public-address.mjs';
test('public address keeps paths and queries on the fixed existing application origin', async()=>{
  for(const path of ['/','/reclutamiento','//evil.example/login?next=https://evil.example','/raids?date=2026-10-09']){
    const response=await worker.fetch(new Request('https://public.example'+path));
    const target=new URL(response.headers.get('Location'));
    assert.equal(target.origin,'https://darknessofthefallen-backend.eltryt-darknessofthefallen.workers.dev');
    assert.equal(target.pathname,new URL('https://public.example'+path).pathname);
    assert.equal(response.status,302);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
});
test('public entry does not forward form submissions or handle sessions',async()=>{
  assert.equal((await worker.fetch(new Request('https://public.example/api/applications',{method:'POST',body:'{}'}))).status,405);
  assert.equal((await worker.fetch(new Request('https://public.example/login'))).headers.get('Set-Cookie'),null);
});
