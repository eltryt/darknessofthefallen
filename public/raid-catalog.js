// The raid catalogue shared by the wishlist and the loot distribution: every raid, its
// bosses and their loot (public/catalog/raids.json, built by scripts/build-raid-loot.mjs).
let request;
export function loadRaidCatalog() {
	request ??= fetch('/catalog/raids.json')
		.then((r) => {
			if (!r.ok) throw new Error('No se pudo cargar el botín de las raids.');
			return r.json();
		})
		.catch((error) => {
			request = undefined;
			throw error;
		});
	return request;
}
export const itemIconUrl = (icon) =>
	`https://wow.zamimg.com/images/wow/icons/large/${encodeURIComponent(icon || 'inv_misc_questionmark')}.jpg`;
// A boss's round portrait, or the first letter of its name when there is no art.
export const bossPortrait = (boss, esc) =>
	boss.portrait
		? `<img src="/assets/bosses/${boss.npc}.webp" alt="" width="96" height="96" loading="lazy" decoding="async">`
		: `<span class="boss-initial" aria-hidden="true">${esc(boss.name.replace(/^(Sum[ao] Sacerdot\w+|Los|El|La)\s+/i, '').slice(0, 1))}</span>`;
