// Ruleta de la hermandad: the guild's High-Low game on a European roulette (0–36).
// The server draws every number; this view only animates them: the wheel turns, the
// ball runs the other way and drops into the pocket, one player after another. Everyone
// with the section open sees a table's spins as soon as it is played.
import { classKey } from './roster-ui.js';
import { tutorialButton } from './tutorials.js';

// Pocket order on a European wheel, clockwise from the zero.
export const WHEEL = [
	0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
	31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const STEP = 360 / WHEEL.length,
	TRACK = 189,
	POCKET = 124,
	POLL = 2000,
	// Everyone watching starts the spins together this long after the table is played.
	LEAD = 4000;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const gold = (n) => `${Number(n).toLocaleString('es-ES')} de oro`;
const when = (iso) =>
	new Date(iso).toLocaleString('es-ES', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});

// The final angles of one spin: the wheel turns clockwise, the ball anticlockwise, and
// the ball ends over the pocket of `number` (angles grow clockwise from the top).
export function spinAngles(wheel, ball, number, extra = 0) {
	const pocket = WHEEL.indexOf(number) * STEP,
		nextWheel = wheel + 720 + extra,
		target = nextWheel + pocket,
		limit = ball - 1440;
	const nextBall = target - 360 * Math.ceil((target - limit) / 360);
	return { wheel: nextWheel, ball: nextBall };
}

