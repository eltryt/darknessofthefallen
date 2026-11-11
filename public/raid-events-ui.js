import { tutorialButton } from './tutorials.js';
const jobLabel = (status) =>
	({
		pending: 'Pendiente de sincronización',
		running: 'Sincronizando',
		uncertain: 'Comprobando el resultado',
		blocked: 'Requiere revisión',
	})[status] || status;
const categories = ['Oficial', 'Extraordinaria', 'Voluntaria'];
const date = (value) =>
	value
		? new Date(value).toLocaleString('es-ES', {
				timeZone: 'Europe/Madrid',
				dateStyle: 'medium',
				timeStyle: 'short',
			})
		: 'Sin indicar';
const madrid = (value) =>
	value
		? new Intl.DateTimeFormat('sv-SE', {
				timeZone: 'Europe/Madrid',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23',
			})
				.format(new Date(value))
				.replace(' ', 'T')
		: '';
import { mountLineup } from './lineup-board.js';
import { mountRaidBot } from './raid-bot-ui.js';
export async function mountRaidEvents(host, ctx, { manage = false, mine = false } = {}) {
	const { api, esc, me, toast } = ctx;
	if (document.body.dataset.showcase) {
		host.innerHTML = /* HTML */ `<a
			class="button"
			href="${esc(new URL('/raids', document.body.dataset.applicationUrl || 'https://darknessofthefallen.com').href)}"
			>Ver convocatorias actualizadas ↗</a
		>`;
		return;
	}
	// The panel also holds the editor of the guild's own sign-up bot, in a part of the
	// page that the periodic refresh of the events never rewrites.
	if (manage) {
		const outer = host;
		outer.innerHTML = '';
		host = outer.appendChild(document.createElement('div'));
		mountRaidBot(outer.appendChild(document.createElement('div')), ctx).catch(() => {});
	}
	let result,
		selected = null,
		lineupOpen = false;
	const filters = { from: '', category: '', roster: '', state: '', mine };
	const manager = me.permissions.includes('attendance.manage');
	const options = (values, value = '') =>
		values
			.map((x) => `<option value="${esc(x)}" ${x === value ? 'selected' : ''}>${esc(x)}</option>`)
			.join('');
	const input = (label, name, value = '', type = 'text', extra = '') =>
		`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
	// Help shown on hover, keyboard focus or tap of the «?» next to each field.
	const hints = {
		title:
			'El nombre que verá la gente en Discord y en la web. Por ejemplo: «Núcleo de Magma — Raid de 40».',
		start:
			'Fecha y hora de Madrid. Debe ser futura: las inscripciones se cierran al llegar esta hora.',
		end: 'Se rellena sola 2 horas después del inicio. Si la raid acaba a la 01:00, es ya el día siguiente.',
		category:
			'Oficial: raid del calendario de la hermandad. Extraordinaria: fuera de los días habituales, coordinada con el GM. Voluntaria: sin compromiso de asistencia.',
		roster:
			'El grupo que va. Elige uno de la lista o escribe otro; las plazas se ajustan solas a 40, 20 o 10.',
		capacity: 'Número máximo de jugadores de la raid. Normalmente 40, 20 o 10.',
		organizer:
			'Quien organiza la raid y puede editarla o cancelarla. Debe ser raid leader, oficial o Líder.',
		public:
			'Muestra la fecha, el tipo y las plazas en la página pública de Raids, sin nombres de jugadores ni enlace de Discord.',
	};
	const hint = (text) =>
		`<span class="field-hint" tabindex="0" role="img" aria-label="Ayuda: ${esc(text)}" data-tip="${esc(text)}">?</span>`;
	const field = (label, help, control) =>
		`<label><span class="field-label">${label} ${hint(help)}</span>${control}</label>`;
	const queue = async (path, method, value, form) => {
		const button = form?.querySelector('[type="submit"]');
		if (button) button.disabled = true;
		try {
			await api(path, method, {
				...value,
				requestId: form?.dataset.requestId || crypto.randomUUID(),
			});
			toast('Solicitud guardada; pendiente de confirmar en Discord.');
			await load();
			if (selected) await detail(selected);
		} catch (e) {
			toast(e.message);
		} finally {
			if (button) button.disabled = false;
		}
	};
	async function load() {
		result = await api('/api/events');
		if (!host.isConnected) return;
		host.innerHTML = /* HTML */ `<div class="section-head">
				<h2>${mine ? 'Mis próximas convocatorias' : 'Convocatorias'}</h2>
				<button type="button" class="secondary" data-refresh>Actualizar</button>
			</div>
			<p>
				Horarios de Madrid.
				${
					result.publisher === 'bot'
						? 'Las convocatorias las publica el bot de la hermandad: lo que se apunta en Discord aparece aquí al momento.'
						: 'Las inscripciones se sincronizan con Raid-Helper aproximadamente cada cinco minutos.'
				}
				«Confirmado» indica inscripción activa, no asistencia histórica.
			</p>
			${!result.configured ? '<p class="notice">El bot de inscripciones está pendiente de conectar: sigue los pasos de «Bot de inscripciones en Discord», más abajo.</p>' : ''}${manager && result.sync?.error ? `<p class="error">${esc(result.sync.error)}</p>` : ''}${result.configured ? `<p class="muted">Última sincronización: ${esc(date(result.sync?.last_success))}</p>` : ''}
			<form class="filters" data-filters>
				${input('Desde', 'from', filters.from, 'date')}<label
					>Tipo<select name="category">
						<option value="">Todos</option>
						${options(categories, filters.category)}
					</select></label
				><label
					>Roster<select name="roster">
						<option value="">Todos</option>
						${options([...new Set(result.events.map((e) => e.roster))], filters.roster)}
					</select></label
				><label
					>Estado<select name="state">
						<option value="">Todos</option>
						${options(['Abierta', 'Finalizada', 'Cancelada', 'Pendiente de publicación'], filters.state)}
					</select></label
				>${me.user ? /* HTML */ `<label><input type="checkbox" name="mine" ${filters.mine ? 'checked' : ''} />Solo mis inscripciones</label>` : ''}
			</form>
			<div class="grid event-grid" data-event-cards></div>
			<div data-event-detail></div>
			${
				manager && manage
					? /* HTML */ `<details class="card section" data-create>
							<summary>Crear convocatoria y publicar en Discord</summary>
							${tutorialButton('crear-convocatoria', 'Ver tutorial en vídeo')}
							<ol class="create-steps">
								<li>Rellena los datos y pulsa «Crear convocatoria».</li>
								<li>
									La web la envía a Discord: verás «Pendiente de publicación» hasta un par de
									minutos.
								</li>
								<li>
									Se publica en el canal de Discord y la gente puede apuntarse allí o aquí,
									<strong>hasta la hora de inicio</strong>.
								</li>
							</ol>
							<form class="form" data-create-form>
								<fieldset class="create-group">
									<legend>Qué y cuándo</legend>
									<div class="form-grid">
										${field('Nombre de la raid', hints.title, `<input name="title" type="text" required maxlength="120" placeholder="Núcleo de Magma — Raid de 40" />`)}${field('Empieza (hora de Madrid)', hints.start, `<input name="start" type="datetime-local" required />`)}${field('Termina (hora de Madrid)', hints.end, `<input name="end" type="datetime-local" required />`)}
									</div>
								</fieldset>
								<fieldset class="create-group">
									<legend>Quién va</legend>
									<div class="form-grid">
										${field('Tipo de convocatoria', hints.category, `<select name="category">${options(categories)}</select>`)}${field('Roster', hints.roster, `<input name="roster" type="text" maxlength="80" list="raid-rosters" placeholder="Elige de la lista o escribe uno" />`)}${field('Plazas', hints.capacity, `<input name="capacity" type="number" value="20" min="1" max="1000" required />`)}${field('Responsable', hints.organizer, `<select name="organizerId"><option value="${esc(me.user.id)}">Yo</option></select>`)}
										<label class="create-check"
											><input type="checkbox" name="public" />Mostrar un resumen en la web pública
											${hint(hints.public)}</label
										>
									</div>
								</fieldset>
								${
									result.publisher === 'bot'
										? /* HTML */ `<fieldset class="create-group">
												<legend>Mensaje de Discord</legend>
												<label
													>Texto de la convocatoria (vacío: el de la plantilla del bot)<textarea
														name="description"
														rows="3"
														maxlength="1500"
													></textarea>
												</label>
											</fieldset>`
										: ''
								}
								<p class="create-summary" data-create-summary aria-live="polite"></p>
								<button type="submit" ${!result.configured ? 'disabled' : ''}>
									Crear convocatoria
								</button>
							</form>
						</details>`
					: ''
			}<datalist id="raid-rosters">
				${options(['Roster de 20 — Grupo 1', 'Roster de 20 — Grupo 2', 'Roster conjunto de 40', 'Grupo de 10', 'Sin roster fijo'])}
			</datalist>`;
		host.querySelector('[data-refresh]').onclick = () => load().catch((e) => toast(e.message));
		host.querySelector('[data-filters]').oninput = (e) => {
			filters[e.target.name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
			cards();
		};
		cards();
		const create = host.querySelector('[data-create-form]');
		if (create) {
			create.dataset.requestId = crypto.randomUUID();
			// A tap on «?» shows its help instead of focusing the field of its label.
			create.querySelectorAll('.field-hint').forEach((h) =>
				h.addEventListener('click', (e) => {
					e.preventDefault();
					h.focus();
				}),
			);
			const el = create.elements,
				summary = create.querySelector('[data-create-summary]'),
				submit = create.querySelector('[type="submit"]'),
				local = (d) => {
					const p = (n) => String(n).padStart(2, '0');
					return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
				},
				plusHours = (value, h) => local(new Date(new Date(value).getTime() + h * 3600000));
			// Sensible start: the next 23:00 (raid time), ending two hours later.
			const first = new Date();
			if (first.getHours() >= 22) first.setDate(first.getDate() + 1);
			first.setHours(23, 0, 0, 0);
			el.start.value = local(first);
			el.end.value = plusHours(el.start.value, 2);
			let endTouched = false;
			el.end.oninput = () => (endTouched = true);
			el.start.oninput = () => {
				if (!endTouched && el.start.value) el.end.value = plusHours(el.start.value, 2);
			};
			el.roster.oninput = () => {
				const size = el.roster.value.match(/\b(40|20|10)\b/);
				if (size) el.capacity.value = size[1];
			};
			const check = () => {
				const start = el.start.value ? new Date(el.start.value) : null,
					end = el.end.value ? new Date(el.end.value) : null;
				let problem = '';
				if (!start || !end) problem = 'Indica cuándo empieza y termina.';
				else if (start.getTime() < Date.now() + 5 * 60000)
					problem =
						'Esa hora de inicio ya ha pasado o es inminente: nadie podría apuntarse. Revisa la fecha y si es por la mañana o por la noche.';
				else if (end <= start) problem = 'La hora de fin debe ser posterior a la de inicio.';
				const when = (d) =>
					new Intl.DateTimeFormat('es-ES', {
						weekday: 'long',
						day: 'numeric',
						month: 'long',
						hour: '2-digit',
						minute: '2-digit',
					}).format(d);
				summary.classList.toggle('is-problem', !!problem);
				summary.textContent =
					problem ||
					`Se publicará «${el.title.value.trim() || 'sin nombre'}»: ${when(start)} → ${when(end)}, hora de Madrid · ${el.capacity.value || '?'} plazas · ${el.category.value}${el.roster.value.trim() ? ' · ' + el.roster.value.trim() : ''}. Inscripciones abiertas hasta el inicio.`;
				if (result.configured) submit.disabled = !!problem;
			};
			create.addEventListener('input', check);
			check();
			create.onsubmit = (e) => {
				e.preventDefault();
				check();
				if (summary.classList.contains('is-problem')) return;
				const fd = new FormData(create);
				queue(
					'/api/events',
					'POST',
					{
						...Object.fromEntries(fd),
						capacity: Number(fd.get('capacity')),
						public: fd.has('public'),
					},
					create,
				);
			};
			if (me.permissions.includes('recruitment.manage')) {
				const members = await api('/api/members');
				for (const member of members.filter(
					(m) => ['leader', 'officer', 'raid_leader'].includes(m.rank) && m.id !== me.user.id,
				))
					create.elements.organizerId.insertAdjacentHTML(
						'beforeend',
						`<option value="${esc(member.id)}">${esc(member.display_name)}</option>`,
					);
			}
		}
	}
	function cards() {
		const rows = result.events
			.filter(
				(e) =>
					(!filters.from || madrid(e.starts_at).slice(0, 10) >= filters.from) &&
					(!filters.category || e.category === filters.category) &&
					(!filters.roster || e.roster === filters.roster) &&
					(!filters.state || e.state === filters.state) &&
					(!filters.mine || ((e.mine || []).length && e.state === 'Abierta')),
			)
			.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
		host.querySelector('[data-event-cards]').innerHTML = rows.length
			? rows
					.map(
						(e) =>
							/* HTML */ `<article class="card">
								<span class="eyebrow">${esc(e.category)} · ${esc(e.state)}</span>
								<h3>${esc(e.title)}</h3>
								<p>${esc(date(e.starts_at))}<br />Hasta ${esc(date(e.ends_at))}</p>
								<p>${esc(e.roster)}${e.organizer ? `<br>Responsable: ${esc(e.organizer)}` : ''}</p>
								<p>
									<strong>${e.occupied} / ${e.capacity ?? 'sin límite indicado'}</strong> plazas
									ocupadas${e.available !== null ? ` · ${e.available} libres` : ''}
								</p>
								<p>
									${
										Object.entries(e.roles)
											.map(([name, n]) => `${esc(name)}: ${n}`)
											.join(' · ') || 'Sin inscripciones confirmadas'
									}
								</p>
								${e.mine?.length ? `<p>Tu inscripción: ${e.mine.map((s) => esc(s.status)).join(', ')}</p>` : ''}
								<div class="actions">
									${e.canDelete ? `<button type="button" class="secondary danger" data-delete-event="${esc(e.id)}">Borrar convocatoria</button>` : ''}${me.user && e.signups ? `<button type="button" data-event="${esc(e.id)}">Ver convocatoria</button>` : ''}${e.canManage && e.signups ? `<button type="button" class="secondary" data-lineup="${esc(e.id)}">Alineación</button>` : ''}${e.discordUrl ? /* HTML */ `<a class="button secondary" href="${esc(e.discordUrl)}" target="_blank" rel="noopener noreferrer">Discord ↗</a>` : ''}
								</div>
								${e.job ? /* HTML */ `<p class="notice">${esc(jobLabel(e.job.status))} · ${esc(e.job.error || 'Esperando sincronización')}</p>` : ''}
							</article>`,
					)
					.join('')
			: '<p class="notice">No hay convocatorias que coincidan con estos filtros.</p>';
		host.querySelectorAll('[data-delete-event]').forEach((button) => {
			button.onclick = async () => {
				if (
					!confirm(
						'¿Borrar esta convocatoria de la web? Se conservará el historial. No se cancela ni borra en Discord: para quitar su mensaje, usa «Cancelar convocatoria».',
					)
				)
					return;
				button.disabled = true;
				try {
					await api('/api/events/' + button.dataset.deleteEvent, 'DELETE', {});
					selected = null;
					await load();
					toast('Convocatoria borrada de la web');
				} catch (error) {
					button.disabled = false;
					toast(error.message);
				}
			};
		});
		host
			.querySelectorAll('[data-event]')
			.forEach((b) => (b.onclick = () => detail(b.dataset.event).catch((e) => toast(e.message))));
		host.querySelectorAll('[data-lineup]').forEach(
			(b) =>
				(b.onclick = async () => {
					const target = host.querySelector('[data-event-detail]');
					selected = null;
					lineupOpen = true;
					try {
						await mountLineup(target, b.dataset.lineup, ctx, () => {
							lineupOpen = false;
							target.innerHTML = '';
						});
						target.scrollIntoView({ behavior: 'smooth', block: 'start' });
					} catch (e) {
						lineupOpen = false;
						toast(e.message);
					}
				}),
		);
	}
	async function detail(id) {
		lineupOpen = false;
		selected = id;
		const event = await api('/api/events/' + id),
			target = host.querySelector('[data-event-detail]');
		const busy = event.job && ['pending', 'running', 'uncertain'].includes(event.job.status);
		target.innerHTML = /* HTML */ `<section class="card section">
			<div class="section-head">
				<h3>${esc(event.title)}</h3>
				<button type="button" class="secondary" data-close>Cerrar</button>
			</div>
			<p>${esc(event.state)} · ${esc(date(event.starts_at))} · ${esc(event.roster)}</p>
			${event.job ? /* HTML */ `<p class="notice">${esc(jobLabel(event.job.status))}: ${esc(event.job.error || 'Pendiente de confirmación externa')}</p>` : ''}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Jugador / personaje</th>
							<th>Clase / especialización</th>
							<th>Rol</th>
							<th>Estado</th>
							${event.canManage ? '<th>Gestión</th>' : ''}
						</tr>
					</thead>
					<tbody>
						${
							event.signups
								.map(
									(s) =>
										/* HTML */ `<tr>
											<td>
												${esc(s.characterName || s.name)}<small class="cell-detail"
													>${s.registeredCharacter ? 'Personaje vinculado en la web' : 'Sin personaje vinculado en la web'}</small
												>
											</td>
											<td>${esc(s.registeredClass || s.className)} · ${esc(s.specName)}</td>
											<td>${esc(s.role || 'Sin indicar')}</td>
											<td>${esc(s.status)}</td>
											${event.canManage ? /* HTML */ `<td><button type="button" class="secondary" data-participant="${esc(s.userId)}">Gestionar</button></td>` : ''}
										</tr>`,
								)
								.join('') || '<tr><td colspan="5">Sin inscripciones</td></tr>'
						}
					</tbody>
				</table>
			</div>
			<div data-signup-form></div>
			${
				event.cancelledSignups?.length
					? /* HTML */ `<details>
							<summary>Inscripciones canceladas</summary>
							${event.cancelledSignups.map((s) => `<p>${esc(s.name)} · ${esc(s.className)} · Cancelado (${esc(date(s.cancelledAt))})</p>`).join('')}
						</details>`
					: ''
			}${
				event.canManage
					? /* HTML */ `<details class="section">
								<summary>Modificar convocatoria</summary>
								<form class="form" data-edit>
									<div class="form-grid">
										${input('Nombre', 'title', event.title, 'text', 'required maxlength="120"')}${input('Inicio · Madrid', 'start', madrid(event.starts_at), 'datetime-local', 'required')}${input('Fin · Madrid', 'end', madrid(event.ends_at), 'datetime-local', 'required')}${input('Capacidad', 'capacity', event.capacity ?? 20, 'number', 'min="1" max="1000" required')}${event.roleLimits.map((r, i) => input(`Límite ${esc(r.name)} (vacío: conservar)`, 'role' + i, '', 'number', 'min="1" max="1000"')).join('')}
									</div>
									${
										event.provider === 'bot'
											? /* HTML */ `<label
													>Texto de la convocatoria<textarea
														name="description"
														rows="3"
														maxlength="1500"
													>
${esc(event.description || '')}</textarea>
												</label>`
											: ''
									}
									<button type="submit" ${busy || event.state !== 'Abierta' ? 'disabled' : ''}>
										Guardar y actualizar en Discord
									</button>
								</form>
							</details>
							<details class="section">
								<summary>Clasificación y visibilidad en la web</summary>
								<form class="form" data-meta>
									<label
										>Categoría<select name="category">
											${options(categories, event.category)}
										</select></label
									>${input('Roster · nombre libre', 'roster', event.roster === 'Sin roster fijo' ? '' : event.roster, 'text', 'maxlength="80" list="raid-rosters"')}<label
										><input type="checkbox" name="public" ${event.public ? 'checked' : ''} />Resumen
										público</label
									><button type="submit">Guardar clasificación</button>
								</form>
							</details>
							<div class="actions section">
								${event.state === 'Abierta' ? /* HTML */ `<button type="button" class="secondary danger" data-cancel ${busy ? 'disabled' : ''}>Cancelar convocatoria</button>` : ''}${event.job?.status === 'blocked' ? '<button type="button" class="secondary" data-retry>Reintentar conexión</button>' : ''}
							</div>`
					: ''
			}
		</section>`;
		target.querySelector('[data-close]').onclick = () => {
			selected = null;
			target.innerHTML = '';
		};
		const form = target.querySelector('[data-edit]');
		if (form) {
			form.dataset.requestId = crypto.randomUUID();
			form.onsubmit = (e) => {
				e.preventDefault();
				const fd = new FormData(form);
				queue(
					'/api/events/' + id,
					'PATCH',
					{
						title: fd.get('title'),
						start: fd.get('start'),
						end: fd.get('end'),
						capacity: Number(fd.get('capacity')),
						...(fd.has('description') ? { description: fd.get('description').trim() } : {}),
						revision: event.revision,
						roleLimits: event.roleLimits.flatMap((r, i) =>
							fd.get('role' + i) ? [{ name: r.name, limit: Number(fd.get('role' + i)) }] : [],
						),
					},
					form,
				);
			};
		}
		const meta = target.querySelector('[data-meta]');
		if (meta)
			meta.onsubmit = async (e) => {
				e.preventDefault();
				try {
					const fd = new FormData(meta);
					await api('/api/events/' + id + '/metadata', 'PATCH', {
						...Object.fromEntries(fd),
						public: fd.has('public'),
						revision: event.revision,
					});
					toast('Clasificación guardada');
					await load();
					await detail(id);
				} catch (error) {
					toast(error.message);
				}
			};
		const cancel = target.querySelector('[data-cancel]');
		if (cancel)
			cancel.onclick = () => {
				if (
					confirm(
						'¿Cancelar esta convocatoria? Se eliminará su mensaje de Discord y se conservará el historial en la web.',
					)
				)
					queue('/api/events/' + id + '/cancel', 'POST', { revision: event.revision });
			};
		const retry = target.querySelector('[data-retry]');
		if (retry) retry.onclick = () => queue('/api/events/' + id + '/retry', 'POST', {});
		const own = await api('/api/characters');
		let roster = null;
		async function signupForm(userId) {
			const box = target.querySelector('[data-signup-form]');
			if (!box) return;
			let characters = own;
			if (userId !== me.user.id) {
				roster = roster || (await api('/api/roster'));
				characters = roster.filter((c) => c.user_id === userId);
			}
			const mine = event.signups.filter(
					(s) => s.userId === userId || (s.own && userId === me.user.id),
				),
				current = mine[0];
			box.innerHTML = /* HTML */ `<h4>
					${userId === me.user.id ? 'Mi inscripción' : 'Gestionar participante'}
				</h4>
				${
					characters.length
						? /* HTML */ `<form class="form" data-signup>
								<div class="form-grid">
									<label
										>Personaje registrado<select name="characterId">
											${characters.map((c) => /* HTML */ `<option value="${esc(c.id)}" ${current?.characterId === c.id ? 'selected' : ''}>${esc(c.name)} · ${esc(c.class)} · ${esc(c.spec || 'Sin especialización')}</option>`).join('')}
										</select></label
									><label
										>Clase u opción<select name="className">
											${options(
												event.classes.map((c) => c.name),
												current?.className,
											)}
										</select></label
									><label>Especialización<select name="specName"></select></label>
								</div>
								<p>
									Selecciona la clase o grupo de rol y la especialización correspondientes a tu
									personaje. Las opciones de suplencia, ausencia y disponibilidad dependen de la
									plantilla del evento.
								</p>
								<button type="submit" ${busy || event.state !== 'Abierta' ? 'disabled' : ''}>
									${current ? 'Actualizar inscripción' : 'Apuntarme'}
								</button>
							</form>`
						: '<p>Primero registra un personaje en <a href="/perfil">tu perfil</a>. No se inventarán personajes a partir del nombre de Discord.</p>'
				}${current ? /* HTML */ `<button type="button" class="secondary danger" data-withdraw ${busy || event.state !== 'Abierta' ? 'disabled' : ''}>Cancelar inscripción</button>` : ''}`;
			const f = box.querySelector('[data-signup]');
			if (f) {
				f.dataset.requestId = crypto.randomUUID();
				const specs = () => {
					const cls = event.classes.find((c) => c.name === f.elements.className.value);
					f.elements.specName.innerHTML = options(
						(cls?.specs || []).map((s) => s.name),
						current?.specName,
					);
					f.elements.specName.required = Boolean(cls?.specs.length);
				};
				f.elements.className.onchange = specs;
				specs();
				f.onsubmit = (e) => {
					e.preventDefault();
					queue(
						'/api/events/' + id + '/signup',
						'POST',
						{ ...Object.fromEntries(new FormData(f)), userId },
						f,
					);
				};
			}
			const withdraw = box.querySelector('[data-withdraw]');
			if (withdraw)
				withdraw.onclick = () => {
					if (confirm('¿Cancelar esta inscripción?'))
						queue('/api/events/' + id + '/signup', 'POST', { cancel: true, userId });
				};
		}
		target
			.querySelectorAll('[data-participant]')
			.forEach(
				(b) => (b.onclick = () => signupForm(b.dataset.participant).catch((e) => toast(e.message))),
			);
		await signupForm(me.user.id);
		target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}
	await load();
	if (!host.isConnected) return;
	const timer = setInterval(() => {
		if (!host.isConnected) {
			clearInterval(timer);
			return;
		}
		// Only while someone is looking: a tab left in the background does not keep asking.
		if (
			document.visibilityState === 'visible' &&
			!selected &&
			!lineupOpen &&
			!host.querySelector('[data-create][open]')
		)
			load().catch(() => {});
	}, 30000);
}
