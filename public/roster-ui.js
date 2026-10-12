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
	{ privateDetails = false, rankLabel = (value) => value } = {},
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
							.map(
								(row) =>
									/* HTML */ `<li class="roster-player class-${classKey(row.class)}">
										<span class="class-emblem" aria-hidden="true">
											${ClassIcon({ className: row.class, size: 'small' })}
										</span>
										<div class="roster-player-info">
											<strong class="class-name"
												>${esc(row.name)}${privateDetails && row.surname ? ' ' + esc(row.surname) : ''}</strong
											>
											<span>${esc(row.class)}</span>
											${privateDetails ? /* HTML */ `<small>${esc(row.display_name)} · ${esc(rankLabel(row.rank))}</small><small class="roster-availability">${esc(row.availability || 'Disponibilidad sin indicar')}</small>` : ''}
										</div>
										${privateDetails ? `<span class="roster-main-badge">${row.is_main ? 'Main' : 'Alter'}</span>` : ''}
									</li>`,
							)
							.join('')}
					</ul>
				</section>`;
			})
			.join('')}
	</div>`;
}