// Seen from above with depth: wood bowl, recessed pockets, brass turret and a fixed light.
// The light and the shading rings stay still while the wheel turns under them, which is
// what makes it read as 3D. Gradients only, no filters on the wheel, so it spins smoothly.
function wheelSvg() {
	const arc = (r, a) => {
		const t = ((a - 90) * Math.PI) / 180;
		return `${(r * Math.cos(t)).toFixed(2)} ${(r * Math.sin(t)).toFixed(2)}`;
	};
	const wedge = (r0, r1, a0, a1) =>
		`M${arc(r1, a0)} A${r1} ${r1} 0 0 1 ${arc(r1, a1)} L${arc(r0, a1)} A${r0} ${r0} 0 0 0 ${arc(r0, a0)}Z`;
	const pockets = WHEEL.map((n, i) => {
		const a0 = (i - 0.5) * STEP,
			a1 = (i + 0.5) * STEP;
		return `<g class="roulette-pocket is-${colorOf(n)}" data-pocket="${n}"><path class="roulette-number-bg" d="${wedge(140, 178, a0, a1)}"/><path class="roulette-slot" d="${wedge(POCKET - 14, 140, a0, a1)}"/><text transform="rotate(${(i * STEP).toFixed(3)}) translate(0 -159)">${n}</text></g>`;
	}).join('');
	// Brass frets between pockets, with a dark edge so they stand up from the slots.
	const frets = WHEEL.map((_, i) => {
		const a = (i + 0.5) * STEP;
		return `<path class="roulette-fret-shadow" d="M${arc(POCKET - 14, a + 0.9)} L${arc(141, a + 0.9)}"/><path class="roulette-fret" d="M${arc(POCKET - 14, a)} L${arc(141, a)}"/>`;
	}).join('');
	// Four tapered turret arms ending in knobs.
	const arms = [0, 90, 180, 270]
		.map(
			(a) =>
				`<g transform="rotate(${a})"><path class="roulette-arm" d="M-7 -44 L-3.2 -90 Q0 -95 3.2 -90 L7 -44Z"/><circle class="roulette-knob" cy="-93" r="6.5"/></g>`,
		)
		.join('');
	return /* HTML */ `<svg
		class="roulette-svg"
		viewBox="-210 -210 420 420"
		role="img"
		aria-label="Ruleta europea del 0 al 36"
	>
		<defs>
			<radialGradient id="rl-wood" r="50%">
				<stop offset="0.86" stop-color="#1d0e06" />
				<stop offset="0.9" stop-color="#5a301a" />
				<stop offset="0.955" stop-color="#8d5532" />
				<stop offset="0.985" stop-color="#5a2f17" />
				<stop offset="1" stop-color="#2a1309" />
			</radialGradient>
			<radialGradient id="rl-track" r="50%">
				<stop offset="0.88" stop-color="#0f0804" />
				<stop offset="0.93" stop-color="#3b2010" />
				<stop offset="1" stop-color="#7a4626" />
			</radialGradient>
			<radialGradient id="rl-cone" r="50%">
				<stop offset="0" stop-color="#b0723f" />
				<stop offset="0.55" stop-color="#7a4523" />
				<stop offset="1" stop-color="#2c160a" />
			</radialGradient>
			<linearGradient id="rl-brass" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#fff2c8" />
				<stop offset="0.35" stop-color="#dcb56a" />
				<stop offset="0.7" stop-color="#8a6424" />
				<stop offset="1" stop-color="#e3be72" />
			</linearGradient>
			<radialGradient id="rl-dome" cx="38%" cy="32%" r="70%">
				<stop offset="0" stop-color="#fff6d6" />
				<stop offset="0.4" stop-color="#d9b46a" />
				<stop offset="1" stop-color="#6e4b18" />
			</radialGradient>
			<radialGradient id="rl-ball" cx="34%" cy="30%" r="75%">
				<stop offset="0" stop-color="#ffffff" />
				<stop offset="0.45" stop-color="#eeeee8" />
				<stop offset="1" stop-color="#9b9b94" />
			</radialGradient>
			<radialGradient id="rl-shade" r="50%">
				<stop offset="0" stop-color="#000" stop-opacity="0" />
				<stop offset="0.6" stop-color="#000" stop-opacity="0" />
				<stop offset="0.625" stop-color="#000" stop-opacity="0.55" />
				<stop offset="0.7" stop-color="#000" stop-opacity="0.15" />
				<stop offset="0.78" stop-color="#000" stop-opacity="0" />
				<stop offset="0.79" stop-color="#000" stop-opacity="0.35" />
				<stop offset="0.83" stop-color="#000" stop-opacity="0" />
				<stop offset="0.95" stop-color="#000" stop-opacity="0" />
				<stop offset="1" stop-color="#000" stop-opacity="0.5" />
			</radialGradient>
			<radialGradient id="rl-light" cx="30%" cy="22%" r="80%">
				<stop offset="0" stop-color="#fff" stop-opacity="0.24" />
				<stop offset="0.35" stop-color="#fff" stop-opacity="0.07" />
				<stop offset="0.7" stop-color="#000" stop-opacity="0" />
				<stop offset="1" stop-color="#000" stop-opacity="0.32" />
			</radialGradient>
			<filter id="rl-soft" x="-1" y="-1" width="3" height="3">
				<feGaussianBlur stdDeviation="2" />
			</filter>
		</defs>
		<circle class="roulette-rim" r="207" />
		<circle class="roulette-track" r="199" />
		<circle class="roulette-lip" r="179.5" />
		<g class="roulette-wheel">
			${pockets}
			<g class="roulette-frets">${frets}</g>
			<circle class="roulette-cone" r="${POCKET - 14}" />
			<circle class="roulette-cone-ring" r="${POCKET - 15}" />
			<g class="roulette-arms">${arms}</g>
			<circle class="roulette-hub" r="50" />
			<circle class="roulette-hub-well" r="43" />
			<image href="/assets/guild-logo-128.webp" x="-38" y="-41" width="76" height="76" />
		</g>
		<circle class="roulette-shade" r="178" />
		<circle class="roulette-light" r="207" />
		<g class="roulette-ball-orbit">
			<g class="roulette-ball">
				<circle class="roulette-ball-shadow" cx="2.5" cy="3.5" r="7" />
				<circle class="roulette-ball-body" r="7" />
				<circle class="roulette-ball-glint" cx="-2.4" cy="-2.6" r="1.8" />
			</g>
		</g>
	</svg>`;
}

