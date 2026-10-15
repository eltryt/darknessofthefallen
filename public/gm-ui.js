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
export async function gmInbox(host, ctx) {
	const { api, esc, empty, toast } = ctx;
	const [messages, notifications] = await Promise.all([
		api('/api/gm-messages'),
		api('/api/gm-notifications'),
	]);
	host.innerHTML = /* HTML */ `<h2>Mensajes e incidencias</h2>
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
