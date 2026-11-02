// Ruleta de la hermandad: the guild's High-Low game on a European roulette (0–36).
// The server draws every number; this view only animates them: the wheel turns, the
// ball runs the other way and drops into the pocket, one player after another. Everyone
// with the section open sees a table's spins as soon as it is played.
import { classKey } from './roster-ui.js';

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
		return `<g class="roulette-pocket is-${colorOf(n)}" data-pocket="${n}"><path class="roulette-number-bg" d="${wedge(140, 178, a0, a1)}"/><path class="roulette-slot" d="${wedge(POCKET - 14, 140, a0, a1)}"/><text transform="rotate(${(i * STEP).toFixed(3)}) translate(0 -152)">${n}</text></g>`;
	}).join('');
	const spokes = [0, 45, 90, 135]
		.map((a) => `<rect x="-3" y="-92" width="6" height="184" rx="3" transform="rotate(${a})"/>`)
		.join('');
	return /* HTML */ `<svg
		class="roulette-svg"
		viewBox="-210 -210 420 420"
		role="img"
		aria-label="Ruleta europea del 0 al 36"
	>
		<circle class="roulette-rim" r="207" />
		<circle class="roulette-track" r="199" />
		<circle class="roulette-track-inner" r="179" />
		<g class="roulette-wheel">
			${pockets}
			<circle class="roulette-cone" r="${POCKET - 14}" />
			<g class="roulette-spokes">${spokes}</g>
			<circle class="roulette-hub" r="52" />
			<image href="/assets/guild-logo-128.webp" x="-40" y="-44" width="80" height="80" />
		</g>
		<g class="roulette-ball-orbit"><circle class="roulette-ball" r="7" /></g>
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
	const chip = (s, extra = '') =>
		`<b class="roulette-chip is-${colorOf(s.number)}${extra}" title="Casilla ${s.number} → ${s.roll} de oro">${s.roll}</b>`;

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
		</header>
		<div class="roulette-stage">
			<div class="roulette-wheel-wrap">${wheelSvg()}</div>
			<div class="roulette-board">
				<p class="roulette-room"></p>
				<p class="roulette-now" aria-live="polite"></p>
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
					{ transform: `translateY(-${TRACK}px)`, offset: 0 },
					{ transform: `translateY(-${TRACK}px)`, offset: 0.62 },
					{ transform: `translateY(-${POCKET + 30}px)`, offset: 0.74 },
					{ transform: `translateY(-${POCKET + 46}px)`, offset: 0.8 },
					{ transform: `translateY(-${POCKET + 6}px)`, offset: 0.88 },
					{ transform: `translateY(-${POCKET + 14}px)`, offset: 0.93 },
					{ transform: `translateY(-${POCKET}px)`, offset: 1 },
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
					`<li data-seat="${esc(p.id)}"${p.me ? ' class="is-me"' : ''}>${name(p)}<span class="roulette-rolls"></span></li>`,
			)
			.join('');
	const label = (s) =>
		s.kind === 'high' ? 'Desempate arriba' : s.kind === 'low' ? 'Desempate abajo' : '';
	const finish = (r, fresh) => {
		for (const li of results.children) {
			li.classList.toggle('is-winner', li.dataset.seat === r.winner?.id);
			li.classList.toggle('is-loser', li.dataset.seat === r.loser?.id);
		}
		verdict.hidden = false;
		verdict.classList.toggle('is-new', fresh);
		verdict.innerHTML = `<span>${name(r.loser)} paga <strong>${gold(r.amount)}</strong> a ${name(r.winner)}</span><small>${r.high} − ${r.low} = ${r.amount}</small>`;
	};
	// Shows a played table: animated the first time it arrives, at once otherwise.
	async function play(r, animate) {
		results.innerHTML = seats(r);
		verdict.hidden = true;
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
			seat?.querySelector('.roulette-rolls');
			// A new spin replaces the player's previous result.
			seat?.querySelectorAll('.roulette-chip').forEach((c) => c.classList.add('is-old'));
			seat
				?.querySelector('.roulette-rolls')
				.insertAdjacentHTML('beforeend', chip(s, s.kind === 'main' ? '' : ' is-tie'));
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
									${t.canDelete ? `<button type="button" class="link-button is-danger" data-delete="${esc(t.id)}">Borrar</button>` : ''}
								</div>
							</article>`,
					)
					.join('')
			: '<p class="empty-note">No hay mesas abiertas. ¡Abre la primera!</p>';
		const debt = (r) => /* HTML */ `<li${r.settledAt ? ' class="is-settled"' : ''}>
				<span>${name(r.loser)} → ${name(r.winner)}</span>
				<strong>${gold(r.amount)}</strong>
				<small>${when(r.closedAt)}</small>
				${
					r.canSettle
						? r.settledAt
							? `<button type="button" class="link-button" data-unsettle="${esc(r.id)}">Deshacer cobro</button>`
							: `<button type="button" class="button secondary" data-settle="${esc(r.id)}">Cobrado</button>`
						: `<span class="roulette-tag">${r.settledAt ? 'Cobrado' : 'Pendiente'}</span>`
				}
				<button type="button" class="link-button" data-replay="${esc(r.id)}">Ver</button>
				${r.canDelete ? `<button type="button" class="link-button is-danger" data-delete="${esc(r.id)}">Borrar</button>` : ''}
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
