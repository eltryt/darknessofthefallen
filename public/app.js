import { initAnalytics } from './analytics.js';
import { createPublicViews } from './public-views.js';
import { createProfileView } from './profile-view.js';
import { createPanelView } from './panel-view.js';
import { createArmoryView } from './armory-view.js';

// Contexto compartido por las herramientas del panel.
function operationsContext() {
	return { api, esc, empty, table, field, select, area, formHandler, toast, me, data };
}
// Utilidades de DOM, escape de contenido y estado de la sesión.
const $ = (s) => document.querySelector(s);
const esc = (v) =>
	String(v ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
let data, me;
const roles = ['Tanque', 'Sanador', 'DPS melee', 'DPS distancia'],
	classes = [
		'Guerrero',
		'Paladín',
		'Cazador',
		'Pícaro',
		'Sacerdote',
		'Chamán',
		'Mago',
		'Brujo',
		'Druida',
	];
const opts = (items) => items.map((x) => `<option>${esc(x)}</option>`).join('');
const empty = (title, detail) =>
	`<div class="empty"><h3>${esc(title)}</h3><p>${esc(detail)}</p></div>`;
const title = (tag, heading, description) =>
	/* HTML */ `<div class="page-title">
		<span class="eyebrow">${esc(tag)}</span>
		<h1>${esc(heading)}</h1>
		<p>${esc(description)}</p>
	</div>`;
let toastTimer;
function toast(message) {
	clearTimeout(toastTimer);
	$('#toast').textContent = message;
	toastTimer = setTimeout(() => ($('#toast').textContent = ''), 7000);
}
// Comunicación con el backend autenticado.
async function api(path, method = 'GET', value) {
	const r = await fetch(path, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(me?.csrf ? { 'X-CSRF-Token': me.csrf } : {}),
		},
		...(value !== undefined ? { body: JSON.stringify(value) } : {}),
	});
	const result = await r
		.json()
		.catch(() => ({ error: 'No se pudo conectar. Vuelve a intentarlo en unos instantes.' }));
	if (!r.ok) throw new Error(result.error || 'No se pudo completar la operación.');
	return result;
}
// Controles reutilizables de formularios y tablas.
function field(label, name, type = 'text', value = '', required = true) {
	return /* HTML */ `<label
		>${esc(label)}${required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}<input
			name="${name}"
			type="${type}"
			value="${esc(value)}"
			${required ? 'required' : ''}
			maxlength="500"
	/></label>`;
}
function select(label, name, items) {
	return /* HTML */ `<label
		>${esc(label)} <span class="required-mark" aria-hidden="true">*</span
		><select name="${name}" required>
			${opts(items)}
		</select></label
	>`;
}
function recruitmentChoices(label, name, items, selected) {
	return /* HTML */ `<fieldset class="wide recruitment-choices">
		<legend>${esc(label)}</legend>
		<div>
			${items.map((item) => /* HTML */ `<label><input type="checkbox" name="${name}" value="${esc(item)}" ${selected.includes(item) ? 'checked' : ''} />${esc(item)}</label>`).join('')}
		</div>
	</fieldset>`;
}
function area(label, name, required = true) {
	return /* HTML */ `<label class="wide"
		>${esc(label)}${required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}<textarea
			name="${name}"
			maxlength="2000"
			${required ? 'required' : ''}
		></textarea>
	</label>`;
}
function formHandler(id, fn) {
	$(id)?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const button = e.target.querySelector('button[type=submit]');
		button.disabled = true;
		e.target.setAttribute('aria-busy', 'true');
		e.target.querySelector('.form-feedback')?.remove();
		try {
			await fn(Object.fromEntries(new FormData(e.target)), e.target);
		} catch (err) {
			const feedback = document.createElement('p');
			feedback.className = 'form-feedback error';
			feedback.setAttribute('role', 'alert');
			feedback.textContent = err.message;
			e.target.append(feedback);
			toast(err.message);
		} finally {
			button.disabled = false;
			e.target.removeAttribute('aria-busy');
		}
	});
}
function table(heads, rows) {
	return /* HTML */ `<div class="table-wrap" tabindex="0" aria-label="Tabla de datos">
		<table>
			<thead>
				<tr>
					${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}
				</tr>
			</thead>
			<tbody>
				${rows.join('')}
			</tbody>
		</table>
	</div>`;
}

// Inicio de la aplicación y navegación.
async function boot() {
	const overview = document.querySelector('[data-public-overview]')?.outerHTML;

	try {
		[data, me] = await Promise.all([
			api('/api/public'),
			api('/api/me').catch((error) => {
				if (overview) return { user: null, permissions: [] };
				throw error;
			}),
		]);
		const s = data.settings,
			path = location.pathname.replace(/\/$/, '') || '/';
		if (!data.authConfigured && !me.user) $('.login').textContent = 'Acceso de miembros';
		document.title = `${{ '/nosotros': 'Hermandad', '/raids': 'Raids', '/roster': 'Roster', '/progreso': 'Progreso PvE', '/reclutamiento': 'Reclutamiento', '/contacto': 'Contacto', '/login': 'Entrar con Discord', '/perfil': 'Mi perfil', '/armeria': 'Armería', '/panel': 'Panel' }[path] || 'Inicio'} · ${s.name}`;
		document.querySelectorAll('nav a').forEach((a) => {
			if (a.pathname.replace(/\/$/, '') === path.replace(/\/$/, ''))
				a.setAttribute('aria-current', 'page');
		});
		if (me.user) {
			$('.login').href = '/perfil';
			$('.login').textContent = 'Mi perfil ↗';
			if (me.permissions.includes('roster.read'))
				$('#navigation').insertAdjacentHTML(
					'beforeend',
					'<a href="/panel"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>Panel</a>',
				);
		}
		if (path === '/panel') $('#navigation a[href="/panel"]')?.setAttribute('aria-current', 'page');
		const context = { ...operationsContext(), $, title, roles, classes, opts, recruitmentChoices };
		// Member areas share the public visual layer, which is keyed on data-page.
		if (['/perfil', '/panel', '/armeria'].includes(path)) document.body.dataset.page = path;
		if (path === '/perfil') await createProfileView(context).profile();
		else if (path === '/armeria') await createArmoryView(context).armory();
		else if (path === '/panel') await createPanelView(context).panel();
		else await createPublicViews(context).render(path);
	} catch (e) {
		if (overview) {
			$('#content').innerHTML = overview;
			const notice = document.createElement('p');
			notice.className = 'notice';
			notice.setAttribute('role', 'status');
			notice.textContent =
				'La información interactiva no está disponible en este momento. Puedes recargar la página para volver a intentarlo.';
			$('#content').append(notice);
			return;
		}
		$('#content').innerHTML = /* HTML */ `<div class="page-title">
			<h1>No hemos podido abrir esta página.</h1>
			<p class="error">${esc(e.message)}</p>
			<a class="button" href="/">Volver al inicio</a>
		</div>`;
	} finally {
		document.documentElement.classList.remove('site-booting');
	}
}
const closeMenu = () => {
	$('#navigation').classList.remove('open');
	$('#menu').setAttribute('aria-expanded', 'false');
};
$('#menu').onclick = () => {
	const open = $('#navigation').classList.toggle('open');
	$('#menu').setAttribute('aria-expanded', String(open));
};
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && $('#navigation').classList.contains('open')) {
		closeMenu();
		$('#menu').focus();
	}
});
$('#navigation').addEventListener('click', (e) => {
	if (e.target.closest('a')) closeMenu();
});
boot();
initAnalytics();