export async function mountRoulette(host, ctx) {
	const { api, esc, toast } = ctx;
	let data = await api('/api/roulette');
	const seen = new Set(data.recent.map((r) => r.id));
	const queue = [];
	let playing = false,
		skip = false,
		busy = false,
		listsKey = '',
		wheelAngle = 0,
		ballAngle = 0;

	const name = (p) =>
		p ? `<span class="roulette-name class-${classKey(p.class)}">${esc(p.name)}</span>` : 'Alguien';
	// A result: its gold value, in the colour of the pocket it came from.
	// A result: the pocket the ball fell in (in its colour) and the gold it is worth.
	const chip = (s, extra = '') =>
		`<span class="roulette-result${extra}" title="Casilla ${s.number} → ${s.roll} de oro"><b class="roulette-chip is-${colorOf(s.number)}">${s.number}</b><span class="roulette-arrow" aria-hidden="true">→</span><strong>${s.roll}</strong><small>oro</small></span>`;
	const last = (r, id) => r.spins.findLast((s) => s.userId === id);
	// The private messages on Discord: each player sees their own, officers both.
	const dmWord = {
		pending: 'en camino',
		sending: 'en camino',
		sent: 'enviado',
		failed: 'no entregado',
		uncertain: 'sin confirmar',
	};
	const dmNote = (dm) => {
		const parts = [
			dm?.winner && dmWord[dm.winner] && `ganador ${dmWord[dm.winner]}`,
			dm?.loser && dmWord[dm.loser] && `quien paga ${dmWord[dm.loser]}`,
		].filter(Boolean);
		return parts.length ? ` · aviso por Discord: ${parts.join(', ')}` : '';
	};
	const svgIcon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
	const icon = {
		play: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5Z"/>'),
		check: svgIcon('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
		trash: svgIcon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'),
	};

	host.innerHTML = /* HTML */ `<div class="roulette">
		<header class="roulette-head">
			<div>
				<span class="eyebrow">Casino de la hermandad</span>
				<h2>Ruleta</h2>
				<p>
					Cada mesa tiene un valor máximo en oro y cada casilla vale de 1 (el 0) a ese máximo (el
					36). Quien saca el resultado más bajo paga al más alto la diferencia: en una mesa de 100,
					un 80 y un 30 son 50 de oro. Los del medio ni pagan ni cobran, y apuntarse es gratis. Si
					hay empate arriba o abajo, los empatados vuelven a tirar y su nueva tirada sustituye a la
					anterior.
				</p>
			</div>
			${tutorialButton('ruleta', 'Ver tutorial en vídeo')}
		</header>
		<div class="roulette-stage">
			<div class="roulette-wheel-wrap">${wheelSvg()}</div>
			<div class="roulette-board">
				<p class="roulette-room"></p>
				<p class="roulette-now" aria-live="polite"></p>
				<p class="roulette-scale"></p>
				<ol class="roulette-results"></ol>
				<p class="roulette-verdict" aria-live="polite" hidden></p>
				<div class="roulette-actions">
					<button type="button" class="button secondary" data-skip hidden>Saltar animación</button>
				</div>
			</div>
		</div>
		<section class="roulette-open" aria-labelledby="roulette-open-title">
			<h3 id="roulette-open-title">Mesas abiertas</h3>
			<form class="roulette-new">
				<label
					>Valor máximo (oro)
					<input name="stake" type="number" step="1" required inputmode="numeric" />
				</label>
				<p class="roulette-risk" aria-live="polite"></p>
				<button type="submit">Abrir mesa</button>
			</form>
			<div class="roulette-tables"></div>
		</section>
		<div class="roulette-lists"></div>
		${
			data.canConfigure
				? /* HTML */ `<details class="roulette-config">
						<summary>Valor máximo permitido (GM)</summary>
						<form class="roulette-limit">
							<label
								>Valor máximo que puede tener una mesa, en oro
								<input
									name="maxBet"
									type="number"
									min="${data.minBet}"
									max="1000000"
									step="1"
									required
									value="${data.maxBet}"
								/>
							</label>
							<button type="submit" class="button secondary">Guardar tope</button>
						</form>
					</details>`
				: ''
		}
		<p class="privacy-note">
			Solo para miembros. Los números los saca el servidor y nadie puede repetir una tirada. El oro
			se paga dentro del juego: la web solo apunta quién debe a quién y quien gana marca «Cobrado».
			Jugad con cabeza.
		</p>
	</div>`;

	const $ = (s) => host.querySelector(s);
	const svg = $('.roulette-svg'),
		wheel = $('.roulette-wheel'),
		orbit = $('.roulette-ball-orbit'),
		ball = $('.roulette-ball'),
		now = $('.roulette-now'),
		results = $('.roulette-results'),
		verdict = $('.roulette-verdict'),
		scale = $('.roulette-scale'),
		skipButton = $('[data-skip]'),
		form = $('.roulette-new'),
		risk = $('.roulette-risk');

	const place = () => {
		wheel.style.transform = `rotate(${wheelAngle}deg)`;
		orbit.style.transform = `rotate(${ballAngle}deg)`;
	};
	const hit = (n) => {
		svg.querySelectorAll('.is-hit').forEach((p) => p.classList.remove('is-hit'));
		if (n !== null) svg.querySelector(`[data-pocket="${n}"]`)?.classList.add('is-hit');
	};
	// Puts the ball in a pocket at once, keeping the wheel where it is.
	const settle = (n) => {
		ballAngle = wheelAngle + WHEEL.indexOf(n) * STEP;
		ball.classList.add('is-in');
		place();
		hit(n);
	};
	const spinTo = async (n, ms) => {
		const next = spinAngles(wheelAngle, ballAngle, n, Math.random() * 360);
		ball.classList.remove('is-in');
		hit(null);
		const frames = [
			wheel.animate(
				[{ transform: `rotate(${wheelAngle}deg)` }, { transform: `rotate(${next.wheel}deg)` }],
				{ duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)' },
			),
			orbit.animate(
				[{ transform: `rotate(${ballAngle}deg)` }, { transform: `rotate(${next.ball}deg)` }],
				{ duration: ms, easing: 'cubic-bezier(.12,.75,.25,1)' },
			),
			// The ball runs on the rim, bounces over the frets and drops into the pocket.
			ball.animate(
				[
					{ transform: `translateY(-${TRACK}px) scale(1)`, offset: 0 },
					{ transform: `translateY(-${TRACK}px) scale(1)`, offset: 0.62 },
					{ transform: `translateY(-${POCKET + 30}px) scale(1.16)`, offset: 0.74 },
					{ transform: `translateY(-${POCKET + 46}px) scale(1.08)`, offset: 0.8 },
					{ transform: `translateY(-${POCKET + 6}px) scale(1.1)`, offset: 0.88 },
					{ transform: `translateY(-${POCKET + 14}px) scale(1.03)`, offset: 0.93 },
					{ transform: `translateY(-${POCKET}px) scale(1)`, offset: 1 },
				],
				{ duration: ms, easing: 'ease-out' },
			),
		];
		wheelAngle = next.wheel % 360;
		ballAngle = next.ball % 360;
		if (skip) frames.forEach((f) => f.finish());
		else await Promise.all(frames.map((f) => f.finished.catch(() => {})));
		frames.forEach((f) => f.cancel());
		ball.classList.add('is-in');
		place();
		hit(n);
	};

	const seats = (r) =>
		r.players
			.map(
				(p) =>
					`<li data-seat="${esc(p.id)}"${p.me ? ' class="is-me"' : ''}><div class="roulette-seat-head">${name(p)}<span class="roulette-badge"></span></div><div class="roulette-current"><span class="roulette-wait">Esperando turno…</span></div><div class="roulette-history" hidden></div></li>`,
			)
			.join('');
	const label = (s) =>
		s.kind === 'high' ? 'Desempate arriba' : s.kind === 'low' ? 'Desempate abajo' : '';
	const finish = (r, fresh) => {
		for (const li of results.children) {
			const won = li.dataset.seat === r.winner?.id,
				lost = li.dataset.seat === r.loser?.id;
			li.classList.toggle('is-winner', won);
			li.classList.toggle('is-loser', lost);
			li.querySelector('.roulette-badge').textContent = won
				? `Gana ${gold(r.amount)}`
				: lost
					? `Paga ${gold(r.amount)}`
					: '';
		}
		verdict.hidden = false;
		verdict.classList.toggle('is-new', fresh);
		const high = last(r, r.winner?.id),
			low = last(r, r.loser?.id);
		verdict.innerHTML = `<span>${name(r.loser)} paga <strong>${gold(r.amount)}</strong> a ${name(r.winner)}</span><small>${name(r.winner)}: casilla ${high?.number} = ${r.high} · ${name(r.loser)}: casilla ${low?.number} = ${r.low} · ${r.high} − ${r.low} = ${r.amount}</small>`;
	};
	// Shows a played table: animated the first time it arrives, at once otherwise.
	async function play(r, animate) {
		results.innerHTML = seats(r);
		verdict.hidden = true;
		scale.textContent = `Valor de las casillas en esta mesa: 0 = 1 · 18 = ${1 + Math.floor((36 * (r.stake - 1) + 36) / 72)} · 36 = ${r.stake} de oro`;
		const rounds = new Set(r.spins.map((s) => s.round)).size;
		now.textContent = `Mesa de hasta ${gold(r.stake)} · ${r.players.length} jugadores${rounds > 1 ? ' · con desempates' : ''}`;
		const quick = !animate || reduced();
		skip = quick;
		skipButton.hidden = quick;
		// Long tie-breaks speed up so a big table still ends in under a minute or so.
		const ms = Math.min(4200, Math.max(700, 30000 / r.spins.length)),
			pause = Math.min(900, ms / 3);
		for (const s of r.spins) {
			const seat = results.querySelector(`[data-seat="${CSS.escape(s.userId)}"]`),
				player = r.players.find((p) => p.id === s.userId);
			if (!skip) {
				now.innerHTML = `${label(s) ? `<em>${label(s)}</em> · ` : ''}Gira ${name(player)}…`;
				seat?.classList.add('is-turn');
				await spinTo(s.number, ms);
				seat?.classList.remove('is-turn');
			}
			// A new spin replaces the player's previous result, which moves to the history.
			const current = seat?.querySelector('.roulette-current'),
				history = seat?.querySelector('.roulette-history'),
				previous = current?.querySelector('.roulette-result');
			if (previous) {
				previous.classList.add('is-old');
				history.append(previous);
				history.hidden = false;
			}
			if (current) current.innerHTML = chip(s, s.kind === 'main' ? '' : ' is-tie');
			if (!skip) {
				now.innerHTML = `${name(player)} · casilla ${s.number} → <strong>${gold(s.roll)}</strong>`;
				// A moment to read the result before the next player spins.
				await new Promise((done) => setTimeout(done, pause));
			}
		}
		// Shown at once, the ball rests on the winning number.
		if (skip)
			settle(
				quick
					? (r.spins.findLast((s) => s.userId === r.winner?.id)?.number ?? 0)
					: r.spins.at(-1).number,
			);
		skipButton.hidden = true;
		now.textContent = `Mesa del ${when(r.closedAt)} · hasta ${gold(r.stake)}`;
		finish(r, !quick);
	}
	// A countdown to the shared start, so the whole room watches the same spin.
	async function countdown(r, at) {
		results.innerHTML = seats(r);
		verdict.hidden = true;
		while (Date.now() < at) {
			now.innerHTML = `¡Mesa de ${gold(r.stake)} en marcha! La bola sale en <strong>${Math.ceil((at - Date.now()) / 1000)}</strong>…`;
			await new Promise((done) => setTimeout(done, Math.min(250, at - Date.now())));
		}
	}
	async function drain() {
		if (playing) return;
		playing = true;
		try {
			while (queue.length) {
				const { r, at } = queue.shift();
				if (at > Date.now()) await countdown(r, at);
				await play(r, true);
			}
		} finally {
			playing = false;
		}
	}

	const idle = () => {
		if (data.recent[0]) return play(data.recent[0], false);
		now.textContent = 'Abre una mesa o apúntate a una para jugar.';
		ball.classList.remove('is-in');
		place();
	};

	// Who has the roulette open right now.
	const renderRoom = () => {
		const list = data.watching || [];
		$('.roulette-room').innerHTML = list.length
			? `<span class="roulette-live" aria-hidden="true"></span>En la sala ahora (${list.length}): ${list.map(name).join(', ')}`
			: '';
	};
	const renderRisk = () => {
		const stake = Number(form.elements.stake.value);
		form.elements.stake.min = data.minBet;
		form.elements.stake.max = data.maxBet;
		risk.innerHTML =
			Number.isInteger(stake) && stake >= data.minBet
				? `Cada casilla vale de 1 a ${gold(stake)}; como mucho se pagan <strong>${gold(stake - 1)}</strong>. Valor de ${data.minBet} a ${data.maxBet} de oro.`
				: `Valor de ${data.minBet} a ${data.maxBet} de oro.`;
	};
	form.elements.stake.value = Math.min(100, data.maxBet);
	form.elements.stake.addEventListener('input', renderRisk);

	function renderLists() {
		const key = JSON.stringify([data.open, data.recent, data.pending, data.ranking]);
		if (key === listsKey) return;
		listsKey = key;
		$('.roulette-tables').innerHTML = data.open.length
			? data.open
					.map(
						(t) =>
							/* HTML */ `<article class="roulette-table">
								<div class="roulette-table-head">
									<strong>Mesa de ${name(t.host)}</strong>
									<span
										>Hasta ${gold(t.stake)} · pago máximo ${gold(t.stake - 1)} · apuntarse es
										gratis</span
									>
								</div>
								<ul class="roulette-seats" aria-label="Jugadores apuntados">
									${t.players.map((p) => `<li${p.me ? ' class="is-me"' : ''}>${name(p)}</li>`).join('')}
								</ul>
								<div class="roulette-table-foot">
									<small>${t.players.length}/${data.maxPlayers} jugadores</small>
									${!t.joined ? `<button type="button" data-join="${esc(t.id)}">Me apunto</button>` : ''}
									${t.joined && t.host?.id !== data.me ? `<button type="button" class="button secondary" data-leave="${esc(t.id)}">Salir</button>` : ''}
									${t.canSpin ? `<button type="button" class="roulette-go" data-spin="${esc(t.id)}">¡Girar la ruleta!</button>` : ''}
									${t.canCancel && !t.canSpin && t.players.length < 2 ? '<small>Hace falta al menos otro jugador.</small>' : ''}
									${t.canCancel ? `<button type="button" class="link-button" data-cancel="${esc(t.id)}">Cancelar mesa</button>` : ''}
									${t.canDelete ? `<button type="button" class="roulette-action is-icon is-danger" data-delete="${esc(t.id)}" aria-label="Borrar mesa" title="Borrar mesa">${icon.trash}</button>` : ''}
								</div>
							</article>`,
					)
					.join('')
			: '<p class="empty-note">No hay mesas abiertas. ¡Abre la primera!</p>';
		const debt = (r) =>
			/* HTML */ `<li class="roulette-debt${r.settledAt ? ' is-settled' : ''}">
				<div class="roulette-debt-info">
					<span>${name(r.loser)} paga <strong>${gold(r.amount)}</strong> a ${name(r.winner)}</span>
					<small
						>${when(r.closedAt)} · ${r.players.length} jugadores · hasta
						${gold(r.stake)}${r.settledAt ? ' · <b class="roulette-paid">Cobrado</b>' : ''}${dmNote(r.dm)}</small
					>
				</div>
				<div class="roulette-debt-actions">
					${
						r.canSettle
							? r.settledAt
								? `<button type="button" class="roulette-action" data-unsettle="${esc(r.id)}">Deshacer cobro</button>`
								: `<button type="button" class="roulette-action is-gold" data-settle="${esc(r.id)}">${icon.check}Cobrado</button>`
							: r.settledAt
								? ''
								: '<span class="roulette-tag">Pendiente</span>'
					}
					<button type="button" class="roulette-action" data-replay="${esc(r.id)}">
						${icon.play}Ver tirada
					</button>
					${r.canDelete ? `<button type="button" class="roulette-action is-icon is-danger" data-delete="${esc(r.id)}" aria-label="Borrar mesa" title="Borrar mesa">${icon.trash}</button>` : ''}
				</div>
			</li>`;
		$('.roulette-lists').innerHTML = /* HTML */ `<section aria-labelledby="roulette-pending-title">
				<h3 id="roulette-pending-title">Pendientes de cobrar</h3>
				${data.pending.length ? `<ul class="roulette-debts">${data.pending.map(debt).join('')}</ul>` : '<p class="empty-note">Nadie debe nada. Por ahora.</p>'}
			</section>
			<section aria-labelledby="roulette-ranking-title">
				<h3 id="roulette-ranking-title">Clasificación</h3>
				${
					data.ranking.length
						? `<div class="table-scroll"><table class="roulette-ranking"><thead><tr><th>#</th><th>Jugador</th><th>Mesas</th><th>Ganado</th><th>Perdido</th><th>Balance</th><th>Mayor premio</th></tr></thead><tbody>${data.ranking
								.map(
									(r, i) =>
										`<tr${r.me ? ' class="is-me"' : ''}><td>${i + 1}</td><td>${name(r)}</td><td>${r.played}</td><td>${gold(r.won)}</td><td>${gold(r.lost)}</td><td class="${r.net > 0 ? 'is-up' : r.net < 0 ? 'is-down' : ''}">${r.net > 0 ? '+' : ''}${r.net.toLocaleString('es-ES')}</td><td>${r.best ? gold(r.best) : '—'}</td></tr>`,
								)
								.join('')}</tbody></table></div>`
						: '<p class="empty-note">Aún no se ha jugado ninguna mesa.</p>'
				}
			</section>
			<section aria-labelledby="roulette-recent-title">
				<h3 id="roulette-recent-title">Últimas mesas</h3>
				${data.recent.length ? `<ul class="roulette-debts">${data.recent.map(debt).join('')}</ul>` : '<p class="empty-note">Todavía no hay historial.</p>'}
			</section>`;
	}

	// New played tables (from anyone) are queued to animate for everyone watching.
	function apply(next) {
		data = next;
		// The server's clock decides the shared start; this is how far ours is from it.
		const offset = Date.parse(data.serverTime) - Date.now();
		renderRoom();
		renderRisk();
		renderLists();
		const fresh = data.recent.filter((r) => !seen.has(r.id)).reverse();
		for (const r of fresh) {
			seen.add(r.id);
			queue.push({ r, at: Date.parse(r.closedAt) + LEAD - offset });
		}
		if (fresh.length) {
			$('.roulette-stage').scrollIntoView({
				behavior: reduced() ? 'auto' : 'smooth',
				block: 'nearest',
			});
			void drain();
		}
	}
	const act = async (path, method, value) => {
		if (busy) return false;
		busy = true;
		try {
			apply(await api(path, method, value));
			return true;
		} catch (error) {
			toast(error.message);
			return false;
		} finally {
			busy = false;
		}
	};

	host.addEventListener('click', (e) => {
		const b = e.target.closest('button');
		if (!b) return;
		const d = b.dataset;
		const table = (id) => `/api/roulette/${encodeURIComponent(id)}`;
		if ('skip' in d) {
			skip = true;
			wheel.getAnimations().forEach((a) => a.finish());
			orbit.getAnimations().forEach((a) => a.finish());
			ball.getAnimations().forEach((a) => a.finish());
		} else if (d.join) act(table(d.join) + '/players', 'PUT');
		else if (d.leave) act(table(d.leave) + '/players', 'DELETE');
		else if (d.spin) act(table(d.spin) + '/spin', 'POST');
		else if (d.cancel) {
			if (confirm('¿Cancelar esta mesa? Nadie pagará nada.'))
				act(table(d.cancel) + '/cancel', 'POST');
		} else if (d.settle) act(table(d.settle) + '/settled', 'PUT');
		else if (d.unsettle) act(table(d.unsettle) + '/settled', 'DELETE');
		else if (d.delete) {
			if (
				confirm(
					'¿Borrar esta mesa? Desaparece de las listas, del ranking y de las deudas. Queda guardada en el registro.',
				)
			)
				act(table(d.delete), 'DELETE');
		} else if (d.replay && !playing) {
			const r = [...data.recent, ...data.pending].find((x) => x.id === d.replay);
			if (r) {
				queue.push({ r, at: 0 });
				$('.roulette-stage').scrollIntoView({
					behavior: reduced() ? 'auto' : 'smooth',
					block: 'nearest',
				});
				void drain();
			}
		}
	});
	form.addEventListener('submit', (e) => {
		e.preventDefault();
		act('/api/roulette', 'POST', { stake: Number(form.elements.stake.value) });
	});
	host.querySelector('.roulette-limit')?.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (
			await act('/api/roulette/settings', 'PUT', { maxBet: Number(e.target.elements.maxBet.value) })
		)
			toast('Tope guardado');
	});

	renderRoom();
	renderRisk();
	renderLists();
	await idle();
	// Keeps the tables live while the section is open and the tab visible.
	const poll = async () => {
		if (!host.isConnected) return;
		if (document.visibilityState === 'visible' && !busy)
			try {
				apply(await api('/api/roulette'));
			} catch {}
		setTimeout(poll, POLL);
	};
	setTimeout(poll, POLL);
}
