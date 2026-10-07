import {runtime} from './runtime-config.js';
import {pagePath, currentPage} from './routing.js';
const isStatic = runtime.mode === 'static';
const sitePath = path => pagePath(path, runtime.basePath, isStatic);
function localizeLinks() {
  if (!isStatic || runtime.basePath === '/') return;
  document.querySelectorAll('a[href^="/"]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href.startsWith(runtime.basePath)) link.setAttribute('href', sitePath(href));
  });
}
const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data,me;const roles=['Tanque','Sanador','DPS melee','DPS distancia'],classes=['Guerrero','Paladín','Cazador','Pícaro','Sacerdote','Chamán','Mago','Brujo','Druida'];
const opts=items=>items.map(x=>`<option>${esc(x)}</option>`).join('');
const empty=(title,detail)=>`<div class="empty"><h3>${esc(title)}</h3><p>${esc(detail)}</p></div>`;
const title=(tag,heading,description)=>`<div class="page-title"><span class="eyebrow">${esc(tag)}</span><h1>${esc(heading)}</h1><p>${esc(description)}</p></div>`;
function toast(message){$('#toast').textContent=message;setTimeout(()=>$('#toast').textContent='',5000);}
async function api(path,method='GET',value){if(isStatic)throw new Error('Esta función todavía no está disponible.');const r=await fetch(path,{method,headers:{'Content-Type':'application/json',...(me?.csrf?{'X-CSRF-Token':me.csrf}:{})},...(value!==undefined?{body:JSON.stringify(value)}:{})});const result=await r.json();if(!r.ok)throw new Error(result.error||'No se pudo completar la operación.');return result;}
function field(label,name,type='text',value='',required=true){return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} maxlength="500"></label>`;}
function select(label,name,items){return `<label>${esc(label)}<select name="${name}" required>${opts(items)}</select></label>`;}
function area(label,name,required=true){return `<label class="wide">${esc(label)}<textarea name="${name}" maxlength="2000" ${required?'required':''}></textarea></label>`;}
function formHandler(id,fn){$(id)?.addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;try{await fn(Object.fromEntries(new FormData(e.target)),e.target);}catch(err){toast(err.message);}finally{button.disabled=false;}});}
function table(heads,rows){return `<div class="table-wrap"><table><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;}
function home(){const s=data.settings;return `<section class="hero"><div><span class="eyebrow">World of Warcraft Forever · ${esc(s.faction)}</span><h1>La noche es nuestra.<br><em>El camino, juntos.</em></h1><p>${esc(s.description)}</p><div class="actions"><a class="button" href="/reclutamiento">Encuentra tu lugar <span aria-hidden="true">→</span></a><a class="button secondary" href="/nosotros">Conoce la hermandad</a></div></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="hero-monogram">DF</div><span class="art-label">DARKNESS OF THE FALLEN</span></div></section><div class="facts"><div class="fact"><span class="label">Nuestro horario</span><strong>${esc(s.raidStart)} — ${esc(s.raidEnd)}</strong><small>Europe/Madrid</small></div><div class="fact"><span class="label">Nuestra facción</span><strong>${esc(s.faction)}</strong><small>${esc(s.region)}</small></div><div class="fact"><span class="label">Nuestra aventura</span><strong>Progresión PvE</strong><small>Con espacio para el PvP</small></div><div class="fact"><span class="label">Días de raid</span><strong>${s.raidDays.length?esc(s.raidDays.join(' · ')):'Por confirmar'}</strong><small>${esc(s.ruleset)} · ${esc(s.server)}</small></div></div><section class="section"><div class="section-head"><h2>Más que una raid.</h2><a href="/nosotros">Nuestra filosofía ↗</a></div><div class="grid"><article class="card"><span class="card-number">I.</span><h3>Construir algo duradero</h3><p>Una comunidad que siga aquí después del lanzamiento. Compartir el viaje importa tanto como llegar al siguiente boss.</p></article><article class="card"><span class="card-number">II.</span><h3>Progresar como equipo</h3><p>Preparación, comunicación y ganas de aprender. Cada papel tiene su sitio en la banda.</p></article><article class="card"><span class="card-number">III.</span><h3>Jugar con transparencia</h3><p>Un reparto de botín con decisiones trazables y un consejo visible cuando se utilice Loot Council.</p></article></div></section><section class="banner"><div><span class="eyebrow">Cuando Azeroth se queda en silencio</span><h2>Nosotros empezamos.</h2><p>Descubre nuestro horario y la organización de las raids.</p></div><a class="button secondary" href="/raids">Ver información de raids →</a></section>`;}
function roster(){return title('La hermandad','Nuestro roster','Personajes, clases y roles. Los datos internos de los miembros permanecen privados.')+`<div class="filters"><input id="search" aria-label="Buscar personaje" placeholder="Buscar personaje…"><select id="class" aria-label="Filtrar clase"><option value="">Todas las clases</option>${opts(classes)}</select><select id="role" aria-label="Filtrar rol"><option value="">Todos los roles</option>${opts(roles)}</select></div><div id="roster-result"></div>`;}
function renderRoster(){const rows=data.characters.filter(c=>(!$('#search').value||c.name.toLowerCase().includes($('#search').value.toLowerCase()))&&(!$('#class').value||c.class===$('#class').value)&&(!$('#role').value||c.role===$('#role').value));$('#roster-result').innerHTML=rows.length?table(['Personaje','Clase','Rol'],rows.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.class)}</td><td><span class="pill">${esc(c.role)}</span></td></tr>`)):empty('El roster está por abrirse','Los personajes aparecerán aquí cuando los miembros los registren.');}
function recruitment(){if(isStatic)return title('Un nuevo comienzo','Tu próxima hermandad.','Conoce a la comunidad y descubre cómo unirte.')+empty('Candidaturas online pendientes de apertura','Consulta las novedades y las necesidades de la hermandad en nuestro Discord.')+discordContact();return title('Un nuevo comienzo','Tu próxima hermandad.','Cuéntanos quién eres, cómo juegas y qué buscas. Tu candidatura solo será visible para el equipo autorizado.')+(!data.settings.recruitmentOpen?empty('Reclutamiento pendiente de apertura','El equipo de la hermandad anunciará las necesidades y activará aquí las candidaturas.'):`<form id="application" class="card form"><div class="form-grid">${field('Nombre o alias','name')}${field('Usuario de Discord','discord')}${field('Personaje y apellido','character')}${select('Clase','class',classes)}${select('Rol','role',roles)}${field('Disponibilidad y horario','availability')}${area('Experiencia','experience')}${area('¿Por qué quieres entrar?','reason')}${area('Información adicional','additional',false)}<label class="honeypot" aria-hidden="true">Sitio web<input name="website" tabindex="-1" autocomplete="off"></label></div><label><input type="checkbox" name="consent" required>Acepto que el Líder y los Oficiales consulten estos datos para gestionar mi candidatura y contacten conmigo por Discord.</label><p>No incluyas información sensible. Puedes solicitar la retirada de tu candidatura a través del contacto de la hermandad.</p><button type="submit">Enviar candidatura →</button></form>`);}
function raids(){const s=data.settings;return title('Preparados para la siguiente noche','Información de raids','Las convocatorias y las inscripciones se gestionan en Discord con Raid-Helper.')+`<section class="card"><span class="label">Horario de la hermandad</span><div class="schedule">${esc(s.raidStart)} — ${esc(s.raidEnd)}</div><p>Europe/Madrid · ${s.raidDays.length?esc(s.raidDays.join(', ')):'Días pendientes de confirmar'}</p>${s.discordUrl?`<a class="button" href="${esc(s.discordUrl)}" rel="noopener noreferrer">Abrir Discord ↗</a>`:'<span class="pill">Invitación Discord pendiente</span>'}</section><section class="section"><h2>Próximas convocatorias</h2>${data.raids.length?table(['Raid','Fecha','Fuente'],data.raids.map(r=>`<tr><td>${esc(r.title)}</td><td>${esc(new Date(r.starts_at).toLocaleString('es-ES',{timeZone:'Europe/Madrid'}))}</td><td>${esc(r.source)}</td></tr>`)):empty('Todavía no hay convocatorias','Las raids se mostrarán aquí cuando se importen o se registren en el panel.')}</section>`;}
async function profile(){const rows=await api('/api/characters'),attendance=await api('/api/attendance');$('#content').innerHTML=title('Tu espacio',me.user.name,'Gestiona tus personajes. Tu asistencia detallada solo es visible para ti y los responsables autorizados.')+`<div class="grid"><div class="card"><span class="label">Asistencia</span><span class="metric">${attendance.metrics.percentage}%</span><p>${attendance.metrics.raids} raids registradas · incluye tardanzas</p></div><div class="card"><span class="label">Personajes</span><span class="metric">${rows.length}</span><p>Un Main y todos tus Alters</p></div><div class="card"><span class="label">Rango</span><h3>${esc(me.user.rank)}</h3><button id="logout" class="secondary">Cerrar sesión</button></div></div><section class="section"><h2>Mis personajes</h2>${rows.length?table(['Nombre','Clase','Rol','Main / Alter'],rows.map(c=>`<tr><td>${esc(c.name)} ${esc(c.surname)}</td><td>${esc(c.class)}</td><td>${esc(c.role)}</td><td>${c.is_main?'<span class="pill gold">MAIN</span>':`<button data-main="${esc(c.id)}" class="secondary">Marcar Main</button>`}</td></tr>`)):empty('Tu historia empieza aquí','Registra tu primer personaje para incorporarte al roster.')}</section>${me.permissions.includes('character.write')?`<section class="section"><h2>Añadir personaje</h2><form id="character" class="card form"><div class="form-grid">${field('Nombre','name')}${field('Apellido','surname','text','',false)}${select('Clase','class',classes)}${select('Rol','role',roles)}${field('Especialización','spec','text','',false)}${field('Profesiones','professions','text','',false)}${area('Disponibilidad','availability',false)}${area('Notas personales','notes',false)}</div><label><input type="checkbox" name="isMain">Marcar como Main</label><button type="submit">Guardar personaje</button></form></section>`:'<p class="notice">Un rol de miembro en Discord es necesario para registrar personajes.</p>'}`;
  formHandler('#character',async(v,f)=>{await api('/api/characters','POST',{...v,isMain:!!v.isMain});toast('Personaje guardado');await profile();});document.querySelectorAll('[data-main]').forEach(b=>b.onclick=async()=>{try{await api(`/api/characters/${b.dataset.main}/main`,'POST',{});await profile();}catch(e){toast(e.message);}});$('#logout').onclick=async()=>{await api('/api/logout','POST',{});location.href='/';};}
async function panel(){const tabs=[['roster.read','roster','Roster'],['recruitment.manage','applications','Candidaturas'],['attendance.manage','attendance','Asistencia'],['settings.manage','settings','Configuración'],['audit.read','audit','Auditoría'],['backup.export','export','Exportación']].filter(t=>me.permissions.includes(t[0]));$('#content').innerHTML=title('Centro de mando','Panel de la hermandad','Organización, datos y seguimiento. Cada herramienta respeta los permisos de tu rango.')+`<div class="panel-tabs">${tabs.map((t,i)=>`<button data-tab="${t[1]}" class="${i===0?'active':''}">${t[2]}</button>`).join('')}</div><section id="panel-body"></section>`;document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));panelTab(b.dataset.tab).catch(e=>toast(e.message));});if(tabs[0])await panelTab(tabs[0][1]);}
async function panelTab(tab){const el=$('#panel-body');el.innerHTML='<p role="status">Cargando…</p>';if(tab==='roster'){const rows=await api('/api/roster'),mains=rows.filter(c=>c.is_main),t=data.settings.rosterTargets;el.innerHTML=`<div class="grid">${[['Tanques',mains.filter(c=>c.role==='Tanque').length,t.tanks],['Sanadores',mains.filter(c=>c.role==='Sanador').length,t.healers],['DPS',mains.filter(c=>c.role.startsWith('DPS')).length,t.dps]].map(([n,v,max])=>`<div class="card"><span class="label">${n} · Mains registrados</span><span class="metric">${v} / ${max}</span></div>`).join('')}</div><p class="notice">Composición por personajes Main; no representa confirmaciones de asistencia a una raid.</p>${table(['Personaje','Clase','Rol','Disponibilidad','Rango'],rows.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.class)}</td><td>${esc(c.role)}</td><td>${esc(c.availability)||'Sin indicar'}</td><td>${esc(c.rank)}</td></tr>`))}`;}
  if(tab==='applications'){const rows=await api('/api/applications');el.innerHTML=`<div class="columns">${['Nuevo','Contactado','Prueba','Aceptado','Rechazado'].map(status=>`<div class="column"><h3>${status} · ${rows.filter(a=>a.status===status).length}</h3>${rows.filter(a=>a.status===status).map(a=>`<form class="card candidate" data-id="${a.id}"><h4>${esc(a.data.name)}</h4><p>${esc(a.data.class)} · ${esc(a.data.role)}</p><details><summary>Ver candidatura</summary>${Object.entries(a.data).map(([k,v])=>`<p><b>${esc(k)}</b>: ${esc(v)}</p>`).join('')}</details>${select('Estado','status',['Nuevo','Contactado','Prueba','Aceptado','Rechazado'])}<label>Notas internas<textarea name="notes">${esc(a.notes)}</textarea></label><button type="submit">Guardar</button></form>`).join('')}</div>`).join('')}</div>`;document.querySelectorAll('.candidate').forEach(f=>{f.elements.status.value=rows.find(a=>a.id===f.dataset.id).status;f.onsubmit=async e=>{e.preventDefault();try{await api('/api/applications/'+f.dataset.id,'PATCH',Object.fromEntries(new FormData(f)));toast('Candidatura actualizada');await panelTab('applications');}catch(e){toast(e.message);}};});}
  if(tab==='attendance'){const a=await api('/api/attendance');el.innerHTML=a.rows.length?table(['Raid','Miembro','Estado'],a.rows.map(r=>`<tr><td>${esc(r.raid_id)}</td><td>${esc(r.user_id)}</td><td>${esc(r.status)}</td></tr>`)):empty('Sin asistencias registradas','La edición de raids y asistencia se implementará en la siguiente fase.');}
  if(tab==='audit'){const rows=await api('/api/audit');el.innerHTML=table(['Fecha','Usuario','Acción','Objeto'],rows.map(r=>`<tr><td>${esc(r.created_at)}</td><td>${esc(r.actor_id)}</td><td>${esc(r.action)}</td><td>${esc(r.target)}</td></tr>`));}
  if(tab==='export')el.innerHTML=`<div class="card"><h2>Copia de los datos de la hermandad</h2><p>JSON con roster, personajes, candidaturas, raids, asistencia, loot, wishlist, progreso, configuración y auditoría. Contiene datos privados: guárdalo en un lugar seguro.</p><a class="button" href="/api/export" download>Descargar exportación JSON</a><p class="notice">La exportación no incluye sesiones ni secretos.</p></div>`;
  if(tab==='settings'){const s=data.settings;el.innerHTML=`<form id="settings" class="card form"><div class="form-grid">${field('Nombre','name','text',s.name)}${field('Descripción','description','text',s.description)}${field('Facción','faction','text',s.faction)}${field('Región','region','text',s.region)}${field('Servidor','server','text',s.server)}${select('Ruleset','ruleset',['Por confirmar','PvP','PvE'])}${field('Inicio de raid','raidStart','time',s.raidStart)}${field('Fin de raid','raidEnd','time',s.raidEnd)}${field('Invitación de Discord','discordUrl','url',s.discordUrl,false)}${select('Método de loot','lootMethod',['Loot Council','Roll','Soft Reserve','DKP','Híbrido'])}<fieldset class="wide"><legend>Días de raid</legend>${['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d=>`<label><input name="days" type="checkbox" value="${d}" ${s.raidDays.includes(d)?'checked':''}>${d}</label>`).join('')}</fieldset>${field('Objetivo tanques','tanks','number',s.rosterTargets.tanks)}${field('Objetivo sanadores','healers','number',s.rosterTargets.healers)}${field('Objetivo DPS','dps','number',s.rosterTargets.dps)}</div><label><input name="recruitmentOpen" type="checkbox" ${s.recruitmentOpen?'checked':''}>Reclutamiento abierto</label><button type="submit">Guardar configuración</button></form>`;$('#settings').elements.ruleset.value=s.ruleset;$('#settings').elements.lootMethod.value=s.lootMethod;formHandler('#settings',async(v,f)=>{data.settings=await api('/api/settings','PUT',{...v,raidDays:new FormData(f).getAll('days'),recruitmentOpen:!!v.recruitmentOpen,rosterTargets:{tanks:Number(v.tanks),healers:Number(v.healers),dps:Number(v.dps)}});toast('Configuración guardada');});}}
