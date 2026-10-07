import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {defaults} from '../src/db.mjs';

// Only approved public defaults and public assets: never export a database or sessions.
const destination=resolve(process.argv[2]||'dist/showcase');
mkdirSync(join(destination,'assets'),{recursive:true});
const source=new URL('../public/',import.meta.url);
for(const file of ['style.css','operations.css','branding.css','character-editor.js','operations-ui.js','assets/guild-logo.png'])copyFileSync(new URL(file,source),join(destination,file));
let app=readFileSync(new URL('app.js',source),'utf8');
const start=app.indexOf('async function api('),end=app.indexOf('\nfunction field(',start);
if(start<0||end<0)throw Error('Public application structure changed; review showcase export.');
app=app.slice(0,start)+`async function api(path,method='GET'){if(method==='GET'&&path==='/api/public'){const response=await fetch('/site-data.json');if(!response.ok)throw Error('No se pudo cargar la presentación.');return response.json();}if(method==='GET'&&path==='/api/me')return {user:null,permissions:[]};throw Error('El área de miembros estará disponible cuando se active el acceso con Discord.');}\n`+app.slice(end);
writeFileSync(join(destination,'app.js'),app);
writeFileSync(join(destination,'site-data.json'),JSON.stringify({settings:defaults,characters:[],raids:[],progress:[],authConfigured:false}));
let html=readFileSync(new URL('index.html',source),'utf8');
html=html.replace('<main id="content"','<aside class="showcase-notice">Versión de presentación · El acceso de miembros con Discord estará disponible próximamente.</aside><main id="content"');
html=html.replace('</head>','<meta name="robots" content="noindex,follow"></head>');
const origin='https://darkness-of-the-fallen.borclagonher.chatgpt.site';
const escapeMeta=value=>String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const description=escapeMeta(`Hermandad ${defaults.faction} de WoW Forever en servidor ${defaults.ruleset}. Raids ${defaults.raidDays.join(', ')}, ${defaults.raidStart}–${defaults.raidEnd}, hora de Madrid.`);
const titles={'':'Inicio',nosotros:'Hermandad',progreso:'Progreso PvE',roster:'Roster',raids:'Raids',reclutamiento:'Reclutamiento',contacto:'Contacto',login:'Entrar con Discord'};
for(const [route,label] of Object.entries(titles)){
  const title=label+' · Darkness of the Fallen',url=origin+(route?'/'+route:'/');
  const meta=`<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:site_name" content="Darkness of the Fallen"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${origin}/assets/guild-logo.png"><meta property="og:image:alt" content="Emblema de Darkness of the Fallen"><meta name="twitter:card" content="summary">`;
  const page=html.replace('<title>Darkness of the Fallen</title>',`<title>${title}</title>`).replace('</head>',meta+'</head>');
  mkdirSync(join(destination,route),{recursive:true});writeFileSync(join(destination,route,'index.html'),page);
}
writeFileSync(join(destination,'branding.css'),readFileSync(join(destination,'branding.css'),'utf8')+'\n.showcase-notice{padding:10px 6%;border-bottom:1px solid var(--line);color:var(--muted);font-size:12px;text-align:center;background:#191419}\n');
console.log('Public showcase exported without private data: '+destination);
