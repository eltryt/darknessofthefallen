export function contactForm(host, ctx, kind = 'contact', { subject = '', heading = '' } = {}) {
	const { field, area, formHandler, api, toast } = ctx;
	host.innerHTML = /* HTML */ `<h2>
			${heading || (kind === 'incident' ? 'Registrar incidencia' : 'Contactar con el equipo')}
		</h2>
		<p>
			El mensaje quedará en el panel privado del GM y oficiales. No incluyas contraseñas ni
			secretos.
		</p>
		<form id="gm-contact" class="card form">
			${field('Asunto', 'subject', 'text', subject)}${area('Mensaje', 'message')}<button
				type="submit"
			>
				Enviar mensaje
			</button>
		</form>
		<p data-contact-result role="status"></p>`;
	const requestId = crypto.randomUUID();
	formHandler('#gm-contact', async (value) => {
		await api('/api/gm-messages', 'POST', { ...value, kind, requestId });
		host.querySelector('form').hidden = true;
		host.querySelector('[data-contact-result]').textContent =
			'Mensaje guardado. El equipo podrá consultarlo en el panel.';
		toast('Mensaje guardado');
	});
}
// App notifications on this device for applications, messages and incidents.
async function pushControl(box, { api, toast }) {
	const supported =
		'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
	const config = await api('/api/push/key').catch(() => ({ enabled: false }));
	const note = (text) => (box.querySelector('[data-push-note]').textContent = text);
	const button = box.querySelector('[data-push-toggle]');
	if (!config.enabled) return note('Los avisos en la app todavía no están configurados.');
	if (!supported)
		return note(
			/iphone|ipad|ipod/i.test(navigator.userAgent)
				? 'En iPhone, instala la web en la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí para activar los avisos.'
				: 'Este navegador no admite avisos.',
		);
	const registration = await navigator.serviceWorker.ready;
	let subscription = await registration.pushManager.getSubscription();
	const render = () => {
		button.hidden = false;
		button.textContent = subscription
			? 'Desactivar avisos en este dispositivo'
			: 'Activar avisos en este dispositivo';
		note(
			subscription
				? 'Este dispositivo recibe avisos de candidaturas, mensajes e incidencias.'
				: 'Recibe una notificación en el móvil o el PC cuando llegue una candidatura, un mensaje o una incidencia.',
		);
	};
	button.onclick = async () => {
		button.disabled = true;
		try {
			if (subscription) {
				await api('/api/push/unsubscribe', 'POST', { endpoint: subscription.endpoint });
				await subscription.unsubscribe();
				subscription = null;
				toast('Avisos desactivados en este dispositivo.');
			} else {
				if ((await Notification.requestPermission()) !== 'granted')
					return toast('Permite las notificaciones en el navegador para activar los avisos.');
				const key = config.publicKey.replaceAll('-', '+').replaceAll('_', '/');
				subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: Uint8Array.from(
						atob(key + '='.repeat((4 - (key.length % 4)) % 4)),
						(c) => c.charCodeAt(0),
					),
				});
				await api('/api/push/subscribe', 'POST', subscription.toJSON());
				toast('Avisos activados. En unos segundos te llegará una notificación de prueba.');
			}
		} catch (e) {
			toast(e.message || 'No se pudieron cambiar los avisos.');
		} finally {
			button.disabled = false;
			render();
		}
	};
	render();
}
export async function gmInbox(host, ctx) {
	const { api, esc, empty, toast } = ctx;
	const [messages, notifications] = await Promise.all([
		api('/api/gm-messages'),
		api('/api/gm-notifications'),
	]);
	host.innerHTML = /* HTML */ `<section class="card push-control" data-push>
			<h3>Avisos en la app</h3>
			<p data-push-note>Comprobando avisos…</p>
			<button type="button" data-push-toggle hidden></button>
		</section>
		<h2>Mensajes e incidencias</h2>
		<p>
			${notifications.configured ? 'Avisos al canal privado de Discord activados.' : 'Los mensajes se guardan aquí. El webhook aún no está activado.'}
		</p>
		<div data-report></div>
		${
			messages
				.map(
					(m) =>
						/* HTML */ `<article class="card section" id="message-${esc(m.id)}">
							<span class="pill">${m.kind === 'incident' ? 'Incidencia' : 'Contacto'}</span>
							<h3>${esc(m.subject)}</h3>
							<p>${esc(m.message)}</p>
							<small>${esc(m.created_at)}</small>
						</article>`,
				)
				.join('') || empty('Sin mensajes', 'Aquí aparecerán los contactos y las incidencias.')
		}
		<h3>Estado de los avisos</h3>
		${notifications.rows
			.map(
				(n) =>
					/* HTML */ `<article class="card">
						<p>
							${esc({ recruitment: 'Candidatura', contact: 'Contacto', incident: 'Incidencia' }[n.kind])}
							·
							${esc({ pending: 'Pendiente', sending: 'Enviando', delivered: 'Entregado', failed: 'Error', uncertain: 'Revisar entrega' }[n.status])}
							· ${n.attempts} intentos
						</p>
						${n.last_error ? `<p>${esc(n.last_error)}</p>` : ''}${['failed', 'uncertain'].includes(n.status) ? `<button data-retry="${esc(n.id)}">Reintentar tras revisar Discord</button>` : ''}
					</article>`,
			)
			.join('')}`;
	contactForm(host.querySelector('[data-report]'), ctx, 'incident');
	pushControl(host.querySelector('[data-push]'), ctx).catch(() => {});
	host.querySelectorAll('[data-retry]').forEach(
		(b) =>
			(b.onclick = async () => {
				if (
					!confirm(
						'Comprueba que este aviso NO está en el canal. Reintentarlo podría duplicarlo si Discord ya lo recibió. ¿Lo has comprobado?',
					)
				)
					return;
				try {
					await api('/api/gm-notifications/retry', 'POST', { id: b.dataset.retry, reviewed: true });
					await gmInbox(host, ctx);
				} catch (e) {
					toast(e.message);
				}
			}),
	);
	const record = new URLSearchParams(location.search).get('record');
	const selected = messages.find((m) => m.id === record);
	if (selected)
		document.getElementById('message-' + selected.id)?.scrollIntoView({ block: 'center' });
}
