// Panel navigation by area and its home: what is waiting for the officers, each with a
// button that opens the right section. Only areas and sections the rank may use appear.
export const panelAreas = [
	{
		id: 'raid',
		label: 'Raid',
		icon: '⚔',
		tabs: [
			['attendance.manage', 'raids', 'Convocatorias'],
			['attendance.manage', 'attendance', 'Asistencia'],
			['progress.manage', 'progress', 'Progreso'],
		],
	},
	{
		id: 'loot',
		label: 'Botín',
		icon: '◆',
		tabs: [
			['loot.manage', 'loot', 'Repartir botín'],
			['loot.manage', 'wishlists', 'Wishlists'],
			['settings.manage', 'council', 'Consejo de botín'],
		],
	},
	{
		id: 'people',
		label: 'Personas',
		icon: '☰',
		tabs: [
			['roster.read', 'roster', 'Roster'],
			['members.manage', 'members', 'Miembros'],
			['applications.manage', 'applications', 'Candidaturas'],
			['recruitment.manage', 'messages', 'Mensajes y avisos'],
		],
	},
	{
		id: 'system',
		label: 'Sistema',
		icon: '⚙',
		tabs: [
			['settings.manage', 'settings', 'Configuración'],
			['armory.configure', 'guides', 'Guías externas'],
			['audit.read', 'audit', 'Auditoría'],
			['backup.export', 'export', 'Exportación'],
		],
	},
];

