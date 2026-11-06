import { ClassIcon } from './components.js';
import { spanishClass } from './lineup-board.js';

// "Pasar lista": one tap marks a player, and it is saved at once. "Todos asistieron" marks
// everyone in the list; the rest is changed player by player afterwards.
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
	let sheet = await api(`/api/raids/${encodeURIComponent(raidId)}/attendance-sheet`);
	const save = async (rows, status) => {
		const entries = rows
			.filter((r) => r.characterId)
			.map((r) => ({ characterId: r.characterId, status }));
		for (let i = 0; i < entries.length; i += 100)
			await api(`/api/raids/${encodeURIComponent(raidId)}/attendance`, 'PUT', {
				entries: entries.slice(i, i + 100),
			});
		for (const r of rows) if (r.characterId) r.status = status;
		render();
		onSaved?.();
	};
	function row(r) {
		const key = classKey[r.class] || 'unknown';
		return /* HTML */ `<li
			class="att-row class-${key} ${r.status ? states.find((s) => s[0] === r.status)?.[3] || '' : 'is-unmarked'}"
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
									`<button type="button" class="att-state ${cls}" data-user="${esc(r.userId)}" data-status="${esc(status)}" aria-pressed="${r.status === status}" title="${esc(status)}"><span aria-hidden="true">${mark}</span>${esc(label)}</button>`,
							)
							.join('')}</span>`
					: '<em class="att-none">Sin personaje en la web: no cuenta</em>'
			}
		</li>`;
	}
	function render() {
		const rows = sheet.rows,
			count = (s) => rows.filter((r) => r.status === s).length,
			pending = rows.filter((r) => r.characterId && !r.status).length;
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
		const b = e.target.closest('[data-status]');
		if (b) {
			const r = sheet.rows.find((x) => x.userId === b.dataset.user);
			if (!r || r.status === b.dataset.status) return;
			b.disabled = true;
			try {
				await save([r], b.dataset.status);
			} catch (error) {
				toast(error.message);
				render();
			}
			return;
		}
		if (e.target.closest('[data-all]')) {
			const others = sheet.rows.filter((r) => r.characterId && r.status && r.status !== 'Asistió');
			if (
				others.length &&
				!confirm(
					`¿Marcar a todos como «Asistió»? ${others.length} ya tienen otro estado y se cambiarán.`,
				)
			)
				return;
			try {
				await save(sheet.rows, 'Asistió');
				toast('Todos marcados como asistencia');
			} catch (error) {
				toast(error.message);
			}
		}
	};
	render();
	return {
		async reload() {
			sheet = await api(`/api/raids/${encodeURIComponent(raidId)}/attendance-sheet`);
			render();
		},
	};
}
