// Populate only after verifying encounter and loot information for WoW Forever.
// Each raid: {id, name, status, sourceUrl, bosses:[{id,name,sourceUrl,items:[]}]}
// Stable IDs are independent of translated names. Never import Retail loot as Forever loot.
export const encounterCatalog = {
	version: 1,
	game: 'WoW Forever',
	reviewedAt: '2026-10-11',
	status: 'pending-verification',
	sources: [
		{
			label: 'Presentación oficial de WoW Forever',
			url: 'https://worldofwarcraft.blizzard.com/en-us/forever',
		},
	],
	raids: [],
};
