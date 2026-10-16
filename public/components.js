import { getSpecsForClass, normalizeSpecValue } from './specs.js';
const classes = {
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
const escape = (value) =>
	String(value ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
function icon(file, label, size) {
	const safeSize = ['small', 'medium', 'large'].includes(size) ? size : 'medium';
	return `<img src="/assets/icons/${file}.webp" alt="${escape(label)}" title="${escape(label)}" class="icon-${safeSize}" width="24" height="24" loading="lazy" decoding="async" />`;
}
export function ClassIcon({ className, size = 'medium' }) {
	const key = Object.hasOwn(classes, className) ? classes[className] : null;
	return key
		? icon(key, className, size)
		: '<span class="spec-icon-placeholder" title="Classe sin identificar">?</span>';
}
export function SpecIcon({ className, specId, size = 'small' }) {
	const key = Object.hasOwn(classes, className) ? classes[className] : '';
	const specs = getSpecsForClass(key),
		id = normalizeSpecValue(specId);
	return Object.hasOwn(specs, id) ? icon(`spec/spec_${id}`, specs[id].name, size) : '';
}
export function ClassWithSpecIcon({ className, specId }) {
	return `<span class="class-with-spec">${ClassIcon({ className })}${SpecIcon({ className, specId })}</span>`;
}
