import { ClassIcon } from './components.js';
import { paperdoll } from './paperdoll.js';
import { classKey } from './roster-ui.js';
import { gameVersions } from './armory-catalog.js';
import { sheetHelpers, factsList, renderGuides, openSlotDialog } from './sheet-parts.js';

const userIcon =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
const dateLabel = (value) =>
	value
		? new Date(value).toLocaleString('es-ES', {
				timeZone: 'Europe/Madrid',
				dateStyle: 'medium',
				timeStyle: 'short',
			})
		: '';
const tabs = [
	['summary', 'Resumen'],
	['gear', 'Equipamiento'],
	['guides', 'Guías'],
];

// Read-only sheet of another member, opened by management ranks from the roster.
// A player's own characters live in Mi perfil, so they are redirected there.
export function createArmoryView(context) {
	const { $, api, esc, toast, me } = context;
	const params = new URLSearchParams(location.search);
	const { specName } = sheetHelpers(esc);
	let sheet,
		guild = [],
		tab = tabs.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'gear',
		guideState = {};

	async function armory() {
		const id = params.get('personaje');
		const mine = await api('/api/armory/characters');
		if (!id || mine.some((c) => c.id === id) || !me.permissions.includes('armory.read')) {
			location.replace(
				id && mine.some((c) => c.id === id)
					? `/perfil?personaje=${encodeURIComponent(id)}#armeria`
					: '/perfil',
			);
			return;
		}
		guild = (await api('/api/armory/characters?scope=guild')).filter(
			(x) => x.user_id !== me.user.id,
		);
		await load(id);
	}
	async function load(id) {
		sheet = await api('/api/armory/characters/' + encodeURIComponent(id));
		const url = new URL(location.href);
		url.searchParams.set('personaje', id);
		url.searchParams.set('tab', tab);
		history.replaceState(null, '', url);
		render();
	}
	function render() {
		const c = sheet.character,
			version = gameVersions[c.game_version];
		$('#content').innerHTML = /* HTML */ `<div class="armory-toolbar">
				<a class="armory-back" href="/roster">← Volver al roster</a>
				<label class="armory-switch"
					>Cambiar de personaje<select id="armory-switch">
						${guild
							.map(
								(x) =>
									`<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)} · ${esc(x.owner_name)}${x.is_main ? ' · Main' : ''}</option>`,
							)
							.join('')}
					</select></label
				>
			</div>
			<section class="armory-head class-${classKey(c.class)}">
				<div class="armory-crest">${ClassIcon({ className: c.class, size: 'large' })}</div>
				<div class="armory-identity">
					<span class="eyebrow"
						>Ficha · ${esc(version?.label || c.game_version)} · Solo lectura</span
					>
					<h1>${esc([c.name, c.surname].filter(Boolean).join(' '))}</h1>
					<p class="armory-line">
						${esc(c.class)} · ${esc(specName(c.class, c.spec) || 'Sin especialización')} ·
						${esc(c.realm || 'Reino sin indicar')}
					</p>
					<p class="armory-owner">
						${userIcon}${
							sheet.owner.linked
								? `Personaje de <strong>${esc(sheet.owner.name)}</strong>`
								: `Registro manual del roster · <strong>${esc(sheet.owner.name)}</strong>`
						}
					</p>
				</div>
				<div class="armory-badges">
					<span class="pill gold">${c.is_main ? 'Main' : 'Alter'}</span>
					<small
						>${c.updated_at ? 'Actualizado ' + esc(dateLabel(c.updated_at)) : 'Sin cambios en la ficha'}</small
					>
				</div>
			</section>
			<nav class="armory-tabs" aria-label="Secciones de la ficha">
				${tabs
					.map(
						([id, label]) =>
							`<button type="button" data-armory-tab="${id}" aria-pressed="${id === tab}">${label}</button>`,
					)
					.join('')}
			</nav>
			<section id="armory-body" class="armory-body"></section>`;
		$('#armory-switch').onchange = (e) => {
			guideState = {};
			void load(e.target.value).catch((error) => toast(error.message));
		};
		document.querySelectorAll('[data-armory-tab]').forEach(
			(b) =>
				(b.onclick = () => {
					tab = b.dataset.armoryTab;
					const url = new URL(location.href);
					url.searchParams.set('tab', tab);
					history.replaceState(null, '', url);
					document
						.querySelectorAll('[data-armory-tab]')
						.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
					renderTab();
				}),
		);
		renderTab();
	}
	function renderTab() {
		const el = $('#armory-body');
		if (tab === 'summary')
			el.innerHTML = `<div class="armory-summary">${factsList(sheet.character, esc)}</div>`;
		if (tab === 'guides') renderGuides(el, sheet, context, guideState);
		if (tab === 'gear') {
			el.innerHTML = paperdoll(sheet, { slotButtons: true });
			el.querySelectorAll('[data-slot]').forEach(
				(b) =>
					(b.onclick = () =>
						openSlotDialog({
							slot: b.dataset.slot,
							sheet,
							canEdit: false,
							ctx: context,
							onSaved: async () => {},
						})),
			);
		}
	}
	return { armory };
}
