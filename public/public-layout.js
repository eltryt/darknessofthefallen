import { recruitmentShowcase } from './guild-showcase.js';
import { schedulePlanner } from './schedule-ui.js';
export function createPublicLayout(context) {
	const { esc, title, data } = context;
	function weekSchedule() {
		const s = data.settings;
		const nights = {
			Martes: ['Continuación', 'Progreso pendiente o contenido alternativo'],
			Miércoles: ['Raid de 20', 'Empieza el progreso semanal'],
			Jueves: ['Raid de 40', 'Roster conjunto de la hermandad'],
		};
		const today = new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'Europe/Madrid' })
			.format(new Date())
			.toLowerCase();
		const clock =
			'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
		const day = (name) => {
			const isToday = name.toLowerCase() === today,
				current = isToday ? ' aria-current="date"' : '',
				head = `<span class="raid-week-name">${name}${isToday ? '<span class="raid-week-today">Hoy</span>' : ''}</span>`;
			if (!s.raidDays.includes(name))
				return `<li class="raid-week-day"${current}>${head}<span class="raid-week-free">Sin raid fija</span></li>`;
			const [heading, detail] = nights[name] || ['Noche de raid', ''];
			return `<li class="raid-week-day is-raid"${current}>${head}<strong>${heading}</strong>${detail ? `<span class="raid-week-detail">${detail}</span>` : ''}<span class="raid-week-time">${clock}${esc(s.raidStart)} – ${esc(s.raidEnd)}</span></li>`;
		};
		return /* HTML */ `<ul class="raid-week" aria-label="Calendario semanal de raids">
				${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day).join('')}
			</ul>
			<p class="schedule-note">
				Hora peninsular española (Europe/Madrid). Las sesiones de ${esc(s.raidStart)} a
				${esc(s.raidEnd)} terminan pasada la medianoche, ya en el día siguiente. Cada convocatoria
				confirma su horario y su roster; las franjas alternativas se coordinan aparte.
			</p>
			${schedulePlanner()}`;
	}

	function guildFacts() {
		const s = data.settings;
		return /* HTML */ `<div class="identity-tags">
			<span class="pill">${esc(s.faction)}</span><span class="pill">Servidor ${esc(s.ruleset)}</span
			><span class="pill">${esc(s.region)}</span><span class="pill">WoW Forever</span>
		</div>`;
	}

	function faq(items) {
		return /* HTML */ `<div class="faq-list">
			${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}
		</div>`;
	}

	function raidOrganization(s) {
		return /* HTML */ `<section class="section">
			<div class="section-head">
				<div>
					<span class="eyebrow">Un equipo, distintas formas de reunirnos</span>
					<h2>Raids de 40, 20 y 10.</h2>
				</div>
			</div>
			<p>
				Nuestro horario base es de ${esc(s.raidStart)} a ${esc(s.raidEnd)}, hora peninsular española
				(Europe/Madrid). Queremos una organización estable que también tenga en cuenta la
				disponibilidad del grupo.
			</p>
			<div class="grid">
				<article class="card">
					<span class="card-number">40</span>
					<h3>Una cita para la gran banda</h3>
					<p>Los jueves de 23:00 a 01:00 reuniremos el roster conjunto de 40.</p>
				</article>
				<article class="card">
					<span class="card-number">20</span>
					<h3>Dos rosters potenciales</h3>
					<p>
						Los miércoles de 23:00 a 01:00 empezaremos el progreso semanal con raids de 20 y dos
						rosters potenciales. Si hay demanda, podremos valorar otra franja, por ejemplo de 22:00
						a 00:00. Es una posibilidad, no un segundo horario confirmado.
					</p>
				</article>
				<article class="card">
					<span class="card-number">10</span>
					<h3>Más margen para organizarnos</h3>
					<p>
						Las raids de 10 tendrán mayor flexibilidad de horario, coordinando cada convocatoria
						según la disponibilidad de quienes quieran participar.
					</p>
				</article>
			</div>
			<article class="card section">
				<h3>Más oportunidades, sin obligación</h3>
				<p>
					También podremos organizar convocatorias oficiales y extraordinarias fuera de los días
					habituales, siempre coordinadas con el Líder o las personas designadas. Son oportunidades
					adicionales para jugar juntos, no una obligación.
				</p>
				<p>
					Los martes de 23:00 a 01:00 continuaremos el progreso pendiente o haremos contenido
					alternativo. Consulta la convocatoria concreta en la web o en Raid-Helper; se pueden
					organizar actividades fuera de estos días.
				</p>
			</article>
		</section>`;
	}

	function lootPhilosophy() {
		return /* HTML */ `<section class="section">
			<div class="section-head">
				<div>
					<span class="eyebrow">El progreso se comparte</span>
					<h2>Loot Council con transparencia.</h2>
				</div>
			</div>
			<div class="grid">
				<article class="card">
					<h3>Tres personas por grupo</h3>
					<p>
						El Loot Council estará formado por tres personas por grupo para evitar empates. No tiene
						por qué estar compuesto solo por oficiales: la responsabilidad del consejo puede
						compartirse con otros miembros.
					</p>
				</article>
				<article class="card">
					<h3>Criterios que acordaremos juntos</h3>
					<p>
						Queremos decisiones basadas en criterios objetivos y transparentes. Esos criterios
						todavía están por definir colectivamente; no presentamos como cerradas unas normas que
						aún debemos acordar.
					</p>
				</article>
				<article class="card">
					<h3>Las mismas normas para todos</h3>
					<p>
						Las normas de loot que acordemos serán comunes para todos los rosters y tipos de raid,
						sean de 40, 20 o 10. Compartimos hermandad, objetivos y una misma forma de entender el
						reparto.
					</p>
				</article>
			</div>
			<p>
				La idea es progresar como equipo, explicar las decisiones y cuidar la confianza entre
				compañeros.
			</p>
		</section>`;
	}

	function publicLayout(path, html) {
		const s = data.settings,
			days = s.raidDays.length ? s.raidDays.join(', ') : 'Días pendientes de confirmar';
		const discord = s.discordUrl
			? /* HTML */ `<a class="button" href="${esc(s.discordUrl)}" rel="noopener noreferrer"
					>Ir al Discord de la hermandad ↗</a
				>`
			: /* HTML */ `<div class="inline-status">
					<span class="status-dot" aria-hidden="true"></span>La invitación oficial de Discord estará
					disponible aquí.
				</div>`;
		const scheduleSection = /* HTML */ `<section class="section">
			<div class="section-head">
				<div>
					<span class="eyebrow">Nuestras noches en Azeroth</span>
					<h2>Un horario para encontrarnos.</h2>
				</div>
				<span class="pill">Europe/Madrid</span>
			</div>
			${weekSchedule()}
		</section>`;
		if (path === '/')
			return (
				html +
				scheduleSection +
				/* HTML */ `<section class="section">
						<div class="section-head">
							<div>
								<span class="eyebrow">El siguiente paso</span>
								<h2>Conoce tu próxima hermandad.</h2>
							</div>
						</div>
						<div class="link-grid">
							<a class="card link-card" href="/progreso"
								><span class="card-number">01</span>
								<h3>El camino de la banda</h3>
								<p>Encuentros, primeras victorias e historia compartida.</p>
								<span>Ver progreso <span aria-hidden="true">↗</span></span></a
							><a class="card link-card" href="/roster"
								><span class="card-number">02</span>
								<h3>Quienes lo hacen posible</h3>
								<p>Conoce los personajes y los roles de nuestro equipo.</p>
								<span>Explorar roster <span aria-hidden="true">↗</span></span></a
							><a class="card link-card" href="/reclutamiento"
								><span class="card-number">03</span>
								<h3>Tu lugar en el grupo</h3>
								<p>Descubre nuestra forma de jugar y el proceso de entrada.</p>
								<span>Reclutamiento <span aria-hidden="true">↗</span></span></a
							>
						</div>
					</section>
					<aside class="partner-banner" aria-label="Colaboración con RestedXP">
						<span class="partner-banner-label">Aliado de la hermandad · Enlace de afiliado</span>
						<a href="https://shop.restedxp.com/ref/Tryt/" target="_blank" rel="sponsored noopener"
							><img
								src="/assets/partners/restedxp-leaderboard.webp"
								class="fade-in"
								width="728"
								height="90"
								loading="lazy"
								decoding="async"
								alt="RestedXP: guías premium de leveo con un 10% de descuento"
						/></a>
					</aside>`
			);
		if (path === '/nosotros')
			return (
				title('Desde 2026 · Una hermandad para quedarnos', 'Un lugar al que volver.', s.about) +
				guildFacts() +
				/* HTML */ `<section class="about-layout">
					<div class="about-emblem">
						<img
							class="fade-in"
							src="/assets/guild-logo.webp"
							width="1024"
							height="1024"
							alt="Emblema de Darkness of the Fallen"
							loading="lazy"
							decoding="async"
						/>
					</div>
					<div>
						<h2>El equipo antes que el ruido.</h2>
						<p>
							No buscamos una aventura que termine con el lanzamiento. Queremos una comunidad con la
							que seguir jugando, aprender los encuentros y disfrutar de cada noche en Azeroth.
						</p>
						<div class="values-list">
							<article>
								<span>01</span>
								<div>
									<h3>Continuidad</h3>
									<p>
										Construir una comunidad estable, con compañerismo y ganas de compartir el camino
										a largo plazo.
									</p>
								</div>
							</article>
							<article>
								<span>02</span>
								<div>
									<h3>Progresión en equipo</h3>
									<p>Preparación, comunicación y espacio para mejorar juntos.</p>
								</div>
							</article>
							<article>
								<span>03</span>
								<div>
									<h3>Transparencia</h3>
									<p>
										Hablar con claridad, acordar juntos los criterios de loot y explicar las
										decisiones para cuidar la confianza del grupo.
									</p>
								</div>
							</article>
						</div>
					</div>
				</section>` +
				lootPhilosophy() +
				scheduleSection +
				/* HTML */ `<p>
						Tenemos un horario base y contemplamos distintas formas de organizarnos según el tamaño
						de la raid.
						<a class="link" href="/raids"
							>Consulta la organización y la flexibilidad de horarios →</a
						>
					</p>
					<div class="banner">
						<div>
							<h2>¿Encaja contigo?</h2>
							<p>Descubre cómo formar parte de la hermandad.</p>
						</div>
						<a class="button" href="/reclutamiento">Conocer el reclutamiento →</a>
					</div>`
			);
		if (path === '/raids')
			return (
				title(
					'Organización de banda',
					'Desafíos que nos hacen más fuertes.',
					`${days} · ${s.raidStart}–${s.raidEnd}, hora de Madrid.`,
				) +
				`<nav class="raid-section-nav" aria-label="En esta página"><a class="button" href="#convocatorias">Convocatorias</a><a class="button secondary" href="/progreso">Progreso de la hermandad</a></nav><article class="onyxia-feature"><img src="/assets/art/onyxia.webp" alt="Ilustración de Onyxia en su guarida" width="750" height="867" loading="lazy"><div><span class="eyebrow">Azeroth nos espera</span><h2>Una banda. Un mismo desafío.</h2><p>Consulta las convocatorias para conocer el encuentro, las plazas y el horario de cada salida. El progreso registrado por la hermandad está disponible en su apartado.</p><a class="button secondary" href="/progreso">Ver progreso real →</a></div></article>` +
				guildFacts() +
				weekSchedule() +
				raidOrganization(s) +
				lootPhilosophy() +
				/* HTML */ `<section class="section">
						<div class="grid">
							<article class="card">
								<span class="card-number">01</span>
								<h3>Consulta la convocatoria</h3>
								<p>
									Discord y Raid-Helper son el punto de encuentro para ver la banda y su horario.
								</p>
							</article>
							<article class="card">
								<span class="card-number">02</span>
								<h3>Confirma tu disponibilidad</h3>
								<p>
									Apúntate desde la convocatoria en la web o en Raid-Helper. El calendario semanal
									es una referencia, no una inscripción.
								</p>
							</article>
							<article class="card">
								<span class="card-number">03</span>
								<h3>Comparte la noche</h3>
								<p>Coordínate con el grupo y consulta las indicaciones de la convocatoria.</p>
							</article>
						</div>
					</section>
					<section class="banner">
						<div>
							<h2>Convocatorias conectadas con Discord.</h2>
							<p>Así mantenemos las convocatorias y la organización del grupo en el mismo sitio.</p>
						</div>
						${discord}
					</section>`
			);
		if (path === '/reclutamiento')
			return (
				title(
					'Hay historias que empiezan en grupo',
					'Encuentra tu lugar.',
					`Alianza · Servidor ${s.ruleset} · ${days}, ${s.raidStart}–${s.raidEnd}.`,
				) +
				/* HTML */ `<section class="recruit-command">
						<div class="recruit-lead">
							<span class="eyebrow">Darkness of the Fallen · Desde 2026</span>
							<h2>La próxima noche.<br />Tu próximo equipo.</h2>
							<p>
								Compañerismo, progresión y un lugar al que volver. Buscamos personas con ganas de
								compartir el camino.
							</p>
							<div class="recruit-facts">
								<article>
									<span class="label">Nuestro horario</span
									><strong>${esc(s.raidStart)}–${esc(s.raidEnd)}</strong>
									<p>${esc(days)}<br />Europe/Madrid</p>
								</article>
								<article>
									<span class="label">Nuestra filosofía</span><strong>El equipo, primero.</strong>
									<p>Comunidad estable, comunicación y ganas de mejorar juntos.</p>
								</article>
							</div>
							${s.recruitmentOpen || document.body.dataset.applicationUrl ? `<a class="button" href="${esc(document.body.dataset.applicationUrl || '#application')}">Quiero formar parte →</a>` : '<span class="pill">Candidaturas cerradas</span>'}
						</div>
						<aside class="recruit-expectations">
							<span class="eyebrow">Así jugamos</span>
							<h3>Buen ambiente.<br />Un objetivo compartido.</h3>
							<ul>
								<li>Respeto y compañerismo dentro y fuera de la raid.</li>
								<li>Comunicar tu disponibilidad y coordinarte con el grupo.</li>
								<li>Aprender los encuentros y progresar en equipo.</li>
								<li>Loot Council con criterios transparentes que definiremos juntos.</li>
							</ul>
							<p>Las actividades adicionales son oportunidades, no obligaciones.</p>
						</aside>
					</section>
					${recruitmentShowcase(s, esc, document.body.dataset.applicationUrl || '')}
					<section class="section">
						<h2>El camino para entrar</h2>
						<ol class="application-steps">
							<li>
								<strong>Tu candidatura</strong
								><span>Personaje, experiencia, disponibilidad y lo que buscas en una guild.</span>
							</li>
							<li>
								<strong>Una conversación</strong
								><span>El equipo revisa tu solicitud y contacta contigo por Discord.</span>
							</li>
							<li>
								<strong>Conocernos jugando</strong
								><span>Si encajamos, el equipo te explicará los siguientes pasos.</span>
							</li>
						</ol>
					</section>
					${
						document.body.dataset.applicationUrl
							? /* HTML */ `<section class="section card">
									<h2>Presenta tu candidatura</h2>
									<p>
										El formulario se guarda en la aplicación de la hermandad. No necesitas iniciar
										sesión ni pertenecer al Discord para enviarlo.
									</p>
									<a class="button" href="${esc(document.body.dataset.applicationUrl)}"
										>Abrir formulario de candidatura →</a
									>
								</section>`
							: s.recruitmentOpen
								? /* HTML */ `<section class="section">
										<h2>Cuéntanos sobre ti</h2>
										<p>
											Los campos marcados con * son obligatorios. Tu candidatura solo es visible
											para el equipo autorizado.
										</p>
										${html.slice(html.indexOf('<form id="application"'))}
									</section>`
								: ''
					}
					<section class="section">
						<h2>Antes de dar el paso</h2>
						${faq([
							[
								'¿En qué horario jugamos?',
								`Nuestro horario base es ${esc(days)}, de ${esc(s.raidStart)} a ${esc(s.raidEnd)}, hora peninsular. La raid de 40 está prevista para el jueves. Para las de 20 contemplamos dos rosters y posibles alternativas si hay demanda; las de 10 serán más flexibles. <a class="link" href="/raids">Ver la organización de raids</a>.`,
							],
							[
								'¿Las convocatorias adicionales son obligatorias?',
								'No. Las convocatorias oficiales y extraordinarias fuera de los días habituales son oportunidades adicionales, siempre coordinadas con el Líder o las personas designadas.',
							],
							[
								'¿Cómo se repartirá el loot?',
								'Usaremos un Loot Council de tres personas por grupo, no necesariamente solo oficiales. Los criterios objetivos y transparentes se definirán colectivamente, con normas comunes para todos los rosters y tipos de raid.',
							],
							[
								'¿En qué tipo de servidor estamos?',
								`Jugamos en un servidor ${esc(s.ruleset)}, en la ${esc(s.faction)}. La progresión PvE es uno de nuestros puntos de encuentro.`,
							],
							[
								'¿Quién puede ver mi candidatura?',
								'Solo el Líder y los Oficiales autorizados. Tus datos no aparecen en el roster público.',
							],
							[
								'¿Cómo me contactaréis?',
								'Por Discord, con el usuario que indiques en tu candidatura. No necesitamos tu contraseña.',
							],
						])}
					</section>`
			);
		if (path === '/roster')
			return (
				html.replace(
					'<div id="roster-result"></div>',
					'<div class="results-toolbar"><span id="roster-count" role="status"></span><button id="clear-roster" class="secondary" type="button">Limpiar filtros</button></div><div id="roster-result"></div>',
				) +
				/* HTML */ `<aside class="privacy-note">
					El roster público muestra únicamente nombre, clase y rol. La información de los miembros
					permanece en el área privada.
				</aside>`
			);
		if (path === '/progreso')
			return (
				html +
				/* HTML */ `<section class="section">
					<h2>Cada encuentro tiene su historia.</h2>
					<div class="grid">
						<article class="card">
							<span class="pill">No intentado</span>
							<h3>El reto por delante</h3>
							<p>Encuentros que la hermandad todavía no ha empezado.</p>
						</article>
						<article class="card">
							<span class="pill">En progreso</span>
							<h3>Aprender y avanzar</h3>
							<p>Bosses en los que la banda está trabajando.</p>
						</article>
						<article class="card">
							<span class="pill gold">Derrotado</span>
							<h3>Una victoria compartida</h3>
							<p>Encuentros superados, con su primera victoria e historial.</p>
						</article>
					</div>
					<p class="privacy-note">
						Aquí compartimos el progreso de la hermandad. Las métricas individuales detalladas
						permanecen privadas.
					</p>
				</section>`
			);
		if (path === '/contacto')
			return (
				title(
					'Nuestro punto de encuentro',
					'Nos vemos en Discord.',
					'Comunidad, convocatorias y conversaciones. Todo empieza con un saludo.',
				) +
				/* HTML */ `<div class="contact-layout">
					<article class="card contact-card">
						<img
							class="fade-in"
							src="/assets/guild-logo.webp"
							alt=""
							width="1024"
							height="1024"
							decoding="async"
						/>
						<h2>${esc(s.name)}</h2>
						${guildFacts()}${discord}
					</article>
					<div class="contact-notes">
						<article>
							<h3>¿Quieres formar parte?</h3>
							<p>Consulta nuestros horarios y cómo funciona el proceso de entrada.</p>
							<a class="link" href="/reclutamiento">Ir a reclutamiento →</a>
						</article>
						<article>
							<h3>¿Buscas una convocatoria?</h3>
							<p>Las inscripciones se realizan desde la web o en Discord con Raid-Helper.</p>
							<a class="link" href="/raids">Ver información de raids →</a>
						</article>
						<article>
							<h3>Tu información personal</h3>
							<p>
								Las dudas sobre candidaturas o datos de miembro se tratan con el equipo autorizado
								por Discord.
							</p>
						</article>
					</div>
				</div>`
			);
		if (path === '/login')
			return /* HTML */ `<div class="login-layout">
				<div class="login-art">
					<img
						class="fade-in"
						src="/assets/guild-logo.webp"
						width="1024"
						height="1024"
						alt="Emblema de Darkness of the Fallen"
						decoding="async"
					/>
				</div>
				<section class="card login-card">
					<span class="eyebrow">Tu lugar en la hermandad</span>
					<h1>Bienvenido a casa.</h1>
					<p>Una cuenta de Discord. Tus personajes, tu wishlist y la historia que compartimos.</p>
					<ul class="login-features">
						<li>Gestiona tu Main y tus Alters.</li>
						<li>Consulta tu asistencia y el historial de loot.</li>
						<li>Accede a las herramientas de tu rango.</li>
					</ul>
					${data.authConfigured ? '<a class="button discord-button" href="/auth/discord">Entrar con Discord ↗</a>' : '<div class="connection-pending"><strong>El acceso de miembros aún no está abierto</strong><p>Cuando se active, entrarás con tu cuenta de Discord. Mientras tanto, puedes consultar los horarios y guardar las próximas noches de raid en tu calendario.</p><div class="login-pending-actions"><a class="button secondary" href="/raids">Ver próximas raids →</a><a class="link" href="/nosotros">Conocer la hermandad</a></div></div>'}
					<p class="login-footnote">
						Solo usamos Discord para entrar. Nunca te pediremos crear una contraseña para esta web.
					</p>
					<a class="link" href="/">Volver a la hermandad →</a>
				</section>
			</div>`;
		return html;
	}
	return { publicLayout };
}
