// "Camino al 60": a goose-game spiral from level 1 (outside) to 60 (the guild emblem
// in the centre). Each member's main character is a token in its class colour on its
// level. Tokens walk to their square when the board opens; iconic squares tell a joke.
import { classKey } from './roster-ui.js';

const SIZE = 1000,
	CENTER = SIZE / 2,
	OUTER = 440,
	INNER = 175,
	TURNS = 3,
	SQUARE = 30,
	TOKENS_PER_SQUARE = 4;

// Iconic squares: Classic references for fun. They are flavour, not rules: WoW Forever
// may change levels, dungeons or prices, and the board never claims otherwise.
export const specialSquares = {
	1: {
		kind: 'start',
		label: 'Salida',
		phrase: 'Mata diez jabalíes y trae diez colmillos. Así empezó todo.',
	},
	6: {
		kind: 'iconic',
		label: 'Murlocs',
		phrase: 'Mrglglglgl. Si oyes eso, corre: nunca vienen solos.',
	},
	10: {
		kind: 'milestone',
		label: 'Despegue',
		phrase: 'Diez niveles. Ya miras a los jabalíes por encima del hombro.',
	},
	11: {
		kind: 'iconic',
		label: 'Hogger',
		phrase: 'Se busca: Hogger. Vivo o muerto. Mejor lleva a cuatro amigos.',
	},
	15: {
		kind: 'iconic',
		label: 'Baldíos',
		phrase: '¿Alguien ha visto a la mujer de Mankrik? Él lleva preguntando desde 2004.',
	},
	19: {
		kind: 'hazard',
		label: 'Posada',
		phrase: 'Piedra de hogar, una jarra y experiencia descansada. Nadie te juzga.',
	},
	20: {
		kind: 'milestone',
		label: 'Aventurero',
		phrase: 'Un tercio del camino. Tus bolsas ya casi no son de lino.',
	},
	22: {
		kind: 'iconic',
		label: 'VanCleef',
		phrase: 'Las Minas de la Muerte: VanCleef te espera al fondo. Con su barco y sus cañones.',
	},
	27: {
		kind: 'hazard',
		label: 'Ninja',
		phrase: 'Un guerrero ha pulsado «Necesidad» en una túnica de tela. Toma nota del nombre.',
	},
	30: {
		kind: 'milestone',
		label: 'Ecuador',
		phrase: 'Media vuelta al mundo. Monasterio Escarlata: una run más y lo dejamos. Prometido.',
	},
	34: {
		kind: 'iconic',
		label: 'Tuercespina',
		phrase: 'Servidor PvP en la Vega de Tuercespina: mira detrás de ti. No, más atrás.',
	},
	37: {
		kind: 'iconic',
		label: 'Páginas',
		phrase: 'Te falta la página 14 de «Las verdes colinas de Tuercespina». Siempre falta una.',
	},
	40: {
		kind: 'milestone',
		label: 'Montura',
		phrase: 'Nivel 40 en Classic: o la montura, o comer este mes. Elige con cabeza.',
	},
	42: {
		kind: 'hazard',
		label: 'Laberinto',
		phrase: 'Maraudon: tres alas, ningún mapa y alguien que jura saberse el camino.',
	},
	45: {
		kind: 'iconic',
		label: "Zul'Farrak",
		phrase: "Escaleras de Zul'Farrak: aguantad arriba y que no baje nadie. Nadie.",
	},
	48: {
		kind: 'iconic',
		label: "Un'Goro",
		phrase: "Cráter de Un'Goro: los dinosaurios no miran tu nivel antes de morder.",
	},
	50: {
		kind: 'milestone',
		label: 'Élite',
		phrase: 'Diez niveles para la raid. Empieza a guardar oro para pociones y frascos.',
	},
	52: {
		kind: 'hazard',
		label: 'Cárcel',
		phrase: 'Profundidades de Roca Negra: hasta tiene calabozo. Y siempre se pierde alguien.',
	},
	55: {
		kind: 'iconic',
		label: 'Leeroy',
		phrase: 'Tenemos un plan con un 32,33 % de éxito… ¡LEEEEROY JENKINS!',
	},
	58: {
		kind: 'hazard',
		label: 'Muerte',
		phrase: 'Durabilidad al 0 %. El espíritu sanador ya te llama por tu nombre.',
	},
	60: {
		kind: 'goal',
		label: 'Meta',
		phrase: 'Nivel 60: ahora empieza el juego de verdad. ¿Onyxia? ¡Más DoTs!',
	},
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

const reduced = () =>
	typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// The squares a token walks through from square 1 to its level; the cap is the centre.
export function walkRoute(squares, level, maxLevel = 60) {
	const route = squares.slice(0, Math.min(level, maxLevel - 1)).map((s) => [s.x, s.y]);
	if (level >= maxLevel) route.push([CENTER, CENTER]);
	return route;
}

// Tokens hop from the start to their square, one square at a time, like goose-game pieces.
function walkTokens(svg, squares, maxLevel) {
	const started = performance.now();
	const plans = [...svg.querySelectorAll('.journey-token[data-level]')].map((g, n) => {
		const route = walkRoute(squares, Number(g.dataset.level), maxLevel);
		return {
			g,
			route,
			home: route[route.length - 1],
			delay: Math.min(n * 90, 900),
			duration: Math.min(350 + route.length * 30, 2100),
		};
	});
	const place = ({ g, route, home }, progress) => {
		if (route.length < 2 || progress >= 1) return g.removeAttribute('transform');
		const u = (1 - (1 - progress) ** 3) * (route.length - 1),
			i = Math.min(Math.floor(u), route.length - 2),
			f = u - i,
			[x0, y0] = route[i],
			[x1, y1] = route[i + 1],
			hop = Math.sin(f * Math.PI) * 10;
		g.setAttribute(
			'transform',
			`translate(${x0 + (x1 - x0) * f - home[0]} ${y0 + (y1 - y0) * f - home[1] - hop})`,
		);
	};
	plans.forEach((plan) => place(plan, 0));
	const frame = (now) => {
		if (!svg.isConnected) return;
		let pending = false;
		for (const plan of plans) {
			const progress = Math.min(Math.max((now - started - plan.delay) / plan.duration, 0), 1);
			place(plan, progress);
			if (progress < 1) pending = true;
		}
		if (pending) requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}

export async function mountJourney(host, ctx) {
	const { api, esc, toast } = ctx;
	const data = await api('/api/journey');
	const squares = spiralSquares(data.maxLevel);
	const groups = byLevel(data.players);
	const leveled = data.players.filter((p) => p.level !== null);
	const unknown = data.players.filter((p) => p.level === null);
	const mine = data.players.find((p) => p.me);
	const atCap = groups.get(data.maxLevel)?.length || 0;

	const path =
		squares.map((s, i) => `${i ? 'L' : 'M'}${s.x} ${s.y}`).join(' ') + ` L${CENTER} ${CENTER}`;
	const token = (p, x, y) =>
		`<g class="journey-token class-${classKey(p.class)}${p.me ? ' is-me' : ''}" data-level="${p.level}"><title>${esc(p.name)} · ${esc(p.class)} · nivel ${p.level}</title>${p.me ? `<circle class="journey-me-ring" cx="${x}" cy="${y}" r="13"/>` : ''}<circle cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y + 4.5}">${esc(p.name.slice(0, 1).toUpperCase())}</text></g>`;
	const tokensAt = (list, cx, cy, radius, room = TOKENS_PER_SQUARE) => {
		// Your own token is always visible, never folded into the "+N".
		list = [...list].sort((x, y) => Number(y.me) - Number(x.me));
		const shown = list.slice(0, room),
			slots = Math.max(shown.length, 3, room === TOKENS_PER_SQUARE ? 0 : room),
			out = shown.map((p, i) => {
				const a = -Math.PI / 2 + (i * 2 * Math.PI) / slots;
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
	const specialAttrs = (level) => {
		const special = specialSquares[level];
		return ` data-special="${level}" tabindex="0" role="button" aria-label="Nivel ${level}, ${esc(special.label)}: ${esc(special.phrase)}"`;
	};
	const board = squares
		.filter((s) => s.level < data.maxLevel)
		.map((s) => {
			const special = specialSquares[s.level];
			const mineHere = (groups.get(s.level) || []).some((p) => p.me);
			return `<g class="journey-square${special ? ' is-special is-' + special.kind : ''}${mineHere ? ' is-mine' : ''}"${special ? specialAttrs(s.level) : ''}><title>Nivel ${s.level}${special ? ' · ' + esc(special.label) : ''}</title><circle cx="${s.x}" cy="${s.y}" r="${SQUARE}"/><text x="${s.x}" y="${s.y + 7}">${s.level}</text>${special && special.kind !== 'start' ? `<text class="journey-label" x="${s.x}" y="${s.y + SQUARE + 16}">${esc(special.label)}</text>` : ''}</g>`;
		})
		.join('');
	// Tokens live in their own top layer so later squares never cover them.
	const tokens =
		squares
			.filter((s) => s.level < data.maxLevel && groups.has(s.level))
			.map((s) => tokensAt(groups.get(s.level), s.x, s.y, SQUARE + 2))
			.join('') + tokensAt(groups.get(data.maxLevel) || [], CENTER, CENTER, 128, 16);
	const goal = `<g class="journey-goal"${specialAttrs(data.maxLevel)}><title>Nivel ${data.maxLevel} · Meta</title><circle cx="${CENTER}" cy="${CENTER}" r="128"/><image href="/assets/guild-logo-320.webp" x="${CENTER - 98}" y="${CENTER - 112}" width="196" height="196"/><text class="journey-goal-level" x="${CENTER}" y="${CENTER + 108}">${data.maxLevel}</text></g>`;

	const ready = Object.entries(data.ready)
		.map(([role, n]) => roleCount(role, n))
		.join(' · ');
	// At the cap: verified or pending; officers get the button to confirm or withdraw it.
	const capStatus = (p) =>
		p.level !== data.maxLevel
			? ''
			: `<span class="journey-cap${p.verified ? ' is-verified' : ''}">${p.verified ? 'Verificado' : 'Pendiente de verificar'}${data.canVerify ? `<button type="button" class="link-button" data-verify="${esc(p.id)}" data-verified="${p.verified}">${p.verified ? 'Quitar' : 'Verificar'}</button>` : ''}</span>`;
	const medals = { 3: 'Oro', 2: 'Plata', 1: 'Bronce' };
	const podiumHtml = Array.from({ length: data.places }, (_, i) => {
		const place = data.podium[i];
		return place
			? `<li class="journey-place tier-${place.tier}${place.me ? ' is-me' : ''}"><b>${place.place}.º</b><span class="journey-dot class-${classKey(place.class)}" aria-hidden="true"></span><strong>${esc(place.name)}</strong><small>${medals[place.tier]}</small></li>`
			: `<li class="journey-place is-open tier-${[3, 2, 2, 1, 1][i] || 1}"><b>${i + 1}.º</b><strong>¿Quién será?</strong><small>${medals[[3, 2, 2, 1, 1][i] || 1]}</small></li>`;
	}).join('');
	const ranking = leveled
		.map(
			(p) =>
				`<li class="${p.me ? 'is-me' : ''}"><span class="journey-dot class-${classKey(p.class)}" aria-hidden="true"></span><strong>${esc(p.name)}</strong><small>${esc(p.class)} · ${esc(p.role)}</small><span class="journey-bar class-${classKey(p.class)}" data-bar="${Math.round((p.level / data.maxLevel) * 100)}" aria-hidden="true"></span><b>${p.level}</b>${capStatus(p)}</li>`,
		)
		.join('');
	const notice =
		mine && mine.level === null
			? '<p class="notice">Tu personaje principal no tiene nivel todavía. Añádelo en <a href="#armeria">Armería</a> para aparecer en el tablero.</p>'
			: !mine
				? '<p class="notice">Marca un personaje principal en <a href="#personajes">Personajes</a> para tener tu ficha en el tablero.</p>'
				: '';

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
		${notice}
		<div class="journey-play">
			<button type="button" class="button secondary journey-dice">
				<span class="journey-die" aria-hidden="true">⚄</span> Tirar el dado
			</button>
			<p class="journey-bubble" aria-live="polite">
				Toca una casilla con nombre o tira el dado: cada una esconde un recuerdo de Classic.
			</p>
		</div>
		<div class="journey-scroll">
			<svg
				class="journey-board"
				viewBox="0 0 ${SIZE} ${SIZE}"
				aria-label="Tablero del camino al ${data.maxLevel}: ${atCap} en la meta y ${leveled.length - atCap} en camino. La lista de debajo detalla cada personaje."
			>
				<path class="journey-path" d="${path}" />
				<path class="journey-path-flow" d="${path}" />
				${board}${goal}
				<g class="journey-tokens">${tokens}</g>
			</svg>
		</div>
		<section class="journey-podium" aria-labelledby="journey-podium-title">
			<h3 id="journey-podium-title">Pioneros de Azeroth</h3>
			<p>
				Medalla para los ${data.places} primeros de la hermandad en llegar a nivel ${data.maxLevel}:
				oro para el 1.º, plata para el 2.º y 3.º y bronce para el 4.º y 5.º. Cuenta el momento en
				que lo registras en la web, y un oficial lo verifica con una captura del juego.
			</p>
			<ol class="journey-places">
				${podiumHtml}
			</ol>
		</section>
		<p class="journey-ready">
			${ready ? `<strong>Listos para raid:</strong> ${esc(ready)}.` : 'Nadie ha llegado todavía al nivel máximo.'}
		</p>
		${ranking ? `<ol class="journey-ranking" aria-label="Clasificación por nivel">${ranking}</ol>` : ''}
		${unknown.length ? `<p class="journey-unknown"><strong>Sin nivel indicado:</strong> ${unknown.map((p) => esc(p.name)).join(', ')}.</p>` : ''}
		<p class="privacy-note">
			Solo para miembros. El nivel sale de la ficha de cada personaje en la Armería; cuando
			conectemos la API de Blizzard se actualizará solo. Las frases son guiños a Classic: WoW
			Forever puede cambiar niveles, mazmorras o precios.
		</p>
	</div>`;

	const svg = host.querySelector('.journey-board'),
		bubble = host.querySelector('.journey-bubble'),
		scroller = host.querySelector('.journey-scroll'),
		dice = host.querySelector('.journey-dice'),
		face = host.querySelector('.journey-die');
	const show = (level) => {
		const special = specialSquares[level];
		svg.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
		svg.querySelector(`[data-special="${level}"]`)?.classList.add('is-active');
		bubble.innerHTML = `<strong>Nivel ${level} · ${esc(special.label)}</strong> ${esc(special.phrase)}`;
		bubble.classList.remove('is-new');
		void bubble.offsetWidth;
		bubble.classList.add('is-new');
		// On phones the board scrolls sideways: bring the square into view.
		if (scroller.scrollWidth > scroller.clientWidth) {
			const x = level >= data.maxLevel ? CENTER : squares[level - 1].x;
			scroller.scrollTo({
				left: (x / SIZE) * scroller.scrollWidth - scroller.clientWidth / 2,
				behavior: reduced() ? 'auto' : 'smooth',
			});
		}
	};
	svg.querySelectorAll('[data-special]').forEach((el) => {
		el.addEventListener('click', () => show(Number(el.dataset.special)));
		el.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			e.preventDefault();
			show(Number(el.dataset.special));
		});
	});
	let rolling = false;
	dice.addEventListener('click', () => {
		if (rolling) return;
		const current = Number(svg.querySelector('.is-active')?.dataset.special || 0),
			options = Object.keys(specialSquares)
				.map(Number)
				.filter((l) => l !== current),
			pick = options[Math.floor(Math.random() * options.length)];
		if (reduced()) return show(pick);
		rolling = true;
		dice.classList.add('is-rolling');
		let turns = 0;
		const spin = setInterval(() => {
			face.textContent = DICE[Math.floor(Math.random() * DICE.length)];
			if (++turns < 9) return;
			clearInterval(spin);
			face.textContent = DICE[(pick - 1) % DICE.length];
			dice.classList.remove('is-rolling');
			rolling = false;
			show(pick);
		}, 70);
	});
	host.querySelectorAll('[data-verify]').forEach((button) =>
		button.addEventListener('click', async () => {
			button.disabled = true;
			const verified = button.dataset.verified === 'true';
			try {
				await api(
					`/api/journey/${encodeURIComponent(button.dataset.verify)}/verification`,
					verified ? 'DELETE' : 'PUT',
					{},
				);
				toast?.(verified ? 'Verificación retirada' : 'Nivel 60 verificado');
				await mountJourney(host, ctx);
			} catch (error) {
				toast?.(error.message);
				button.disabled = false;
			}
		}),
	);
	if (!reduced()) walkTokens(svg, squares, data.maxLevel);
}
