// "Camino al 60": a goose-game spiral from level 1 (outside) to 60 (the guild emblem
// in the centre). Each member's main character is a token in its class colour on its
// level. Special squares are flavour only; they make no claim about game mechanics.
import { classKey } from './roster-ui.js';

const SIZE = 1000,
	CENTER = SIZE / 2,
	OUTER = 440,
	INNER = 175,
	TURNS = 3,
	SQUARE = 30,
	TOKENS_PER_SQUARE = 4;

export const specialSquares = {
	1: { kind: 'start', label: 'Salida', note: 'Todo héroe empieza aquí.' },
	10: { kind: 'milestone', label: 'Primeros pasos', note: 'Diez niveles: ya no eres un novato.' },
	19: { kind: 'hazard', label: 'Posada', note: 'Piedra de hogar, una cerveza y a descansar.' },
	20: { kind: 'milestone', label: 'Aventurero', note: 'Un tercio del camino.' },
	30: { kind: 'milestone', label: 'Ecuador', note: 'La mitad del viaje hasta el 60.' },
	40: { kind: 'milestone', label: 'Curtido', note: 'Ya se ve la meta en el horizonte.' },
	42: { kind: 'hazard', label: 'Laberinto', note: 'Mazmorras largas: paciencia y buen grupo.' },
	50: { kind: 'milestone', label: 'Élite', note: 'Diez niveles para la raid.' },
	52: { kind: 'hazard', label: 'Cárcel', note: 'Un pull de más y a esperar al espíritu sanador.' },
	58: { kind: 'hazard', label: 'Muerte', note: 'Durabilidad al 0 %. Vuelta al cementerio.' },
	60: { kind: 'goal', label: 'Meta', note: 'Nivel máximo: listos para raid.' },
};

