// Panel → Convocatorias: editor of the guild's own sign-up bot. Everything the Discord
// message shows (classes, specializations, icons, roles, limits, texts, colours) is edited
// here; saving sends it to the open events' messages.
const kinds = { bench: 'Suplente / banquillo', tentative: 'Tentativo', absence: 'Ausente' };

export async function mountRaidBot(host, ctx) {
	const { api, esc, me, toast } = ctx;
	if (!me.permissions.includes('recruitment.manage')) return;
	let data, config;
	try {
		data = await api('/api/raid-bot');
	} catch {
		return;
	}
	config = structuredClone(data.config);
	let open = false,
		dirty = false;

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
		`<span class="bot-icon"><span data-glyph="${path}">${glyph(value)}</span>${text(path, value, 'list="bot-icon-names" maxlength="60" placeholder="icono o emoji" aria-label="Icono"')}</span>`;
	// Wrapped: the panel lays out as a grid any fieldset with checkboxes straight inside.
	const check = (path, value, label) =>
		`<div class="bot-check"><label><input type="checkbox" data-path="${path}" ${value ? 'checked' : ''} />${label}</label></div>`;
	const remove = (act, title) =>
		`<button type="button" class="secondary danger bot-small" data-act="${act}" title="${title}" aria-label="${title}">✕</button>`;

	function status() {
		const uploaded = data.icons.filter((icon) => icon.uploaded).length;
		const row = (ok, label) =>
			`<li class="${ok ? 'bot-ok' : 'bot-pending'}">${ok ? '✓' : '○'} ${label}</li>`;
		return /* HTML */ `<ul class="bot-status">
				${row(data.tokenReady, data.tokenReady ? 'Token del bot instalado en el servidor' : 'Falta el token del bot en el servidor (lo instala el propietario, ver docs/DISCORD_BOT.md)')}
				${row(data.connected, data.connected ? `Conectado a la aplicación «${esc(data.appName)}»` : 'Sin conectar con Discord todavía')}
				${row(uploaded === data.icons.length, `${uploaded} de ${data.icons.length} iconos de clase y especialización subidos como emojis del bot`)}
				${row(config.enabled && data.connected, config.enabled ? 'Las convocatorias nuevas las publica este bot' : 'Apagado: las convocatorias nuevas siguen saliendo por Raid-Helper')}
			</ul>
			${data.report ? report(data.report) : ''}
			${data.errors.map((e) => `<p class="error">«${esc(e.title)}»: ${esc(e.error)}</p>`).join('')}
			<div class="actions">
				<button type="button" data-connect ${data.tokenReady ? '' : 'disabled'}>
					${data.connected ? 'Volver a sincronizar con Discord' : 'Conectar con Discord y subir iconos'}
				</button>
				${data.inviteUrl ? `<a class="button secondary" href="${esc(data.inviteUrl)}" target="_blank" rel="noopener noreferrer">Dar permisos al bot en el servidor ↗</a>` : ''}
			</div>`;
	}
	const report = (r) =>
		/* HTML */ `<p class="notice">
			Sincronizado: ${r.created} iconos nuevos
			subidos${r.failed.length ? `, ${r.failed.length} sin subir (${esc(r.failed.slice(0, 5).join(', '))}); pulsa otra vez en un minuto` : ''}.
			Botones de Discord: ${r.endpoint === 'ok' ? 'conectados a la web' : esc(r.endpoint)}. Canal:
			${r.channel === 'ok' ? 'visible para el bot' : esc(r.channel)}.
		</p>`;

	function classCard(c, i) {
		return /* HTML */ `<div class="bot-class">
			<div class="bot-row">
				${iconInput(`classes.${i}.icon`, c.icon)}
				${text(`classes.${i}.name`, c.name, 'maxlength="32" required aria-label="Nombre de la clase"')}
				${number(`classes.${i}.limit`, c.limit, 'placeholder="sin límite" aria-label="Límite de la clase"')}
				<button type="button" class="secondary bot-small" data-act="up:${i}" title="Subir">
					↑
				</button>
				<button type="button" class="secondary bot-small" data-act="down:${i}" title="Bajar">
					↓
				</button>
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
			</button>
		</div>`;
	}
	function form() {
		const primary = config.classes.map((c, i) => [c, i]).filter(([c]) => c.type !== 'default'),
			extra = config.classes.map((c, i) => [c, i]).filter(([c]) => c.type === 'default');
		return /* HTML */ `<form class="bot-form" data-bot-form>
			<fieldset class="create-group">
				<legend>Publicación</legend>
				${check('enabled', config.enabled, 'Publicar las convocatorias nuevas con este bot (en lugar de Raid-Helper)')}
				<div class="form-grid">
					<label
						>ID del canal de
						convocatorias${text('channelId', config.channelId, `inputmode="numeric" placeholder="${esc(data.defaultChannelId || 'clic derecho en el canal → Copiar ID')}"`)}</label
					>
					<label
						>ID del rol a mencionar al
						publicar${text('mentionRoleId', config.mentionRoleId, 'inputmode="numeric" placeholder="vacío: sin mención"')}</label
					>
					<label
						>Cerrar inscripciones (minutos antes del inicio)<input
							type="number"
							data-path="closeMinutes"
							data-number
							data-zero
							value="${esc(config.closeMinutes)}"
							min="0"
							max="10080"
					/></label>
				</div>
			</fieldset>
			<fieldset class="create-group">
				<legend>Aspecto del mensaje</legend>
				<div class="form-grid">
					<label>Color<input type="color" data-path="color" value="${esc(config.color)}" /></label>
					<label
						>Agrupar inscritos por<select data-path="groupBy">
							<option value="class" ${config.groupBy === 'class' ? 'selected' : ''}>Clase</option>
							<option value="role" ${config.groupBy === 'role' ? 'selected' : ''}>Rol</option>
						</select></label
					>
					<label class="wide"
						>Texto por defecto de cada convocatoria<textarea
							data-path="description"
							rows="3"
							maxlength="1500"
							placeholder="Normas, consumibles, hora de invitaciones…"
						>
${esc(config.description)}</textarea>
					</label>
					<label
						>Imagen de cabecera
						(https)${text('imageUrl', config.imageUrl, 'maxlength="300" placeholder="https://…"')}</label
					>
					<label>Pie del mensaje${text('footer', config.footer, 'maxlength="200"')}</label>
				</div>
				${check('buttonLabels', config.buttonLabels, 'Botones con el nombre de la clase además del icono')}
				${check('showWebLink', config.showWebLink, 'Botón «Ver en la web»')}
			</fieldset>
			<fieldset class="create-group">
				<legend>Roles y límites</legend>
				${config.roles
					.map(
						(r, i) =>
							/* HTML */ `<div class="bot-row">
								${iconInput(`roles.${i}.icon`, r.icon)}
								${text(`roles.${i}.name`, r.name, 'maxlength="32" required aria-label="Rol"')}
								${number(`roles.${i}.limit`, r.limit, 'placeholder="sin límite" aria-label="Límite del rol"')}
								${remove(`del-role:${i}`, 'Quitar rol')}
							</div>`,
					)
					.join('')}
				<button type="button" class="secondary bot-small" data-act="add-role">+ Rol</button>
			</fieldset>
			<fieldset class="create-group">
				<legend>Clases y especializaciones</legend>
				<p class="muted">
					Icono: elige uno de la lista (los de la web), escribe un emoji o pega un emoji del
					servidor como <code>&lt;:nombre:id&gt;</code>. Cada clase es un botón en Discord; con
					varias especializaciones, el jugador elige una en un menú privado.
				</p>
				<div class="bot-classes">${primary.map(([c, i]) => classCard(c, i)).join('')}</div>
				<button type="button" class="secondary bot-small" data-act="add-class">+ Clase</button>
			</fieldset>
			<fieldset class="create-group">
				<legend>Opciones extra</legend>
				${extra
					.map(
						([c, i]) =>
							/* HTML */ `<div class="bot-row">
								${iconInput(`classes.${i}.icon`, c.icon)}
								${text(`classes.${i}.name`, c.name, 'maxlength="32" required aria-label="Nombre de la opción"')}
								<select data-path="classes.${i}.kind" aria-label="Qué significa">
									${Object.entries(kinds)
										.map(
											([k, label]) =>
												`<option value="${k}" ${c.kind === k ? 'selected' : ''}>${label}</option>`,
										)
										.join('')}
								</select>
								${remove(`del-class:${i}`, 'Quitar opción')}
							</div>`,
					)
					.join('')}
				${extra.length < 3 ? '<button type="button" class="secondary bot-small" data-act="add-extra">+ Opción</button>' : ''}
			</fieldset>
			<datalist id="bot-icon-names">
				${data.icons.map((icon) => `<option value="${esc(icon.name)}"></option>`).join('')}
			</datalist>
			<h4>Vista previa del mensaje de Discord</h4>
			<div data-preview></div>
			<label class="bot-check"
				><input type="checkbox" data-apply checked />Aplicar también a las ${data.openEvents}
				convocatorias abiertas y actualizar sus mensajes en Discord</label
			>
			<div class="actions">
				<button type="submit">Guardar y enviar a Discord</button>
				<button type="button" class="secondary" data-act="defaults">
					Restaurar plantilla por defecto
				</button>
			</div>
		</form>`;
	}
	// An approximation of the message: enough to see order, icons, texts and buttons.
	function preview() {
		const primary = config.classes.filter((c) => c.type !== 'default'),
			extra = config.classes.filter((c) => c.type === 'default'),
			sample = primary.slice(0, 3).map((c, i) => ({
				cls: c,
				spec: c.specs[0],
				name: ['Arthas', 'Jaina', 'Uther'][i],
			})),
			button = (c) =>
				`<span class="bot-button">${glyph(c.icon)}${config.buttonLabels || !c.icon ? esc(c.name) : ''}</span>`,
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
		const rows = [];
		for (let i = 0; i < primary.length; i += 5) rows.push(primary.slice(i, i + 5));
		return /* HTML */ `<div class="bot-preview" style="border-left-color:${esc(config.color)}">
			<strong class="bot-preview-title">Núcleo de Magma — ejemplo</strong>
			${config.description ? `<p class="bot-preview-text">${esc(config.description)}</p>` : ''}
			<p>📅 martes, 23:00 · en 3 días<br />👥 <strong>${sample.length}/20</strong> inscritos</p>
			<p>
				${config.roles.map((r) => `${glyph(r.icon)} ${esc(r.name)} <strong>${sample.filter((s) => s.spec?.roleName === r.name).length}${r.limit ? '/' + r.limit : ''}</strong>`).join(' · ')}
			</p>
			<div class="bot-preview-groups">${groups.join('')}</div>
			${config.imageUrl ? '<p class="muted">[imagen de cabecera]</p>' : ''}
			${config.footer ? `<small class="muted">${esc(config.footer)}</small>` : ''}
			${rows.map((row) => `<div class="bot-buttons">${row.map(button).join('')}</div>`).join('')}
			<div class="bot-buttons">
				${extra.map(button).join('')}<span class="bot-button bot-danger">Retirarme</span
				>${config.showWebLink ? '<span class="bot-button">Ver en la web ↗</span>' : ''}
			</div>
		</div>`;
	}

	const at = (path) => {
		const keys = path.split('.'),
			last = keys.pop();
		return [keys.reduce((target, key) => target[key], config), last];
	};
	function render() {
		host.innerHTML = /* HTML */ `<details class="card section bot-editor" ${open ? 'open' : ''}>
			<summary>
				Bot de inscripciones en Discord ·
				${config.enabled && data.connected ? 'activo' : data.connected ? 'conectado, apagado' : 'sin conectar'}
			</summary>
			<p>
				El bot propio de la hermandad publica cada convocatoria en Discord con un botón por clase.
				Lo que cambies aquí llega a los mensajes de Discord al guardar.
			</p>
			${status()}${form()}
		</details>`;
		const details = host.querySelector('details'),
			f = host.querySelector('[data-bot-form]'),
			shown = host.querySelector('[data-preview]');
		details.ontoggle = () => (open = details.open);
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
			if (name === 'add-class')
				list.splice(list.findLastIndex((c) => c.type !== 'default') + 1, 0, {
					name: 'Nueva clase',
					icon: '',
					type: 'primary',
					limit: null,
					specs: [],
				});
			else if (name === 'add-extra')
				list.push({
					name: 'Nueva opción',
					icon: '❔',
					type: 'default',
					kind: 'tentative',
					limit: null,
					specs: [],
				});
			else if (name === 'del-class') list.splice(i, 1);
			else if (name === 'add-spec')
				list[i].specs.push({ name: 'Nueva', icon: '', roleName: config.roles[0]?.name || '' });
			else if (name === 'del-spec') list[i].specs.splice(Number(b), 1);
			else if (name === 'add-role') config.roles.push({ name: 'Nuevo rol', icon: '', limit: null });
			else if (name === 'del-role') {
				const [gone] = config.roles.splice(i, 1);
				for (const c of list)
					for (const s of c.specs) if (s.roleName === gone.name) s.roleName = '';
			} else if (name === 'up' || name === 'down') {
				const j = name === 'up' ? i - 1 : i + 1;
				if (list[j] && list[j].type !== 'default') [list[i], list[j]] = [list[j], list[i]];
			} else if (name === 'defaults') {
				if (
					!confirm(
						'¿Volver a las 9 clases y especializaciones por defecto? No se guarda hasta que pulses «Guardar».',
					)
				)
					return;
				config = {
					...structuredClone(data.defaults),
					enabled: config.enabled,
					channelId: config.channelId,
					mentionRoleId: config.mentionRoleId,
				};
			}
			dirty = true;
			render();
		};
		f.onsubmit = async (e) => {
			e.preventDefault();
			const button = f.querySelector('[type="submit"]');
			button.disabled = true;
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
				button.disabled = false;
			}
		};
		const connect = host.querySelector('[data-connect]');
		connect.onclick = async () => {
			connect.disabled = true;
			connect.textContent = 'Sincronizando con Discord…';
			try {
				const next = await api('/api/raid-bot/connect', 'POST', {});
				// Unsaved edits of the form stay as they are.
				data = next;
				if (!dirty) config = structuredClone(data.config);
				toast('Bot sincronizado con Discord');
			} catch (error) {
				toast(error.message);
			}
			render();
		};
	}
	render();
}
