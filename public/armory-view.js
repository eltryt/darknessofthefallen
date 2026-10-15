import { ClassIcon } from './components.js';
import { getSpecsForClass, normalizeSpecValue } from './specs.js';
import { classKey } from './roster-ui.js';
import {
	gameVersions,
	slotLabels,
	factions,
	bisStatuses,
	bisContents,
	guideContentTypes,
	itemQualities,
} from './armory-catalog.js';

const boxIcon =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>';
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

export function createArmoryView(context) {
	const { $, api, esc, toast, me, roles, classes } = context;
	const params = new URLSearchParams(location.search);
	let sheet,
		mine = [],
		guild = [],
		tab = params.get('tab') || 'gear',
		listId = null,
		guideSpec = null,
		editingEntry = null;

	const specName = (className, id) => {
		const specs = getSpecsForClass(classKey(className)),
			key = normalizeSpecValue(id || '');
		return Object.hasOwn(specs, key) ? specs[key].name : id || '';
	};
	const specOptions = (className, value) =>
		[
			'<option value="">Sin especificar</option>',
			...Object.entries(getSpecsForClass(classKey(className))).map(
				([id, s]) =>
					`<option value="${esc(id)}" ${normalizeSpecValue(value || '') === id ? 'selected' : ''}>${esc(s.name)}</option>`,
			),
		].join('');
	const options = (items, value, labels = {}) =>
		items
			.map(
				(x) =>
					`<option value="${esc(x)}" ${String(value ?? '') === String(x) ? 'selected' : ''}>${esc(labels[x] || x || 'Sin indicar')}</option>`,
			)
			.join('');
	const note = (heading, detail) =>
		`<div class="empty-note" role="status"><strong>${esc(heading)}</strong><p>${esc(detail)}</p></div>`;

	async function armory() {
		[mine, guild] = await Promise.all([
			api('/api/armory/characters'),
			me.permissions.includes('armory.read')
				? api('/api/armory/characters?scope=guild')
				: Promise.resolve([]),
		]);
		const id = params.get('personaje') || mine.find((c) => c.is_main)?.id || mine[0]?.id;
		if (!id) {
			$('#content').innerHTML =
				context.title(
					'Armería de la hermandad',
					'Tu ficha empieza aquí',
					'Registra un personaje en tu perfil para abrir su ficha, su lista BiS y sus guías.',
				) + '<p><a class="button" href="/perfil">Ir a mi perfil</a></p>';
			return;
		}
		await load(id);
	}
	async function load(id) {
		sheet = await api('/api/armory/characters/' + encodeURIComponent(id));
		listId = sheet.lists.some((l) => l.id === listId) ? listId : sheet.lists[0]?.id || null;
		guideSpec = guideSpec in sheet.guides ? guideSpec : Object.keys(sheet.guides)[0];
		const url = new URL(location.href);
		url.searchParams.set('personaje', id);
		url.searchParams.set('tab', tab);
		history.replaceState(null, '', url);
		render();
	}
	function tabs() {
		return [
			['summary', 'Resumen'],
			['gear', 'Equipamiento'],
			['bis', sheet.canEdit ? 'Mi BiS' : 'Lista BiS'],
			['guides', 'Guías'],
			...(sheet.canReview ? [['reviews', 'Revisiones']] : []),
		];
	}
	function render() {
		const c = sheet.character,
			own = sheet.owner.id === me.user.id,
			version = gameVersions[c.game_version];
		if (!tabs().some(([id]) => id === tab)) tab = 'gear';
		const switcher = [
			mine.length
				? `<optgroup label="Mis personajes">${mine.map((x) => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}${x.is_main ? ' · Main' : ''}</option>`).join('')}</optgroup>`
				: '',
			guild.length
				? `<optgroup label="Miembros de la hermandad">${guild
						.filter((x) => x.user_id !== me.user.id)
						.map(
							(x) =>
								`<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)} · ${esc(x.owner_name)}</option>`,
						)
						.join('')}</optgroup>`
				: '',
		].join('');
		$('#content').innerHTML = /* HTML */ `<div class="armory-toolbar">
				<a class="armory-back" href="${own ? '/perfil' : '/panel'}"
					>← ${own ? 'Volver a mi perfil' : 'Volver al panel'}</a
				>
				<label class="armory-switch"
					>Cambiar de personaje<select id="armory-switch">
						${switcher}
					</select></label
				>
			</div>
			<section class="armory-head class-${classKey(c.class)}">
				<div class="armory-crest">${ClassIcon({ className: c.class, size: 'large' })}</div>
				<div class="armory-identity">
					<span class="eyebrow">Armería · ${esc(version?.label || c.game_version)}</span>
					<h1>${esc([c.name, c.surname].filter(Boolean).join(' '))}</h1>
					<p class="armory-line">
						${esc(c.class)} · ${esc(specName(c.class, c.spec) || 'Sin especialización')} ·
						${esc(c.realm || 'Reino sin indicar')}
					</p>
					<p class="armory-meta">
						${esc(c.race || 'Raza sin indicar')} · ${esc(c.faction || 'Facción sin indicar')} ·
						${c.level ? 'Nivel ' + esc(c.level) : 'Nivel sin indicar'}
					</p>
					<p class="armory-owner">
						${userIcon}${
							sheet.owner.linked
								? `Vinculado al perfil de Discord de <strong>${esc(sheet.owner.name)}</strong>`
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
				${tabs()
					.map(
						([id, label]) =>
							`<button type="button" data-armory-tab="${id}" aria-pressed="${id === tab}">${label}</button>`,
					)
					.join('')}
			</nav>
			<section id="armory-body" class="armory-body"></section>`;
		$('#armory-switch').onchange = (e) => {
			listId = null;
			guideSpec = null;
			editingEntry = null;
			void load(e.target.value).catch((error) => toast(error.message));
		};
		document.querySelectorAll('[data-armory-tab]').forEach(
			(b) =>
				(b.onclick = () => {
					tab = b.dataset.armoryTab;
					editingEntry = null;
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
		({ summary, gear, bis, guides, reviews })[tab](el);
	}

	function summary(el) {
		const c = sheet.character,
			version = gameVersions[c.game_version];
		const rows = [
			['Versión del juego', version?.label || c.game_version],
			['Reino o servidor', c.realm],
			['Región', c.region],
			['Facción', c.faction],
			['Raza', c.race],
			['Clase', c.class],
			['Especialización principal', specName(c.class, c.spec)],
			['Especialización secundaria', specName(c.class, c.secondary_spec)],
			['Rol de combate', c.role],
			['Nivel', c.level],
			['Profesiones', c.professions],
			['Tipo', c.is_main ? 'Personaje principal' : 'Personaje secundario'],
			['Origen de los datos', c.synced_at ? 'Proveedor externo' : 'Introducidos manualmente'],
		];
		el.innerHTML = /* HTML */ `<div class="armory-summary">
				<dl class="armory-facts">
					${rows
						.map(
							([k, v]) =>
								`<div><dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span class="muted">Sin indicar</span>'}</dd></div>`,
						)
						.join('')}
				</dl>
				${
					sheet.canEdit && c.notes
						? `<div class="card"><h3>Mis notas personales</h3><p>${esc(c.notes)}</p></div>`
						: ''
				}
			</div>
			${sheet.canEdit ? sheetForm(c) : ''}`;
		if (!sheet.canEdit) return;
		const f = $('#armory-sheet');
		const races = () => {
			const v = gameVersions[f.elements.game_version.value],
				faction = f.elements.faction.value;
			const current = f.elements.race.value;
			f.elements.race.innerHTML = options(
				['', ...Object.keys(v.races).filter((r) => !faction || v.races[r] === faction)],
				current,
			);
			f.elements.region.innerHTML = options(['', ...v.regions], f.elements.region.value);
		};
		f.elements.faction.onchange = races;
		f.elements.game_version.onchange = races;
		f.elements.race.onchange = () => {
			const v = gameVersions[f.elements.game_version.value];
			if (f.elements.race.value) f.elements.faction.value = v.races[f.elements.race.value];
		};
		f.elements.class.onchange = () => {
			f.elements.spec.innerHTML = specOptions(f.elements.class.value, '');
			f.elements.secondary_spec.innerHTML = specOptions(f.elements.class.value, '');
		};
		f.onsubmit = async (e) => {
			e.preventDefault();
			const button = f.querySelector('button[type=submit]');
			button.disabled = true;
			try {
				const v = Object.fromEntries(new FormData(f));
				await api('/api/characters/' + encodeURIComponent(c.id), 'PATCH', {
					...v,
					level: v.level === '' ? null : Number(v.level),
				});
				toast('Ficha actualizada');
				await load(c.id);
			} catch (error) {
				toast(error.message);
			} finally {
				button.disabled = false;
			}
		};
	}
	function sheetForm(c) {
		const version = gameVersions[c.game_version] || Object.values(gameVersions)[0];
		const raceList = Object.keys(version.races).filter(
			(r) => !c.faction || version.races[r] === c.faction,
		);
		return /* HTML */ `<form id="armory-sheet" class="card form armory-form">
			<h2>Datos de la ficha</h2>
			<p>Los datos que todavía no conozcas pueden quedar vacíos.</p>
			<div class="form-grid">
				<label>Nombre<input name="name" required maxlength="40" value="${esc(c.name)}" /></label>
				<label>Apellido<input name="surname" maxlength="40" value="${esc(c.surname)}" /></label>
				<label
					>Versión del juego<select name="game_version">
						${options(Object.keys(gameVersions), c.game_version, Object.fromEntries(Object.entries(gameVersions).map(([k, v]) => [k, v.label])))}
					</select></label
				>
				<label>Reino o servidor<input name="realm" maxlength="60" value="${esc(c.realm)}" /></label>
				<label
					>Región<select name="region">
						${options(['', ...version.regions], c.region)}
					</select></label
				>
				<label
					>Facción<select name="faction">
						${options(['', ...factions], c.faction)}
					</select></label
				>
				<label
					>Raza<select name="race">
						${options(['', ...raceList], c.race)}
					</select></label
				>
				<label
					>Clase<select name="class" required>
						${options(classes, c.class)}
					</select></label
				>
				<label
					>Especialización principal<select name="spec">
						${specOptions(c.class, c.spec)}
					</select></label
				>
				<label
					>Especialización secundaria<select name="secondary_spec">
						${specOptions(c.class, c.secondary_spec)}
					</select></label
				>
				<label
					>Rol de combate<select name="role" required>
						${options(roles, c.role)}
					</select></label
				>
				<label
					>Nivel<input
						name="level"
						type="number"
						min="1"
						max="${version.maxLevel || 100}"
						value="${c.level ?? ''}"
				/></label>
				<label class="wide"
					>Profesiones<input name="professions" maxlength="160" value="${esc(c.professions)}"
				/></label>
			</div>
			${
				version.provisional
					? '<p class="notice">Las razas y ranuras de WoW Forever son provisionales hasta confirmarlas con una fuente oficial; no se aplican restricciones de raza y clase.</p>'
					: ''
			}
			<button type="submit">Guardar ficha</button>
		</form>`;
	}

	function gear(el) {
		const c = sheet.character,
			version = gameVersions[c.game_version],
			items = new Map(sheet.equipment.map((row) => [row.slot, row]));
		el.innerHTML = /* HTML */ `<div class="gear-grid">
				${(version?.slots || [])
					.map((slot) => {
						const item = items.get(slot);
						return `<article class="gear-slot ${item ? 'quality-' + esc(item.quality || 'none') : 'is-empty'}"><span class="gear-icon">${boxIcon}</span><div><strong>${esc(slotLabels[slot] || slot)}</strong>${
							item
								? `<span class="gear-item">${esc(item.item_name || 'Objeto sin nombre')}</span><small>${[item.item_level ? 'Nivel de objeto ' + item.item_level : '', item.quality ? itemQualities[item.quality] || item.quality : '', item.enchant ? 'Encantamiento: ' + item.enchant : '', item.gems?.length ? item.gems.length + ' gemas' : '', item.origin === 'provider' ? 'Proveedor ' + item.provider : 'Manual'].filter(Boolean).map(esc).join(' · ')}</small>`
								: '<small>Sin datos</small>'
						}</div></article>`;
					})
					.join('')}
			</div>
			${note(
				sheet.equipment.length
					? 'Equipamiento registrado'
					: 'Todavía no hay equipamiento registrado',
				'Las ranuras se completarán cuando exista una fuente fiable: introducción manual o un proveedor compatible con WoW Forever. No se muestran objetos de ejemplo.',
			)}`;
	}

	function bis(el) {
		const c = sheet.character,
			version = gameVersions[c.game_version],
			list = sheet.lists.find((l) => l.id === listId);
		const listLabel = (l) =>
			[l.title || specName(c.class, l.spec) || 'Toda la clase', l.content, l.phase]
				.filter(Boolean)
				.join(' · ');
		el.innerHTML = /* HTML */ `${
			sheet.lists.length
				? `<div class="bis-lists" role="group" aria-label="Listas BiS">${sheet.lists.map((l) => `<button type="button" class="secondary" data-bis-list="${esc(l.id)}" aria-pressed="${l.id === listId}">${esc(listLabel(l))}</button>`).join('')}</div>`
				: note(
						sheet.canEdit ? 'Tu lista BiS está vacía' : 'Este personaje no tiene lista BiS',
						sheet.canEdit
							? 'Crea una lista por especialización, contenido y fase. Empieza vacía: añade los objetos cuando tengas información fiable de WoW Forever.'
							: 'El jugador todavía no ha preparado su equipamiento objetivo.',
					)
		}
		${list ? bisList(list, version) : ''} ${sheet.canEdit ? newListForm(c) : ''}`;
		document.querySelectorAll('[data-bis-list]').forEach(
			(b) =>
				(b.onclick = () => {
					listId = b.dataset.bisList;
					editingEntry = null;
					bis(el);
				}),
		);
		bindBis(el, c);
	}
	function bisList(list, version) {
		const c = sheet.character;
		const bySlot = (slot) => list.entries.filter((e) => e.slot === slot);
		const entry = (e) =>
			`<li class="bis-entry ${e.is_primary ? 'is-primary' : ''}"><div class="bis-entry-main">${e.is_primary ? '<span class="bis-badge">BiS</span>' : '<span class="bis-badge alt">Alt.</span>'}<strong>${esc(e.item_name)}</strong><span class="pill">${esc(e.status)}</span><span class="bis-priority" title="Prioridad personal">P${e.priority}</span></div>${e.source || e.boss ? `<small>${esc([e.source, e.boss].filter(Boolean).join(' · '))}</small>` : ''}${e.notes ? `<p class="bis-notes"><span>Nota del jugador:</span> ${esc(e.notes)}</p>` : ''}${sheet.canEdit ? `<div class="actions"><button type="button" class="secondary" data-bis-edit="${esc(e.id)}">Editar</button><button type="button" class="secondary danger" data-bis-delete="${esc(e.id)}">Quitar</button></div>` : ''}</li>`;
		return /* HTML */ `<div class="bis-head">
				<div>
					<h2>${esc(list.title || 'Lista BiS')}</h2>
					<p>
						${esc(specName(c.class, list.spec) || 'Toda la clase')} ·
						${esc(list.content)}${list.phase ? ' · ' + esc(list.phase) : ''} · Actualizada
						${esc(dateLabel(list.updated_at))}
					</p>
				</div>
				${
					sheet.canEdit
						? `<button type="button" class="secondary danger" data-bis-delete-list="${esc(list.id)}">Borrar lista</button>`
						: ''
				}
			</div>
			<div class="bis-grid">
				${(version?.slots || [])
					.map((slot) => {
						const entries = bySlot(slot);
						return `<section class="bis-slot ${entries.length ? '' : 'is-empty'}"><header><span class="gear-icon">${boxIcon}</span><h3>${esc(slotLabels[slot] || slot)}</h3><span class="bis-count">${entries.length || 'Sin objetivo'}</span></header>${entries.length ? `<ul>${entries.map(entry).join('')}</ul>` : ''}</section>`;
					})
					.join('')}
			</div>
			${sheet.canEdit ? entryForm(list, version) : ''}`;
	}
	function entryForm(list, version) {
		const e = list.entries.find((x) => x.id === editingEntry) || {};
		return /* HTML */ `<form id="bis-entry" class="card form">
			<h3>${e.id ? 'Editar objeto' : 'Añadir objeto a la lista'}</h3>
			<p>
				Escribe el objeto tal como lo conoces. Varios objetos en la misma ranura se guardan como
				candidatos; marca uno como BiS principal.
			</p>
			<div class="form-grid">
				<label
					>Ranura<select name="slot" required>
						${options(version.slots, e.slot, slotLabels)}
					</select></label
				>
				<label
					>Objeto deseado<input
						name="item_name"
						required
						maxlength="120"
						value="${esc(e.item_name)}"
				/></label>
				<label
					>Identificador del objeto (opcional)<input
						name="item_id"
						maxlength="40"
						pattern="[A-Za-z0-9_:-]+"
						value="${esc(e.item_id)}"
				/></label>
				<label
					>Fuente<input
						name="source"
						maxlength="120"
						placeholder="Banda, mazmorra, profesión…"
						value="${esc(e.source)}"
				/></label>
				<label>Jefe<input name="boss" maxlength="120" value="${esc(e.boss)}" /></label>
				<label
					>Prioridad personal<select name="priority">
						${options(['1', '2', '3', '4', '5'], String(e.priority || 3), {
							1: '1 · Máxima',
							5: '5 · Mínima',
						})}
					</select></label
				>
				<label
					>Estado<select name="status">
						${options(bisStatuses, e.status || 'Pendiente')}
					</select></label
				>
				<label class="armory-check"
					><input type="checkbox" name="is_primary" ${e.is_primary ? 'checked' : ''} />BiS principal
					de la ranura</label
				>
				<label class="wide"
					>Notas del jugador<textarea name="notes" maxlength="1000">${esc(e.notes)}</textarea>
				</label>
			</div>
			<div class="actions">
				<button type="submit">${e.id ? 'Guardar cambios' : 'Añadir a la lista'}</button>${
					e.id ? '<button type="button" class="secondary" data-bis-cancel>Cancelar</button>' : ''
				}
			</div>
		</form>`;
	}
	function newListForm(c) {
		return /* HTML */ `<details class="card armory-new-list" ${sheet.lists.length ? '' : 'open'}>
			<summary>Crear una lista BiS</summary>
			<form id="bis-new-list" class="form">
				<div class="form-grid">
					<label
						>Especialización<select name="spec">
							${specOptions(c.class, c.spec)}
						</select></label
					>
					<label
						>Contenido<select name="content">
							${options(bisContents, 'General')}
						</select></label
					>
					<label
						>Fase o temporada<input name="phase" maxlength="40" placeholder="Opcional"
					/></label>
					<label>Título<input name="title" maxlength="80" placeholder="Opcional" /></label>
				</div>
				<button type="submit">Crear lista vacía</button>
			</form>
		</details>`;
	}
	function bindBis(el, c) {
		const run = async (fn, message) => {
			try {
				await fn();
				if (message) toast(message);
				await load(c.id);
			} catch (error) {
				toast(error.message);
			}
		};
		const newList = $('#bis-new-list');
		if (newList)
			newList.onsubmit = (e) => {
				e.preventDefault();
				const v = Object.fromEntries(new FormData(newList));
				void run(async () => {
					listId = (
						await api(`/api/armory/characters/${encodeURIComponent(c.id)}/bis-lists`, 'POST', v)
					).id;
				}, 'Lista creada');
			};
		const form = $('#bis-entry');
		if (form)
			form.onsubmit = (e) => {
				e.preventDefault();
				const v = Object.fromEntries(new FormData(form));
				const payload = { ...v, priority: Number(v.priority), is_primary: !!v.is_primary };
				void run(async () => {
					await (editingEntry
						? api('/api/armory/bis-entries/' + encodeURIComponent(editingEntry), 'PATCH', payload)
						: api(`/api/armory/bis-lists/${encodeURIComponent(listId)}/entries`, 'POST', payload));
					editingEntry = null;
				}, 'Lista actualizada');
			};
		el.querySelector('[data-bis-cancel]')?.addEventListener('click', () => {
			editingEntry = null;
			bis(el);
		});
		el.querySelectorAll('[data-bis-edit]').forEach(
			(b) =>
				(b.onclick = () => {
					editingEntry = b.dataset.bisEdit;
					bis(el);
					$('#bis-entry').scrollIntoView({ block: 'center' });
				}),
		);
		el.querySelectorAll('[data-bis-delete]').forEach(
			(b) =>
				(b.onclick = () => {
					if (confirm('¿Quitar este objeto de la lista?'))
						void run(
							() =>
								api(
									'/api/armory/bis-entries/' + encodeURIComponent(b.dataset.bisDelete),
									'DELETE',
									{},
								),
							'Objeto retirado',
						);
				}),
		);
		el.querySelector('[data-bis-delete-list]')?.addEventListener('click', (e) => {
			if (confirm('¿Borrar esta lista BiS y todos sus objetos? No se puede deshacer.'))
				void run(async () => {
					await api(
						'/api/armory/bis-lists/' + encodeURIComponent(e.target.dataset.bisDeleteList),
						'DELETE',
						{},
					);
					listId = null;
				}, 'Lista borrada');
		});
	}

	function guides(el) {
		const c = sheet.character,
			specs = Object.keys(sheet.guides),
			providers = sheet.guides[guideSpec] || [];
		const any = providers.some((p) => p.sections.some((s) => s.links.length));
		el.innerHTML = /* HTML */ `${
				specs.length > 1
					? `<div class="bis-lists" role="group" aria-label="Especialización">${specs.map((s) => `<button type="button" class="secondary" data-guide-spec="${esc(s)}" aria-pressed="${s === guideSpec}">${esc(specName(c.class, s) || 'Toda la clase')}</button>`).join('')}</div>`
					: ''
			}
			<p class="notice">
				Solo se muestran enlaces comprobados por la hermandad para ${esc(c.class)}
				${guideSpec ? esc(specName(c.class, guideSpec)) : ''} en
				${esc(gameVersions[c.game_version]?.label || c.game_version)}. Se abren en la web original;
				aquí no se copia su contenido.
			</p>
			${
				any
					? ''
					: note(
							'Aún no hay guías verificadas para esta combinación',
							'Ningún proveedor tiene todavía un enlace comprobado compatible con esta clase, especialización y versión. Los enlaces se añaden desde Panel → Guías externas.',
						)
			}
			<div class="guide-grid">
				${providers
					.map(
						(p) =>
							`<section class="guide-provider"><header><h3>${esc(p.name)}</h3><a href="${esc(p.homepage)}" target="_blank" rel="noopener noreferrer">Web ↗</a></header><ul>${p.sections
								.map(
									(s) =>
										`<li><span>${esc(guideContentTypes[s.type])}</span>${
											s.links.length
												? s.links
														.map(
															(l) =>
																`<a class="guide-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${l.phase ? esc(l.phase) : 'Abrir'} ↗</a>`,
														)
														.join('')
												: '<em>No disponible</em>'
										}</li>`,
								)
								.join('')}</ul></section>`,
					)
					.join('')}
			</div>
			${
				me.permissions.includes('armory.configure')
					? '<p><a class="button secondary" href="/panel?tab=guides">Gestionar enlaces de guías</a></p>'
					: ''
			}`;
		el.querySelectorAll('[data-guide-spec]').forEach(
			(b) =>
				(b.onclick = () => {
					guideSpec = b.dataset.guideSpec;
					guides(el);
				}),
		);
	}

	function reviews(el) {
		const c = sheet.character;
		el.innerHTML = /* HTML */ `<p class="notice">
				Revisión de equipamiento · Solo visible para Oficiales y Líder. Las notas internas no se
				muestran al jugador y son distintas de sus notas personales.
			</p>
			<div class="review-layout">
				<section>
					<h2>Revisiones</h2>
					${
						sheet.reviews.length
							? `<ul class="review-list">${sheet.reviews
									.map(
										(r) =>
											`<li class="card"><div class="review-head"><span class="pill ${r.status === 'Completada' ? 'gold' : ''}">${esc(r.status)}</span><small>Iniciada por ${esc(r.reviewer_name)} · ${esc(dateLabel(r.created_at))}</small></div>${r.summary ? `<p>${esc(r.summary)}</p>` : ''}${r.completed_at ? `<small>Completada por ${esc(r.completed_by_name)} · ${esc(dateLabel(r.completed_at))}</small>` : `<button type="button" class="secondary" data-review-complete="${esc(r.id)}">Marcar como completada</button>`}</li>`,
									)
									.join('')}</ul>`
							: note(
									'Sin revisiones todavía',
									'Consulta la lista BiS y las guías, y registra aquí tu valoración. La aplicación no decide si una lista es correcta.',
								)
					}
					<form id="review-new" class="card form">
						<label class="wide"
							>Valoración de la revisión<textarea
								name="summary"
								maxlength="2000"
								placeholder="Qué has comparado y qué recomiendas"
							></textarea>
						</label>
						<button type="submit">Iniciar revisión</button>
					</form>
				</section>
				<section>
					<h2>Notas internas</h2>
					${
						sheet.notes.length
							? `<ul class="review-list">${sheet.notes
									.map(
										(n) =>
											`<li class="card"><p>${esc(n.body)}</p><div class="review-head"><small>${esc(n.author_name)} · ${esc(dateLabel(n.created_at))}</small>${n.author_id === me.user.id || me.permissions.includes('armory.configure') ? `<button type="button" class="secondary danger" data-note-delete="${esc(n.id)}">Retirar</button>` : ''}</div></li>`,
									)
									.join('')}</ul>`
							: note(
									'Sin notas internas',
									'Las notas sobre la planificación del equipamiento aparecerán aquí.',
								)
					}
					<form id="note-new" class="card form">
						<label class="wide"
							>Nueva nota interna<textarea name="body" maxlength="2000" required></textarea>
						</label>
						<button type="submit">Guardar nota</button>
					</form>
				</section>
			</div>`;
		const run = async (fn, message) => {
			try {
				await fn();
				toast(message);
				await load(c.id);
			} catch (error) {
				toast(error.message);
			}
		};
		$('#review-new').onsubmit = (e) => {
			e.preventDefault();
			void run(
				() =>
					api(
						`/api/armory/characters/${encodeURIComponent(c.id)}/reviews`,
						'POST',
						Object.fromEntries(new FormData(e.target)),
					),
				'Revisión registrada',
			);
		};
		$('#note-new').onsubmit = (e) => {
			e.preventDefault();
			void run(
				() =>
					api(
						`/api/armory/characters/${encodeURIComponent(c.id)}/notes`,
						'POST',
						Object.fromEntries(new FormData(e.target)),
					),
				'Nota guardada',
			);
		};
		el.querySelectorAll('[data-review-complete]').forEach(
			(b) =>
				(b.onclick = () =>
					void run(
						() =>
							api('/api/armory/reviews/' + encodeURIComponent(b.dataset.reviewComplete), 'PATCH', {
								status: 'Completada',
							}),
						'Revisión completada',
					)),
		);
		el.querySelectorAll('[data-note-delete]').forEach(
			(b) =>
				(b.onclick = () => {
					if (confirm('¿Retirar esta nota interna?'))
						void run(
							() =>
								api('/api/armory/notes/' + encodeURIComponent(b.dataset.noteDelete), 'DELETE', {}),
							'Nota retirada',
						);
				}),
		);
	}
	return { armory };
}
