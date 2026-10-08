import {mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve, dirname, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {publicData} from './public-data.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const basePath = process.env.PAGES_BASE_PATH || '/darknessofthefallen/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath)) {
  throw new Error('PAGES_BASE_PATH must be / or a path such as /darknessofthefallen/.');
}
const siteOrigin = process.env.PAGES_ORIGIN || 'https://eltryt.github.io';
const origin = new URL(siteOrigin);
if (origin.protocol !== 'https:' || origin.origin !== siteOrigin || origin.username || origin.password) {
  throw new Error('PAGES_ORIGIN must be an HTTPS origin without a path.');
}
for (const dir of ['src', 'public', 'scripts']) {
  for (const file of readdirSync(dir)) {
    if (/\.(mjs|js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], {stdio: 'inherit'});
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
// Export directly from the current application. No database is opened or read;
// the exporter uses only the public defaults and assets in src/ and public/.
const exported = mkdtempSync(resolve(tmpdir(), 'darkness-pages-'));
try {
const result = spawnSync(process.execPath, ['scripts/export-showcase.mjs', exported], {stdio: 'inherit'});
if (result.status !== 0) throw new Error('Public showcase export failed.');
const snapshot = JSON.parse(readFileSync(resolve(exported, 'site-data.json'), 'utf8'));
assert.deepEqual(snapshot, publicData(snapshot), 'The export must contain only supported public fields; authentication and submissions must remain disabled.');

const routes = ['', 'nosotros', 'progreso', 'roster', 'raids', 'reclutamiento', 'contacto', 'login'];
const assets = ['schedule.js', 'schedule-ui.js', 'app.js', 'character-editor.js', 'operations-ui.js', 'style.css', 'operations.css', 'branding.css', 'assets/guild-logo.png', 'site-data.json'];
const sourceOrigin = 'https://darkness-of-the-fallen.borclagonher.chatgpt.site';
function adapt(text) {
  return text
    .replace(/((?:href|src)=["'])\/(?!\/)/g, `$1${basePath}`)
    .replace(/(from\s+["'])\/(?!\/)/g, `$1${basePath}`)
    .replace(/(fetch\(["'])\/(?!\/)/g, `$1${basePath}`)
    .replace(/(location\.href=["'])\/(?!\/)/g, `$1${basePath}`);
}
rmSync('dist', {recursive: true, force: true});
mkdirSync('dist', {recursive: true});
for (const file of assets) {
  mkdirSync(dirname(`dist/${file}`), {recursive: true});
  if (extname(file) === '.js') {
    let source = adapt(readFileSync(resolve(exported, file), 'utf8'));
    if (file === 'app.js') {
      source = source.replaceAll('location.pathname', 'pagesPath(location.pathname)')
        .replaceAll('a.pathname', 'pagesPath(a.pathname)');
      source = `// GitHub Pages path adapter; the full application source is kept in public/.\nconst pagesBasePath = ${JSON.stringify(basePath)};\nfunction pagesPath(path) { return path.startsWith(pagesBasePath) ? '/' + path.slice(pagesBasePath.length) : path; }\n` + source;
    }
    writeFileSync(`dist/${file}`, source);
  } else {
    copyFileSync(resolve(exported, file), `dist/${file}`);
  }
}
for (const route of routes) {
  const relative = route ? `${route}/index.html` : 'index.html';
  const html = adapt(readFileSync(resolve(exported, relative), 'utf8'))
    .replaceAll(sourceOrigin, siteOrigin + basePath.replace(/\/$/, ''));
  mkdirSync(dirname(`dist/${relative}`), {recursive: true});
  writeFileSync(`dist/${relative}`, html);
}
writeFileSync('dist/.nojekyll', '');
writeFileSync('dist/build-info.json', JSON.stringify({basePath, siteOrigin, source: sourceOrigin}, null, 2) + '\n');
copyFileSync('dist/index.html', 'dist/404.html');
console.log(`Current published website built at ${resolve('dist')} (base path: ${basePath}).`);

} finally {
  rmSync(exported, {recursive: true, force: true});
}
