// Visual entrances. Images and CSS illustrations fade in once they have
// loaded instead of popping in; page content enters softly and the home page
// reveals its sections while scrolling. Everything respects reduced motion.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const checked = new WeakSet();
// Elements that carry an illustration in ::before (cards, headers, banners).
const ART =
	'.hero, .hub-hero, .page-title, .adventure-card, .raid-art, .link-card, .card, section, article, aside';
const urlsOf = (value) => [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);

function fadeImage(img) {
	if (checked.has(img)) return;
	checked.add(img);
	// Already decoded (usually from the cache): show it as is.
	if (img.complete && img.naturalWidth) return;
	img.classList.add('fade-in');
}
function fadeArt(el) {
	if (checked.has(el)) return;
	checked.add(el);
	const urls = urlsOf(getComputedStyle(el, '::before').backgroundImage);
	if (!urls.length) return;
	const pending = urls.map((src) => {
		const image = new Image();
		image.src = src;
		return image.complete
			? null
			: new Promise((done) => {
					image.onload = image.onerror = done;
				});
	});
	if (pending.every((p) => p === null)) return;
	el.classList.add('art-fade', 'art-pending');
	const show = () => el.classList.remove('art-pending');
	Promise.all(pending).then(show);
	// A slow network never keeps an illustration hidden.
	setTimeout(show, 2500);
}
function scan(root) {
	if (!(root instanceof Element)) return;
	if (root.matches('img')) fadeImage(root);
	root.querySelectorAll('img').forEach(fadeImage);
	if (root.matches(ART)) fadeArt(root);
	root.querySelectorAll(ART).forEach(fadeArt);
}

// Home: sections below the hero appear as they scroll into view.
let revealer = null;
function revealHome() {
	revealer?.disconnect();
	if (reduced() || document.body.dataset.page !== '/' || !('IntersectionObserver' in window))
		return;
	revealer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries)
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					revealer.unobserve(entry.target);
				}
		},
		{ rootMargin: '0px 0px -8% 0px' },
	);
	document.querySelectorAll('#content > :not(.hero):not(.adventure-grid)').forEach((el) => {
		el.classList.add('reveal');
		revealer.observe(el);
	});
}

// Browsers without cross-document view transitions get a short fade-out.
function leaveSoftly() {
	if (reduced() || 'onpagereveal' in window) return;
	document.addEventListener('click', (e) => {
		const link = e.target.closest('a[href]');
		if (
			!link ||
			e.defaultPrevented ||
			e.button !== 0 ||
			e.metaKey ||
			e.ctrlKey ||
			e.shiftKey ||
			e.altKey ||
			link.target ||
			link.hasAttribute('download') ||
			link.origin !== location.origin ||
			(link.pathname === location.pathname && link.hash)
		)
			return;
		e.preventDefault();
		document.documentElement.classList.add('page-leaving');
		setTimeout(() => location.assign(link.href), 180);
	});
	// Coming back from the browser cache must not leave the page faded out.
	addEventListener('pageshow', () => document.documentElement.classList.remove('page-leaving'));
}

export function initMotion() {
	scan(document.body);
	new MutationObserver((records) => {
		for (const r of records) r.addedNodes.forEach(scan);
	}).observe(document.body, { childList: true, subtree: true });
	leaveSoftly();
}
// Called once the page content has been rendered.
export function pageReady() {
	const content = document.querySelector('#content');
	if (!reduced() && content) {
		content.classList.remove('page-enter');
		void content.offsetWidth;
		content.classList.add('page-enter');
	}
	revealHome();
}
