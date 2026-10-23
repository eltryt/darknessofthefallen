// Item catalogue for the armory: public/catalog/<group>.json, built weekly from the
// Blizzard Game Data API (scripts/sync-items.mjs). Classic data, orientative for Forever.
import { catalogIconUrl, itemQualities, equipmentStats } from './armory-catalog.js';

const cache = new Map();
export function loadCatalog(group) {
	if (!cache.has(group))
		cache.set(
			group,
			fetch(`/catalog/${group}.json`).then((r) => {
				if (!r.ok) throw new Error('Catálogo no disponible.');
				return r.json();
			}),
		);
	const pending = cache.get(group);
	pending.catch(() => cache.delete(group));
	return pending;
}

const fold = (value) => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Items whose name contains every word typed, ignoring accents; highest level first.
export function searchItems(items, query, limit = 40) {
	const words = fold(query).split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	return items.filter((item) => words.every((w) => fold(item.name).includes(w))).slice(0, limit);
}

export const statLabels = {
	strength: 'Fuerza',
	agility: 'Agilidad',
	stamina: 'Aguante',
	intellect: 'Intelecto',
	spirit: 'Espíritu',
	armor: 'Armadura',
	fire_resistance: 'Resistencia al Fuego',
	nature_resistance: 'Resistencia a la Naturaleza',
	frost_resistance: 'Resistencia a la Escarcha',
	shadow_resistance: 'Resistencia a las Sombras',
	arcane_resistance: 'Resistencia a lo Arcano',
};

// What a picked item stores: only known qualities and the stats the armory adds up.
export function equipmentFromItem(item) {
	const stats = {};
	for (const key of equipmentStats) {
		const value = key === 'armor' ? item.armor : item.stats?.[key];
		if (Number.isInteger(value)) stats[key] = value;
	}
	return {
		item_id: String(item.id),
		item_name: item.name,
		quality: Object.hasOwn(itemQualities, item.quality) ? item.quality : '',
		item_level: item.level || '',
		icon: item.icon || '',
		stats,
	};
}

export function itemCard(item, esc) {
	const icon = catalogIconUrl(item.icon);
	const lines = [
		item.armor ? `${item.armor} ${statLabels.armor.toLowerCase()}` : '',
		item.weapon
			? `${item.weapon.min}–${item.weapon.max} daño${item.weapon.speed ? ` · velocidad ${String(item.weapon.speed).replace('.', ',')}` : ''}${item.weapon.dps ? ` · ${String(item.weapon.dps).replace('.', ',')} DPS` : ''}`
			: '',
		...Object.entries(item.stats || {}).map(
			([key, value]) =>
				`${value > 0 ? '+' : ''}${value} ${statLabels[key] || key.replace(/_/g, ' ')}`,
		),
	].filter(Boolean);
	return `<div class="catalog-card quality-${esc(item.quality)}">${icon ? `<img src="${esc(icon)}" alt="" width="44" height="44" loading="lazy">` : ''}<div><strong>${esc(item.name)}</strong><small>${esc(item.type)}${item.level ? ` · Nivel de objeto ${esc(item.level)}` : ''}${item.required ? ` · Requiere nivel ${esc(item.required)}` : ''}${item.bop ? ' · Se liga al recogerlo' : ''}</small>${lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}${(item.effects || []).map((e) => `<p class="catalog-effect">${esc(e)}</p>`).join('')}</div></div>`;
}

// Search box wired to a slot form: picking a result fills the form's fields.
export function attachCatalogPicker(host, form, group, esc) {
	const input = host.querySelector('[data-catalog-search]'),
		results = host.querySelector('[data-catalog-results]'),
		choice = host.querySelector('[data-catalog-choice]');
	let items = [];
	const setHidden = (data) => {
		form.elements.item_id.value = data?.item_id || '';
		form.elements.icon.value = data?.icon || '';
		form.elements.stats.value = data ? JSON.stringify(data.stats) : '{}';
	};
	const render = () => {
		const found = searchItems(items, input.value);
		results.innerHTML = found.length
			? found
					.map(
						(item, i) =>
							`<li><button type="button" class="catalog-result quality-${esc(item.quality)}" data-pick="${i}">${catalogIconUrl(item.icon) ? `<img src="${esc(catalogIconUrl(item.icon))}" alt="" width="32" height="32" loading="lazy">` : ''}<span><strong>${esc(item.name)}</strong><small>${item.level ? 'Nivel ' + esc(item.level) + ' · ' : ''}${esc(item.type)}</small></span></button></li>`,
					)
					.join('')
			: input.value.trim()
				? '<li class="muted">Sin resultados en este hueco.</li>'
				: '';
		results.querySelectorAll('[data-pick]').forEach((b) =>
			b.addEventListener('click', () => {
				const item = found[Number(b.dataset.pick)],
					data = equipmentFromItem(item);
				form.elements.item_name.value = data.item_name;
				form.elements.quality.value = data.quality;
				form.elements.item_level.value = data.item_level;
				setHidden(data);
				choice.innerHTML = itemCard(item, esc);
				results.innerHTML = '';
				input.value = '';
			}),
		);
	};
	let timer;
	input.addEventListener('input', () => {
		clearTimeout(timer);
		timer = setTimeout(render, 120);
	});
	// Typing a different name by hand detaches the catalogue item.
	form.elements.item_name.addEventListener('input', () => {
		setHidden(null);
		choice.innerHTML = '';
	});
	return loadCatalog(group).then(
		(list) => {
			items = list;
			host.hidden = false;
		},
		() => {
			host.hidden = true;
		},
	);
}
