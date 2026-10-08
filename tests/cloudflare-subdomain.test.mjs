import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureSubdomain} from '../scripts/cloudflare-subdomain.mjs';
const env = {CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only'};
test('Cloudflare onboarding preserves existing subdomains and never mutates on auth failure', async () => {
  let calls = 0;
  assert.equal(await ensureSubdomain(env, async () => {
    calls++;
    return Response.json({success: true, result: {subdomain: 'existing'}});
  }), 'existing');
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(ensureSubdomain(env, async () => {
    calls++;
    return Response.json({success: false, errors: [{code: 10000}]}, {status: 403});
  }), /Cannot read/);
  assert.equal(calls, 1);
});
test('Cloudflare onboarding registers only a confirmed missing subdomain', async () => {
  const calls = [];
  const result = await ensureSubdomain(env, async (url, options) => {
    calls.push(options);
    return calls.length === 1
      ? Response.json({success: false, errors: [{code: 10007}]}, {status: 404})
      : Response.json({success: true, result: {subdomain: 'eltryt-darknessofthefallen'}});
  });
  assert.equal(result, 'eltryt-darknessofthefallen');
  assert.equal(calls[1].method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].body), {subdomain: result});
});
