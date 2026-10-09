# Darkness of the Fallen — estado actual

Actualizado el 9 de octubre de 2026. Fuente de requisitos: `docs/REQUIREMENTS.md`;
prevalecen las instrucciones posteriores del propietario. Único repositorio de
trabajo: `eltryt/darknessofthefallen`. Los documentos de `docs/imported/` son históricos.

## Publicación y arquitectura

- Aplicación completa: https://darknessofthefallen-backend.eltryt-darknessofthefallen.workers.dev/
- Presentación pública: https://eltryt.github.io/darknessofthefallen/
- Cloudflare Workers con Durable Object SQLite persistente; mismo origen para frontend/API/sesiones.
- Pages publica solo recursos y datos editoriales; acceso de miembros y candidaturas enlazan al backend.
- Node 24 + SQLite sigue disponible para desarrollo local. Herramientas fijadas en package-lock.json.
- Última base de despliegue verificada antes de esta tanda: `bea2d19`; backend Actions 37885504841, Pages 37885504249. Consultar Actions del commit actual para comprobar nuevas publicaciones.

## Decisiones confirmadas por el propietario

- WoW Forever Realmless, Alianza, «Servidor PvP» sin nombre de reino.
- Martes, miércoles y jueves, 23:00–01:00 Europe/Madrid.
- Invitación oficial: https://discord.gg/4PTrHVYUNT
- Reclutamiento abierto a todas las clases y roles. No seleccionar prioridades por cuenta propia.
- Sin avisos a Discord por ahora. No crear bot ni activar webhooks automáticamente.
- No contratar planes ni dominios de pago. No cambiar la visibilidad del repositorio como efecto lateral de otro trabajo.

## Implementado y comprobado

- Sitio público con logo original, diseño adaptable, calendario de horarios e iCalendar.
- Discord OAuth publicado; primer acceso real confirmado por el propietario. Líder por ID explícito y cuatro roles mapeados en `.github/workflows/discord.yml`.
- Permisos backend, sesiones de 30 minutos, cookies seguras, origen/CSRF, validación y auditoría. Cambios de rol o salida de Discord no invalidan instantáneamente una sesión existente.
- Personajes, Main/Alters, edición propia, archivado, roster público limitado a nombre/clase/rol.
- Raids manuales, asistencia, wishlist, loot, consejo y progreso con permisos y pruebas locales. No equivalen a integraciones activas con proveedores.
- Candidaturas públicas persistentes, referencia, consentimiento y revisión privada para Líder/Oficiales; filtros, estados y notas. La migración 004 abrió el formulario una vez y respeta posteriores cierres desde el panel.
- Envíos sin avisos ni cola de notificaciones con la configuración actual. Requieren opt-in explícito para futuras integraciones.
- Configuración del líder: identidad, horarios, invitación, loot, composición y apertura del reclutamiento.
- Esta tanda completa edición del texto «Sobre la hermandad» y selección/limpieza de clases y roles buscados, con validación, auditoría y publicación en la aplicación. Las prioridades son informativas; no rechazan otras clases.
- Exportaciones JSON/CSV y auditoría; backup SQLite para Node local.

## Verificación de esta tanda

- 33 pruebas Node correctas: permisos de los seis rangos, validación, operaciones, OAuth simulado, Pages y calendario.
- Integración workerd correcta: datos y candidaturas conservados tras reiniciar, cierre del formulario persistente, rollback, CSRF, origen y controles privados.
- Prueba de navegador local: guardar y limpiar prioridades, editar texto de hermandad, recargar, mostrar cambios al público, conservar todas las opciones de candidatura y diseño móvil.
- No se guardan preferencias ficticias ni candidatos de pruebas en producción.
- Estado observado en producción antes de publicar esta tanda: reclutamiento abierto y listas de prioridades vacías.

## Pendiente del prompt maestro

