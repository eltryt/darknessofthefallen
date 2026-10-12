// Public GA4 measurement ID. Loaded only after explicit consent.
export const measurementId = 'G-CEGJTCH2DX';
const publicPaths = new Set(['/', '/nosotros', '/roster', '/raids', '/progreso']);
export function analyticsPage(path) {
	return publicPaths.has(path.replace(/\/$/, '') || '/');
}
export function initAnalytics() {
	if (
		!/^G-[A-Z0-9]+$/.test(measurementId) ||
		document.body.dataset.showcase ||
		!analyticsPage(location.pathname)
	)
		return;
	const key = 'dotf-analytics-consent';
	const read = () => {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	};
	const save = (value) => {
		try {
			localStorage.setItem(key, value);
		} catch {
			/* This visit only. */
		}
	};
	let loaded = false;
	function start() {
		if (loaded) return;
		loaded = true;
		window['ga-disable-' + measurementId] = false;
		window.dataLayer = window.dataLayer || [];
		function gtag() {
			window.dataLayer.push(arguments);
		}
		gtag('consent', 'default', {
			analytics_storage: 'granted',
			ad_storage: 'denied',
			ad_user_data: 'denied',
			ad_personalization: 'denied',
		});
		gtag('js', new Date());
		gtag('config', measurementId, {
			send_page_view: false,
			allow_google_signals: false,
			allow_ad_personalization_signals: false,
			page_location: location.origin + location.pathname,
			page_referrer: '',
			page_title: 'Darkness of the Fallen',
		});
		gtag('event', 'page_view', {
			page_location: location.origin + location.pathname,
			page_referrer: '',
			page_title: 'Darkness of the Fallen',
		});
		const script = document.createElement('script');
		script.async = true;
		script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
		document.head.append(script);
	}
	const box = document.createElement('section');
	box.className = 'analytics-consent';
	box.setAttribute('aria-label', 'Preferencias de estadísticas');
	box.innerHTML =
		'<p>¿Permites Google Analytics para medir las visitas a las páginas públicas? Es opcional. No medimos el panel, el perfil ni los formularios.</p><div class="actions"><button type="button" data-accept>Aceptar estadísticas</button><button type="button" class="secondary" data-reject>Rechazar</button></div>';
	const choose = (accepted) => {
		save(accepted ? 'accepted' : 'rejected');
		box.hidden = true;
		if (accepted) start();
		else {
			window['ga-disable-' + measurementId] = true;
			for (const entry of document.cookie.split(';')) {
				const name = entry.trim().split('=')[0];
				if (!/^_ga(?:_|$)/.test(name)) continue;
				document.cookie = `${name}=; Max-Age=0; Path=/`;
				const parts = location.hostname.split('.');
				for (let i = 0; i < parts.length - 1; i++)
					document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${parts.slice(i).join('.')}`;
			}
			if (loaded) location.reload();
		}
	};
	box.querySelector('[data-accept]').onclick = () => choose(true);
	box.querySelector('[data-reject]').onclick = () => choose(false);
	document.body.append(box);
	const preferences = document.createElement('button');
	preferences.type = 'button';
	preferences.className = 'secondary';
	preferences.textContent = 'Preferencias de estadísticas';
	preferences.onclick = () => {
		box.hidden = false;
		box.querySelector('button').focus();
	};
	document.querySelector('footer')?.append(preferences);
	box.hidden = read() !== null;
	if (read() === 'accepted') start();
}
