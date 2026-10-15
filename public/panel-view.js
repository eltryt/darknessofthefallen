import { gmInbox } from './gm-ui.js';
import { mountRaidEvents } from './raid-events-ui.js';
import { operationTab } from './operations-ui.js';
import { applicationInbox } from './recruitment-ui.js';
import { guideAdmin } from './armory-admin-ui.js';
export function createPanelView(context) {
	const {
		$,
		api,
		esc,
		empty,
		title,
		table,
		field,
		select,
		formHandler,
		toast,
		me,
		data,
		roles,
		classes,
		recruitmentChoices,
	} = context;
	const operationsContext = () => context;
	async function panel() {
		const tabs = [
			['roster.read', 'roster', 'Roster'],
			['recruitment.manage', 'applications', 'Candidaturas'],
			['recruitment.manage', 'messages', 'Mensajes y avisos'],
			['attendance.manage', 'raids', 'Raids'],
			['attendance.manage', 'attendance', 'Asistencia'],
			['loot.manage', 'loot', 'Loot'],
			['loot.manage', 'wishlists', 'Wishlists'],
			['community.read', 'council', 'Consejo'],
			['progress.manage', 'progress', 'Progreso'],
			['settings.manage', 'settings', 'Configuración'],
			['armory.configure', 'guides', 'Guías externas'],
			['audit.read', 'audit', 'Auditoría'],
			['backup.export', 'export', 'Exportación'],
		].filter((t) => me.permissions.includes(t[0]));
		$('#content').innerHTML =
			title(
				'Centro de mando',
				'Panel de la hermandad',
				'Organización, datos y seguimiento. Cada herramienta respeta los permisos de tu rango.',
			) +
			/* HTML */ `<div class="panel-tabs" aria-label="Secciones del panel">
					${tabs.map((t, i) => /* HTML */ `<button data-tab="${t[1]}" aria-pressed="${i === 0}" class="${i === 0 ? 'active' : ''}">${t[2]}</button>`).join('')}
				</div>
				<section id="panel-body"></section>`;
		document.querySelectorAll('[data-tab]').forEach(
			(b) =>
				(b.onclick = () => {
					document.querySelectorAll('[data-tab]').forEach((x) => {
						x.classList.toggle('active', x === b);
						x.setAttribute('aria-pressed', String(x === b));
					});
					void panelTab(b.dataset.tab);
				}),
		);
		const selected = new URLSearchParams(location.search).get('tab');
		const active = tabs.find((t) => t[1] === selected) || tabs[0];
		if (active) {
			document.querySelectorAll('[data-tab]').forEach((b) => {
				b.classList.toggle('active', b.dataset.tab === active[1]);
				b.setAttribute('aria-pressed', String(b.dataset.tab === active[1]));
			});
			await panelTab(active[1]);
		}
	}

	async function panelTab(tab) {
		// A new host disconnects the previous tab's polling and isolates late responses.
		const el = document.createElement('section');
		el.id = 'panel-body';
		el.dataset.panelTab = tab;
		el.innerHTML = '<p role="status">Cargando…</p>';
		$('#panel-body').replaceWith(el);
		try {
			await renderPanelTab(tab, el);
		} catch (e) {
			if (!el.isConnected) return;
			el.innerHTML = empty('No se pudo cargar esta sección', e.message);
			toast(e.message);
		}
	}
	async function renderPanelTab(tab, el) {
		if (tab === 'messages') {
			await gmInbox(el, context);
			return;
		}
		if (tab === 'raids') {
			await mountRaidEvents(el, operationsContext(), { manage: true });
			return;
		}
		if (tab === 'guides') {
			await guideAdmin(el, context);
			return;
		}
		if (await operationTab(tab, el, operationsContext())) return;
		if (tab === 'roster') {
			const rows = await api('/api/roster'),
				mains = rows.filter((c) => c.is_main),
				t = data.settings.rosterTargets;
			el.innerHTML = /* HTML */ `<div class="grid">
					${[
						['Tanques', mains.filter((c) => c.role === 'Tanque').length, t.tanks],
						['Sanadores', mains.filter((c) => c.role === 'Sanador').length, t.healers],
						['DPS', mains.filter((c) => c.role.startsWith('DPS')).length, t.dps],
					]
						.map(
							([n, v, max]) =>
								/* HTML */ `<div class="card">
									<span class="label">${n} · Mains registrados</span
									><span class="metric">${v} / ${max}</span>
								</div>`,
						)
						.join('')}
				</div>
				<p class="notice">
					Composición por personajes Main; no representa confirmaciones de asistencia a una raid.
				</p>
				${table(
					['Personaje', 'Clase', 'Rol', 'Disponibilidad', 'Rango'],
					rows.map(
						(c) =>
							/* HTML */ `<tr>
								<td>${esc(c.name)}</td>
								<td>${esc(c.class)}</td>
								<td>${esc(c.role)}</td>
								<td>${esc(c.availability) || 'Sin indicar'}</td>
								<td>${esc(c.rank)}</td>
							</tr>`,
					),
				)}`;
		}
		if (tab === 'applications') {
			await applicationInbox(el, { api, esc, toast });
			return;
		}
		if (tab === 'attendance') {
			const a = await api('/api/attendance');
			el.innerHTML = a.rows.length
				? table(
						['Raid', 'Miembro', 'Estado'],
						a.rows.map(
							(r) =>
								`<tr><td>${esc(r.raid_id)}</td><td>${esc(r.user_id)}</td><td>${esc(r.status)}</td></tr>`,
						),
					)
				: empty(
						'Sin asistencias registradas',
						'La edición de raids y asistencia se implementará en la siguiente fase.',
					);
		}
		if (tab === 'audit') {
			const rows = await api('/api/audit');
			el.innerHTML = table(
				['Fecha', 'Usuario', 'Acción', 'Objeto'],
				rows.map(
					(r) =>
						/* HTML */ `<tr>
							<td>${esc(r.created_at)}</td>
							<td>${esc(r.actor_id)}</td>
							<td>${esc(r.action)}</td>
							<td>${esc(r.target)}</td>
						</tr>`,
				),
			);
		}
		if (tab === 'export')
			el.innerHTML = /* HTML */ `<div class="card">
				<h2>Copia de los datos de la hermandad</h2>
				<p>
					JSON con roster, personajes, candidaturas, raids, asistencia, loot, wishlist, progreso,
					configuración y auditoría. Contiene datos privados: guárdalo en un lugar seguro.
				</p>
				<a class="button" href="/api/export" download>Descargar exportación JSON</a>
				<p class="notice">
					Copia manual con comprobación de integridad. Incluye convocatorias e inscripciones. No
					incluye sesiones ni secretos. Guarda varias copias fuera de la web, en un lugar privado.
				</p>
				<div class="actions">
					${['characters', 'attendance', 'loot', 'applications', 'settings'].map((name, i) => /* HTML */ `<a class="button secondary" href="/api/export/csv?dataset=${name}" download>CSV · ${['Personajes', 'Asistencia', 'Loot', 'Candidaturas', 'Configuración'][i]}</a>`).join('')}
				</div>
			</div>`;
		if (tab === 'settings') {
			const s = data.settings;
			el.innerHTML = /* HTML */ `<form id="settings" class="card form">
				<div class="form-grid">
					${field('Nombre', 'name', 'text', s.name)}${field('Descripción', 'description', 'text', s.description)}<label
						class="wide"
						>Sobre la hermandad<textarea name="about" maxlength="4000" required>
${esc(s.about)}</textarea></label
					>${field('Facción', 'faction', 'text', s.faction)}${field('Región', 'region', 'text', s.region)}${field('Servidor', 'server', 'text', s.server)}${select('Ruleset', 'ruleset', ['Por confirmar', 'PvP', 'PvE'])}${field('Inicio de raid', 'raidStart', 'time', s.raidStart)}${field('Fin de raid', 'raidEnd', 'time', s.raidEnd)}${field('Invitación de Discord', 'discordUrl', 'url', s.discordUrl, false)}${select('Método de loot', 'lootMethod', ['Loot Council', 'Roll', 'Soft Reserve', 'DKP', 'Híbrido'])}
					<fieldset class="wide">
						<legend>Días de raid</legend>
						${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => /* HTML */ `<label><input name="days" type="checkbox" value="${d}" ${s.raidDays.includes(d) ? 'checked' : ''} />${d}</label>`).join('')}
					</fieldset>
					${field('Objetivo tanques', 'tanks', 'number', s.rosterTargets.tanks)}${field('Objetivo sanadores', 'healers', 'number', s.rosterTargets.healers)}${field('Objetivo DPS', 'dps', 'number', s.rosterTargets.dps)}
				</div>
				<p>
					Marca las clases y roles que buscáis. Son prioridades informativas: otras clases también
					pueden presentar candidatura. Si no marcas ninguna opción, no se anunciará una prioridad.
				</p>
				<fieldset>
					<legend>Prioridades por clase</legend>
					<p>
						Informativas: no impiden presentar candidatura. Abierta mantiene el reclutamiento sin
						preferencias.
					</p>
					<div class="form-grid">
						${classes.map((name) => select(name, 'priority_' + name, ['abierta', 'alta', 'media', 'baja'])).join('')}
					</div>
				</fieldset>
				${recruitmentChoices('Clases buscadas', 'soughtClasses', classes, s.soughtClasses || [])}${recruitmentChoices('Roles buscados', 'soughtRoles', roles, s.soughtRoles || [])}<label
					><input
						name="recruitmentOpen"
						type="checkbox"
						${s.recruitmentOpen ? 'checked' : ''}
					/>Reclutamiento abierto</label
				><button type="submit">Guardar configuración</button>
			</form>`;
			for (const name of classes)
				$('#settings').elements['priority_' + name].value = s.classPriorities?.[name] || 'abierta';
			$('#settings').elements.ruleset.value = s.ruleset;
			$('#settings').elements.lootMethod.value = s.lootMethod;
			formHandler('#settings', async (v, f) => {
				data.settings = await api('/api/settings', 'PUT', {
					...v,
					raidDays: new FormData(f).getAll('days'),
					classPriorities: Object.fromEntries(
						classes.map((name) => [name, new FormData(f).get('priority_' + name)]),
					),
					soughtClasses: new FormData(f).getAll('soughtClasses'),
					soughtRoles: new FormData(f).getAll('soughtRoles'),
					recruitmentOpen: !!v.recruitmentOpen,
					rosterTargets: { tanks: Number(v.tanks), healers: Number(v.healers), dps: Number(v.dps) },
				});
				toast('Configuración guardada');
			});
		}
	}
	return { panel };
}
