import {mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicData} from './public-data.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const basePath = process.env.PAGES_BASE_PATH || '/darknessofthefallen/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath)) {
  throw new Error('PAGES_BASE_PATH must be / or a path such as /darknessofthefallen/.');
}
for (const dir of ['src', 'public', 'scripts']) {
  for (const file of readdirSync(dir)) {
    if (/\.(mjs|js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], {stdio: 'inherit'});
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
const data = publicData(JSON.parse(readFileSync('site/public.json', 'utf8')));
// Fixed allowlist: databases, backups, .env and server modules cannot enter the artifact.
rmSync('dist', {recursive: true, force: true});
mkdirSync('dist', {recursive: true});
for (const file of ['app.js', 'style.css', 'routing.js']) copyFileSync(`public/${file}`, `dist/${file}`);
writeFileSync('dist/runtime-config.js', `export const runtime = ${JSON.stringify({mode: 'static', basePath})};\n`);
writeFileSync('dist/site-data.json', JSON.stringify(data, null, 2) + '\n');
writeFileSync('dist/.nojekyll', '');
const html = readFileSync('public/index.html', 'utf8')
  .replace(/(href|src)="\/(?!\/)([^"]*)"/g, (_, attr, path) => {
    const suffix = attr === 'href' && path && !path.includes('.') ? '/' : '';
    return `${attr}="${basePath}${path}${suffix}"`;
  });
writeFileSync('dist/index.html', html);
for (const route of ['nosotros', 'progreso', 'roster', 'raids', 'reclutamiento', 'contacto', 'login', 'perfil', 'panel']) {
  mkdirSync(`dist/${route}`, {recursive: true});
  writeFileSync(`dist/${route}/index.html`, html);
}
writeFileSync('dist/404.html', html);
console.log(`GitHub Pages artifact: ${resolve('dist')} (base path: ${basePath}).`);
