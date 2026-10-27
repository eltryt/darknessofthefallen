export function mountManualRoster(host, rows, ctx, refresh) {
	const { api, esc, field, select, area, classes, roles, toast } = ctx;
	const section = document.createElement('details');
	section.className = 'card section';
	section.innerHTML = `<summary>Añadir o editar personajes del roster</summary><p>Selecciona un personaje existente para editarlo o añade un jugador que no entre en la web. Cada alta crea un personaje principal independiente, sin cuenta ni permisos. Si después se registra, no se vinculará automáticamente.</p><label>Personaje<select data-manual-pick><option value="">Añadir jugador nuevo</option>${rows
		.map((r) => `<option value="${esc(r.id)}">${esc(r.name)} ${esc(r.surname)}</option>`)
		.join(
			'',
		)}</select></label><form data-manual-form class="form"><div class="form-grid">${field('Nombre del jugador (solo panel)', 'playerName', 'text', '', false)}${field('Nombre del personaje', 'name')}${field('Apellido', 'surname', 'text', '', false)}${select('Clase', 'class', classes)}${select('Rol', 'role', roles)}${field('Especialización', 'spec', 'text', '', false)}${field('Profesiones', 'professions', 'text', '', false)}${area('Disponibilidad', 'availability', false)}${area('Notas del personaje', 'notes', false)}</div><div class="actions"><button type="submit">Guardar personaje</button><button type="button" class="secondary danger" data-manual-archive hidden>Archivar personaje</button></div><p data-manual-status role="status"></p></form>`;
	section.insertAdjacentHTML(
		'beforeend',
		`<hr><h3>Importar lista de jugadores</h3><p>El archivo JSON se compara por nombre y apellido. Actualiza clase y rol, conserva los demás datos y añade los que falten como registros manuales. Los rangos de cuentas Discord no se cambian.</p><label>Archivo JSON<input type="file" accept=".json,application/json" data-roster-file></label><p data-import-preview></p><button type="button" data-roster-import disabled>Aplicar lista</button><p role="status" data-import-status></p>`,
	);
	const file = section.querySelector('[data-roster-file]');
	const apply = section.querySelector('[data-roster-import]');
	const importStatus = section.querySelector('[data-import-status]');
	let list;
	file.onchange = async () => {
		apply.disabled = true;
		list = null;
		importStatus.textContent = '';
		try {
			if (!file.files[0]) return;
			if (file.files[0].size > 50000) throw new Error('Archivo demasiado grande.');
			list = JSON.parse(await file.files[0].text());
			if (!Array.isArray(list) || !list.length || list.length > 100)
				throw new Error('Lista no válida.');
			section.querySelector('[data-import-preview]').textContent = list
				.map((r) => `${r.name} ${r.surname || ''} · ${r.class} · ${r.role} · ${r.rank}`)
				.join(' / ');
			apply.disabled = false;
		} catch (e) {
			importStatus.textContent = e.message;
		}
	};
	apply.onclick = async () => {
		apply.disabled = true;
		file.disabled = true;
		try {
			const result = await api('/api/roster/import', 'POST', { characters: list });
			toast(`${result.created} añadidos y ${result.updated} actualizados`);
			await refresh();
		} catch (e) {
			importStatus.textContent = e.message;
			apply.disabled = false;
			file.disabled = false;
		}
	};

	section.insertAdjacentHTML(
		'beforeend',
		`<hr><h3>Personajes archivados</h3><p>Restaurar devuelve el personaje al roster con su historial.</p><div data-archived>Cargando…</div>`,
	);
	const archived = section.querySelector('[data-archived]');
	api('/api/roster/archived')
		.then((list) => {
			archived.innerHTML = list.length
				? `<ul>${list.map((c) => `<li>${esc(c.name)} ${esc(c.surname || '')} · ${esc(c.class)} · ${esc(c.display_name)} <button type="button" class="secondary" data-restore="${esc(c.id)}">Restaurar</button></li>`).join('')}</ul>`
				: 'No hay personajes archivados.';
		})
		.catch((e) => (archived.textContent = e.message));
	archived.onclick = async (event) => {
		const id = event.target.closest('[data-restore]')?.dataset.restore;
		if (!id) return;
		event.target.disabled = true;
		try {
			await api('/api/roster/characters/' + id + '/restore', 'POST', {});
			toast('Personaje restaurado');
			await refresh();
		} catch (e) {
			archived.insertAdjacentText('beforeend', ' ' + e.message);
			event.target.disabled = false;
		}
	};

	host.prepend(section);
	const form = section.querySelector('form'),
		pick = section.querySelector('[data-manual-pick]'),
		archive = section.querySelector('[data-manual-archive]'),
		status = section.querySelector('[data-manual-status]');
	pick.onchange = () => {
		form.reset();
		const row = rows.find((r) => r.id === pick.value);
		archive.hidden = !row;
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
				'¿Archivar este personaje? Desaparecerá del roster y de la web, y conservará su historial.',
			)
		)
			return;
		busy(true);
		try {
			const manual = rows.find((r) => r.id === pick.value)?.source === 'staff';
			await api(
				(manual ? '/api/roster/manual/' : '/api/roster/characters/') + pick.value,
				'DELETE',
				{},
			);
			toast('Personaje archivado');
			await refresh();
		} catch (e) {
			status.textContent = e.message;
			busy(false);
		}
	};
}
