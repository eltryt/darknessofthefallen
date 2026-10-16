import { ClassIcon, SpecIcon } from './components.js';
import { classKey } from './roster-ui.js';
import { getSpecsForClass } from './specs.js';

const classNames = [
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
const priorities = { abierta: 'Abierta', alta: 'Alta', media: 'Media', baja: 'Baja' };

const roleGroups = [
	['Tanque', 'Tanques'],
	['Sanador', 'Sanadores'],
	['DPS melee', 'DPS cuerpo a cuerpo'],
	['DPS distancia', 'DPS a distancia'],
];
const priorityOrder = { alta: 0, media: 1, baja: 2, abierta: 3 };
// A specialization's own priority wins; otherwise it inherits its class priority.
export function specPriority(settings, className, specId) {
	return (
		settings.specPriorities?.[`${className}:${specId}`] ||
		settings.classPriorities?.[className] ||
		'abierta'
	);
}
export function recruitmentSpecs(settings) {
	return classNames.flatMap((name) =>
		Object.entries(getSpecsForClass(classKey(name))).map(([id, spec]) => ({
			className: name,
			id,
			name: spec.name,
			role: spec.category,
			priority: specPriority(settings, name, id),
		})),
	);
}

export function recruitmentShowcase(settings, esc, applicationUrl = '') {
	const open = settings.recruitmentOpen;
	const href = applicationUrl || '#application';
	const specs = recruitmentSpecs(settings);
	const card = (s) =>
		`<article class="spec-recruit-card class-${classKey(s.className)} priority-${esc(s.priority)}" data-recruit-priority="${esc(s.priority)}" data-recruit-roles="${esc(s.role)}|${s.role.startsWith('DPS') ? 'DPS' : ''}"><span class="spec-recruit-icons">${SpecIcon({ className: s.className, specId: s.id, size: 'large' })}${ClassIcon({ className: s.className, size: 'small' })}</span><span class="spec-recruit-text"><h4>${esc(s.name)}</h4><small>${esc(s.className)}${settings.soughtClasses?.includes(s.className) ? ' · Clase buscada' : ''}</small></span><span class="recruit-priority">${open ? priorities[s.priority] : 'Cerrado'}</span></article>`;
	return `<section class="recruit-showcase" aria-labelledby="classes-heading">
		<div class="section-head"><div><span class="eyebrow">Un lugar para cada forma de jugar</span><h2 id="classes-heading">Tu especialización. Tu lugar en la banda.</h2><p>${open ? 'Todas las especializaciones son bienvenidas. Las prioridades orientan, no excluyen.' : 'Consulta nuestras especializaciones. Las candidaturas están cerradas por ahora.'}</p></div></div>
		<div class="recruit-controls" role="group" aria-label="Filtrar por prioridad">${['todas', ...Object.keys(priorities)].map((key) => `<button type="button" class="secondary" data-priority-filter="${key}" aria-pressed="${key === 'todas'}">${key === 'todas' ? 'Todas' : priorities[key]}</button>`).join('')}</div>
		<div class="recruit-controls" role="group" aria-label="Filtrar por rol">${['todos', 'Tanque', 'Sanador', 'DPS'].map((role) => `<button type="button" class="secondary" data-recruit-role="${role}" aria-pressed="${role === 'todos'}">${role === 'todos' ? 'Todos los roles' : role}</button>`).join('')}</div>
		${roleGroups
			.map(([role, title]) => {
				const list = specs
					.filter((s) => s.role === role)
					.sort(
						(a, b) =>
							priorityOrder[a.priority] - priorityOrder[b.priority] ||
							a.className.localeCompare(b.className, 'es'),
					);
				return `<section class="spec-recruit-group" data-recruit-group><h3>${title}<span>${list.length}</span></h3><div class="spec-recruit-grid">${list.map(card).join('')}</div></section>`;
			})
			.join('')}
		<p data-recruit-empty hidden role="status">No hay especializaciones que coincidan con estos filtros.</p>
		${open || applicationUrl ? `<div class="recruit-cta"><a class="button" href="${esc(href)}">Presentar mi candidatura <span aria-hidden="true">→</span></a><p>No necesitas una cuenta en la web para dar el primer paso.</p></div>` : ''}
	</section>`;
}

export function attachRecruitmentFilters(root) {
	const update = () => {
		const priority =
			root.querySelector('[data-priority-filter][aria-pressed="true"]')?.dataset.priorityFilter ||
			'todas';
		const role =
			root.querySelector('[data-recruit-role][aria-pressed="true"]')?.dataset.recruitRole ||
			'todos';
		let count = 0;
		root.querySelectorAll('[data-recruit-priority]').forEach((card) => {
			card.hidden =
				(priority !== 'todas' && card.dataset.recruitPriority !== priority) ||
				(role !== 'todos' && !card.dataset.recruitRoles.split('|').includes(role));
			if (!card.hidden) count++;
		});
		root.querySelectorAll('[data-recruit-group]').forEach((group) => {
			group.hidden = !group.querySelector('[data-recruit-priority]:not([hidden])');
		});
		const empty = root.querySelector('[data-recruit-empty]');
		if (empty) empty.hidden = count !== 0;
	};
	for (const attr of ['data-priority-filter', 'data-recruit-role']) {
		root.querySelectorAll(`[${attr}]`).forEach((button) => {
			button.onclick = () => {
				root
					.querySelectorAll(`[${attr}]`)
					.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
				update();
			};
		});
	}
}

export function progressShowcase(rows, esc) {
	if (!rows.length)
		return `<section class="raid-showcase raid-reference raid-onyxia"><div class="raid-art"><img class="fade-in" decoding="async" src="/assets/icons/onyxia.webp" alt="" width="56" height="56"><span class="eyebrow">Un encuentro con historia</span><h2>Onyxia</h2><p>La próxima historia la escribimos juntos.</p></div><div class="raid-card-body"><span class="pill">Referencia visual · Sin progreso registrado</span><p>Cuando la hermandad registre sus encuentros, aquí verás las victorias, los jefes pendientes y las fechas de cada avance.</p></div></section>`;
	return `<div class="raid-showcase-grid">${rows
		.map((p) => {
			const onyxia =
				/onyxia|onixya|onixia/i.test(p.name) ||
				p.bosses.some((b) => /onyxia|onixya|onixia/i.test(b.name));
			return `<article class="raid-showcase${onyxia ? ' raid-onyxia' : ''}"><div class="raid-art">${onyxia ? '<img class="fade-in" decoding="async" src="/assets/icons/onyxia.webp" alt="" width="56" height="56">' : '<span class="raid-sigil" aria-hidden="true">◇</span>'}<span class="eyebrow">${esc(p.difficulty || 'Progreso de hermandad')}</span><h2>${esc(p.name)}</h2><strong class="raid-score">${Number(p.defeated)}<span> / ${Number(p.total)}</span></strong><p>Encuentros superados</p></div><div class="raid-card-body"><progress value="${Number(p.defeated)}" max="${Number(p.total) || 1}" aria-label="Progreso de ${esc(p.name)}"></progress><ul class="encounter-tiles">${p.bosses.map((b) => `<li class="${b.status === 'Derrotado' ? 'encounter-defeated' : ''}"><span aria-hidden="true">${b.status === 'Derrotado' ? '✓' : '◇'}</span><div><strong>${esc(b.name)}</strong><small>${esc(b.status)}</small>${b.firstKill ? `<small>Primera victoria · ${esc(new Date(b.firstKill).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }))}</small>` : ''}</div></li>`).join('')}</ul>${
				p.history?.length
					? `<details><summary>Historial de la banda</summary><ul>${p.history
							.slice(0, 12)
							.map(
								(h) =>
									`<li>${esc(new Date(h.date).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }))} · ${esc(h.boss)} · ${esc(h.status)}</li>`,
							)
							.join('')}</ul></details>`
					: ''
			}</div></article>`;
		})
		.join(
			'',
		)}</div><p class="progress-source">Progreso registrado por la hermandad · Horario de Madrid</p>`;
}
