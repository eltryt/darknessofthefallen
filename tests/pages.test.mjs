import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {publicData} from '../scripts/public-data.mjs';
import {defaults} from '../src/database-core.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const content = () => structuredClone({settings: defaults, characters: [], raids: [], progress: [], authConfigured: false});

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

test('Pages uses the current published website with its logo, branding and confirmed schedule', () => {
  const source = new URL('../public/', import.meta.url);
  const snapshot = content();
  assert.deepEqual(snapshot, publicData(snapshot));
  assert.equal(snapshot.settings.ruleset, 'PvP');
  assert.deepEqual(snapshot.settings.raidDays, ['Martes', 'Miércoles', 'Jueves']);
  for (const file of ['schedule.js', 'schedule-ui.js', 'branding.css', 'operations.css', 'operations-ui.js', 'character-editor.js', 'assets/guild-logo.png']) {
    assert.ok(existsSync(new URL(file, source)), file);
  }
  const html = readFileSync(new URL('index.html', source), 'utf8');
  assert.match(html, /class="brand-logo"/);
  assert.match(html, /branding\.css/);
  const app = readFileSync(new URL('app.js', source), 'utf8');
  assert.match(app, /function weekSchedule/);
  assert.match(app, /function publicLayout/);
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
    const config = JSON.parse(readFileSync(new URL('build-info.json', dist), 'utf8'));
    assert.equal(config.basePath, base);
    // Public assets come from the current full project, never an older snapshot.
    for (const file of ['style.css', 'operations.css', 'assets/guild-logo.png']) {
      assert.deepEqual(readFileSync(new URL(file, dist)), readFileSync(new URL(`../public/${file}`, import.meta.url)), file);
    }
    const branding = readFileSync(new URL('branding.css', dist), 'utf8');
    assert.ok(branding.startsWith(readFileSync(new URL('../public/branding.css', import.meta.url), 'utf8')));
    assert.match(branding, /showcase-notice/);
    assert.deepEqual(JSON.parse(readFileSync(new URL('site-data.json', dist), 'utf8')), content());
    const app = readFileSync(new URL('app.js', dist), 'utf8');
    assert.ok(app.includes(`from '${base}character-editor.js'`));
    assert.ok(app.includes(`from '${base}schedule-ui.js'`));
    assert.ok(app.includes(`from '${base}operations-ui.js'`));
    assert.ok(app.includes(`fetch('${base}site-data.json')`));
    assert.ok(app.includes('path=pagesPath(location.pathname)'));
    assert.ok(app.includes('pagesPath(a.pathname)'));
    for (const route of ['', 'nosotros/', 'roster/', 'raids/', 'progreso/', 'reclutamiento/', 'contacto/', 'login/']) {
      const html = readFileSync(new URL(`${route}index.html`, dist), 'utf8');
      assert.ok(!html.includes('https://darkness-of-the-fallen.borclagonher.chatgpt.site'));
      assert.ok(html.includes(`https://eltryt.github.io${base}`));
      for (const [, attr, url] of html.matchAll(/(href|src)="([^"]+)"/g)) {
        if (url.startsWith('#') || url.startsWith('https:')) continue;
        assert.ok(url.startsWith(base), `${attr}=${url}`);
        const relative = url.slice(base.length);
        assert.ok(existsSync(new URL(!relative ? 'index.html' : relative.endsWith('/') ? `${relative}index.html` : relative.includes('.') ? relative : `${relative}/index.html`, dist)), url);
      }
    }
    assert.ok(existsSync(new URL('404.html', dist)));
  }
});
