import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';

test('Cloudflare SQLite: permissions, writes, rollback, assets and persistence after restart', {timeout: 120000}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'darkness-worker-'));
  let runtime;
  try {
    execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', 'tests/cloudflare/fixture.mjs', '--dry-run', '--outdir', join(directory, 'bundle')], {
      env: {...process.env, WRANGLER_SEND_METRICS: 'false'}, stdio: 'pipe'
    });
    const options = {
      modulesRoot: join(directory, 'bundle'),
      modules: [{type: 'ESModule', path: join(directory, 'bundle/fixture.js')}, ...(await readdir(join(directory, 'bundle'))).filter(file => file.endsWith('.sql')).map(file => ({type: 'Text', path: join(directory, 'bundle', file)}))],
      compatibilityDate: '2026-10-08', compatibilityFlags: ['nodejs_compat'],
      durableObjects: {GUILD: {className: 'Guild', useSQLite: true}},
      resourcePersistencePath: join(directory, 'storage'),
      isolatedResourcePersistencePath: join(directory, 'storage'),
      name: 'darkness-integration',
      bindings: {APP_ORIGIN: 'https://guild.example', DISCORD_CLIENT_ID: 'test-id', DISCORD_CLIENT_SECRET: 'test-secret', DISCORD_GUILD_ID: 'test-guild'},
      serviceBindings: {ASSETS: async request => {
        const path = new URL(request.url).pathname;
        return new Response(await readFile(resolve('public', path === '/' ? 'index.html' : path.slice(1))));
      }}
    };
    runtime = new Miniflare(convertV4MiniflareOptions(options));
    const request = (path, options) => runtime.dispatchFetch('https://guild.example' + path, options);
    assert.equal((await request('/api/health')).status, 200);
    const oldAddress = await runtime.dispatchFetch('https://old.example/raids?view=next',{redirect:'manual'});
    assert.equal(oldAddress.status,302);
    assert.equal(oldAddress.headers.get('location'),'https://guild.example/raids?view=next');
    assert.equal((await runtime.dispatchFetch('https://old.example/api/settings',{method:'PUT',body:'{}'})).status,409);
    assert.equal((await request('/panel')).status, 401);
    assert.equal((await request('/perfil')).status, 401);
    assert.equal((await request('/api/export')).status, 401);
    for (const path of ['/', '/reclutamiento', '/app.js', '/assets/guild-logo.png']) assert.equal((await request(path)).status, 200);
    const sessions = await (await request('/__test/seed')).json();
    const headers = rank => ({cookie: 'session=' + sessions[rank].raw, origin: 'https://guild.example', 'content-type': 'application/json', 'x-csrf-token': sessions[rank].csrf});
    assert.equal((await (await request('/api/events')).json()).events.length,0);
    const eventList=await (await request('/api/events',{headers:headers('leader')})).json();
    assert.equal(eventList.events[0].title,'Private runtime raid');
    assert.equal((await request('/api/events/runtime-event/metadata',{method:'PATCH',headers:headers('member'),body:JSON.stringify({category:'Oficial',roster:'Grupo 1',public:true,revision:eventList.events[0].revision})})).status,403);
    const candidate = {name:'Applicant',discord:'private-discord-handle',character:'Test character',class:'Mago',role:'DPS distancia',availability:'Noches',experience:'Classic',reason:'Jugar en equipo',additional:'private-detail',consent:true};
    const submit = value => ({method:'POST',headers:{origin:'https://guild.example','content-type':'application/json'},body:JSON.stringify(value)});
    assert.equal((await request('/api/applications', submit({...candidate,consent:false}))).status,400);
    const sent = await request('/api/applications', submit(candidate));
    assert.equal(sent.status,201);
    const application = await sent.json();
    assert.equal((await request('/api/applications')).status,401);
    assert.equal((await request('/api/applications',{headers:headers('member')})).status,403);
    assert.equal((await request('/api/applications/'+application.id,{method:'PATCH',headers:headers('leader'),body:JSON.stringify({status:'Contactado',notes:'private-review'})})).status,200);
    const projection = await (await request('/api/public')).text();
    assert.ok(!projection.includes('private-'));
    await request('/api/settings',{method:'PUT',headers:headers('leader'),body:JSON.stringify({recruitmentOpen:false})});
    assert.equal((await request('/api/applications', submit(candidate))).status,409);
    assert.equal((await request('/api/export', {headers: headers('member')})).status, 403);
    const update = {method: 'PUT', headers: headers('leader'), body: JSON.stringify({server: 'Persistence test'})};
    assert.equal((await request('/api/settings', {...update, headers: {...update.headers, origin: 'https://attacker.example'}})).status, 403);
    assert.equal((await request('/api/settings', {...update, headers: {...update.headers, 'x-csrf-token': 'wrong'}})).status, 403);
    assert.equal((await request('/api/settings', update)).status, 200);
    assert.equal((await (await request('/__test/rollback')).json()).display_name, 'leader');
    const oauth = await request('/auth/discord', {redirect: 'manual'});
    assert.equal(oauth.status, 302);
    assert.match(oauth.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    assert.equal(new URL(oauth.headers.get('location')).searchParams.get('redirect_uri'), 'https://guild.example/auth/discord/callback');
    assert.equal((await request('/api/settings', {...update, body: JSON.stringify({about: 'x'.repeat(33000)})})).status, 413);
    await runtime.dispose(); runtime = new Miniflare(convertV4MiniflareOptions(options));
    assert.equal((await (await request('/api/public')).json()).settings.server, 'Persistence test');
    assert.equal((await (await request('/api/me', {headers: headers('leader')})).json()).user.rank, 'leader');
    const persisted = await (await request('/api/applications',{headers:headers('leader')})).json();
    assert.equal(persisted.length,1);
    assert.equal(persisted[0].id,application.id);
    assert.equal(persisted[0].status,'Contactado');
    assert.equal(persisted[0].notes,'private-review');
    assert.equal(persisted[0].data.discord,candidate.discord);
    assert.equal((await (await request('/api/public')).json()).settings.recruitmentOpen,false);
    assert.equal((await request('/api/export', {headers: headers('leader')})).status, 200);
  } finally {
    await runtime?.dispose();
    await rm(directory, {recursive: true, force: true});
  }
});
