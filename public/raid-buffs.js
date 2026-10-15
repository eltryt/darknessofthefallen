// Raid and party buffs by class for the lineup board. WoW Forever is in beta: this list
// follows Classic Era plus changes reported by community guides (several former
// talents such as Blessing of Kings and Divine Spirit described as baseline). It is
// provisional until Blizzard confirms the final class design; edit it here.
export const buffSource =
	'Provisional: Classic Era y cambios de WoW Forever publicados por guías de la comunidad durante la beta. Pendiente de confirmar con Blizzard.';

// scope 'raid': one caster covers the whole raid. scope 'group': only the caster's party of 5.
// spec: optional Raid-Helper specialization names that are required.
export const raidBuffs = [
	{ id: 'intellect', name: 'Intelecto Arcano', classKey: 'mage', scope: 'raid' },
	{ id: 'fortitude', name: 'Palabra de poder: entereza', classKey: 'priest', scope: 'raid' },
	{ id: 'spirit', name: 'Espíritu divino', classKey: 'priest', scope: 'raid' },
	{ id: 'wild', name: 'Marca de lo Salvaje', classKey: 'druid', scope: 'raid' },
	{ id: 'blessings', name: 'Bendiciones', classKey: 'paladin', scope: 'raid', perCaster: true },
	{ id: 'shout', name: 'Grito de batalla', classKey: 'warrior', scope: 'group' },
	{ id: 'totems', name: 'Tótems', classKey: 'shaman', scope: 'group' },
	{ id: 'aura', name: 'Aura de paladín', classKey: 'paladin', scope: 'group' },
	{ id: 'pact', name: 'Pacto de sangre', classKey: 'warlock', scope: 'group' },
	{
		id: 'trueshot',
		name: 'Aura de disparo certero',
		classKey: 'hunter',
		scope: 'group',
		spec: ['marksmanship'],
	},
];
// Blessings a paladin can maintain; each paladin covers one blessing per class.
export const blessingCount = 4;

export function buffCoverage(players, classOf, specOf) {
	const has = (buff, list) =>
		list.filter(
			(p) => classOf(p) === buff.classKey && (!buff.spec || buff.spec.includes(specOf(p))),
		);
	return {
		raid: raidBuffs
			.filter((b) => b.scope === 'raid')
			.map((b) => {
				const casters = has(b, players);
				return {
					...b,
					casters: casters.length,
					covered: casters.length > 0,
					detail: b.perCaster
						? `${Math.min(casters.length, blessingCount)} de ${blessingCount} bendiciones posibles`
						: '',
				};
			}),
		group: (members) =>
			raidBuffs
				.filter((b) => b.scope === 'group')
				.map((b) => ({ ...b, covered: has(b, members).length > 0 })),
	};
}
