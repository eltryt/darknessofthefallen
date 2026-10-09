const statuses = ['Nuevo', 'Contactado', 'Prueba', 'Aceptado', 'Rechazado'];
const labels = {name:'Nombre o alias',discord:'Usuario de Discord',character:'Personaje',class:'Clase',role:'Rol',availability:'Disponibilidad',experience:'Experiencia',reason:'Motivación',additional:'Información adicional'};

export function prepareApplication(form) {
  if (!form) return;
  for (const [name, limit] of Object.entries({name:80,discord:80,character:80,availability:1000,experience:2000,reason:2000,additional:2000})) form.elements[name].maxLength = limit;
  for (const name of ['class', 'role']) {
    const placeholder = new Option('Selecciona una opción', '', true, true);
    placeholder.disabled = true;
    form.elements[name].prepend(placeholder);
  }
}

export function applicationReceipt(form, result, esc) {
  const receipt = document.createElement('section');
  receipt.className = 'card application-receipt';
  receipt.tabIndex = -1;
  receipt.setAttribute('role', 'status');
  receipt.innerHTML = `<span class="eyebrow">Solicitud registrada</span><h2>Candidatura recibida</h2><p>Tu candidatura se ha guardado en la web. El Líder y los Oficiales podrán revisarla y contactar contigo por Discord.</p><p>Referencia: <strong class="application-reference">${esc(result.id)}</strong></p><p>Guarda esta referencia por si necesitas consultar o retirar tu solicitud. Enviarla no implica la aceptación en la hermandad.</p><a class="button secondary" href="/">Volver al inicio</a>`;
  form.replaceWith(receipt);
  receipt.focus();
}

export async function applicationInbox(el, {api, esc, toast}) {
  const rows = await api('/api/applications');
  el.innerHTML = `<section class="application-inbox"><h2>Candidaturas</h2><p>Solicitudes guardadas en la web, visibles únicamente para el Líder y los Oficiales. Fechas en hora de Madrid.</p><div class="filters"><label>Buscar candidato<input id="application-search" type="search" placeholder="Nombre, Discord, personaje o referencia"></label><label>Estado<select id="application-status"><option value="">Todos los estados</option>${statuses.map(s=>`<option>${s}</option>`).join('')}</select></label></div><p id="application-count" role="status"></p><div id="application-list"></div></section>`;
  const list = el.querySelector('#application-list');
  const date = value => new Date(value).toLocaleString('es-ES', {timeZone:'Europe/Madrid'});
  function render() {
    const query = el.querySelector('#application-search').value.trim().toLocaleLowerCase('es');
    const status = el.querySelector('#application-status').value;
    const visible = rows.filter(row => (!status || row.status === status) && [row.id,row.data.name,row.data.discord,row.data.character].some(v=>String(v).toLocaleLowerCase('es').includes(query)));
    el.querySelector('#application-count').textContent = `${visible.length} de ${rows.length} candidaturas · ${rows.filter(r=>r.status==='Nuevo').length} nuevas${rows.length===500?' · Se muestran las 500 más recientes':''}`;
    list.innerHTML = visible.length ? visible.map(row=>`<article class="card application-card"><div class="application-heading"><div><h3>${esc(row.data.name)}</h3><p>${esc(row.data.class)} · ${esc(row.data.role)}</p></div><span class="pill">${esc(row.status)}</span></div><p>Recibida: <time datetime="${esc(row.created_at)}">${esc(date(row.created_at))}</time></p><p class="application-reference">Referencia: ${esc(row.id)}</p><details><summary>Ver candidatura completa</summary><dl>${Object.entries(labels).map(([key,label])=>`<dt>${label}</dt><dd>${esc(row.data[key] || 'Sin indicar')}</dd>`).join('')}</dl></details><form data-application-id="${esc(row.id)}"><label>Estado<select name="status">${statuses.map(s=>`<option ${s===row.status?'selected':''}>${s}</option>`).join('')}</select></label><label>Notas internas<textarea name="notes" maxlength="4000">${esc(row.notes)}</textarea></label><p>Las notas y los cambios de estado se guardan en la web. No se envía un mensaje automático al candidato.</p><button type="submit">Guardar revisión</button><p class="review-feedback" role="status"></p></form></article>`).join('') : `<div class="empty"><h3>${rows.length?'No hay coincidencias':'Todavía no hay candidaturas'}</h3><p>${rows.length?'Prueba otro nombre o estado.':'Las solicitudes enviadas desde Reclutamiento aparecerán aquí.'}</p></div>`;
    for (const form of list.querySelectorAll('form')) form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button');
      if (button.disabled) return;
      button.disabled = true;
      const feedback = form.querySelector('.review-feedback');
      feedback.textContent = 'Guardando…';
      try {
        const values = Object.fromEntries(new FormData(form));
        await api('/api/applications/' + form.dataset.applicationId, 'PATCH', values);
        Object.assign(rows.find(row=>row.id===form.dataset.applicationId), values);
        render(); toast('Revisión guardada');
      } catch (error) { feedback.textContent = error.message; feedback.setAttribute('role','alert'); }
      finally { button.disabled = false; }
    });
  }
  el.querySelector('#application-search').addEventListener('input', render);
  el.querySelector('#application-status').addEventListener('change', render);
  render();
}
