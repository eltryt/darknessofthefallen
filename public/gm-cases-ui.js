// Panel → Mensajes y avisos: contacts and incidents as cases. Filters with counts, then one
// card per case with its status, officer in charge, priority and an internal team thread.
const statusClass = {
	Nueva: 'is-new',
	'En curso': 'is-working',
	Resuelta: 'is-done',
	Descartada: 'is-dropped',
};
const filters = [
	['open', 'Abiertas', (m) => ['Nueva', 'En curso'].includes(m.status)],
	['mine', 'Mías', (m, me) => m.assignee_id === me && ['Nueva', 'En curso'].includes(m.status)],
	['Nueva', 'Nuevas', (m) => m.status === 'Nueva'],
	['En curso', 'En curso', (m) => m.status === 'En curso'],
	['Resuelta', 'Resueltas', (m) => m.status === 'Resuelta'],
	['all', 'Todas', () => true],
];
const when = (iso) =>
	new Date(iso).toLocaleString('es-ES', {
		timeZone: 'Europe/Madrid',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});

export async function mountCases(el, { api, esc, empty, toast, me }) {
	let data = await api('/api/gm-cases');
	const open = new Set();
	const myId = me?.user?.id;
	// Opened from a notification (?record=): show that case, even if it is closed.
	const record = new URLSearchParams(location.search).get('record');
	const linked = data.messages.find((m) => m.id === record);
	let filter = linked && !['Nueva', 'En curso'].includes(linked.status) ? 'all' : 'open';
	if (linked) open.add(linked.id);
	const card = (m) => {
		const notes = m.notes || [];
		const expanded = open.has(m.id) || m.status === 'Nueva' || m.status === 'En curso';
		return /* HTML */ `<article
			class="card gm-case ${statusClass[m.status] || ''} ${m.priority === 'Urgente' ? 'is-urgent' : ''}"
			id="message-${esc(m.id)}"
		>
			<header class="gm-case-head">
				<span class="pill">${m.kind === 'incident' ? 'Incidencia' : 'Contacto'}</span>
				<span class="gm-status">${esc(m.status)}</span>
				${m.priority === 'Urgente' ? '<span class="gm-urgent">Urgente</span>' : ''}
				<span class="gm-who"
					>${m.assignee_name ? `Responsable: <strong>${esc(m.assignee_name)}</strong>` : 'Sin responsable'}</span
				>
			</header>
			<h3>${esc(m.subject)}</h3>
			<p class="gm-body">${esc(m.message)}</p>
			<p class="gm-meta">
				${esc(m.author_name || 'Sistema')} ·
				${esc(when(m.created_at))}${
					m.resolved_at ? ` · Resuelta el ${esc(when(m.resolved_at))}` : ''
				}
			</p>
			<div class="gm-actions" role="group" aria-label="Estado del caso">
				${data.statuses
					.map(
						(s) =>
							`<button type="button" class="gm-state ${statusClass[s]}" data-case="${esc(m.id)}" data-status="${esc(s)}" aria-pressed="${m.status === s}">${s === 'En curso' ? 'Estamos en ello' : s === 'Resuelta' ? 'Resuelta ✓' : esc(s)}</button>`,
					)
					.join('')}
				${
					m.assignee_id === myId
						? ''
						: `<button type="button" class="secondary" data-case="${esc(m.id)}" data-assign="${esc(myId || '')}">Me encargo yo</button>`
				}
				<select data-case="${esc(m.id)}" data-assign-select aria-label="Responsable">
					<option value="">Sin responsable</option>
					${data.team
						.map(
							(u) =>
								`<option value="${esc(u.id)}" ${u.id === m.assignee_id ? 'selected' : ''}>${esc(u.name)}</option>`,
						)
						.join('')}
				</select>
				<button
					type="button"
					class="secondary gm-urgent-toggle"
					data-case="${esc(m.id)}"
					data-priority="${m.priority === 'Urgente' ? 'Normal' : 'Urgente'}"
					aria-pressed="${m.priority === 'Urgente'}"
				>
					${m.priority === 'Urgente' ? 'Quitar urgente' : 'Marcar urgente'}
				</button>
			</div>
			<details class="gm-thread" data-thread="${esc(m.id)}" ${expanded ? 'open' : ''}>
				<summary>
					Chat interno del
					equipo${
						notes.filter((n) => n.kind === 'note').length
							? ` · ${notes.filter((n) => n.kind === 'note').length}`
							: ''
					}
				</summary>
				<ol class="gm-notes">
					${
						notes.length
							? notes
									.map((n) =>
										n.kind === 'event'
											? `<li class="gm-event"><span>${esc(n.author_name)} ${esc(n.body)}</span><time>${esc(when(n.created_at))}</time></li>`
											: `<li class="gm-note ${n.user_id === myId ? 'is-me' : ''}"><span class="gm-note-meta"><strong>${esc(n.author_name)}</strong><time>${esc(when(n.created_at))}</time>${n.user_id === myId ? `<button type="button" class="gm-note-x" data-hide-note="${n.id}" aria-label="Quitar nota" title="Quitar nota">×</button>` : ''}</span><p>${esc(n.body)}</p></li>`,
									)
									.join('')
							: '<li class="gm-empty">Nadie ha escrito todavía. Usa este chat para coordinaros; el remitente no lo ve.</li>'
					}
				</ol>
				<form class="gm-note-form" data-note-form="${esc(m.id)}">
					<input
						name="body"
						maxlength="2000"
						autocomplete="off"
						placeholder="Escribe al equipo…"
						aria-label="Nota interna"
					/><button type="submit">Enviar</button>
				</form>
			</details>
		</article>`;
	};
	function render() {
		const list = data.messages;
		const counts = Object.fromEntries(
			filters.map(([k, , f]) => [k, list.filter((m) => f(m, myId)).length]),
		);
		const visible = list.filter((m) => filters.find(([k]) => k === filter)[2](m, myId));
		el.innerHTML = /* HTML */ `<div class="gm-filters" role="group" aria-label="Filtrar casos">
				${filters
					.map(
						([k, label]) =>
							`<button type="button" class="${filter === k ? '' : 'secondary'}" data-filter="${esc(k)}" aria-pressed="${filter === k}">${label} <span class="gm-count">${counts[k]}</span></button>`,
					)
					.join('')}
			</div>
			${
				visible.map(card).join('') ||
				empty(
					filter === 'open' ? 'Todo al día' : 'Sin casos',
					filter === 'open'
						? 'No hay mensajes ni incidencias pendientes.'
						: 'No hay casos con este filtro.',
				)
			}`;
	}
	const reload = async (id) => {
		if (id) open.add(id);
		data = await api('/api/gm-cases');
		render();
		if (id) el.querySelector(`[data-note-form="${CSS.escape(id)}"] input`)?.focus();
	};
	const patch = async (id, value) => {
		try {
			await api(`/api/gm-messages/${encodeURIComponent(id)}`, 'PATCH', value);
			await reload(id);
		} catch (e) {
			toast(e.message);
		}
	};
	el.addEventListener('click', async (e) => {
		const t = e.target.closest('button');
		if (!t) return;
		if (t.dataset.filter) {
			filter = t.dataset.filter;
			render();
		} else if (t.dataset.status && t.getAttribute('aria-pressed') !== 'true')
			await patch(t.dataset.case, { status: t.dataset.status });
		else if ('assign' in t.dataset) await patch(t.dataset.case, { assigneeId: t.dataset.assign });
		else if (t.dataset.priority) await patch(t.dataset.case, { priority: t.dataset.priority });
		else if (t.dataset.hideNote) {
			try {
				await api(`/api/gm-notes/${encodeURIComponent(t.dataset.hideNote)}`, 'DELETE');
				await reload(t.closest('[data-thread]')?.dataset.thread);
			} catch (error) {
				toast(error.message);
			}
		}
	});
	el.addEventListener('change', (e) => {
		if ('assignSelect' in e.target.dataset)
			patch(e.target.dataset.case, { assigneeId: e.target.value || null });
	});
	el.addEventListener(
		'toggle',
		(e) => {
			const id = e.target.dataset?.thread;
			if (id) e.target.open ? open.add(id) : open.delete(id);
		},
		true,
	);
	el.addEventListener('submit', async (e) => {
		const form = e.target.closest('[data-note-form]');
		if (!form) return;
		e.preventDefault();
		const input = form.elements.body,
			value = input.value.trim();
		if (!value) return;
		input.disabled = true;
		try {
			await api(`/api/gm-messages/${encodeURIComponent(form.dataset.noteForm)}/notes`, 'POST', {
				body: value,
			});
			await reload(form.dataset.noteForm);
		} catch (error) {
			toast(error.message);
			input.disabled = false;
		}
	});
	render();
	if (linked) document.getElementById('message-' + linked.id)?.scrollIntoView({ block: 'center' });
}
