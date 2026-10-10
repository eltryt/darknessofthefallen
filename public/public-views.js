import { rosterCards } from './roster-ui.js';
import { createPublicLayout } from './public-layout.js';
import { mountRaidEvents } from './raid-events-ui.js';
import { prepareApplication, applicationReceipt } from './recruitment-ui.js';
import { attachSchedulePlanner } from './schedule-ui.js';
import { renderProgress } from './operations-ui.js';
export function createPublicViews(context) {
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
		data,
		roles,
		classes,
		opts,
	} = context;
	const operationsContext = () => context;
	const { publicLayout } = createPublicLayout(context);
	function home() {
		const s = data.settings;
		return /* HTML */ `<section class="hero">
				<div>
					<span class="eyebrow">World of Warcraft Forever · ${esc(s.faction)}</span>
					<h1>La noche es nuestra.<br /><em>El camino, juntos.</em></h1>
					<p>${esc(s.description)}</p>
					<div class="actions">
						<a class="button" href="/reclutamiento"
							>Encuentra tu lugar <span aria-hidden="true">→</span></a
						><a class="button secondary" href="/nosotros">Conoce la hermandad</a>
					</div>
				</div>
				<div class="hero-art" aria-hidden="true">
					<img
						class="hero-logo"
						src="/assets/guild-logo.png"
						alt=""
						width="1254"
						height="1254"
						fetchpriority="high"
					/>
				</div>
			</section>
			<div class="facts">
				<div class="fact">
					<span class="label">Nuestro horario</span
					><strong>${esc(s.raidStart)} — ${esc(s.raidEnd)}</strong><small>Europe/Madrid</small>
				</div>
				<div class="fact">
					<span class="label">Nuestra facción</span><strong>${esc(s.faction)}</strong
					><small>${esc(s.region)}</small>
				</div>
				<div class="fact">
					<span class="label">Nuestra aventura</span><strong>Servidor ${esc(s.ruleset)}</strong
					><small>Progresión PvE y PvP</small>
				</div>
				<div class="fact">
					<span class="label">Días de raid</span
					><strong>${s.raidDays.length ? esc(s.raidDays.join(' · ')) : 'Por confirmar'}</strong
					><small>${esc(s.raidStart)} — ${esc(s.raidEnd)} · Europe/Madrid</small>
				</div>
			</div>
			<section class="section">
				<div class="section-head">
					<h2>Más que una raid.</h2>
					<a href="/nosotros">Nuestra filosofía ↗</a>
				</div>
				<div class="grid">
					<article class="card">
						<span class="card-number">I.</span>
						<h3>Construir algo duradero</h3>
						<p>
							Una comunidad que siga aquí después del lanzamiento. Compartir el viaje importa tanto
							como llegar al siguiente boss.
						</p>
					</article>
					<article class="card">
						<span class="card-number">II.</span>
						<h3>Progresar como equipo</h3>
						<p>
							Preparación, comunicación y ganas de aprender. Cada papel tiene su sitio en la banda.
						</p>
					</article>
					<article class="card">
						<span class="card-number">III.</span>
						<h3>Jugar con transparencia</h3>
						<p>
							Un Loot Council de tres personas por grupo, con criterios objetivos que definiremos
							juntos y normas comunes para todas las raids.
						</p>
					</article>
				</div>
			</section>
			<section class="banner">
				<div>
					<span class="eyebrow">Cuando Azeroth se queda en silencio</span>
					<h2>Nosotros empezamos.</h2>
					<p>Descubre nuestro horario y la organización de las raids.</p>
				</div>
				<a class="button secondary" href="/raids">Ver información de raids →</a>
			</section>`;
	}

	function roster() {
		return (
			title(
				'La hermandad',
				'Nuestro roster',
				'Personajes, clases y roles. Los datos internos de los miembros permanecen privados.',
			) +
			/* HTML */ `<div class="filters">
					<input id="search" aria-label="Buscar personaje" placeholder="Buscar personaje…" /><select
						id="class"
						aria-label="Filtrar clase"
					>
						<option value="">Todas las clases</option>
						${opts(classes)}</select
					><select id="role" aria-label="Filtrar rol">
						<option value="">Todos los roles</option>
						${opts(roles)}
					</select>
				</div>
				<div id="roster-result"></div>`
		);
	}

	function renderRoster() {
		const rows = data.characters.filter(
			(c) =>
				(!$('#search').value ||
					c.name.toLowerCase().includes($('#search').value.trim().toLocaleLowerCase('es'))) &&
				(!$('#class').value || c.class === $('#class').value) &&
				(!$('#role').value || c.role === $('#role').value),
		);
		$('#roster-count').textContent =
			`${rows.length} ${rows.length === 1 ? 'personaje' : 'personajes'}`;
		$('#roster-result').innerHTML = rows.length
			? rosterCards(rows, esc)
			: data.characters.length
				? empty(
						'No encontramos personajes con esos filtros',
						'Prueba otra clase o rol, o pulsa Limpiar filtros.',
					)
				: empty(
						'El roster está por abrirse',
						'Los personajes aparecerán cuando los miembros los registren. Aquí verás su nombre, clase y rol.',
					);
	}

	function recruitment() {
		return (
			title(
				'Un nuevo comienzo',
				'Tu próxima hermandad.',
				'Cuéntanos quién eres, cómo juegas y qué buscas. Tu candidatura solo será visible para el equipo autorizado.',
			) +
			(!data.settings.recruitmentOpen
				? empty(
						'Reclutamiento cerrado',
						'Ahora no estamos recibiendo nuevas candidaturas. Puedes contactar con nosotros en Discord.',
					)
				: /* HTML */ `<form id="application" class="card form">
						<div class="form-grid">
							${field('Nombre o alias', 'name')}${field('Usuario de Discord', 'discord')}${field('Personaje y apellido', 'character')}${select('Clase', 'class', classes)}${select('Rol', 'role', roles)}${field('Disponibilidad y horario', 'availability')}${area('Experiencia', 'experience')}${area('¿Por qué quieres entrar?', 'reason')}${area('Información adicional', 'additional', false)}<label
								class="honeypot"
								aria-hidden="true"
								>Sitio web<input name="website" tabindex="-1" autocomplete="off"
							/></label>
						</div>
						<label
							><input type="checkbox" name="consent" required />Acepto que el Líder y los Oficiales
							consulten estos datos para gestionar mi candidatura y contacten conmigo por
							Discord.</label
						>
						<p>
							No necesitas iniciar sesión ni pertenecer al Discord para enviar la candidatura. No
							incluyas información sensible. Puedes solicitar la retirada de tu candidatura a través
							del contacto de la hermandad.
						</p>
						<button type="submit">Enviar candidatura →</button>
					</form>`)
		);
	}

	function raids() {
		const s = data.settings;
		return (
			title(
				'Preparados para la siguiente noche',
				'Información de raids',
				'Las convocatorias y las inscripciones se gestionan en Discord con Raid-Helper.',
			) +
			/* HTML */ `<section class="card">
					<span class="label">Horario de la hermandad</span>
					<div class="schedule">${esc(s.raidStart)} — ${esc(s.raidEnd)}</div>
					<p>
						Europe/Madrid ·
						${s.raidDays.length ? esc(s.raidDays.join(', ')) : 'Días pendientes de confirmar'}
					</p>
					${s.discordUrl ? `<a class="button" href="${esc(s.discordUrl)}" rel="noopener noreferrer">Abrir Discord ↗</a>` : '<span class="pill">Invitación Discord pendiente</span>'}
				</section>
				<section class="section">
					<h2>Próximas convocatorias</h2>
					${
						data.raids.length
							? table(
									['Raid', 'Fecha', 'Fuente'],
									data.raids.map(
										(r) =>
											/* HTML */ `<tr>
												<td>${esc(r.title)}</td>
												<td>
													${esc(new Date(r.starts_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }))}
												</td>
												<td>${esc(r.source)}</td>
											</tr>`,
									),
								)
							: empty(
									'Todavía no hay convocatorias',
									'Las raids se mostrarán aquí cuando se importen o se registren en el panel.',
								)
					}
				</section>`
		);
	}
	async function render(path) {
		const s = data.settings;
		let html = '';
		switch (path) {
			case '/':
				html = home();
				break;
			case '/nosotros':
				html =
					title('Nuestra identidad', 'Un lugar al que volver.', s.about) +
					/* HTML */ `<div class="grid">
						<article class="card">
							<h3>Alianza</h3>
							<p>${esc(s.name)} en ${esc(s.region)}. ${esc(s.server)} · WoW Forever Realmless.</p>
						</article>
						<article class="card">
							<h3>Progresión PvE</h3>
							<p>Conocer cada encuentro, mejorar juntos y construir un equipo estable.</p>
						</article>
						<article class="card">
							<h3>Noches compartidas</h3>
							<p>
								De ${esc(s.raidStart)} a ${esc(s.raidEnd)}, Europe/Madrid.
								${s.raidDays.length ? esc(s.raidDays.join(', ')) : 'Días por confirmar.'}
							</p>
						</article>
					</div>`;
				break;
			case '/roster':
				html = roster();
				break;
			case '/reclutamiento':
				html = recruitment();
				break;
			case '/raids':
				html = raids();
				break;
			case '/progreso':
				html =
					title(
						'Paso a paso, boss a boss',
						'Nuestro progreso PvE',
						'Aquí quedarán los encuentros superados y los hitos de la hermandad.',
					) + renderProgress(data.progress, { esc, empty });
				break;
			case '/contacto':
				html =
					title(
						'Nos vemos en Azeroth',
						'Hablemos en Discord.',
						'Nuestro punto de encuentro para la comunidad, las convocatorias y las dudas.',
					) +
					(s.discordUrl
						? `<a class="button" href="${esc(s.discordUrl)}">Entrar al Discord de la guild ↗</a>`
						: empty('Invitación pendiente', 'El Líder añadirá aquí el enlace oficial de Discord.'));
				break;
			case '/login':
				html =
					title(
						'Bienvenido a casa',
						'Entra con Discord.',
						'Tu cuenta de Discord conecta tus personajes y tu rango con la hermandad.',
					) +
					(data.authConfigured
						? '<a class="button" href="/auth/discord">Autorizar con Discord ↗</a>'
						: empty(
								'Conexión pendiente',
								'El acceso se activará cuando esté configurada la aplicación Discord de la hermandad.',
							));
				break;
			default:
				html = empty('Página no encontrada', 'Vuelve al inicio para seguir explorando.');
		}
		$('#content').innerHTML = publicLayout(path, html);
		attachSchedulePlanner(s);
		if (path === '/raids') {
			const host = document.createElement('section');
			host.className = 'section';
			$('#content').querySelector('.page-title').after(host);
			await mountRaidEvents(host, operationsContext());
		}
		if (path === '/roster') {
			renderRoster();
			$('#clear-roster').onclick = () => {
				['#search', '#class', '#role'].forEach((id) => ($(id).value = ''));
				renderRoster();
				$('#search').focus();
			};
			['#search', '#class', '#role'].forEach((s) => $(s).addEventListener('input', renderRoster));
		}
		prepareApplication($('#application'));
		formHandler('#application', async (v, f) => {
			const result = await api('/api/applications', 'POST', { ...v, consent: !!v.consent });
			applicationReceipt(f, result, esc);
			toast('Candidatura guardada');
		});
	}
	return { render };
}
