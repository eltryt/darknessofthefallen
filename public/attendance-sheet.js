import { ClassIcon } from './components.js';
import { spanishClass } from './lineup-board.js';

// "Pasar lista": taps and "Todos asistieron" are a draft until "Guardar lista" sends them.
// "Deshacer cambios" drops the draft; "Vaciar la lista" leaves the raid unmarked again
// (its saved marks are archived on the server, not deleted).
const states = [
	['Asistió', '✓', 'Asistió', 'is-in'],
	['Llegó tarde', '⏱', 'Tarde', 'is-late'],
	['Ausente', '✗', 'Ausente', 'is-out'],
	['Reserva', '⇄', 'Reserva', 'is-bench'],
];
const classKey = Object.fromEntries(Object.entries(spanishClass).map(([k, v]) => [v, k]));
const groupName = (slot) =>
	slot === 'bench'
		? 'Banquillo'
		: slot === 'other'
			? 'Marcados fuera de la lista'
			: slot?.startsWith('group:')
				? `Grupo ${slot.split(':')[1]}`
				: '';
const sources = {
	lineup: 'Lista sacada de la alineación de la convocatoria.',
	signups: 'Lista sacada de los inscritos en Discord (la convocatoria no tiene alineación).',
	roster: 'Esta raid no tiene inscritos: aparece el roster entero con su personaje principal.',
};

export async function mountAttendanceSheet(target, raidId, { api, esc, toast }, onSaved) {
	const url = `/api/raids/${encodeURIComponent(raidId)}`;
	let sheet = await api(`${url}/attendance-sheet`);
	// userId → status chosen and not saved yet.
	const draft = new Map();
	const current = (r) => draft.get(r.userId) ?? r.status;
	const mark = (r, status) => {
		if (!r.characterId) return;
		if (status === r.status) draft.delete(r.userId);
		else draft.set(r.userId, status);
	};
	const reload = async () => {
		sheet = await api(`${url}/attendance-sheet`);
		draft.clear();
		render();
		onSaved?.();
	};
	const save = async () => {
		const entries = sheet.rows
			.filter((r) => draft.has(r.userId))
			.map((r) => ({ characterId: r.characterId, status: draft.get(r.userId) }));
		for (let i = 0; i < entries.length; i += 100)
			await api(`${url}/attendance`, 'PUT', { entries: entries.slice(i, i + 100) });
		await reload();
	};
	function row(r) {
		const key = classKey[r.class] || 'unknown',
			status = current(r);
		return /* HTML */ `<li
			class="att-row class-${key} ${status ? states.find((s) => s[0] === status)?.[3] || '' : 'is-unmarked'} ${draft.has(r.userId) ? 'is-changed' : ''}"
		>
			${r.class ? ClassIcon({ className: r.class, size: 'small' }) : '<span class="lineup-noicon">?</span>'}
			<span class="att-who"
				><strong>${esc(r.characterName || r.name)}</strong
				><small
					>${esc([r.characterName ? r.name : '', r.role].filter(Boolean).join(' · '))}</small
				></span
			>
			${
				r.characterId
					? `<span class="att-states" role="group" aria-label="Asistencia de ${esc(r.characterName || r.name)}">${states
							.map(
								([status, mark, label, cls]) =>
									`<button type="button" class="att-state ${cls}" data-user="${esc(r.userId)}" data-status="${esc(status)}" aria-pressed="${current(r) === status}" title="${esc(status)}"><span aria-hidden="true">${mark}</span>${esc(label)}</button>`,
							)
							.join('')}</span>`
					: '<em class="att-none">Sin personaje en la web: no cuenta</em>'
			}
		</li>`;
	}
	function render() {
		const rows = sheet.rows,
			count = (s) => rows.filter((r) => current(r) === s).length,
			pending = rows.filter((r) => r.characterId && !current(r)).length,
			saved = rows.some((r) => r.status);
		const groups = [];
		for (const r of rows) {
			const name = groupName(r.slot);
			if (!groups.length || groups.at(-1).name !== name) groups.push({ name, rows: [] });
			groups.at(-1).rows.push(r);
		}
		target.innerHTML = /* HTML */ `<div class="att-sheet">
			<header class="att-head">
				<p class="att-source">${esc(sources[sheet.source])}</p>
				<div class="att-counts">
					<span class="att-count is-in">✓ ${count('Asistió')} asistieron</span>
					<span class="att-count is-late">⏱ ${count('Llegó tarde')} tarde</span>
					<span class="att-count is-out">✗ ${count('Ausente')} ausentes</span>
					<span class="att-count is-bench">⇄ ${count('Reserva')} reserva</span>
					${pending ? `<span class="att-count is-unmarked">${pending} sin marcar</span>` : ''}
				</div>
				<button
					type="button"
					class="att-all"
					data-all
					${rows.some((r) => r.characterId) ? '' : 'disabled'}
				>
					✓ Todos asistieron
				</button>
			</header>
			${
				rows.length
					? `<div class="att-save ${draft.size ? 'is-dirty' : ''}" role="status">
						<span>${draft.size ? `<strong>${draft.size} ${draft.size === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}</strong>` : saved ? 'Lista guardada.' : 'Marca a cada jugador y guarda la lista.'}</span>
						<button type="button" data-save ${draft.size ? '' : 'disabled'}>Guardar lista</button>
						<button type="button" class="secondary" data-undo ${draft.size ? '' : 'hidden'}>Deshacer cambios</button>
						<button type="button" class="secondary danger" data-reset ${saved ? '' : 'hidden'}>Vaciar la lista</button>
					</div>`
					: ''
			}
			${
				rows.length
					? groups
							.map(
								(g) =>
									`<section class="att-group">${g.name ? `<h4>${esc(g.name)}</h4>` : ''}<ul>${g.rows.map(row).join('')}</ul></section>`,
							)
							.join('')
					: '<p class="notice">No hay nadie para esta raid todavía.</p>'
			}
		</div>`;
	}
	target.onclick = async (e) => {
		const b = e.target.closest('button');
		if (!b || b.disabled) return;
		if (b.dataset.status) {
			const r = sheet.rows.find((x) => x.userId === b.dataset.user);
			if (r) mark(r, b.dataset.status);
			render();
		} else if ('all' in b.dataset) {
			for (const r of sheet.rows) mark(r, 'Asistió');
			render();
			toast('Todos marcados como asistencia. Pulsa «Guardar lista» para guardarlo.');
		} else if ('undo' in b.dataset) {
			draft.clear();
			render();
		} else if ('save' in b.dataset) {
			b.disabled = true;
			try {
				await save();
				toast('Lista guardada');
			} catch (error) {
				toast(error.message);
				render();
			}
		} else if ('reset' in b.dataset) {
			if (
				!confirm(
					'¿Vaciar la lista de esta raid? Todos quedan sin marcar. Lo guardado se archiva y queda en la auditoría.',
				)
			)
				return;
			b.disabled = true;
			try {
				const r = await api(`${url}/attendance/reset`, 'POST', {});
				await reload();
				toast(`Lista vaciada (${r.archived} archivadas)`);
			} catch (error) {
				toast(error.message);
				render();
			}
		}
	};
	render();
	return {
		// Unsaved marks, so changing raid can ask first.
		dirty: () => draft.size > 0,
		reload,
	};
}
