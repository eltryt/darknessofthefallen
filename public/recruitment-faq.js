import { recruitmentSpecs } from './guild-showcase.js';

// The recruitment questions people ask (and search for), answered from the guild settings so
// they never go out of date. The server writes them into the page for search engines and
// the recruitment page shows the same text.
const order = { alta: 0, media: 1, baja: 2, abierta: 3 };
const list = (items) =>
	items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

// What the guild is looking for now, as a sentence: "Paladín Sagrado, Mago Fuego y Escarcha…".
export function wantedSentence(s) {
	if (!s.recruitmentOpen)
		return 'Ahora mismo el reclutamiento está cerrado, pero puedes escribirnos por Discord.';
	const open = recruitmentSpecs(s).filter((x) => x.priority !== 'cerrada');
	if (!open.length || open.every((x) => x.priority === 'abierta'))
		return 'Buscamos jugadores de todas las clases y roles.';
	const byClass = new Map();
	for (const x of [...open].sort((a, b) => order[a.priority] - order[b.priority]))
		byClass.set(x.className, [...(byClass.get(x.className) || []), x.name]);
	return `Buscamos ${list([...byClass].map(([name, specs]) => `${name} ${list(specs)}`))}.`;
}

export function recruitmentFaq(s) {
	const days = list(s.raidDays || []);
	return [
		[
			'¿En qué servidor y facción jugáis?',
			`Somos una hermandad (guild) española de la ${s.faction || 'Alianza'} en WoW Forever, en ${s.region || 'Europa'}, con reglas ${s.ruleset || 'PvP'}. Nuestro objetivo principal es el PvE y la progresión de raid.`,
		],
		[
			'¿Qué días y a qué hora son las raids?',
			days
				? `${days}, de ${s.raidStart} a ${s.raidEnd} (hora peninsular española).`
				: `De ${s.raidStart} a ${s.raidEnd} (hora peninsular española).`,
		],
		['¿Qué clases buscáis ahora?', wantedSentence(s)],
		[
			'¿Qué pedís para entrar en el roster de raid?',
			'Disponibilidad los días de raid, conectarte a las 22:45 y avisar antes de las 20:00 si vas a faltar, conocer tu personaje y traer el equipo encantado y tus consumibles. Son obligatorios BigWigs o DBM y RCLootCouncil (versión Classic). No somos una hermandad hardcore, y también hay sitio para jugadores sociales.',
		],
		[
			'¿Cómo se reparte el botín?',
			'En las raids de 20 y 40, con Loot Council: un consejo de tres oficiales de loot vota según tu wishlist, tu rol y tu asistencia (hace falta un 75 % al mes). En las de 10, con Soft Reserve: cada uno reserva 2 objetos. Cada reparto se publica con su motivo.',
		],
		[
			'¿Cómo presento mi candidatura?',
			'Con el formulario de esta página: no necesitas una cuenta en la web. El equipo revisa cada candidatura y contacta contigo por Discord.',
		],
		[
			'¿Hace falta hablar español?',
			'Sí. Somos una hermandad española y todo, raids y Discord, es en español.',
		],
	].map(([q, a]) => ({ q, a }));
}

export const faqHtml = (items, esc) =>
	/* HTML */ `<section class="section recruit-faq">
		<h2>Preguntas frecuentes</h2>
		${items.map(({ q, a }) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
	</section>`;