// Squares 1..max placed at equal distances along an Archimedean spiral, outside in.
export function spiralSquares(max = 60) {
	const total = TURNS * 2 * Math.PI,
		k = (OUTER - INNER) / total,
		start = Math.PI / 2,
		point = (t) => {
			const r = OUTER - k * t,
				a = start + t;
			return [CENTER + r * Math.cos(a), CENTER + r * Math.sin(a)];
		};
	// Arc length table, then equal steps along it.
	const steps = 4000,
		lengths = [0];
	let prev = point(0);
	for (let i = 1; i <= steps; i++) {
		const p = point((total * i) / steps);
		lengths.push(lengths[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
		prev = p;
	}
	const squares = [];
	for (let n = 0; n < max; n++) {
		const target = (lengths[steps] * n) / (max - 1);
		let i = lengths.findIndex((l) => l >= target);
		if (i < 0) i = steps;
		const [x, y] = point((total * i) / steps);
		squares.push({ level: n + 1, x: Math.round(x), y: Math.round(y) });
	}
	return squares;
}

// Players by level, the cap first; characters without a level are kept apart.
export function byLevel(players) {
	const map = new Map();
	for (const p of players) {
		if (p.level === null) continue;
		if (!map.has(p.level)) map.set(p.level, []);
		map.get(p.level).push(p);
	}
	return map;
}

const roleLabels = {
	Tanque: ['tanque', 'tanques'],
	Sanador: ['sanador', 'sanadores'],
	'DPS melee': ['DPS melee', 'DPS melee'],
	'DPS distancia': ['DPS a distancia', 'DPS a distancia'],
};
const roleCount = (role, n) => `${n} ${(roleLabels[role] || [role, role])[n === 1 ? 0 : 1]}`;

export async function mountJourney(host, { api, esc }) {
	const data = await api('/api/journey');
	const squares = spiralSquares(data.maxLevel);
	const groups = byLevel(data.players);
	const leveled = data.players.filter((p) => p.level !== null);
	const unknown = data.players.filter((p) => p.level === null);
	const mine = data.players.find((p) => p.me);
	const atCap = groups.get(data.maxLevel)?.length || 0;

	const path = squares.map((s, i) => `${i ? 'L' : 'M'}${s.x} ${s.y}`).join(' ');
	const token = (p, x, y) =>
		`<g class="journey-token class-${classKey(p.class)}${p.me ? ' is-me' : ''}"><title>${esc(p.name)} · ${esc(p.class)} · nivel ${p.level}</title><circle cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y + 4.5}">${esc(p.name.slice(0, 1).toUpperCase())}</text></g>`;
	const tokensAt = (list, cx, cy, radius, room = TOKENS_PER_SQUARE) => {
		// Your own token is always visible, never folded into the "+N".
		list = [...list].sort((x, y) => Number(y.me) - Number(x.me));
		const shown = list.slice(0, room),
			out = shown.map((p, i) => {
				const a =
					-Math.PI / 2 +
					(i * 2 * Math.PI) / Math.max(shown.length, 3, room === TOKENS_PER_SQUARE ? 0 : room);
				return token(
					p,
					Math.round(cx + radius * Math.cos(a)),
					Math.round(cy + radius * Math.sin(a)),
				);
			});
		if (list.length > shown.length)
			out.push(
				`<g class="journey-more"><title>${list
					.slice(shown.length)
					.map((p) => esc(p.name))
					.join(
						', ',
					)}</title><circle cx="${cx + radius}" cy="${cy + radius}" r="13"/><text x="${cx + radius}" y="${cy + radius + 4.5}">+${list.length - shown.length}</text></g>`,
			);
		return out.join('');
	};
	const board = squares
		.filter((s) => s.level < data.maxLevel)
		.map((s) => {
			const special = specialSquares[s.level];
			const players = groups.get(s.level) || [];
			return `<g class="journey-square${special ? ' is-' + special.kind : ''}${players.some((p) => p.me) ? ' is-mine' : ''}"><title>Nivel ${s.level}${special ? ' · ' + special.label + ': ' + special.note : ''}</title><circle cx="${s.x}" cy="${s.y}" r="${SQUARE}"/><text x="${s.x}" y="${s.y + 7}">${s.level}</text>${special && special.kind !== 'start' ? `<text class="journey-label" x="${s.x}" y="${s.y + SQUARE + 16}">${special.label}</text>` : ''}${players.length ? tokensAt(players, s.x, s.y, SQUARE + 2) : ''}</g>`;
		})
		.join('');
	const goal = `<g class="journey-goal"><title>Nivel ${data.maxLevel} · ${specialSquares[60].note}</title><circle cx="${CENTER}" cy="${CENTER}" r="128"/><image href="/assets/guild-logo-320.webp" x="${CENTER - 98}" y="${CENTER - 112}" width="196" height="196"/><text class="journey-goal-level" x="${CENTER}" y="${CENTER + 108}">${data.maxLevel}</text>${tokensAt(groups.get(data.maxLevel) || [], CENTER, CENTER, 128, 16)}</g>`;

	const ready = Object.entries(data.ready)
		.map(([role, n]) => roleCount(role, n))
		.join(' · ');
	const ranking = leveled
		.map(
			(p) =>
				`<li class="${p.me ? 'is-me' : ''}"><span class="journey-dot class-${classKey(p.class)}" aria-hidden="true"></span><strong>${esc(p.name)}</strong><small>${esc(p.class)} · ${esc(p.role)}</small><span class="journey-bar class-${classKey(p.class)}" data-bar="${Math.round((p.level / data.maxLevel) * 100)}" aria-hidden="true"></span><b>${p.level}</b></li>`,
		)
		.join('');

	host.innerHTML = /* HTML */ `<div class="journey">
		<header class="journey-head">
			<div>
				<h2>Camino al ${data.maxLevel}</h2>
				<p>
					De nivel en nivel y tiro porque me toca. Cada ficha es el personaje principal de un
					miembro; las raids empiezan a medida que vamos llegando al centro.
				</p>
			</div>
			<dl class="journey-stats">
				<div>
					<dt>En la meta</dt>
					<dd>${atCap}</dd>
				</div>
				<div>
					<dt>En camino</dt>
					<dd>${leveled.length - atCap}</dd>
				</div>
				<div>
					<dt>Tu nivel</dt>
					<dd>${mine?.level ?? '—'}</dd>
				</div>
			</dl>
		</header>
		${
			mine && mine.level === null
				? `<p class="notice">Tu personaje principal no tiene nivel todavía. Añádelo en <a href="#armeria">Armería</a> para aparecer en el tablero.</p>`
				: !mine
					? `<p class="notice">Marca un personaje principal en <a href="#personajes">Personajes</a> para tener tu ficha en el tablero.</p>`
					: ''
		}
		<div class="journey-scroll">
			<svg
				class="journey-board"
				viewBox="0 0 ${SIZE} ${SIZE}"
				role="img"
				aria-label="Tablero del camino al ${data.maxLevel}: ${atCap} en la meta y ${leveled.length - atCap} en camino. La lista de debajo detalla cada personaje."
			>
				<path class="journey-path" d="${path} L${CENTER} ${CENTER}" />
				${board}${goal}
			</svg>
		</div>
		<p class="journey-ready">
			${ready ? `<strong>Listos para raid:</strong> ${esc(ready)}.` : 'Nadie ha llegado todavía al nivel máximo.'}
		</p>
		${ranking ? `<ol class="journey-ranking" aria-label="Clasificación por nivel">${ranking}</ol>` : ''}
		${unknown.length ? `<p class="journey-unknown"><strong>Sin nivel indicado:</strong> ${unknown.map((p) => esc(p.name)).join(', ')}.</p>` : ''}
		<p class="privacy-note">
			Solo para miembros. El nivel sale de la ficha de cada personaje en la Armería; cuando
			conectemos la API de Blizzard se actualizará solo.
		</p>
	</div>`;
}
