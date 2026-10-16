// Visual entrances. Images and CSS illustrations fade in once they have
// loaded instead of popping in; the home page opens with a cinematic intro,
// a living hero and cards dealt in 3D; other pages rise softly. Everything
// respects reduced motion.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const checked = new WeakSet();
// Elements that carry an illustration in ::before (cards, headers, banners).
const ART =
	'.hero, .hub-hero, .page-title, .adventure-card, .raid-art, .link-card, .card, section, article, aside';
const urlsOf = (value) => [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
const INTRO_MS = 2600,
	INTRO_REVEAL = '1.75s';

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
function scan(node) {
	if (!(node instanceof Element)) return;
	if (node.matches('img')) fadeImage(node);
	node.querySelectorAll('img').forEach(fadeImage);
	if (node.matches(ART)) fadeArt(node);
	node.querySelectorAll(ART).forEach(fadeArt);
}

// Opening curtain: the emblem lights up, the name unfolds and the screen
// splits open over the castle. Once per session; a click or key skips it.
function playIntro() {
	try {
		sessionStorage.setItem('dotf-intro', '1');
	} catch {
		/* storage unavailable: it simply plays again next time */
	}
	root.style.setProperty('--intro', INTRO_REVEAL);
	const intro = document.createElement('div');
	intro.className = 'intro';
	intro.setAttribute('aria-hidden', 'true');
	intro.innerHTML = /* HTML */ `<div class="intro-panel intro-top"></div>
		<div class="intro-panel intro-bottom"></div>
		<div class="intro-core">
			<span class="intro-glow"></span>
			<img src="/assets/guild-logo-320.webp" alt="" width="320" height="320" />
			<span class="intro-line"></span>
			<p class="intro-name">Darkness of the Fallen</p>
			<p class="intro-tag">WoW Forever · Alianza</p>
		</div>`;
	document.body.append(intro);
	root.classList.remove('intro-pending');
	root.classList.add('intro-playing');
	let done = false;
	const finish = () => {
		if (done) return;
		done = true;
		root.classList.remove('intro-playing');
		intro.remove();
		removeEventListener('keydown', skip, true);
	};
	const skip = () => {
		if (intro.classList.contains('is-skipping')) return;
		intro.classList.add('is-skipping');
		root.style.setProperty('--intro', '0.2s');
		setTimeout(finish, 450);
	};
	intro.addEventListener('click', skip);
	addEventListener('keydown', skip, true);
	setTimeout(finish, INTRO_MS);
}

// Title letters arrive one by one; words never break across lines.
function splitTitle(h1) {
	if (!h1 || h1.dataset.split) return;
	h1.dataset.split = '1';
	const label = h1.cloneNode(true);
	label.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
	h1.setAttribute('aria-label', label.textContent.replace(/\s+/g, ' ').trim());
	let index = 0;
	const walk = (node) => {
		for (const child of [...node.childNodes]) {
			if (child.nodeType === Node.TEXT_NODE) {
				const frag = document.createDocumentFragment();
				for (const part of child.textContent.split(/(\s+)/)) {
					if (!part) continue;
					if (/^\s+$/.test(part)) {
						frag.append(document.createTextNode(' '));
						continue;
					}
					const word = document.createElement('span');
					word.className = 'title-word';
					word.setAttribute('aria-hidden', 'true');
					for (const ch of part) {
						const span = document.createElement('span');
						span.className = 'title-char';
						span.textContent = ch;
						span.style.setProperty('--i', index++);
						word.append(span);
					}
					frag.append(word);
				}
				child.replaceWith(frag);
			} else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') walk(child);
		}
	};
	walk(h1);
}

// Embers drifting up over the castle.
function embers(hero) {
	if (!hero || hero.querySelector('.hero-embers')) return;
	const layer = document.createElement('div');
	layer.className = 'hero-embers';
	layer.setAttribute('aria-hidden', 'true');
	const count = innerWidth < 640 ? 12 : 26;
	for (let i = 0; i < count; i++) {
		const e = document.createElement('span');
		e.style.setProperty('--x', `${Math.random() * 100}%`);
		e.style.setProperty('--s', `${2 + Math.random() * 3.5}px`);
		e.style.setProperty('--d', `${6 + Math.random() * 7}s`);
		e.style.setProperty('--delay', `${-Math.random() * 12}s`);
		e.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
		layer.append(e);
	}
	hero.prepend(layer);
}

// Home: sections below the cards appear while scrolling.
let revealer = null;
function revealHome() {
	revealer?.disconnect();
	if (!('IntersectionObserver' in window)) return;
	revealer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries)
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					revealer.unobserve(entry.target);
				}
		},
		{ rootMargin: '0px 0px -10% 0px' },
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
		root.classList.add('page-leaving');
		setTimeout(() => location.assign(link.href), 180);
	});
	// Coming back from the browser cache must not leave the page faded out.
	addEventListener('pageshow', () => root.classList.remove('page-leaving'));
}

export function initMotion() {
	if (root.classList.contains('intro-pending')) playIntro();
	scan(document.body);
	new MutationObserver((records) => {
		for (const r of records) r.addedNodes.forEach(scan);
	}).observe(document.body, { childList: true, subtree: true });
	leaveSoftly();
}
// Called once the page content has been rendered.
export function pageReady() {
	const content = document.querySelector('#content');
	if (reduced() || !content) return;
	if (document.body.dataset.page === '/') {
		const hero = content.querySelector('.hero');
		splitTitle(hero?.querySelector('h1'));
		embers(hero);
		revealHome();
	}
	content.classList.remove('page-enter');
	void content.offsetWidth;
	content.classList.add('page-enter');
}
