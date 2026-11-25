// «Inicio» of the member profile: what matters now in one screen. The next raid with
// your state, your wishlist, your monthly attendance, anything waiting for you and
// direct access to every section.
import { isWanted } from './wish-states.js';

const HOUR = 3600 * 1000;
const madrid = (value, options) =>
	new Date(value).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', ...options });
function countdown(startsAt) {
	const diff = Date.parse(startsAt) - Date.now();
	if (diff <= 0) return 'En curso';
	if (diff < 24 * HOUR)
		return `Hoy a las ${madrid(startsAt, { hour: '2-digit', minute: '2-digit' })}`;
	const days = Math.round(diff / (24 * HOUR));
	return `En ${days} ${days === 1 ? 'día' : 'días'}`;
}

export async function mountProfileHome(
	host,
	ctx,
	{ character, rows, attendance, achievements, sections, svg },
) {
	const { api, esc, me } = ctx;
	const member = me.permissions.includes('community.read');
	const [events, callups, wishes, win] = await Promise.all([
		api('/api/events').catch(() => ({ events: [] })),
		api('/api/callups/mine').catch(() => []),
		member ? api('/api/wishlists').catch(() => []) : [],
		member ? api('/api/wishlist-window').catch(() => ({ state: 'free' })) : { state: 'free' },
	]);
	if (!host.isConnected) return;
	const byEvent = new Map(callups.map((c) => [c.event_id, c]));
	const next = (events.events || [])
		.filter(
			(e) =>
				Date.parse(e.starts_at) > Date.now() - 6 * HOUR &&
				(e.mine?.length || e.lineup?.players.some((p) => p.own) || byEvent.has(e.id)),
		)
		.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
	const open = (events.events || []).filter(
		(e) => Date.parse(e.starts_at) > Date.now() && !e.mine?.length && e.discordUrl,
	);
	const mine = character
		? wishes.filter((w) => w.data.characterId === character.id && isWanted(w.data.status))
		: [];
	const bis = mine.filter((w) => w.data.status === 'BiS').length;
	const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 7);
	const thisMonth = (attendance.metrics.monthly || []).find((m) => m.month === month);
	const minimum = attendance.metrics.minimum;
	const earned = achievements ? achievements.achievements.filter((a) => a.tier).length : null;

	// What is waiting for you, most urgent first.
	const todo = [];
	if (!rows.length)
		todo.push([
			'personajes',
			'Registra tu primer personaje',
			'Sin personaje no sales en el roster ni en las convocatorias.',
		]);
	else if (!rows.some((c) => c.is_main))
		todo.push([
			'personajes',
			'Marca tu personaje principal',
			'Es el que cuenta para el roster, el Camino al 60 y la Senda del honor.',
		]);
	if (character && character.source !== 'battlenet')
		todo.push([
			'personajes',
			'Importa tu personaje de Battle.net',
			'Así se rellenan solos su nivel, equipo y PvP.',
		]);
	if (member && character && !mine.length)
		todo.push([
			'wishlist',
			'Prepara tu wishlist',
			'Marca el botín que quieres de cada jefe: el consejo lo usa al repartir.',
		]);
	if (win.state === 'open')
		todo.push([
			'wishlist',
			'Plazo de wishlist abierto',
			`Hasta el ${madrid(win.closesAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`,
		]);
	if (thisMonth && thisMonth.eligible === false)
		todo.push([
			'convocatorias',
			`Asistencia del mes: ${thisMonth.percentage} %`,
			`Hace falta un ${minimum} % para optar a botín.`,
		]);
	if (open.length)
		todo.push([
			'convocatorias',
			`${open.length} ${open.length === 1 ? 'convocatoria abierta' : 'convocatorias abiertas'} sin apuntarte`,
			'Apúntate desde Discord.',
		]);

	const nextCard = next
		? (() => {
				const signup = next.mine?.[0];
				const own = next.lineup?.players.find((p) => p.own);
				const state = own
					? own.slot === 'bench'
						? 'Banquillo'
						: 'Grupo ' + own.slot.slice(6)
					: signup
						? signup.status
						: 'Pendiente';
				return `<a class="pf-card pf-next" href="#convocatorias"><small>Tu próxima raid</small><strong>${esc(next.title)}</strong><span>${esc(madrid(next.starts_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}</span><span class="pf-row"><b class="pf-count">${esc(countdown(next.starts_at))}</b><span class="cu-pill ${own && own.slot !== 'bench' ? 'is-done' : 'is-pending'}">${esc(state)}</span></span></a>`;
			})()
		: `<a class="pf-card pf-next is-empty" href="#convocatorias"><small>Tu próxima raid</small><strong>Sin convocatorias</strong><span>Cuando te apuntes en Discord aparecerá aquí.</span></a>`;

	host.innerHTML = /* HTML */ `<div class="pf">
		<div class="pf-grid">
			${nextCard}
			${
				member
					? `<a class="pf-card" href="#wishlist"><small>Wishlist${character ? ' de ' + esc(character.name) : ''}</small><strong>${mine.length ? `${bis} BiS · ${mine.length - bis} mejoras` : 'Vacía'}</strong><span>${mine.length ? 'Ver y cambiar prioridades' : 'Elige el botín que quieres de cada jefe'}</span></a>`
					: ''
			}
			<a class="pf-card" href="#convocatorias"
				><small>Asistencia de este mes</small
				><strong>${thisMonth ? thisMonth.percentage + ' %' : 'Sin registros'}</strong
				><span
					>${thisMonth ? (thisMonth.eligible === false ? `No llega al ${minimum} % para el botín` : `Mínimo para botín: ${minimum} %`) : 'Se registra después de cada raid'}</span
				>${thisMonth ? `<i class="pf-bar${thisMonth.eligible === false ? ' is-low' : ''}" data-bar="${Math.min(100, Number(thisMonth.percentage) || 0)}"></i>` : ''}</a
			>
			${
				earned !== null
					? `<a class="pf-card" href="#logros"><small>Logros</small><strong>${earned} ${earned === 1 ? 'medalla' : 'medallas'}</strong><span>Ver todos los logros</span></a>`
					: ''
			}
		</div>
		${
			todo.length
				? `<section class="pf-todo"><h3>Pendiente</h3><ul>${todo
						.map(
							([id, title, text]) =>
								`<li><a href="#${id}"><strong>${esc(title)}</strong><span>${esc(text)}</span><b aria-hidden="true">→</b></a></li>`,
						)
						.join('')}</ul></section>`
				: '<p class="pf-ok">✓ Lo tienes todo al día.</p>'
		}
		<nav class="pf-quick" aria-label="Accesos rápidos">
			${sections
				.filter(([id]) => id !== 'inicio')
				.map(([id, label]) => `<a href="#${id}">${svg(id)}<span>${esc(label)}</span></a>`)
				.join('')}
		</nav>
	</div>`;
}
