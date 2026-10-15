import { attachCharacterEditor } from './character-editor.js';
import { attachMemberOperations } from './operations-ui.js';
export function createProfileView(context) {
	const {
		$,
		api,
		esc,
		empty,
		title,
		table,
		field,
		select,
		area,
		formHandler,
		toast,
		me,
		roles,
		classes,
	} = context;
	const operationsContext = () => context;
	function rankLabel(rank) {
		return (
			{
				visitor: 'Visitante',
				member: 'Miembro',
				raider: 'Raider',
				raid_leader: 'Raid Leader',
				officer: 'Oficial',
				leader: 'Líder',
			}[rank] || rank
		);
	}

	async function profile() {
		const rows = await api('/api/characters'),
			attendance = await api('/api/attendance?userId=me');
		$('#content').innerHTML =
			title(
				'Tu espacio',
				me.user.name,
				'Gestiona tus personajes. Tu asistencia detallada solo es visible para ti y los responsables autorizados.',
			) +
			/* HTML */ `<div class="grid">
					<div class="card">
						<span class="label">Asistencia</span
						><span class="metric">${attendance.metrics.percentage}%</span>
						<p>
							${attendance.metrics.raids ? attendance.metrics.raids + ' raids registradas · incluye tardanzas' : 'Sin registros de asistencia todavía'}
						</p>
					</div>
					<div class="card">
						<span class="label">Personajes</span><span class="metric">${rows.length}</span>
						<p>Un Main y todos tus Alters</p>
					</div>
					<div class="card">
						<span class="label">Rango</span>
						<h3>${esc(rankLabel(me.user.rank))}</h3>
						<button id="logout" class="secondary">Cerrar sesión</button>
					</div>
				</div>
				<section class="section">
					<h2>Mis personajes</h2>
					${
						rows.length
							? table(
									['Nombre', 'Clase', 'Rol', 'Main / Alter'],
									rows.map(
										(c) =>
											/* HTML */ `<tr>
												<td>
													${esc(c.name)} ${esc(c.surname)}<a
														class="cell-detail armory-link"
														href="/armeria?personaje=${encodeURIComponent(c.id)}"
														>Ver ficha de armería →</a
													>
												</td>
												<td>${esc(c.class)}</td>
												<td>${esc(c.role)}</td>
												<td>
													${c.is_main ? '<span class="pill gold">MAIN</span>' : `<button data-main="${esc(c.id)}" class="secondary">Marcar Main</button>`}
												</td>
											</tr>`,
									),
								)
							: empty(
									'Tu historia empieza aquí',
									'Registra tu primer personaje para incorporarte al roster.',
								)
					}
				</section>
				${
					me.permissions.includes('character.write')
						? /* HTML */ `<section class="section">
								<h2>Añadir personaje</h2>
								<form id="character" class="card form">
									<div class="form-grid">
										${field('Nombre', 'name')}${field('Apellido', 'surname', 'text', '', false)}${select('Clase', 'class', classes)}${select('Rol', 'role', roles)}${field('Especialización', 'spec', 'text', '', false)}${field('Profesiones', 'professions', 'text', '', false)}${area('Disponibilidad', 'availability', false)}${area('Notas personales', 'notes', false)}
									</div>
									<label><input type="checkbox" name="isMain" />Marcar como Main</label
									><button type="submit">Guardar personaje</button>
								</form>
							</section>`
						: '<p class="notice">Un rol de miembro en Discord es necesario para registrar personajes.</p>'
				}`;
		attachCharacterEditor({ rows, api, refresh: profile, toast });
		formHandler('#character', async (v, f) => {
			await api('/api/characters', 'POST', { ...v, isMain: !!v.isMain });
			toast('Personaje guardado');
			await profile();
		});
		document.querySelectorAll('[data-main]').forEach(
			(b) =>
				(b.onclick = async () => {
					try {
						await api(`/api/characters/${b.dataset.main}/main`, 'POST', {});
						await profile();
					} catch (e) {
						toast(e.message);
					}
				}),
		);
		$('#logout').onclick = async () => {
			await api('/api/logout', 'POST', {});
			location.href = '/';
		};
		await attachMemberOperations({ rows, refresh: profile, ...operationsContext() });
	}
	return { profile };
}
