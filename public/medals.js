// Achievement medals drawn with HTML and CSS only: a ribbon in the category
// colours, a metal disc for the tier, an engraved ring and an embossed icon.
const icons = {
	shield: '<path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6Z"/><path d="m9 12 2 2 4-4"/>',
	flame:
		'<path d="M12 21c-3.9 0-6-2.6-6-5.6 0-3.3 2.6-5 3.2-8.4 1.5 1.2 2.3 2.6 2.4 4.2C13 9.4 13.8 7 13.5 4c3 2.1 4.5 6 4.5 10.4 0 4-2.3 6.6-6 6.6Z"/>',
	hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
	skull:
		'<path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.2 3 5v3h8v-3c1.7-.8 3-2.4 3-5a7 7 0 0 0-7-7Z"/><circle cx="9.5" cy="10.5" r="1.4"/><circle cx="14.5" cy="10.5" r="1.4"/><path d="M10 18v3M14 18v3"/>',
	crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5Z"/><path d="M5 19h14"/>',
	banner: '<path d="M6 3v18M6 4h11l-2.5 4L17 12H6"/>',
	anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M9 10h6"/>',
	scroll:
		'<path d="M7 4h11v13a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3h11"/><path d="M7 4a2 2 0 0 0-2 2v11M10 8h5M10 12h5"/>',
	helm: '<path d="M5 13a7 7 0 0 1 14 0v5h-4l-1-3h-4l-1 3H5Z"/><path d="M12 6v9M8 11h8"/>',
	gem: '<path d="M6 4h12l3 5-9 11L3 9Z"/><path d="M3 9h18M9 4l3 16 3-16"/>',
	family:
		'<circle cx="12" cy="7" r="3"/><circle cx="5.5" cy="9" r="2.2"/><circle cx="18.5" cy="9" r="2.2"/><path d="M7 20v-3a5 5 0 0 1 10 0v3M2 19v-2.5A3.5 3.5 0 0 1 6 13M22 19v-2.5a3.5 3.5 0 0 0-4-3.5"/>',
	phoenix:
		'<path d="M12 21c-2-3-2-6 0-9 2 3 2 6 0 9Z"/><path d="M12 12C9 9 5 9 3 5c4 0 6 1 9 4 3-3 5-4 9-4-2 4-6 4-9 7Z"/>',
	bolt: '<path d="M13 2 5 13h6l-1 9 8-11h-6Z"/>',
	sword: '<path d="M14.5 3H21v6.5L10 20.5 3.5 14Z"/><path d="m6 17-3 3M8 12l4 4"/>',
	moon: '<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/>',
	calendar:
		'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M9 15l2 2 4-4"/>',
	star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
	swords: '<path d="M4 4h4l9 9M20 4h-4l-9 9M14 16l4 4M10 16l-4 4M15.5 14.5l-3 3M8.5 14.5l3 3"/>',
	cracked:
		'<path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6Z"/><path d="m12 3-1 5 3 3-2 4 1 5"/>',
	target:
		'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
	chest: '<path d="M4 10a8 5 0 0 1 16 0v9H4Z"/><path d="M4 12h16M11 11h2v3h-2Z"/>',
	stone: '<path d="M5 18 4 11l4-6 8 1 4 6-2 6Z"/><path d="m8 5 2 6 6 1M10 11l-2 7"/>',
	hundred:
		'<path d="M4 8v8M8 8a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0Z M14 8a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0Z"/><path d="M6 19h12"/>',
	compass: '<circle cx="12" cy="12" r="8"/><path d="m15 9-2 4-4 2 2-4Z"/>',
	infinity:
		'<path d="M8 15c-2 0-4-1.3-4-3s2-3 4-3c3 0 5 6 8 6 2 0 4-1.3 4-3s-2-3-4-3c-3 0-5 6-8 6Z"/>',
	laurel:
		'<path d="M12 20c-4-1-7-5-7-10M12 20c4-1 7-5 7-10"/><path d="M7 15c-1.5 0-2.5-1-3-2M6 11c-1.2-.3-2-1.2-2.2-2.4M17 15c1.5 0 2.5-1 3-2M18 11c1.2-.3 2-1.2 2.2-2.4M12 6l1 2h2l-1.5 1.4.5 2.1-2-1.1-2 1.1.5-2.1L9 8h2Z"/>',
	chevrons: '<path d="m6 18 6-5 6 5M6 13l6-5 6 5M6 8l6-5 6 5"/>',
	secret:
		'<path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.5-1.5 1.2-1.5 2.3"/><circle cx="12" cy="18" r=".9"/>',
};
export const tierNames = { 1: 'Bronce', 2: 'Plata', 3: 'Oro' };
const tierClass = { 0: 'is-locked', 1: 'is-bronze', 2: 'is-silver', 3: 'is-gold' };
const esc = (v) =>
	String(v ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);

// Progress towards the next tier, 0–100, used by the ring on locked medals.
export function progressOf(a) {
	if (a.single) return a.tier ? 100 : 0;
	if (!a.tiers || a.value == null) return 0;
	const target = a.next ?? a.tiers.at(-1),
		previous = a.tiers[a.tiers.indexOf(target) - 1] ?? 0;
	return Math.max(0, Math.min(100, ((a.value - previous) / (target - previous)) * 100));
}
export function medal(a, { size = 'medium' } = {}) {
	const tier = a.tier || 0;
	const label = `${a.name}${tier ? ' · ' + tierNames[tier] : ' · Bloqueado'}`;
	return `<span class="medal medal-${esc(size)} ${tierClass[tier]} cat-${esc(a.category)}${a.secret && !tier ? ' is-secret' : ''}" role="img" aria-label="${esc(label)}" title="${esc(label)}" data-progress="${Math.round(progressOf(a))}"><span class="medal-ribbon" aria-hidden="true"></span><span class="medal-disc" aria-hidden="true"><span class="medal-edge"></span><svg viewBox="0 0 24 24" focusable="false">${icons[a.icon] || icons.secret}</svg></span></span>`;
}
