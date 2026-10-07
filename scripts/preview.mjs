import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const runtime = JSON.parse(await readFile(new URL('../dist/build-info.json', import.meta.url), 'utf8'));

const root = fileURLToPath(new URL('../dist/', import.meta.url)).replace(/\/$/, '');
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8'};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/' && runtime.basePath !== '/' || url.pathname === runtime.basePath.slice(0, -1)) {
      res.writeHead(302, {Location: runtime.basePath}); res.end(); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (!url.pathname.startsWith(runtime.basePath)) { res.writeHead(404); res.end(); return; }
    let path = resolve(root, decodeURIComponent(url.pathname.slice(runtime.basePath.length)));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    if ((await stat(path)).isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(301, {Location: url.pathname + '/' + url.search}); res.end(); return; }
      path = resolve(path, 'index.html');
    }
    const body = await readFile(path);
    res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, {'Content-Type': types['.html']});
    res.end(req.method === 'HEAD' ? undefined : await readFile(resolve(root, '404.html')));
  }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => {
  console.log(`Pages preview listening on port ${server.address().port}, path ${runtime.basePath}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
