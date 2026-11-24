// "Senda del honor": the members' main characters on a staircase of honor ranks (from no
// rank to 14), the podium of honorable kills and the full list. Data from Battle.net.
import { classKey } from './roster-ui.js';

const TOKENS_PER_STEP = 6;
const rankName = (rank) => (rank ? `Rango ${rank}` : 'Sin rango');
const number = (n) => Number(n || 0).toLocaleString('es-ES');

export async function mountPvp(host, ctx) {
	const { api, esc } = ctx;
	const data = await api('/api/pvp');
	const byId = new Map(data.players.map((p) => [p.id, p]));
	const known = data.players.filter((p) => p.rank !== null);
	const unknown = data.players.filter((p) => p.rank === null);
	const mine = data.players.find((p) => p.me);
	const maxKills = Math.max(1, ...known.map((p) => p.kills || 0));

	const token = (p) =>
		`<li class="pvp-token class-${classKey(p.class)}${p.me ? ' is-me' : ''}" title="${esc(p.name)} · ${esc(p.class)} · ${esc(rankName(p.rank))} · ${number(p.kills)} muertes con honor"><span aria-hidden="true">${esc(p.name.slice(0, 1).toUpperCase())}</span><span class="visually-hidden">${esc(p.name)}</span></li>`;
	const steps = data.ranks
		.map((ids, rank) => {
			const list = ids.map((id) => byId.get(id)).sort((a, b) => Number(b.me) - Number(a.me));
			const shown = list.slice(0, TOKENS_PER_STEP);
			const more = list.length - shown.length;
			return `<li class="pvp-step${list.some((p) => p.me) ? ' is-mine' : ''}${list.length ? '' : ' is-empty'}" data-rank="${rank}"><ul class="pvp-tokens">${shown.map(token).join('')}${
				more > 0
					? `<li class="pvp-token is-more" title="${esc(
							list
								.slice(TOKENS_PER_STEP)
								.map((p) => p.name)
								.join(', '),
						)}">+${more}</li>`
					: ''
			}</ul><span class="pvp-block" data-bar="${Math.round((rank / data.maxRank) * 100)}"><b>${rank || '—'}</b><small>${list.length ? `${list.length} ${list.length === 1 ? 'miembro' : 'miembros'}` : ''}</small></span></li>`;
		})
		.join('');

	const medals = ['Oro', 'Plata', 'Bronce'];
	const podium = Array.from({ length: data.places }, (_, i) => {
		const place = data.podium[i] && byId.get(data.podium[i].id);
		return place
			? `<li class="journey-place tier-${3 - i}${place.me ? ' is-me' : ''}"><b>${i + 1}.º</b><span class="journey-dot class-${classKey(place.class)}" aria-hidden="true"></span><strong>${esc(place.name)}</strong><small>${number(place.kills)} muertes · ${medals[i]}</small></li>`
			: `<li class="journey-place is-open tier-${3 - i}"><b>${i + 1}.º</b><strong>¿Quién será?</strong><small>${medals[i]}</small></li>`;
	}).join('');
	const ranking = known
		.map(
			(p) =>
				`<li class="${p.me ? 'is-me' : ''}"><span class="journey-dot class-${classKey(p.class)}" aria-hidden="true"></span><strong>${esc(p.name)}</strong><small>${esc(p.class)} · ${esc(rankName(p.rank))}</small><span class="journey-bar class-${classKey(p.class)}" data-bar="${Math.round(((p.kills || 0) / maxKills) * 100)}" aria-hidden="true"></span><b>${number(p.kills)}</b></li>`,
		)
		.join('');
	const notice = !mine
		? '<p class="notice">Marca un personaje principal en <a href="#personajes">Personajes</a> para aparecer en la clasificación.</p>'
		: mine.rank === null
			? '<p class="notice">Tu personaje principal no tiene datos de PvP. Salen de Battle.net: impórtalo desde <a href="#personajes">Personajes</a> y en una hora como mucho aparecerá aquí.</p>'
			: '';

	host.innerHTML = /* HTML */ `<div class="journey pvp">
		<header class="journey-head">
			<div>
				<h2>Senda del honor</h2>
				<p>
					El rango de honor y las muertes con honor del personaje principal de cada miembro. Cada
					peldaño es un rango, del «Sin rango» al ${data.maxRank}.
				</p>
			</div>
			<dl class="journey-stats">
				<div>
					<dt>Con rango</dt>
					<dd>${data.ranked}</dd>
				</div>
				<div>
					<dt>Muertes de la hermandad</dt>
					<dd>${number(data.totalKills)}</dd>
				</div>
				<div>
					<dt>Tu rango</dt>
					<dd>${mine && mine.rank !== null ? mine.rank || '—' : '—'}</dd>
				</div>
			</dl>
		</header>
		${notice}
		<div class="pvp-scroll">
			<ol
				class="pvp-stairs"
				aria-label="Escalera de rangos de honor: ${data.ranked} miembros con rango. La lista de debajo detalla cada personaje."
			>
				${steps}
			</ol>
		</div>
		<section class="journey-podium" aria-labelledby="pvp-podium-title">
			<h3 id="pvp-podium-title">Los más temidos</h3>
			<p>Los ${data.places} personajes principales con más muertes con honor de la hermandad.</p>
			<ol class="journey-places">
				${podium}
			</ol>
		</section>
		${ranking ? `<ol class="journey-ranking pvp-ranking" aria-label="Clasificación por muertes con honor">${ranking}</ol>` : '<p class="journey-ready">Todavía no hay datos de PvP de nadie.</p>'}
		${unknown.length ? `<p class="journey-unknown"><strong>Sin datos de Battle.net:</strong> ${unknown.map((p) => esc(p.name)).join(', ')}.</p>` : ''}
		<p class="privacy-note">
			Solo para miembros. Los datos salen de Blizzard para los personajes importados desde
			Battle.net y se actualizan solos más o menos cada hora.
		</p>
	</div>`;
}
