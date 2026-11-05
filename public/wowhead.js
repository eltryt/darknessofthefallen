// Wowhead tooltips for WoW Forever items. Wishlist and loot rows store only the item
// name, so names are matched against the catalogue's Spanish names (catalog/names.json,
// built by scripts/sync-items.mjs); Forever keeps the Classic item ids. A name that is
// not in the catalogue stays plain text.
export const itemKey = (name) =>
	String(name || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();

let names;
export function loadItemNames() {
	names ??= fetch('/catalog/names.json')
		.then((r) => (r.ok ? r.json() : {}))
		.then((index) => new Map(Object.entries(index)))
		.catch(() => {
			names = undefined;
			return new Map();
		});
	return names;
}

export const wowheadItemUrl = (id) => `https://www.wowhead.com/forever/es/item=${Number(id)}`;

// The item name as a Wowhead link when the catalogue knows it, escaped text otherwise.
export function itemLink(name, ids, esc) {
	const id = ids?.get(itemKey(name));
	return id
		? `<a class="wowhead-link" href="${wowheadItemUrl(id)}" target="_blank" rel="noopener">${esc(name)}</a>`
		: esc(name);
}

// Loads Wowhead's tooltip script once. It listens on the whole page, so links rendered
// later (another page of the list, another tab) get their tooltip too. Links keep the
// site's own colours.
let script;
export function loadTooltips() {
	if (script) return;
	window.whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false };
	script = document.createElement('script');
	script.src = 'https://wow.zamimg.com/js/tooltips.js';
	script.async = true;
	document.head.append(script);
}
