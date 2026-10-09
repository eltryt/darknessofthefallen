import assert from 'node:assert/strict';
import {setTimeout} from 'node:timers/promises';

const origin = process.env.BACKEND_URL;
const url = new URL(origin);
assert.ok(url.protocol === 'https:' && url.origin === origin && !url.username && !url.password);
async function request(path) {
  return fetch(origin + path, {signal: AbortSignal.timeout(15000), redirect: 'manual'});
}
// New workers.dev registrations can take time to propagate DNS and certificates.
let healthy = false;
for (let attempt = 1; attempt <= 24; attempt++) {
  try {
    const response = await request('/api/health');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    healthy = true; break;
  } catch {
    console.log(`Waiting for HTTPS health check (${attempt}/24).`);
    if (attempt < 24) await setTimeout(10000);
  }
}
assert.ok(healthy, 'Backend did not pass its public HTTPS health check.');
for (const path of ['/', '/login', '/raids', '/reclutamiento', '/app.js', '/recruitment-ui.js', '/api/public']) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.ok(response.headers.get('content-security-policy'), path);
  if (path === '/api/public') {
    const data = await response.json();
    assert.ok(data.settings?.name);
    console.log(`Discord configured: ${data.authConfigured === true}`);
  }
}
for (const path of ['/panel', '/perfil', '/api/export']) {
  const response = await request(path);
  assert.equal(response.status, 401, path);
  assert.ok((await response.json()).error);
}
const rejected = await fetch(origin + '/api/settings', {
  method: 'PUT', headers: {Origin: 'https://untrusted.example', 'Content-Type': 'application/json'},
  body: '{}', signal: AbortSignal.timeout(15000)
});
assert.equal(rejected.status, 403);
console.log(`Public backend verified: ${origin}`);
