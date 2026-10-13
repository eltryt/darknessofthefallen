export function mountManualRoster(host, rows, ctx, refresh) {
	const { api, esc, field, select, area, classes, roles, toast } = ctx;
	const section = document.createElement('details');
	section.className = 'card section';
	section.innerHTML = `<summary>Añadir o editar personajes del roster</summary><p>Selecciona un personaje existente para editarlo o añade un jugador que no entre en la web. Cada alta crea un personaje principal independiente, sin cuenta ni permisos. Si después se registra, no se vinculará automáticamente.</p><label>Personaje<select data-manual-pick><option value="">Añadir jugador nuevo</option>${rows
		.map((r) => `<option value="${esc(r.id)}">${esc(r.name)} ${esc(r.surname)}</option>`)
		.join(
			'',
		)}</select></label><form data-manual-form class="form"><div class="form-grid">${field('Nombre del jugador (solo panel)', 'playerName', 'text', '', false)}${field('Nombre del personaje', 'name')}${field('Apellido', 'surname', 'text', '', false)}${select('Clase', 'class', classes)}${select('Rol', 'role', roles)}${field('Especialización', 'spec', 'text', '', false)}${field('Profesiones', 'professions', 'text', '', false)}${area('Disponibilidad', 'availability', false)}${area('Notas del personaje', 'notes', false)}</div><div class="actions"><button type="submit">Guardar personaje</button><button type="button" class="secondary danger" data-manual-archive hidden>Archivar personaje</button></div><p data-manual-status role="status"></p></form>`;
	host.prepend(section);
	const form = section.querySelector('form'),
		pick = section.querySelector('[data-manual-pick]'),
		archive = section.querySelector('[data-manual-archive]'),
		status = section.querySelector('[data-manual-status]');
	pick.onchange = () => {
		form.reset();
		const row = rows.find((r) => r.id === pick.value);
		archive.hidden = !row || row.source !== 'staff';
		form.elements.playerName.disabled = !!row && row.source !== 'staff';
		status.textContent =
			row && row.source !== 'staff'
				? 'La cuenta de Discord, el rango y la condición de Main o Alter se conservan.'
				: '';
		if (row) {
			for (const key of [
				'name',
				'surname',
				'class',
				'role',
				'spec',
				'professions',
				'availability',
				'notes',
			])
				form.elements[key].value = row[key] || '';
			form.elements.playerName.value = row.display_name;
		}
	};
	const busy = (value) => {
		form.querySelectorAll('button').forEach((b) => (b.disabled = value));
		pick.disabled = value;
	};
	form.onsubmit = async (event) => {
		event.preventDefault();
		busy(true);
		try {
			const data = Object.fromEntries(new FormData(form));
			await api(
				rows.find((r) => r.id === pick.value)?.source !== 'staff' && pick.value
					? '/api/roster/characters/' + pick.value
					: '/api/roster/manual' + (pick.value ? '/' + pick.value : ''),
				pick.value ? 'PATCH' : 'POST',
				data,
			);
			toast('Personaje guardado');
			await refresh();
		} catch (e) {
			status.textContent = e.message;
			busy(false);
		}
	};
	archive.onclick = async () => {
		if (
			!pick.value ||
			!confirm(
				'¿Archivar este personaje manual? Desaparecerá del roster y conservará su historial.',
			)
		)
			return;
		busy(true);
		try {
			await api('/api/roster/manual/' + pick.value, 'DELETE', {});
			toast('Personaje archivado');
			await refresh();
		} catch (e) {
			status.textContent = e.message;
			busy(false);
		}
	};
}
