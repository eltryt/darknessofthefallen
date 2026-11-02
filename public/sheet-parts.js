import { getSpecsForClass, normalizeSpecValue } from './specs.js';
import { classKey } from './roster-ui.js';
import {
	gameVersions,
	slotLabels,
	factions,
	raceFactions,
	itemQualities,
	catalogGroup,
} from './armory-catalog.js';
import { attachCatalogPicker } from './item-catalog.js';

// Pieces of the character sheet shared by the profile (owner) and the
// read-only sheet that management ranks open from the roster.
export function sheetHelpers(esc) {
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
	return { specName, specOptions, options, note };
}

export function sheetFacts(c, esc) {
	const { specName } = sheetHelpers(esc),
		version = gameVersions[c.game_version];
	return [
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
		['Tipo', c.is_main ? 'Main (personaje principal)' : 'Alter (personaje secundario)'],
		['Origen de los datos', c.synced_at ? 'Proveedor externo' : 'Introducidos manualmente'],
	];
}

export function factsList(c, esc) {
	return `<dl class="armory-facts">${sheetFacts(c, esc)
		.map(
			([k, v]) =>
				`<div><dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span class="muted">Sin indicar</span>'}</dd></div>`,
		)
		.join('')}</dl>`;
}

// Owner-only form for the sheet fields; the API also checks ownership.
export function sheetForm(c, { esc, roles, classes }) {
	const { specOptions, options } = sheetHelpers(esc);
	const version = gameVersions[c.game_version] || Object.values(gameVersions)[0];
	const raceList = Object.keys(version.races).filter(
		(r) => !c.faction || raceFactions(version, r).includes(c.faction),
	);
	return /* HTML */ `<form id="armory-sheet" class="form armory-form">
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
			<label class="wide"
				>Disponibilidad<input name="availability" maxlength="300" value="${esc(c.availability)}"
			/></label>
			<label class="wide"
				>Notas personales<textarea name="notes" maxlength="1000">${esc(c.notes)}</textarea>
			</label>
		</div>
		${
			version.provisional
				? '<p class="notice">Las razas y ranuras de WoW Forever son provisionales hasta confirmarlas con una fuente oficial; no se aplican restricciones de raza y clase.</p>'
				: ''
		}
		<button type="submit">Guardar ficha</button>
	</form>`;
}

export function bindSheetForm(f, c, { api, toast, esc }, done) {
	const { specOptions, options } = sheetHelpers(esc);
	const races = () => {
		const v = gameVersions[f.elements.game_version.value],
			faction = f.elements.faction.value,
			current = f.elements.race.value;
		f.elements.race.innerHTML = options(
			['', ...Object.keys(v.races).filter((r) => !faction || raceFactions(v, r).includes(faction))],
			current,
		);
		f.elements.region.innerHTML = options(['', ...v.regions], f.elements.region.value);
	};
	f.elements.faction.onchange = races;
	f.elements.game_version.onchange = races;
	f.elements.race.onchange = () => {
		const v = gameVersions[f.elements.game_version.value];
		if (!f.elements.race.value) return;
		// A neutral race keeps the chosen faction; a single-faction race sets it.
		const allowed = raceFactions(v, f.elements.race.value);
		if (!allowed.includes(f.elements.faction.value))
			f.elements.faction.value = allowed.length === 1 ? allowed[0] : '';
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
			await done();
		} catch (error) {
			toast(error.message);
		} finally {
			button.disabled = false;
		}
	};
}

// Guide links for the character's class and specialisations, one card per site and one
// clickable tile per guide. Sites without links for this spec are named in a single line.
const guideTiles = {
	general: [
		'Guía general',
		'Resumen y claves de la especialización',
		'<path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2Z"/><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2Z"/>',
	],
	leveling: [
		'Subida de nivel',
		'Cómo subir del 1 al 60',
		'<path d="M12 20V5M6 11l6-6 6 6"/><path d="M5 20h14"/>',
	],
	talents: [
		'Talentos',
		'Builds de talentos recomendadas',
		'<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v5M12 12l-6 5M12 12l6 5"/>',
	],
	rotation: [
		'Rotación',
		'Prioridades y cooldowns',
		'<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
	],
	bis: [
		'Lista BiS',
		'El mejor equipo de cada fase',
		'<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6Z"/><path d="m12 8 1.2 2.5 2.8.4-2 1.9.5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-1.9 2.8-.4Z"/>',
	],
	gear: ['Equipamiento', 'Equipo recomendado', '<path d="M8 3h8l3 4-2 2v11H7V9L5 7Z"/>'],
	stats: ['Estadísticas', 'Qué estadística priorizar', '<path d="M5 20V10M12 20V4M19 20v-7"/>'],
	consumables: [
		'Consumibles',
		'Encantamientos, pociones y comida',
		'<path d="M10 3h4M11 3v5l-5 9a2 2 0 0 0 1.8 3h8.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M8 15h8"/>',
	],
};
const guideOrder = [
	'general',
	'leveling',
	'talents',
	'rotation',
	'bis',
	'gear',
	'stats',
	'consumables',
];
const guideBadges = { wowhead: 'W', 'icy-veins': 'IV', archon: 'A' };
export function renderGuides(el, sheet, { esc, me }, state = {}) {
	const { specName, note } = sheetHelpers(esc);
	const c = sheet.character,
		specs = Object.keys(sheet.guides);
	if (!(state.spec in sheet.guides)) state.spec = specs[0];
	const providers = sheet.guides[state.spec] || [];
	// Each link becomes a tile; the leveling guide is the general guide's "Subida de nivel" phase.
	const tilesOf = (p) =>
		p.sections
			.flatMap((s) =>
				s.links.map((l) => {
					const kind = s.type === 'general' && l.phase === 'Subida de nivel' ? 'leveling' : s.type;
					const [title, hint, icon] = guideTiles[kind];
					return {
						kind,
						url: l.url,
						title: l.phase && kind !== 'leveling' ? `${title} · ${l.phase}` : title,
						hint,
						icon,
					};
				}),
			)
			.sort((a, b) => guideOrder.indexOf(a.kind) - guideOrder.indexOf(b.kind));
	const withLinks = providers
		.map((p) => ({ ...p, tiles: tilesOf(p) }))
		.filter((p) => p.tiles.length);
	const without = providers.filter((p) => !withLinks.some((w) => w.id === p.id));
	const version = esc(gameVersions[c.game_version]?.label || c.game_version);
	el.innerHTML = /* HTML */ `${
			specs.length > 1
				? `<div class="bis-lists" role="group" aria-label="Especialización">${specs.map((s) => `<button type="button" class="secondary" data-guide-spec="${esc(s)}" aria-pressed="${s === state.spec}">${esc(specName(c.class, s) || 'Toda la clase')}</button>`).join('')}</div>`
				: ''
		}
		${
			withLinks.length
				? `<div class="guide-board">${withLinks
						.map(
							(p) =>
								/* HTML */ `<section class="guide-source is-${esc(p.id)}">
									<header>
										<span class="guide-badge" aria-hidden="true"
											>${esc(guideBadges[p.id] || p.name.slice(0, 1))}</span
										>
										<div>
											<h3>${esc(p.name)}</h3>
											<small
												>${p.tiles.length} ${p.tiles.length === 1 ? 'guía' : 'guías'} ·
												${version}</small
											>
										</div>
										<a
											class="guide-home"
											href="${esc(p.homepage)}"
											target="_blank"
											rel="noopener noreferrer"
											>Web ↗</a
										>
									</header>
									<div class="guide-tiles">
										${p.tiles
											.map(
												(t) =>
													`<a class="guide-tile" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${t.icon}</svg><span><strong>${esc(t.title)}</strong><small>${esc(t.hint)}</small></span><span class="guide-go" aria-hidden="true">↗</span></a>`,
											)
											.join('')}
									</div>
								</section>`,
						)
						.join('')}</div>`
				: note(
						'Aún no hay guías para esta combinación',
						'Ningún sitio tiene todavía guías de esta clase y especialización en esta versión. El Líder puede añadirlas desde Panel → Guías externas.',
					)
		}
		<p class="guide-foot">
			Guías de ${esc(c.class)} ${state.spec ? esc(specName(c.class, state.spec)) : ''} para
			${version}. Se abren en la web original; aquí no se copia su
			contenido.${
				without.length && withLinks.length
					? ` Sin guías de Forever todavía: ${without.map((p) => esc(p.name)).join(', ')}.`
					: ''
			}
			${
				me.permissions.includes('armory.configure')
					? '<a href="/panel?tab=guides">Gestionar enlaces</a>'
					: ''
			}
		</p>`;
	el.querySelectorAll('[data-guide-spec]').forEach(
		(b) =>
			(b.onclick = () => {
				state.spec = b.dataset.guideSpec;
				renderGuides(el, sheet, { esc, me }, state);
			}),
	);
}

// Contextual panel for one equipment slot. Viewing is the default; only the
// owner gets the entry form: pick the item from the Classic catalogue (Blizzard API,
// orientative for Forever) or type it by hand as it appears in the game.
export function openSlotDialog({ slot, sheet, wishes = [], canEdit, ctx, onSaved }) {
	const { esc, api, toast } = ctx;
	const label = slotLabels[slot] || slot,
		item = sheet.equipment.find((e) => e.slot === slot) || null,
		goals = wishes.filter((w) => w.data.slot === slot && w.data.status !== 'Pasar'),
		provider = item?.origin === 'provider';
	const dialog = document.createElement('dialog');
	dialog.className = 'slot-dialog';
	dialog.setAttribute('aria-labelledby', 'slot-dialog-title');
	const qualityOptions = ['', ...Object.keys(itemQualities)]
		.map(
			(q) =>
				`<option value="${q}" ${q === (item?.quality || '') ? 'selected' : ''}>${q ? esc(itemQualities[q]) : 'Sin indicar'}</option>`,
		)
		.join('');
	dialog.innerHTML = /* HTML */ `<form method="dialog" class="slot-dialog-close">
			<button type="submit" class="icon-button" aria-label="Cerrar">×</button>
		</form>
		<span class="eyebrow">Hueco de equipo</span>
		<h2 id="slot-dialog-title">${esc(label)}</h2>
		<section class="slot-current quality-${esc(item?.quality || 'none')}">
			<h3>Equipado ahora</h3>
			${
				item
					? `<p class="slot-item"><strong>${esc(item.item_name)}</strong>${item.quality ? `<span class="pill">${esc(itemQualities[item.quality] || item.quality)}</span>` : ''}${item.item_level ? `<span class="pill">Nivel ${esc(item.item_level)}</span>` : ''}</p>${item.enchant ? `<p>Encantamiento: ${esc(item.enchant)}</p>` : ''}${item.source_label ? `<p>Origen: ${esc(item.source_label)}</p>` : ''}<p class="muted">${provider ? 'Dato de un proveedor externo.' : 'Introducido a mano por el jugador.'}</p>`
					: '<p class="muted">Sin datos para este hueco.</p>'
			}
		</section>
		${
			goals.length
				? `<section class="slot-goals"><h3>Objetivo en la wishlist</h3><ul>${goals.map((g) => `<li><strong>${esc(g.data.item)}</strong> <span class="pill ${g.data.status === 'BiS' ? 'gold' : ''}">${esc(g.data.status || 'Me interesa')}</span>${g.data.obtained ? ' <span class="pill">Conseguido</span>' : ''}${g.data.boss ? `<small>${esc(g.data.boss)}${g.data.raid ? ' · ' + esc(g.data.raid) : ''}</small>` : ''}</li>`).join('')}</ul></section>`
				: ''
		}
		${
			canEdit && !provider
				? /* HTML */ `<form class="form slot-edit">
						<h3>${item ? 'Cambiar objeto' : 'Registrar objeto'}</h3>
						<div class="catalog-picker" data-catalog hidden>
							<label
								>Buscar en el catálogo<input
									type="search"
									data-catalog-search
									placeholder="Escribe parte del nombre…"
									autocomplete="off"
							/></label>
							<ul class="catalog-results" data-catalog-results></ul>
							<div class="catalog-choice" data-catalog-choice></div>
							<p class="catalog-note">
								Objetos de WoW Classic desde la API de Blizzard: orientativos hasta que haya datos
								oficiales de Forever. Si tu objeto no aparece, escríbelo a mano.
							</p>
						</div>
						<input type="hidden" name="item_id" value="${esc(item?.item_id || '')}" />
						<input type="hidden" name="icon" value="${esc(item?.item_id ? item.icon || '' : '')}" />
						<input
							type="hidden"
							name="stats"
							value="${esc(JSON.stringify(item?.item_id ? item.stats || {} : {}))}"
						/>
						<div class="form-grid">
							<label class="wide"
								>Nombre del objeto<input
									name="item_name"
									required
									maxlength="160"
									list="slot-known-items"
									value="${esc(item?.item_name || '')}"
							/></label>
							<datalist id="slot-known-items">
								${goals.map((g) => `<option value="${esc(g.data.item)}"></option>`).join('')}
							</datalist>
							<label
								>Calidad<select name="quality">
									${qualityOptions}
								</select></label
							>
							<label
								>Nivel de objeto<input
									name="item_level"
									type="number"
									min="1"
									max="1000"
									value="${item?.item_level ?? ''}"
							/></label>
							<label
								>Encantamiento<input
									name="enchant"
									maxlength="120"
									value="${esc(item?.enchant || '')}"
							/></label>
							<label
								>Dónde se consiguió<input
									name="source_label"
									maxlength="120"
									value="${esc(item?.source_label || '')}"
							/></label>
						</div>
						<div class="slot-actions">
							<button type="submit">Guardar</button>
							${item ? '<button type="button" class="secondary danger" data-slot-clear>Vaciar hueco</button>' : ''}
						</div>
					</form>`
				: canEdit
					? '<p class="notice">Este hueco lo actualiza un proveedor de datos y no se edita a mano.</p>'
					: '<p class="muted">Solo el propietario del personaje puede cambiar su equipo.</p>'
		}`;
	document.body.append(dialog);
	const opener = document.activeElement;
	dialog.addEventListener('close', () => {
		dialog.remove();
		opener?.focus?.();
	});
	dialog.addEventListener('click', (e) => {
		if (e.target === dialog) dialog.close();
	});
	const url = `/api/armory/characters/${encodeURIComponent(sheet.character.id)}/equipment/${slot}`;
	const form = dialog.querySelector('.slot-edit');
	if (form)
		attachCatalogPicker(dialog.querySelector('[data-catalog]'), form, catalogGroup(slot), esc);
	if (form)
		form.onsubmit = async (e) => {
			e.preventDefault();
			const button = form.querySelector('button[type=submit]');
			button.disabled = true;
			try {
				await api(url, 'PUT', Object.fromEntries(new FormData(form)));
				toast(`${label} actualizado`);
				dialog.close();
				await onSaved();
			} catch (error) {
				toast(error.message);
				button.disabled = false;
			}
		};
	dialog.querySelector('[data-slot-clear]')?.addEventListener('click', async () => {
		if (!confirm(`¿Vaciar el hueco ${label}?`)) return;
		try {
			await api(url, 'DELETE', {});
			toast(`${label} vaciado`);
			dialog.close();
			await onSaved();
		} catch (error) {
			toast(error.message);
		}
	});
	dialog.showModal();
	(form?.elements.item_name || dialog.querySelector('.slot-dialog-close button')).focus();
	return dialog;
}
