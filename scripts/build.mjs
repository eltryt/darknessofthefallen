import {mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const dir of ['src','public','scripts'])for(const file of readdirSync(dir)){if(/\.(mjs|js)$/.test(file)){const r=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(r.status!==0)process.exit(1);}}
mkdirSync('dist',{recursive:true});copyFileSync('public/index.html','dist/index.html');console.log('Build verified. Node server serves public/; no bundler or CDN dependencies.');