function discordContact() {
  const url = data.settings.discordUrl;
  return url ? `<a class="button" href="${esc(url)}" rel="noopener noreferrer">Entrar al Discord de la guild ↗</a>` : empty('Invitación pendiente', 'El enlace oficial de Discord se publicará aquí cuando esté disponible.');
}
function memberAccess() {
  return title('La hermandad', 'Acceso de miembros pendiente', 'El acceso con Discord y la gestión de personajes todavía no están disponibles en esta web.') + discordContact();
}
async function boot() {
  try {
    if (isStatic) {
      const response = await fetch(new URL('./site-data.json', import.meta.url));
      if (!response.ok) throw new Error('No se ha podido cargar la información de la hermandad.');
      data = await response.json();
      me = {user: null, permissions: []};
      $('.login').textContent = 'Acceso de miembros ↗';
    } else {
      [data, me] = await Promise.all([api('/api/public'), api('/api/me')]);
    }
    const s = data.settings, path = currentPage(location.pathname, runtime.basePath);
    document.title = `${s.name} · WoW Forever`;
    localizeLinks();
    document.querySelectorAll('nav a').forEach(a => {
      if (currentPage(a.pathname, runtime.basePath) === path) a.setAttribute('aria-current', 'page');
    });
    if (me.user) {
      $('.login').href = '/perfil';
      $('.login').textContent = 'Mi perfil ↗';
      if (me.permissions.includes('roster.read')) $('#navigation').insertAdjacentHTML('beforeend', '<a href="/panel">Panel</a>');
    }
    let html = '';
    switch (path) {
      case '/': html = home(); break;
      case '/nosotros':
        html = title('Nuestra identidad', 'Un lugar al que volver.', s.about) + `<div class="grid"><article class="card"><h3>Alianza</h3><p>${esc(s.name)} en ${esc(s.region)}. Servidor: ${esc(s.server)}. Ruleset: ${esc(s.ruleset)}.</p></article><article class="card"><h3>Progresión PvE</h3><p>Conocer cada encuentro, mejorar juntos y construir un equipo estable.</p></article><article class="card"><h3>Noches compartidas</h3><p>De ${esc(s.raidStart)} a ${esc(s.raidEnd)}, Europe/Madrid. ${s.raidDays.length ? esc(s.raidDays.join(', ')) : 'Días por confirmar.'}</p></article></div>`;
        break;
      case '/roster': html = roster(); break;
      case '/reclutamiento': html = recruitment(); break;
      case '/raids': html = raids(); break;
      case '/progreso':
        html = title('Paso a paso, boss a boss', 'Nuestro progreso PvE', 'Aquí quedarán los encuentros superados y los hitos de la hermandad.') + empty('La aventura está por escribirse', 'Todavía no hay progreso registrado. No mostramos victorias ni estadísticas ficticias.');
        break;
      case '/contacto':
        html = title('Nos vemos en Azeroth', 'Hablemos en Discord.', 'Nuestro punto de encuentro para la comunidad, las convocatorias y las dudas.') + discordContact();
        break;
      case '/login':
        html = isStatic ? memberAccess() : title('Bienvenido a casa', 'Entra con Discord.', 'Tu cuenta de Discord conecta tus personajes y tu rango con la hermandad.') + (data.authConfigured ? '<a class="button" href="/auth/discord">Autorizar con Discord ↗</a>' : empty('Conexión pendiente', 'El acceso se activará cuando esté configurada la aplicación Discord de la hermandad.'));
        break;
      case '/perfil':
        if (isStatic) { html = memberAccess(); break; }
        await profile(); return;
      case '/panel':
        if (isStatic) { html = memberAccess(); break; }
        await panel(); return;
      default: html = empty('Página no encontrada', 'Vuelve al inicio para seguir explorando.');
    }
    $('#content').innerHTML = html;
    localizeLinks();
    if (path === '/roster') {
      renderRoster();
      ['#search', '#class', '#role'].forEach(selector => $(selector).addEventListener('input', renderRoster));
    }
    formHandler('#application', async (v, f) => {
      await api('/api/applications', 'POST', {...v, consent: !!v.consent});
      f.innerHTML = empty('Candidatura recibida', 'El equipo autorizado la revisará y contactará contigo por Discord.');
      toast('Candidatura enviada');
    });
  } catch (e) {
    $('#content').innerHTML = `<div class="page-title"><h1>No hemos podido abrir esta página.</h1><p class="error">${esc(e.message)}</p><a class="button" href="${sitePath('/')}">Volver al inicio</a></div>`;
  }
}
$('#menu').onclick = () => {
  const open = $('#navigation').classList.toggle('open');
  $('#menu').setAttribute('aria-expanded', String(open));
};
boot();
