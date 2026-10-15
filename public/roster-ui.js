import { ClassIcon, ClassWithSpecIcon } from './components.js';

const classKeys = {
	Guerrero: 'warrior',
	Paladín: 'paladin',
	Cazador: 'hunter',
	Pícaro: 'rogue',
	Sacerdote: 'priest',
	Chamán: 'shaman',
	Mago: 'mage',
	Brujo: 'warlock',
	Druida: 'druid',
};

export function classKey(name) {
	return Object.hasOwn(classKeys, name) ? classKeys[name] : 'unknown';
}

export function rosterCards(
	rows,
	esc,
	{
		privateDetails = false,
		rankLabel = (value) => value,
		editable = false,
		sheetLinks = false,
	} = {},
) {
	const roleOrder = ['Tanque', 'Sanador', 'DPS melee', 'DPS distancia'];
	const roles = [...new Set(rows.map((row) => row.role))].sort(
		(a, b) =>
			(roleOrder.indexOf(a) < 0 ? 99 : roleOrder.indexOf(a)) -
			(roleOrder.indexOf(b) < 0 ? 99 : roleOrder.indexOf(b)),
	);

	return /* HTML */ `<div class="roster-board">
		${roles
			.map((role) => {
				const members = rows.filter((row) => row.role === role);
				return /* HTML */ `<section class="roster-role">
					<header class="roster-role-heading">
						<h3>${esc(role || 'Sin rol')}</h3>
						<span class="roster-count">${members.length}</span>
					</header>
					<ul class="roster-members">
						${members
							.map((row) => {
								const identity = `<span class="class-emblem" aria-hidden="true">${row.spec ? ClassWithSpecIcon({ className: row.class, specId: row.spec }) : ClassIcon({ className: row.class })}</span><span class="roster-player-info"><strong class="class-name">${esc(row.name)}${privateDetails && row.surname ? ' ' + esc(row.surname) : ''}</strong><span>${esc(row.class)}${privateDetails ? ' · ' + esc(rankLabel(row.rank)) : ''}</span></span>`;
								return `<li class="roster-player class-${classKey(row.class)}">${privateDetails ? `<details class="roster-profile"><summary>${identity}<span class="roster-main-badge">${row.is_main ? 'Main' : 'Alter'}</span><span class="roster-expand" aria-hidden="true">⌄</span></summary><div class="roster-profile-body"><dl><dt>Jugador</dt><dd>${esc(row.display_name || row.name)}</dd><dt>Disponibilidad</dt><dd>${esc(row.availability || 'Por confirmar')}</dd><dt>Registro</dt><dd>${row.source === 'staff' ? 'Manual · sin cuenta web' : 'Cuenta de Discord'}</dd></dl>${sheetLinks ? `<a class="button secondary" href="/armeria?personaje=${encodeURIComponent(row.id)}">Ficha de armería</a>` : ''}${editable ? `<button type="button" class="secondary" data-roster-edit="${esc(row.id)}">Editar personaje</button>` : ''}</div></details>` : `<div class="roster-public-identity">${identity}</div>`}</li>`;
							})
							.join('')}
					</ul>
				</section>`;
			})
			.join('')}
	</div>`;
}

// Public roster: use only fields already exposed by the public API.
export function rosterTable(rows, esc) {
	const roles = ['Tanque', 'Sanador', 'DPS melee', 'DPS distancia'];
	return `<div class="roster-layout"><div class="roster-table-wrap"><table class="guild-roster-table"><caption>Personajes que coinciden con los filtros</caption><thead><tr><th scope="col">Personaje</th><th scope="col">Clase</th><th scope="col">Rol</th></tr></thead><tbody>${rows.map((row) => `<tr class="class-${classKey(row.class)}"><th scope="row"><span class="roster-table-name">${ClassIcon({ className: row.class })}<span>${esc(row.name)}</span></span></th><td>${esc(row.class)}</td><td><span class="pill">${esc(row.role || 'Sin rol')}</span></td></tr>`).join('')}</tbody></table></div><aside class="roster-summary"><section class="card"><span class="eyebrow">Nuestra hermandad</span><h2>${rows.length}</h2><p>Personajes en esta selección</p><p>Darkness of the Fallen<br>Desde 2026</p></section><section class="card"><h3>Composición por rol</h3><dl>${roles.map((role) => `<div><dt>${role}</dt><dd>${rows.filter((r) => r.role === role).length}</dd></div>`).join('')}</dl></section></aside></div>`;
}