const DAY = 86400000;
const appOrder = ['Nuevo', 'Contactado', 'Prueba'];
const appLabel = { Nuevo: 'Sin tratar', Contactado: 'Contactado', Prueba: 'En prueba' };
const shortDate = (value) =>
	new Date(value).toLocaleString('es-ES', {
		timeZone: 'Europe/Madrid',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
const when = (value) =>
	new Date(value).toLocaleString('es-ES', {
		timeZone: 'Europe/Madrid',
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		hour: '2-digit',
		minute: '2-digit',
	});

// Each card: what is pending, how many, and the section that solves it.
export async function mountPanelHome(el, { api, esc, me, data }, open) {
	const can = (p) => me.permissions.includes(p);
	const safe = (promise) => promise.catch(() => null);
	const [applications, cases, requests, raids, attendance, events, roster] = await Promise.all([
		can('applications.manage') ? safe(api('/api/applications')) : null,
		can('recruitment.manage') ? safe(api('/api/gm-cases')) : null,
		can('loot.manage') ? safe(api('/api/wishlist-requests?all=true')) : null,
		can('attendance.manage') ? safe(api('/api/raids')) : null,
		can('attendance.manage') ? safe(api('/api/attendance')) : null,
		safe(api('/api/events')),
		can('roster.read') ? safe(api('/api/roster')) : null,
	]);
	if (!el.isConnected) return;
	const cards = [];
	// Applications still open (accepted and rejected ones live in «Archivadas»).
	const openApps = (applications || [])
		.filter((a) => !['Aceptado', 'Rechazado'].includes(a.status))
		.sort(
			(a, b) =>
				appOrder.indexOf(a.status) - appOrder.indexOf(b.status) ||
				b.created_at.localeCompare(a.created_at),
		);
	if (applications) {
		const n = applications.filter((a) => a.status === 'Nuevo').length;
		const going = openApps.length - n;
		cards.push({
			n,
			label: n === 1 ? 'candidatura sin tratar' : 'candidaturas sin tratar',
			detail: going ? `${going} en curso (contactado o en prueba)` : '',
			tab: 'applications',
			go: 'Revisar candidaturas',
			urgent: n > 0,
		});
	}
	if (cases) {
		const n = (cases.messages || []).filter((m) => ['Nueva', 'En curso'].includes(m.status)).length;
		cards.push({
			n,
			label: n === 1 ? 'mensaje abierto' : 'mensajes abiertos',
			tab: 'messages',
			go: 'Ver mensajes',
			urgent: n > 0,
		});
	}
	if (requests) {
		const n = requests.filter((r) => r.status === 'pending').length;
		cards.push({
			n,
			label: n === 1 ? 'petición de wishlist' : 'peticiones de wishlist',
			tab: 'wishlists',
			go: 'Resolver peticiones',
			urgent: n > 0,
		});
	}
	if (raids && attendance) {
		const withRecords = new Set(attendance.rows.map((r) => r.raid_id));
		const now = Date.now();
		const missing = raids.filter(
			(r) =>
				Date.parse(r.starts_at) < now &&
				Date.parse(r.starts_at) > now - 14 * DAY &&
				!withRecords.has(r.id),
		);
		cards.push({
			n: missing.length,
			label: missing.length === 1 ? 'raid sin pasar lista' : 'raids sin pasar lista',
			detail: missing
				.map((r) => r.title)
				.slice(0, 3)
				.join(', '),
			tab: 'attendance',
			go: 'Pasar lista',
			urgent: missing.length > 0,
		});
	}
	const next = (events?.events || [])
		.filter((e) => Date.parse(e.starts_at) > Date.now() - 3 * 3600 * 1000)
		.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
	// The raid roster only: mains of raiders and above (visitors and social members left out).
	const mains = roster
		? roster.filter((c) => c.is_main && !['visitor', 'member'].includes(c.rank))
		: [];
	const targets = data.settings.rosterTargets || {};
	const roles = [
		['Tanques', mains.filter((c) => c.role === 'Tanque').length, targets.tanks],
		['Sanadores', mains.filter((c) => c.role === 'Sanador').length, targets.healers],
		['DPS', mains.filter((c) => !['Tanque', 'Sanador'].includes(c.role)).length, targets.dps],
	];
	const pending = cards.filter((c) => c.urgent).length;

	el.innerHTML = /* HTML */ `<div class="ph">
		<header class="ph-head">
			<h2>
				${pending ? `Tienes ${pending} ${pending === 1 ? 'cosa pendiente' : 'cosas pendientes'}` : 'Todo al día'}
			</h2>
			<p>
				${pending ? 'Empieza por lo que está marcado.' : 'No hay nada esperando a los oficiales.'}
			</p>
		</header>
		<ul class="ph-cards">
			${cards
				.map(
					(c) =>
						`<li class="ph-card${c.urgent ? ' is-urgent' : ''}"><strong>${c.n}</strong><span>${esc(c.label)}</span>${c.detail ? `<small>${esc(c.detail)}</small>` : ''}<button type="button" class="${c.urgent ? '' : 'secondary'}" data-open-tab="${c.tab}">${esc(c.go)} →</button></li>`,
				)
				.join('')}
		</ul>
		${
			openApps.length
				? `<section class="ph-panel ph-apps"><header><small>Candidaturas pendientes · ${openApps.length}</small><button type="button" class="secondary" data-open-tab="applications">Ver todas →</button></header><ul>${openApps
						.slice(0, 6)
						.map(
							(a) =>
								`<li class="app-${a.status.toLowerCase()}"><button type="button" data-open-tab="applications"><span class="ph-app-who"><strong>${esc(a.data.name)}</strong><small>${esc([a.data.class, a.data.role].filter(Boolean).join(' · '))} · ${esc(shortDate(a.created_at))}</small></span><span class="pill app-status app-${a.status.toLowerCase()}">${esc(appLabel[a.status] || a.status)}</span></button></li>`,
						)
						.join(
							'',
						)}</ul>${openApps.length > 6 ? `<p class="muted">Y ${openApps.length - 6} más.</p>` : ''}</section>`
				: ''
		}
		<div class="ph-row">
			${
				next
					? `<section class="ph-panel ph-next"><small>Próxima convocatoria</small><h3>${esc(next.title)}</h3><p>${esc(when(next.starts_at))}</p><p class="ph-big"><strong>${next.occupied ?? 0}</strong>${next.capacity ? ` de ${next.capacity}` : ''} confirmados</p>${can('attendance.manage') ? '<button type="button" class="secondary" data-open-tab="raids">Gestionar convocatorias →</button>' : ''}</section>`
					: ''
			}
			${
				roster
					? `<section class="ph-panel"><small>Roster de raid · mains de raiders y oficiales</small><ul class="ph-roles">${roles
							.map(
								([label, n, target]) =>
									`<li><span>${label}</span><strong>${n}${target ? `<small> / ${target}</small>` : ''}</strong><i data-bar="${target ? Math.min(100, Math.round((n / target) * 100)) : 100}"></i></li>`,
							)
							.join(
								'',
							)}</ul><button type="button" class="secondary" data-open-tab="roster">Ver roster →</button></section>`
					: ''
			}
		</div>
	</div>`;
	el.querySelectorAll('[data-open-tab]').forEach(
		(b) => (b.onclick = () => open(b.dataset.openTab)),
	);
}
