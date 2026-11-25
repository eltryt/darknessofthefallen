const statuses = ['Nuevo', 'Contactado', 'Prueba', 'Aceptado', 'Rechazado'];
// Accepted and rejected applications leave the working list for «Archivadas».
export const closedStatuses = ['Aceptado', 'Rechazado'];
const isClosed = (row) => closedStatuses.includes(row.status);
const statusOrder = (row) => statuses.indexOf(row.status);
const statusClass = (status) => 'app-' + status.toLowerCase();
const labels = {
	name: 'Nombre o alias',
	discord: 'Usuario de Discord',
	character: 'Personaje',
	class: 'Clase',
	role: 'Rol',
	availability: 'Disponibilidad',
	experience: 'Experiencia',
	reason: 'Motivación',
	additional: 'Información adicional',
};

export function prepareApplication(form) {
	if (!form) return;
	for (const [name, limit] of Object.entries({
		name: 80,
		discord: 80,
		character: 80,
		availability: 1000,
		experience: 2000,
		reason: 2000,
		additional: 2000,
	}))
		form.elements[name].maxLength = limit;
	for (const name of ['class', 'role']) {
		const placeholder = new Option('Selecciona una opción', '', true, true);
		placeholder.disabled = true;
		form.elements[name].prepend(placeholder);
	}
}

// Optional: identify with Discord before applying. The web keeps the real account, so
// there is one open application per person, officers can message them, and the candidate
// sees it at /candidatura. Applying without it still works.
export async function mountApplicantIdentity(form, { api, esc }) {
	if (!form) return;
	let me;
	try {
		me = await api('/api/applicant');
	} catch {
		return;
	}
	const box = document.createElement('div');
	box.className = 'applicant-identity';
	const discord = form.elements.discord;
	if (me.identified && me.username) {
		discord.value = me.username;
		discord.readOnly = true;
		box.innerHTML = `<p><span aria-hidden="true">✓</span> Identificado con Discord como <strong>@${esc(me.username)}</strong>. Podrás ver tu candidatura en <a href="/candidatura">/candidatura</a>. <a href="/auth/candidato/salir">Usar otra cuenta</a></p>`;
	} else if (me.identified)
		box.innerHTML =
			'<p><span aria-hidden="true">✓</span> Has entrado con tu cuenta de Discord: tu candidatura quedará ligada a ella y podrás verla en <a href="/candidatura">/candidatura</a>.</p>';
	else
		box.innerHTML = `<p><strong>Opcional:</strong> identifícate con Discord y guardaremos tu cuenta real. Así podrás ver tu candidatura cuando quieras y te avisaremos por privado. No hace falta estar en nuestro servidor.</p><a class="button secondary" href="/auth/candidato?next=${encodeURIComponent(location.pathname + '#application')}">Identificarme con Discord</a>`;
	form.prepend(box);
}

export function applicationReceipt(form, result, esc) {
	const receipt = document.createElement('section');
	receipt.className = 'card application-receipt';
	receipt.tabIndex = -1;
	receipt.setAttribute('role', 'status');
	receipt.innerHTML = /* HTML */ `<span class="eyebrow">Solicitud registrada</span>
		<h2>Candidatura recibida</h2>
		<p>
			Tu candidatura se ha guardado en la web. El Líder y los Oficiales podrán revisarla y contactar
			contigo por Discord.
		</p>
		<p>Referencia: <strong class="application-reference">${esc(result.id)}</strong></p>
		${
			result.trackUrl
				? `<div class="application-track"><p><strong>Tu enlace privado</strong> para ver tu candidatura y su estado. Guárdalo: no hace falta cuenta para abrirlo.</p><div class="application-track-row"><input readonly value="${esc(result.trackUrl)}" aria-label="Enlace privado de tu candidatura" /><button type="button" data-copy-track>Copiar</button></div>${result.identified ? '<p>También la verás en <a href="/candidatura">/candidatura</a> entrando con Discord.</p>' : ''}</div>`
				: ''
		}
		<p>Enviarla no implica la aceptación en la hermandad.</p>
		<div class="gate-actions">
			${result.trackUrl ? `<a class="button" href="${esc(result.trackUrl)}">Ver mi candidatura</a>` : ''}
			<a class="button secondary" href="/">Volver al inicio</a>
		</div>`;
	receipt.querySelector('[data-copy-track]')?.addEventListener('click', async (e) => {
		const input = receipt.querySelector('.application-track input');
		try {
			await navigator.clipboard.writeText(input.value);
			e.target.textContent = 'Copiado';
		} catch {
			input.select();
		}
	});
	form.replaceWith(receipt);
	receipt.focus();
}