1. Roster avanzado: resumen de composición frente a objetivos y filtros de disponibilidad/Main-Alter/rango/asistencia coherentes con los datos existentes.
2. Revisión completa de flujos manuales de raids/asistencia/loot/progreso con usuarios reales y corrección de vacíos de interfaz.
3. Estrategia y ensayo de recuperación de SQLite remoto. El JSON exportado no tiene restauración implementada; `npm run backup` solo cubre Node local.
4. Integraciones Raid-Helper/Warcraft Logs/Forever: comprobar APIs oficiales y compatibilidad antes de implementar; no fabricar datos ni usar scraping frágil.
5. Avisos privados de candidaturas: aplazados explícitamente por el propietario.
6. Auditoría de accesibilidad, rendimiento y revisión final de seguridad antes de declarar terminada la versión completa.

## Desarrollo y despliegue

`npm ci`, `npm test`, `npm run test:backend`, `npm run build`, `npm run build:backend`.
`npm run dev:backend` para Cloudflare local; `npm start` para Node; `npm run preview`
para Pages. Los procesos deben reiniciarse en nuevas sesiones. No crear worktrees
ni sobrescribir secretos o trabajo ajeno. QA solo local y desechable.

Pages se publica al hacer push a main. El backend utiliza el workflow manual
**Deploy backend to Cloudflare**; comprobar su resultado y la URL pública.
**Configure Discord login** instala credenciales y roles desde GitHub. Nunca
publicar valores de secretos ni bases. Ver `docs/CLOUDFLARE.md`, `docs/DISCORD.md`
y `docs/RECRUITMENT.md`.

## Textos de organización y loot — 9 de octubre de 2026

- Inicio, Hermandad, Raids y preguntas de Reclutamiento explican comunidad estable, compañerismo, progreso conjunto y transparencia.
- Horario base configurable (actualmente 23:00–01:00 peninsular); raid de 40 con día específico todavía por concretar. No se asigna a ningún día del calendario.
- Dos rosters potenciales de 20 preferentemente en horario base; 22:00–00:00 solo como ejemplo de alternativa si hay demanda. Raids de 10 con mayor flexibilidad.
- Convocatorias oficiales y extraordinarias fuera de los días habituales: coordinadas con el Líder o personas designadas, adicionales y no obligatorias.
- Loot Council de tres personas por grupo, no necesariamente oficiales; criterios objetivos y transparentes pendientes de definición colectiva y normas comunes para todos los rosters y tipos de raid.
- Esta tanda es editorial: no modifica OAuth, permisos, sesiones, datos de producción, lógica de loot ni generación de calendarios. Reutiliza las tarjetas y secciones existentes.
- Verificado: 33 pruebas Node, build de Pages y navegador a 1440/768/390/320 px en Inicio, Hermandad, Raids y Reclutamiento; un H1 por página, sin errores JavaScript ni desbordamiento, preguntas desplegables operativas. Publicación mediante los workflows existentes de Pages y Cloudflare; consultar Actions del commit de esta tanda.

## Dirección pública sin «backend» — transición

- Worker de entrada independiente: `darknessofthefallen`, configuración `wrangler.public.jsonc`.
- URL prevista: https://darknessofthefallen.eltryt-darknessofthefallen.workers.dev/
- En esta fase redirige temporalmente a la aplicación existente, conserva rutas y no almacena datos ni sesiones. No se renombra el Worker propietario de SQLite.
- Workflow manual: **Publish clean public address**. Pruebas de destino fijo, rutas y rechazo de escrituras; build independiente.
- Pendiente externo: añadir en Discord OAuth2 el callback `https://darknessofthefallen.eltryt-darknessofthefallen.workers.dev/auth/discord/callback`, conservando el actual.
- Después de confirmarlo, convertir la entrada en proxy mediante un Service Binding al Worker original, fijar el nuevo APP_ORIGIN, redirigir la dirección antigua y actualizar enlaces/comprobaciones. Mantener el mismo Durable Object y su identificador; no crear otra base ni copiar credenciales a la entrada.
- Hasta completar ese cambio, la barra del navegador seguirá mostrando la dirección original después de la redirección. No presentar el alias como una migración de origen terminada.
