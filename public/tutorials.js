// Video tutorials shown in a pop-up. Recorded on a local demo with example data;
// the Discord windows inside them are labelled illustrations, not screenshots.
const tutorials = [
	{
		id: 'entrar',
		groups: ['miembros', 'nuevos'],
		title: 'Entra con Discord y crea tu personaje',
		seconds: 49,
	},
	{ id: 'armeria', groups: ['miembros'], title: 'Tu equipo y tu objetivo BiS', seconds: 35 },
	{
		id: 'wishlist',
		groups: ['miembros'],
		title: 'Wishlist: qué quieres de cada jefe',
		seconds: 47,
	},
	{ id: 'convocatorias', groups: ['miembros'], title: 'Apúntate a una raid', seconds: 34 },
	{ id: 'logros', groups: ['miembros'], title: 'Logros y Camino al 60', seconds: 31 },
	{ id: 'candidatura', groups: ['nuevos'], title: 'Únete a la hermandad', seconds: 47 },
	{ id: 'crear-convocatoria', groups: ['oficiales'], title: 'Crear una convocatoria', seconds: 44 },
	{ id: 'alineacion', groups: ['oficiales'], title: 'Alineación y aviso por Discord', seconds: 33 },
	{ id: 'botin', groups: ['oficiales'], title: 'Registrar botín y asistencia', seconds: 54 },
];
const groups = { miembros: 'Miembros', nuevos: 'Nuevos', oficiales: 'Oficiales' };
const base = '/assets/tutorials/';
const length = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const play =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l5.5-3.5Z" /></svg>';

// A button for a group ("miembros") or a single video ("convocatorias").
export function tutorialButton(target, label, className = 'button secondary') {
	return `<button type="button" class="${className} tutorial-open" data-tutorials="${target}">${play}<span>${label}</span></button>`;
}

function open(target) {
	const byId = tutorials.find((t) => t.id === target),
		group = byId ? byId.groups[0] : target,
		list = tutorials.filter((t) => t.groups.includes(group)),
		first = byId || list[0];
	if (!first) return;
	document.querySelector('.tutorial-dialog')?.remove();
	const dialog = document.createElement('dialog');
	dialog.className = 'tutorial-dialog';
	dialog.setAttribute('aria-labelledby', 'tutorial-title');
	dialog.innerHTML = /* HTML */ `<form method="dialog" class="slot-dialog-close">
			<button type="submit" class="icon-button" aria-label="Cerrar tutorial">×</button>
		</form>
		<span class="eyebrow">Tutoriales · ${groups[group]}</span>
		<h2 id="tutorial-title"></h2>
		<div class="tutorial-layout">
			<video class="tutorial-video" controls playsinline muted preload="metadata"></video>
			${
				list.length > 1
					? `<ol class="tutorial-list">${list
							.map(
								(t) =>
									`<li><button type="button" data-tutorial-pick="${t.id}"><img src="${base}${t.id}.webp" alt="" width="128" height="72" loading="lazy" decoding="async"><span>${t.title}<small>${length(t.seconds)}</small></span></button></li>`,
							)
							.join('')}</ol>`
					: ''
			}
		</div>
		<p class="tutorial-note">
			Vídeos sin sonido, con subtítulos. Se grabaron en una demo con datos de ejemplo; las ventanas
			de Discord son ilustraciones.
		</p>`;
	document.body.append(dialog);
	const video = dialog.querySelector('video');
	const show = (t, autoplay) => {
		dialog.querySelector('#tutorial-title').textContent = t.title;
		video.poster = base + t.id + '.webp';
		video.src = base + t.id + '.mp4';
		video.setAttribute('aria-label', 'Vídeo: ' + t.title);
		dialog
			.querySelectorAll('[data-tutorial-pick]')
			.forEach((b) => b.setAttribute('aria-current', String(b.dataset.tutorialPick === t.id)));
		if (autoplay) video.play().catch(() => {});
	};
	dialog.addEventListener('click', (e) => {
		const pick = e.target.closest('[data-tutorial-pick]');
		if (pick)
			show(
				tutorials.find((t) => t.id === pick.dataset.tutorialPick),
				true,
			);
		// A click on the backdrop closes the pop-up.
		else if (e.target === dialog) dialog.close();
	});
	dialog.addEventListener('close', () => {
		video.pause();
		video.removeAttribute('src');
		video.load();
		dialog.remove();
	});
	show(first, false);
	dialog.showModal();
	video.play().catch(() => {});
}

let bound = false;
export function bindTutorials() {
	if (bound) return;
	bound = true;
	document.addEventListener('click', (e) => {
		const b = e.target.closest('[data-tutorials]');
		if (b) open(b.dataset.tutorials);
	});
}