export async function applicationInbox(el, { api, esc, toast }) {
	const rows = await api('/api/applications');
	el.innerHTML = /* HTML */ `<section class="application-inbox">
		<h2>Candidaturas</h2>
		<p>
			Solicitudes guardadas en la web, visibles únicamente para el Líder y los Oficiales. Fechas en
			hora de Madrid.
		</p>
		<div class="hub-segment app-views" role="group" aria-label="Qué candidaturas ver">
			<button type="button" data-app-view="open" aria-pressed="true"></button>
			<button type="button" data-app-view="closed" aria-pressed="false"></button>
		</div>
		<div class="filters">
			<label
				>Buscar candidato<input
					id="application-search"
					type="search"
					placeholder="Nombre, Discord, personaje o referencia" /></label
			><label
				>Estado<select id="application-status">
					<option value="">Todos los estados</option>
				</select></label
			>
		</div>
		<p id="application-count" role="status"></p>
		<div id="application-list"></div>
	</section>`;
	const list = el.querySelector('#application-list');
	// Pending first (new on top), or the archive of accepted and rejected ones.
	let view = new URLSearchParams(location.search).get('ver') === 'archivadas' ? 'closed' : 'open';
	const statusSelect = el.querySelector('#application-status');
	function setView(next) {
		view = next;
		statusSelect.innerHTML =
			'<option value="">Todos los estados</option>' +
			statuses
				.filter((s) => closedStatuses.includes(s) === (view === 'closed'))
				.map((s) => `<option>${s}</option>`)
				.join('');
		render();
	}
	const date = (value) => new Date(value).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
	function render() {
		const query = el.querySelector('#application-search').value.trim().toLocaleLowerCase('es');
		const status = el.querySelector('#application-status').value;
		const open = rows.filter((r) => !isClosed(r)),
			closed = rows.filter(isClosed);
		el.querySelector('[data-app-view="open"]').innerHTML =
			`Pendientes <b>${open.length}</b>${rows.some((r) => r.status === 'Nuevo') ? ` <small>${rows.filter((r) => r.status === 'Nuevo').length} sin tratar</small>` : ''}`;
		el.querySelector('[data-app-view="closed"]').innerHTML = `Archivadas <b>${closed.length}</b>`;
		el.querySelectorAll('[data-app-view]').forEach((b) =>
			b.setAttribute('aria-pressed', String(b.dataset.appView === view)),
		);
		const visible = (view === 'closed' ? closed : open)
			.filter(
				(row) =>
					(!status || row.status === status) &&
					[row.id, row.data.name, row.data.discord, row.data.character].some((v) =>
						String(v).toLocaleLowerCase('es').includes(query),
					),
			)
			.sort((a, b) =>
				view === 'open'
					? statusOrder(a) - statusOrder(b) || b.created_at.localeCompare(a.created_at)
					: String(b.updated_at || b.created_at).localeCompare(
							String(a.updated_at || a.created_at),
						),
			);
		el.querySelector('#application-count').textContent =
			`${visible.length} ${view === 'closed' ? 'archivadas' : 'pendientes'} · ${rows.length} en total${rows.length === 500 ? ' · Se muestran las 500 más recientes' : ''}`;
		list.innerHTML = visible.length
			? visible
					.map(
						(row) =>
							/* HTML */ `<article class="card application-card ${statusClass(row.status)}">
								<div class="application-heading">
									<div>
										<h3>${esc(row.data.name)}</h3>
										<p>${esc(row.data.class)} · ${esc(row.data.role)}</p>
									</div>
									<span class="pill app-status ${statusClass(row.status)}"
										>${row.status === 'Nuevo' ? 'Nuevo · sin tratar' : esc(row.status)}</span
									>
								</div>
								<p>
									Recibida:
									<time datetime="${esc(row.created_at)}">${esc(date(row.created_at))}</time>
								</p>
								<p class="application-reference">Referencia: ${esc(row.id)}</p>
								<div class="application-contact">
									<span class="pill ${row.identified ? 'is-verified' : ''}"
										>${row.identified ? '✓ Discord verificado' : 'Discord escrito a mano'}</span
									>
									${
										row.trackUrl
											? `<button type="button" class="secondary" data-copy-link="${esc(row.trackUrl)}">Copiar enlace del candidato</button>`
											: ''
									}
									<button type="button" class="secondary" data-notify="${esc(row.id)}">
										Avisar por Discord
									</button>
									${
										row.notified_at
											? `<small>Último aviso: ${esc(row.notice_status)} · ${esc(date(row.notified_at))}${row.notified_by_name ? ' · ' + esc(row.notified_by_name) : ''}</small>`
											: ''
									}
								</div>
								<details>
									<summary>Ver candidatura completa</summary>
									<dl>
										${Object.entries(labels)
											.map(
												([key, label]) =>
													`<dt>${label}</dt><dd>${esc(row.data[key] || 'Sin indicar')}</dd>`,
											)
											.join('')}
									</dl>
								</details>
								<form data-application-id="${esc(row.id)}">
									<label
										>Estado<select name="status">
											${statuses.map((s) => `<option ${s === row.status ? 'selected' : ''}>${s}</option>`).join('')}
										</select></label
									><label
										>Notas internas<textarea name="notes" maxlength="4000">
${esc(row.notes)}</textarea>
									</label>
									<p>
										Las notas son internas. El candidato ve el estado en su enlace; para avisarle,
										usa «Avisar por Discord» o copia su enlace.
									</p>
									<button type="submit">Guardar revisión</button>
									<button type="button" class="secondary" data-delete-application="${esc(row.id)}">
										Borrar candidatura
									</button>
									<p class="review-feedback" role="status"></p>
								</form>
							</article>`,
					)
					.join('')
			: /* HTML */ `<div class="empty">
					<h3>
						${!rows.length ? 'Todavía no hay candidaturas' : status || el.querySelector('#application-search').value.trim() ? 'No hay coincidencias' : view === 'closed' ? 'No hay candidaturas archivadas' : 'Ninguna pendiente'}
					</h3>
					<p>
						${!rows.length ? 'Las solicitudes enviadas desde Reclutamiento aparecerán aquí.' : status || el.querySelector('#application-search').value.trim() ? 'Prueba otro nombre o estado.' : view === 'closed' ? 'Al marcar una candidatura como Aceptado o Rechazado pasa aquí.' : 'Están todas aceptadas o rechazadas: las tienes en Archivadas.'}
					</p>
				</div>`;

		for (const button of list.querySelectorAll('[data-copy-link]'))
			button.addEventListener('click', async () => {
				try {
					await navigator.clipboard.writeText(button.dataset.copyLink);
					toast('Enlace copiado: pégaselo por privado');
				} catch {
					prompt('Copia el enlace del candidato:', button.dataset.copyLink);
				}
			});
		for (const button of list.querySelectorAll('[data-notify]'))
			button.addEventListener('click', async () => {
				const row = rows.find((r) => r.id === button.dataset.notify);
				const note = prompt(
					`Mensaje privado para ${row.data.name} (opcional). El bot añade su estado y su enlace.`,
					'',
				);
				if (note === null) return;
				button.disabled = true;
				try {
					const r = await api(`/api/applications/${encodeURIComponent(row.id)}/notify`, 'POST', {
						note,
					});
					Object.assign(row, { notice_status: r.status, notified_at: new Date().toISOString() });
					toast('Aviso enviado por Discord');
				} catch (error) {
					Object.assign(row, {
						notice_status: 'No enviado',
						notified_at: new Date().toISOString(),
					});
					toast(error.message);
				}
				render();
			});
		for (const button of list.querySelectorAll('[data-delete-application]')) {
			button.addEventListener('click', async () => {
				const index = rows.findIndex((row) => row.id === button.dataset.deleteApplication);
				if (index < 0 || button.disabled) return;
				const row = rows[index];
				if (
					!confirm(
						`¿Borrar definitivamente la candidatura de ${row.data.name}? Se eliminarán sus datos y notas. Esta acción no se puede deshacer.`,
					)
				)
					return;
				button.disabled = true;
				try {
					await api('/api/applications/' + row.id, 'DELETE');
					rows.splice(
						rows.findIndex((entry) => entry.id === row.id),
						1,
					);
					render();
					toast('Candidatura borrada');
				} catch (error) {
					toast(error.message);
					button.disabled = false;
				}
			});
		}
		for (const form of list.querySelectorAll('form'))
			form.addEventListener('submit', async (event) => {
				event.preventDefault();
				const button = form.querySelector('button');
				if (button.disabled) return;
				button.disabled = true;
				const feedback = form.querySelector('.review-feedback');
				feedback.textContent = 'Guardando…';
				try {
					const values = Object.fromEntries(new FormData(form));
					await api('/api/applications/' + form.dataset.applicationId, 'PATCH', values);
					const row = rows.find((r) => r.id === form.dataset.applicationId);
					const wasClosed = isClosed(row);
					Object.assign(row, values, { updated_at: new Date().toISOString() });
					render();
					toast(
						isClosed(row) && !wasClosed
							? `Revisión guardada · ${row.data.name} pasa a Archivadas`
							: !isClosed(row) && wasClosed
								? `Revisión guardada · ${row.data.name} vuelve a Pendientes`
								: 'Revisión guardada',
					);
				} catch (error) {
					feedback.textContent = error.message;
					feedback.setAttribute('role', 'alert');
				} finally {
					button.disabled = false;
				}
			});
	}
	el.querySelector('#application-search').addEventListener('input', render);
	statusSelect.addEventListener('change', render);
	el.querySelectorAll('[data-app-view]').forEach((b) =>
		b.addEventListener('click', () => {
			el.querySelector('#application-search').value = '';
			setView(b.dataset.appView);
		}),
	);
	setView(view);
}
