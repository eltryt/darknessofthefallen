// Panel → Convocatorias: the guild's own sign-up bot. Up front only what anyone needs: the
// three set-up steps and how players sign up. Everything else (texts, roles, classes, icons)
// waits folded under «Ajustes»; saving sends it to the open events' Discord messages.
const kinds = { bench: 'Suplente / banquillo', tentative: 'Tentativo', absence: 'Ausente' };

export async function mountRaidBot(host, ctx) {
	const { api, esc, me, toast } = ctx;
	if (!me.permissions.includes('recruitment.manage')) return;
	let data;
	try {
		data = await api('/api/raid-bot');
	} catch {
		return;
	}
	let config = structuredClone(data.config),
		dirty = false;
	// Folded parts stay as the user left them across re-renders.
	const opened = new Set();

	const icons = () => new Map(data.icons.map((icon) => [icon.name, icon]));
	// A website icon shows its image; an emoji shows as text; a server emoji as a tag.
	const glyph = (value) => {
		const icon = icons().get(value);
		if (icon)
			return `<img src="${esc(icon.file)}" alt="" width="20" height="20" class="bot-glyph" />`;
		if (/^<a?:\w+:\d+>$/.test(value || ''))
			return `<span class="bot-glyph-text" title="Emoji del servidor">${esc(value.split(':')[1])}</span>`;
		return value ? `<span class="bot-glyph-text">${esc(value)}</span>` : '';
	};
	const text = (path, value, extra = '') =>
		`<input type="text" data-path="${path}" value="${esc(value ?? '')}" ${extra} />`;
	const number = (path, value, extra = '') =>
		`<input type="number" data-path="${path}" data-number value="${esc(value ?? '')}" min="1" max="1000" ${extra} />`;
	const iconInput = (path, value) =>
		`<span class="bot-icon"><span data-glyph="${path}">${glyph(value)}</span>${text(path, value, 'list="bot-icon-names" maxlength="60" placeholder="icono" aria-label="Icono" title="Icono: nombre de un icono de la web, un emoji o <:nombre:id>"')}</span>`;
	// Wrapped: the panel lays out as a grid any fieldset with checkboxes straight inside.
	const check = (path, value, label) =>
		`<div class="bot-check"><label><input type="checkbox" data-path="${path}" ${value ? 'checked' : ''} />${label}</label></div>`;
	const remove = (act, title) =>
		`<button type="button" class="secondary danger bot-small" data-act="${act}" title="${title}" aria-label="${title}">✕</button>`;
	const fold = (key, title, body, extra = '') =>
		`<details class="bot-fold ${extra}" data-fold="${key}" ${opened.has(key) ? 'open' : ''}><summary>${title}</summary><div class="bot-fold-body">${body}</div></details>`;

	function steps() {
		const uploaded = data.icons.filter((icon) => icon.uploaded).length,
			total = data.icons.length,
			connected = data.connected && uploaded === total;
		const step = (done, n, title, help, action) =>
			/* HTML */ `<li class="bot-step ${done ? 'is-done' : ''}">
				<span class="bot-step-mark">${done ? '✓' : n}</span>
				<div>
					<strong>${title}</strong>
					<p>${help}</p>
					${action}
				</div>
			</li>`;
		if (!data.tokenReady)
			return '<p class="notice">Falta instalar el token del bot en el servidor. Lo hace el propietario (docs/DISCORD_BOT.md).</p>';
		return /* HTML */ `<ol class="bot-steps">
				${step(
					connected,
					1,
					'Conectar el bot con Discord',
					connected
						? `Conectado a «${esc(data.appName)}» con los ${total} iconos.`
						: data.connected
							? `Faltan ${total - uploaded} iconos por subir: Discord limita cuántos se suben seguidos. Pulsa otra vez (si sigue faltando alguno, espera un minuto).`
							: 'Sube los iconos de clase, especialización y rol y conecta los botones de Discord con la web.',
					`<button type="button" class="${connected ? 'secondary' : ''}" data-connect>${connected ? 'Volver a sincronizar' : data.connected ? 'Subir los iconos que faltan' : 'Conectar con Discord'}</button>`,
				)}
				${step(
					false,
					2,
					'Dar permisos al bot en el servidor',
					'Solo hace falta una vez. Discord pide elegir el servidor y aceptar.',
					data.inviteUrl
						? `<a class="button secondary" href="${esc(data.inviteUrl)}" target="_blank" rel="noopener noreferrer">Dar permisos ↗</a>`
						: '<em class="muted">Disponible tras el paso 1.</em>',
				)}
				${step(
					Boolean(config.channelId || data.defaultChannelId),
					3,
					'Canal donde se publican las convocatorias',
					'En Discord: clic derecho en el canal → «Copiar ID» (con el modo desarrollador activado).',
					`<div class="bot-row">${text('channelId', config.channelId, `inputmode="numeric" placeholder="${esc(data.defaultChannelId || 'ID del canal')}" aria-label="ID del canal"`)}<button type="submit" class="secondary">Guardar</button></div>`,
				)}
			</ol>
			${data.report ? report(data.report) : ''}
			${data.errors.map((e) => `<p class="error">«${esc(e.title)}»: ${esc(e.error)}</p>`).join('')}`;
	}
	const report = (r) =>
		/* HTML */ `<p class="notice">
			${r.created} iconos
			subidos${r.failed.length ? `, ${r.failed.length} pendientes (pulsa otra vez en un minuto)` : ''}.
			Botones: ${r.endpoint === 'ok' ? 'conectados a la web ✓' : esc(r.endpoint)}. Canal:
			${r.channel === 'ok' ? 'el bot puede publicar ✓' : esc(r.channel)}.
			${r.retried ? `Se vuelven a publicar ${r.retried} convocatorias que estaban bloqueadas.` : ''}
		</p>`;
	const howTo = /* HTML */ `<div class="bot-howto">
		<strong>Cómo se apunta un jugador</strong>
		<ol>
			<li>Entra en la web con su cuenta de Discord.</li>
			<li>En <em>Mi perfil → Personajes</em> pulsa <em>Actualizar desde Battle.net</em>.</li>
			<li>En la convocatoria de Discord pulsa <em>✅ Apuntarme</em>.</li>
		</ol>
		<p class="muted">
			Sin personaje actualizado desde Battle.net el bot no le deja apuntarse y le explica estos
			pasos. Las convocatorias se crean más arriba, en «Crear convocatoria y publicar en Discord».
		</p>
	</div>`;

	function classFold(c, i) {
		const body = /* HTML */ `<div class="bot-row">
				${iconInput(`classes.${i}.icon`, c.icon)}
				${text(`classes.${i}.name`, c.name, 'maxlength="32" required aria-label="Nombre de la clase"')}
				${number(`classes.${i}.limit`, c.limit, 'placeholder="sin límite" aria-label="Máximo de esta clase" title="Máximo de jugadores de esta clase"')}
				${remove(`del-class:${i}`, 'Quitar clase')}
			</div>
			${c.specs
				.map(
					(s, j) =>
						/* HTML */ `<div class="bot-row bot-spec">
							${iconInput(`classes.${i}.specs.${j}.icon`, s.icon)}
							${text(`classes.${i}.specs.${j}.name`, s.name, 'maxlength="32" required aria-label="Especialización"')}
							<select data-path="classes.${i}.specs.${j}.roleName" aria-label="Rol">
								<option value="">Sin rol</option>
								${config.roles.map((r) => `<option ${r.name === s.roleName ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
							</select>
							${remove(`del-spec:${i}:${j}`, 'Quitar especialización')}
						</div>`,
				)
				.join('')}
			<button type="button" class="secondary bot-small" data-act="add-spec:${i}">
				+ Especialización
			</button>`;
		return fold(
			`class:${i}`,
			`${glyph(c.icon)} ${esc(c.name)} <span class="bot-fold-icons">${c.specs.map((s) => glyph(s.icon)).join('')}</span>${c.limit ? ` <span class="muted">· máx. ${c.limit}</span>` : ''}`,
			body,
			'bot-class',
		);
	}
	function settings() {
		const primary = config.classes.map((c, i) => [c, i]).filter(([c]) => c.type !== 'default'),
			extra = config.classes.map((c, i) => [c, i]).filter(([c]) => c.type === 'default');
		const message = /* HTML */ `<label
				>Texto por defecto de cada convocatoria<textarea
					data-path="description"
					rows="3"
					maxlength="1500"
					placeholder="Normas, consumibles, hora de invitaciones…"
				>
${esc(config.description)}</textarea>
			</label>
			<div class="form-grid">
				<label
					>Rol a mencionar al publicar
					(ID)${text('mentionRoleId', config.mentionRoleId, 'inputmode="numeric" placeholder="vacío: sin mención"')}</label
				>
				<label
					>Cerrar inscripciones (minutos antes)<input
						type="number"
						data-path="closeMinutes"
						data-number
						data-zero
						value="${esc(config.closeMinutes)}"
						min="0"
						max="10080"
				/></label>
				<label>Color<input type="color" data-path="color" value="${esc(config.color)}" /></label>
				<label
					>Agrupar inscritos por<select data-path="groupBy">
						<option value="class" ${config.groupBy === 'class' ? 'selected' : ''}>Clase</option>
						<option value="role" ${config.groupBy === 'role' ? 'selected' : ''}>Rol</option>
					</select></label
				>
				<label
					>Imagen de cabecera
					(https)${text('imageUrl', config.imageUrl, 'maxlength="300" placeholder="https://…"')}</label
				>
				<label>Pie del mensaje${text('footer', config.footer, 'maxlength="200"')}</label>
			</div>
			${check('showWebLink', config.showWebLink, 'Botones «Mi perfil» y «Ver en la web»')}`;
		const roles = /* HTML */ `${config.roles
				.map(
					(r, i) =>
						/* HTML */ `<div class="bot-row">
							${iconInput(`roles.${i}.icon`, r.icon)}
							${text(`roles.${i}.name`, r.name, 'maxlength="32" required aria-label="Rol"')}
							${number(`roles.${i}.limit`, r.limit, 'placeholder="sin límite" aria-label="Máximo del rol" title="Máximo de jugadores con este rol"')}
							${remove(`del-role:${i}`, 'Quitar rol')}
						</div>`,
				)
				.join('')}
			<button type="button" class="secondary bot-small" data-act="add-role">+ Rol</button>`;
		const classes = /* HTML */ `<p class="muted">
				Cada especialización indica su rol, que cuenta para los límites. Los jugadores no eligen
				clase: se usa la de su personaje vinculado.
			</p>
			${primary.map(([c, i]) => classFold(c, i)).join('')}
			<button type="button" class="secondary bot-small" data-act="add-class">+ Clase</button>`;
		const extras = /* HTML */ `${extra
			.map(
				([c, i]) =>
					/* HTML */ `<div class="bot-row">
						${iconInput(`classes.${i}.icon`, c.icon)}
						${text(`classes.${i}.name`, c.name, 'maxlength="32" required aria-label="Nombre del botón"')}
						<select data-path="classes.${i}.kind" aria-label="Qué significa">
							${Object.entries(kinds)
								.map(
									([k, label]) =>
										`<option value="${k}" ${c.kind === k ? 'selected' : ''}>${label}</option>`,
								)
								.join('')}
						</select>
						${remove(`del-class:${i}`, 'Quitar botón')}
					</div>`,
			)
			.join('')}
		${extra.length < 3 ? '<button type="button" class="secondary bot-small" data-act="add-extra">+ Botón</button>' : ''}`;
		return fold(
			'settings',
			'⚙️ Ajustes del mensaje, roles y clases',
			[
				fold('message', 'Mensaje', message),
				fold('roles', 'Roles y límites', roles),
				fold('classes', 'Clases y especializaciones', classes),
				fold('extras', 'Botones extra (suplente, tentativo, ausente)', extras),
				/* HTML */ `<div class="bot-save">
					<label class="bot-check-inline"
						><input type="checkbox" data-apply checked />Actualizar también las ${data.openEvents}
						convocatorias abiertas</label
					>
					<div class="actions">
						<button type="submit">Guardar y enviar a Discord</button>
						<button type="button" class="secondary" data-act="defaults">
							Restaurar plantilla por defecto
						</button>
					</div>
				</div>`,
			].join(''),
		);
	}
	// An approximation of the message: enough to see order, icons, texts and buttons.
	function preview() {
		const extra = config.classes.filter((c) => c.type === 'default'),
			sample = config.classes
				.filter((c) => c.type !== 'default')
				.slice(0, 3)
				.map((c, i) => ({ cls: c, spec: c.specs[0], name: ['Arthas', 'Jaina', 'Uther'][i] })),
			groups =
				config.groupBy === 'role'
					? config.roles
							.map((r) => [r, sample.filter((s) => s.spec?.roleName === r.name)])
							.filter(([, members]) => members.length)
							.map(
								([r, members]) =>
									`<div><strong>${glyph(r.icon)} ${esc(r.name)} (${members.length})</strong>${members.map((s) => `<span>${glyph(s.cls.icon)}${glyph(s.spec?.icon)} ${s.name}</span>`).join('')}</div>`,
							)
					: sample.map(
							(s) =>
								`<div><strong>${glyph(s.cls.icon)} ${esc(s.cls.name)} (1)</strong><span>${glyph(s.spec?.icon)} ${s.name}</span></div>`,
						);
		return /* HTML */ `<div class="bot-preview" style="border-left-color:${esc(config.color)}">
			<strong class="bot-preview-title">Núcleo de Magma — ejemplo</strong>
			${config.description ? `<p class="bot-preview-text">${esc(config.description)}</p>` : ''}
			<p>📅 martes, 23:00 · en 3 días<br />👥 <strong>${sample.length}/20</strong> inscritos</p>
			<p>
				${config.roles.map((r) => `${glyph(r.icon)} ${esc(r.name)} <strong>${sample.filter((s) => s.spec?.roleName === r.name).length}${r.limit ? '/' + r.limit : ''}</strong>`).join(' · ')}
			</p>
			<p>
				📝 Para apuntarte necesitas <strong>entrar en la web con Discord</strong> y tener tu
				personaje <strong>actualizado desde Battle.net</strong> (Mi perfil → Personajes → Actualizar
				desde Battle.net).
			</p>
			<div class="bot-preview-groups">${groups.join('')}</div>
			${config.imageUrl ? '<p class="muted">[imagen de cabecera]</p>' : ''}
			${config.footer ? `<small class="muted">${esc(config.footer)}</small>` : ''}
			<div class="bot-buttons">
				<span class="bot-button bot-go">✅ Apuntarme</span
				>${extra.map((c) => `<span class="bot-button">${glyph(c.icon)}${esc(c.name)}</span>`).join('')}<span
					class="bot-button bot-danger"
					>Retirarme</span
				>
			</div>
			${config.showWebLink ? '<div class="bot-buttons"><span class="bot-button">Mi perfil (Battle.net) ↗</span><span class="bot-button">Ver en la web ↗</span></div>' : ''}
		</div>`;
	}

	const at = (path) => {
		const keys = path.split('.'),
			last = keys.pop();
		return [keys.reduce((target, key) => target[key], config), last];
	};
	function render() {
		const uploaded = data.icons.filter((icon) => icon.uploaded).length,
			ready = data.connected && uploaded === data.icons.length;
		host.innerHTML = /* HTML */ `<details
			class="card section bot-editor"
			data-fold="editor"
			${opened.has('editor') ? 'open' : ''}
		>
			<summary>
				🤖 Bot de inscripciones en Discord ·
				${ready ? '<span class="bot-ok">listo</span>' : '<span class="bot-pending">falta configurarlo</span>'}
			</summary>
			<form class="bot-form" data-bot-form>
				${ready ? fold('setup', '✓ Puesta en marcha', steps()) : steps()} ${howTo}
				${fold('preview', 'Vista previa del mensaje de Discord', '<div data-preview></div>')}
				${settings()}
				<datalist id="bot-icon-names">
					${data.icons.map((icon) => `<option value="${esc(icon.name)}"></option>`).join('')}
				</datalist>
			</form>
		</details>`;
		const f = host.querySelector('[data-bot-form]'),
			shown = host.querySelector('[data-preview]');
		host
			.querySelectorAll('[data-fold]')
			.forEach((d) =>
				d.addEventListener('toggle', () =>
					d.open ? opened.add(d.dataset.fold) : opened.delete(d.dataset.fold),
				),
			);
		shown.innerHTML = preview();
		f.oninput = (e) => {
			const input = e.target;
			if (!input.dataset.path) return;
			const [target, key] = at(input.dataset.path),
				before = target[key];
			target[key] =
				input.type === 'checkbox'
					? input.checked
					: 'number' in input.dataset
						? input.value === ''
							? 'zero' in input.dataset
								? 0
								: null
							: Number(input.value)
						: input.value;
			// A renamed role keeps its specializations.
			if (/^roles\.\d+\.name$/.test(input.dataset.path))
				for (const c of config.classes)
					for (const s of c.specs) if (s.roleName === before) s.roleName = input.value;
			const mark = f.querySelector(`[data-glyph="${input.dataset.path}"]`);
			if (mark) mark.innerHTML = glyph(input.value.trim());
			dirty = true;
			shown.innerHTML = preview();
		};
		// Role names feed the selectors of every specialization.
		f.onchange = (e) => {
			if (/^roles\.\d+\.name$/.test(e.target.dataset?.path || '')) render();
		};
		f.onclick = (e) => {
			const act = e.target.closest('[data-act]')?.dataset.act;
			if (!act) return;
			const [name, a, b] = act.split(':'),
				i = Number(a),
				list = config.classes;
			if (name === 'add-class') {
				list.splice(list.findLastIndex((c) => c.type !== 'default') + 1, 0, {
					name: 'Nueva clase',
					icon: '',
					type: 'primary',
					limit: null,
					specs: [],
				});
				opened.add(`class:${list.findLastIndex((c) => c.type !== 'default')}`);
			} else if (name === 'add-extra')
				list.push({
					name: 'Nueva opción',
					icon: '❔',
					type: 'default',
					kind: 'tentative',
					limit: null,
					specs: [],
				});
			else if (name === 'del-class') {
				if (!confirm(`¿Quitar «${list[i].name}»?`)) return;
				list.splice(i, 1);
			} else if (name === 'add-spec')
				list[i].specs.push({ name: 'Nueva', icon: '', roleName: config.roles[0]?.name || '' });
			else if (name === 'del-spec') list[i].specs.splice(Number(b), 1);
			else if (name === 'add-role') config.roles.push({ name: 'Nuevo rol', icon: '', limit: null });
			else if (name === 'del-role') {
				const [gone] = config.roles.splice(i, 1);
				for (const c of list)
					for (const s of c.specs) if (s.roleName === gone.name) s.roleName = '';
			} else if (name === 'defaults') {
				if (
					!confirm(
						'¿Volver a la plantilla por defecto (9 clases, especializaciones e iconos de rol)? No se guarda hasta que pulses «Guardar».',
					)
				)
					return;
				config = {
					...structuredClone(data.defaults),
					channelId: config.channelId,
					mentionRoleId: config.mentionRoleId,
				};
			}
			dirty = true;
			render();
		};
		f.onsubmit = async (e) => {
			e.preventDefault();
			const buttons = [...f.querySelectorAll('[type="submit"]')];
			buttons.forEach((b) => (b.disabled = true));
			try {
				const trimmed = structuredClone(config);
				trimmed.description = trimmed.description.trim();
				data = await api('/api/raid-bot', 'PUT', {
					config: trimmed,
					applyToOpen: f.querySelector('[data-apply]').checked,
				});
				config = structuredClone(data.config);
				dirty = false;
				toast(
					data.updated
						? `Guardado. ${data.updated} convocatorias abiertas se actualizan en Discord en unos segundos.`
						: 'Guardado.',
				);
				render();
			} catch (error) {
				toast(error.message);
				buttons.forEach((b) => (b.disabled = false));
			}
		};
		const connect = host.querySelector('[data-connect]');
		if (connect)
			connect.onclick = async () => {
				connect.disabled = true;
				connect.textContent = 'Conectando con Discord…';
				try {
					data = await api('/api/raid-bot/connect', 'POST', {});
					// Unsaved edits of the form stay as they are.
					if (!dirty) config = structuredClone(data.config);
					toast('Bot sincronizado con Discord');
				} catch (error) {
					toast(error.message);
				}
				render();
			};
	}
	// Open by default until the bot is set up, then folded out of the way.
	const ready = data.connected && data.icons.every((icon) => icon.uploaded);
	if (!ready) opened.add('editor');
	render();
}
