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

export function recruitmentShowcase(settings, esc, applicationUrl = '') {
	const open = settings.recruitmentOpen;
	const href = applicationUrl || '#application';
	return `<section class="recruit-showcase" aria-labelledby="classes-heading">
		<div class="section-head"><div><span class="eyebrow">Un lugar para cada forma de jugar</span><h2 id="classes-heading">Tu clase. Tu lugar en la banda.</h2><p>${open ? 'Todas las clases son bienvenidas. Las prioridades orientan, no excluyen.' : 'Consulta nuestras clases. Las candidaturas están cerradas por ahora.'}</p></div></div>
		<div class="recruit-controls" role="group" aria-label="Filtrar clases por prioridad">${['todas', ...Object.keys(priorities)].map((key) => `<button type="button" class="secondary" data-priority-filter="${key}" aria-pressed="${key === 'todas'}">${key === 'todas' ? 'Todas' : priorities[key]}</button>`).join('')}</div>
		<div class="recruit-controls" role="group" aria-label="Filtrar clases por rol">${['todos', 'Tanque', 'Sanador', 'DPS'].map((role) => `<button type="button" class="secondary" data-recruit-role="${role}" aria-pressed="${role === 'todos'}">${role === 'todos' ? 'Todos los roles' : role}</button>`).join('')}</div>
		<div class="class-recruit-grid">${classNames
			.map((name) => {
				const priority = settings.classPriorities?.[name] || 'abierta';
				const specs = getSpecsForClass(classKey(name));
				return `<article class="class-recruit-card class-${classKey(name)}" data-recruit-priority="${esc(priority)}" data-recruit-roles="${esc([...new Set(Object.values(specs).map((spec) => (spec.category.startsWith('DPS') ? 'DPS' : spec.category)))].join('|'))}"><div class="class-recruit-heading">${ClassIcon({ className: name, size: 'large' })}<div><h3>${esc(name)}</h3><span class="recruit-priority">${open ? 'Prioridad · ' + priorities[priority] : 'Candidaturas cerradas'}${settings.soughtClasses?.includes(name) ? ' · Clase buscada' : ''}</span></div></div><div class="recruit-specs">${Object.entries(
					specs,
				)
					.map(
						([id, spec]) =>
							`<span>${SpecIcon({ className: name, specId: id })}${esc(spec.name)}</span>`,
					)
					.join('')}</div></article>`;
			})
			.join(
				'',
			)}</div><p data-recruit-empty hidden role="status">No hay clases que coincidan con estos filtros.</p>
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
		root.querySelector('[data-recruit-empty]').hidden = count !== 0;
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
		return `<section class="raid-showcase raid-reference"><div class="raid-art"><img src="/assets/icons/onyxia.jpg" alt="" width="56" height="56"><span class="eyebrow">Un encuentro con historia</span><h2>Onyxia</h2><p>La próxima historia la escribimos juntos.</p></div><div class="raid-card-body"><span class="pill">Referencia visual · Sin progreso registrado</span><p>Cuando la hermandad registre sus encuentros, aquí verás las victorias, los jefes pendientes y las fechas de cada avance.</p></div></section>`;
	return `<div class="raid-showcase-grid">${rows
		.map((p) => {
			const onyxia = /onyxia/i.test(p.name) || p.bosses.some((b) => /onyxia/i.test(b.name));
			return `<article class="raid-showcase"><div class="raid-art">${onyxia ? '<img src="/assets/icons/onyxia.jpg" alt="" width="56" height="56">' : '<span class="raid-sigil" aria-hidden="true">◇</span>'}<span class="eyebrow">${esc(p.difficulty || 'Progreso de hermandad')}</span><h2>${esc(p.name)}</h2><strong class="raid-score">${Number(p.defeated)}<span> / ${Number(p.total)}</span></strong><p>Encuentros superados</p></div><div class="raid-card-body"><progress value="${Number(p.defeated)}" max="${Number(p.total) || 1}" aria-label="Progreso de ${esc(p.name)}"></progress><ul class="encounter-tiles">${p.bosses.map((b) => `<li class="${b.status === 'Derrotado' ? 'encounter-defeated' : ''}"><span aria-hidden="true">${b.status === 'Derrotado' ? '✓' : '◇'}</span><div><strong>${esc(b.name)}</strong><small>${esc(b.status)}</small>${b.firstKill ? `<small>Primera victoria · ${esc(new Date(b.firstKill).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }))}</small>` : ''}</div></li>`).join('')}</ul>${
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
