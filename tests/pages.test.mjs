import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {publicData} from '../scripts/public-data.mjs';
import {currentPage, pagePath} from '../public/routing.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const content = () => JSON.parse(readFileSync(new URL('../site/public.json', import.meta.url)));

test('Pages exposes only public fields, with no authentication or submission capability', () => {
  const input = content();
  input.settings.DISCORD_CLIENT_SECRET = 'private-secret';
  input.settings.recruitmentOpen = true;
  input.authConfigured = true;
  input.sessions = [{token: 'private-token'}];
  input.characters = [{name: 'Example', class: 'Mago', role: 'DPS distancia', notes: 'private-note', user_id: 'private-id'}];
  input.raids = [{id: '1', title: 'Raid', starts_at: '2026-10-08T21:00:00Z', source: 'Manual', attendance: 'private-attendance'}];
  const result = publicData(input);
  assert.equal(result.authConfigured, false);
  assert.equal(result.settings.recruitmentOpen, false);
  assert.deepEqual(Object.keys(result.characters[0]), ['name', 'class', 'role']);
  assert.ok(!JSON.stringify(result).includes('private-'));
  input.settings.discordUrl = 'javascript:alert(1)';
  assert.throws(() => publicData(input), /Discord/);
});

test('Pages links and route detection support project and root deployments', () => {
  for (const base of ['/', '/darknessofthefallen/']) {
    assert.equal(pagePath('/', base, true), base);
    const link = pagePath('/roster', base, true);
    assert.equal(link, `${base}roster/`);
    assert.equal(currentPage(link, base), '/roster');
    assert.equal(currentPage(link.slice(0, -1), base), '/roster');
    assert.equal(currentPage(`${base}index.html`, base), '/');
    assert.equal(pagePath('https://discord.gg/example', base, true), 'https://discord.gg/example');
    assert.equal(pagePath('#content', base, true), '#content');
  }
  assert.equal(currentPage('/another-site/roster/', '/darknessofthefallen/'), null);
  assert.equal(pagePath('/roster', '/', false), '/roster');
});

test('Pages builds complete, repeatable artifacts at both base paths and rejects invalid paths', () => {
  const build = base => spawnSync(process.execPath, ['scripts/build.mjs'], {
    cwd: root, env: {...process.env, PAGES_BASE_PATH: base}, encoding: 'utf8'
  });
  const invalid = build('/../private/');
  assert.notEqual(invalid.status, 0);
  for (const base of ['/', '/darknessofthefallen/', '/darknessofthefallen/']) {
    const result = build(base);
    assert.equal(result.status, 0, result.stderr);
    const dist = new URL('../dist/', import.meta.url);
    const files = readdirSync(dist, {recursive: true});
    assert.ok(files.includes('.nojekyll'));
    for (const forbidden of ['.env', 'src', 'data', 'backups', 'history.bundle', 'guild.sqlite']) {
      assert.ok(!files.some(file => file.split('/').includes(forbidden)), forbidden);
    }
    const config = readFileSync(new URL('runtime-config.js', dist), 'utf8');
    assert.ok(config.includes('"mode":"static"'));
    assert.ok(config.includes(`"basePath":"${base}"`));
    for (const route of ['', 'nosotros/', 'roster/', 'raids/', 'progreso/', 'reclutamiento/', 'contacto/', 'login/', 'perfil/', 'panel/']) {
      const html = readFileSync(new URL(`${route}index.html`, dist), 'utf8');
      for (const [, attr, url] of html.matchAll(/(href|src)="([^"]+)"/g)) {
        if (url.startsWith('#')) continue;
        assert.ok(url.startsWith(base), `${attr}=${url}`);
        const relative = url.slice(base.length);
        assert.ok(existsSync(new URL(relative.endsWith('/') || !relative ? `${relative}index.html` : relative, dist)), url);
      }
    }
    assert.ok(existsSync(new URL('404.html', dist)));
  }
});
