# Darkness of the Fallen — estado actual

Actualizado el 9 de octubre de 2026. Fuente de requisitos: `docs/REQUIREMENTS.md`;
prevalecen las instrucciones posteriores del propietario. Único repositorio de
trabajo: `eltryt/darknessofthefallen`. Los documentos de `docs/imported/` son históricos.

## Publicación y arquitectura

- Aplicación completa: https://darknessofthefallen.eltryt-darknessofthefallen.workers.dev/
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

## Dirección pública sin «backend» — activación

- URL principal: https://darknessofthefallen.eltryt-darknessofthefallen.workers.dev/
- El propietario confirmó el registro del nuevo callback OAuth en Discord.
- Worker público `darknessofthefallen` conectado mediante Service Binding al Worker original `darknessofthefallen-backend`. La entrada no almacena secretos ni crea otra base de datos.
- Se conservan la clase Guild, la migración v1 y el identificador darknessofthefallen del Durable Object original. APP_ORIGIN cambia al dominio público.
- Las navegaciones por la dirección antigua se redirigen a la nueva; los formularios antiguos piden recargar en la dirección nueva en lugar de reenviar escrituras automáticamente.
- Las cookies siguen siendo HttpOnly/Secure y limitadas al dominio actual; los usuarios deberán iniciar sesión de nuevo en la dirección nueva. No se transfieren tokens en enlaces.
- El workflow de backend publica primero la entrada y luego el backend; comprueba HTTPS, permisos privados y el callback OAuth nuevo. La entrada contempla temporalmente la propagación de versiones antiguas.
- Pages y documentación activa enlazan al nuevo origen. Conservar ambos callbacks durante la transición.

## Borrado de loot solicitado por el líder — 9 de octubre de 2026

- Panel → Loot: botón «Borrar» por asignación, incluidas las anuladas, exclusivo del permiso `loot.delete` (rango Líder).
- Confirmación con nombre del objeto; elimina el registro del historial y conserva la copia anterior y el actor en Auditoría (`loot.deleted`). No hay restauración desde el panel.
- Endpoint DELETE protegido por rango, origen y CSRF; borrado y auditoría en una misma transacción. No cambia Discord, los datos existentes ni las facultades de anulación de otros responsables.
- Validación local: 36 pruebas Node, integración SQLite de Cloudflare, builds de Pages/backend y prueba Chromium de cancelación, borrado activo/anulado, recarga y lista vacía en móvil/escritorio. Pruebas con datos sintéticos; no se han borrado objetos reales.
- Publicación mediante los workflows existentes del commit de esta tanda; consultar Actions para el resultado del despliegue.

## Convocatorias con Raid-Helper — cierre 10 de octubre de 2026

- Implementada integración con la API oficial Raid-Helper v4, plantilla `wowforever`
  y canal `1550997172982382723`. Clave configurada mediante GitHub Secrets y Cloudflare.
  Decisión, fuentes, instalación y limitaciones: `docs/RAID_EVENTS.md`.
- Panel y `/raids`: crear, editar horarios/capacidad/distribución, clasificar, asignar
  roster libre, filtrar, inscribir personajes registrados, gestionar suplentes/bajas
  y cancelar. Perfil: próximas convocatorias. Controles y permisos en backend.
- Reutiliza SQLite/Durable Object existente con migración 005 aditiva, sin segundo
  login, bot propio, servidor nuevo ni suscripción Premium. Conserva loot/asistencia.
- Raid-Helper es fuente de verdad para eventos e inscripciones; la web conserva
  clasificación, visibilidad y vínculos de personajes. Alarmas cada cinco minutos,
  cola de escritura, deduplicación, reintentos limitados y reconciliación.
- Calendario: miércoles raid 20, jueves raid 40, martes continuación/alternativo;
  23:00–01:00 Europe/Madrid con cambios estacionales. No limita otras convocatorias.
- Validación local: 44 pruebas Node aprobadas; integración workerd/SQLite y builds
  verificados. Chromium: creación, clasificación, inscripción, permisos y anchos
  1440/768/390/320 sin desbordamiento. Fallos temporales 429/503 y respuestas perdidas
  comprobados con proveedor simulado, no provocados en el servicio real.
- Aceptación API real aprobada: Actions 38074135714, commit 35d53e5. Handlers reales
  con base efímera: publicación en Discord, envío repetido sin duplicado, modificación
  de horario/capacidad, inscripción, cambio de personaje, suplente, baja y cancelación.
  Limpieza del único evento técnico confirmada. No modifica perfiles de producción.
- Corregidas incompatibilidades observadas: ID de plantilla (no su imagen), textos
  de éxito de la API, roles agrupados de Forever, restricciones desactivadas con
  `none` y especialización anterior conservada por Raid-Helper al pasar a Bench.
- Producción: `/api/events` devuelve sincronización saludable y evento externo real
  importado, incluida su cancelación. No se editó ni borró ese evento del propietario.
- Aceptación pendiente del propietario: crear/apuntarse usando directamente los
  botones de Discord y comprobar su sesión en la web. La prueba API real no sustituye
  esa interacción manual ni demuestra un nuevo login OAuth desde el navegador.
- Límites: borradores programados aún no publicados no se importan; eventos con
  restricciones de roles requieren inscripción en Discord. La API no ofrece CAS,
  por lo que existe una ventana GET/PATCH; resultados ambiguos no se repiten a ciegas.
  No se han activado webhooks Premium ni definido nuevas normas de composición.
- Siguiente paso recomendado: usar una convocatoria normal en el canal configurado
  y comprobar el resultado en Panel → Raids tras el siguiente ciclo de sincronización.


## Copias y recuperación — 11 de octubre de 2026

- El propietario confirma que el flujo real de convocatorias desde Discord y el
  recorrido de candidatura funcionan. La comprobación de rangos con cuentas reales
  sigue pendiente; se mantienen las pruebas automáticas de permisos.
- Exportación privada del líder: formato 2, esquema 5, snapshot transaccional y
  SHA-256; incluye outbox y todas las tablas de negocio, excluye autenticación.
- Nueva herramienta `npm run restore -- copia.json [nueva.sqlite]`: ensayo offline
  o archivo nuevo 0600, validación de integridad/referencias y rechazo de sobrescritura.
  Restauración pausa colas para no reenviar operaciones a Discord.
- Backup local nativo: rechaza rutas inexistentes y comprueba integridad SQLite.
- Documentado procedimiento en `docs/RECOVERY.md`, incluyendo PITR oficial de
  Cloudflare, limitaciones, retención documentada y precauciones de recuperación.
- No se han descargado datos privados de producción ni realizado PITR real.
  Las copias externas siguen siendo manuales; importación a Cloudflare no automatizada.
  Siguiente acción del líder: descargar una copia en Panel → Exportación y guardarla
  en almacenamiento privado. No enviar el archivo al chat ni al repositorio.
- Validación: 47 pruebas Node completas y un test adicional de backup nativo (48 en total),
  integración workerd con exportación/restauración aprobada, builds de Pages/backend correctos.

## Orden del código y estilos — 11 de octubre de 2026

- Primera limpieza de legibilidad: JavaScript, HTML, CSS, backend, scripts y pruebas
  con formato consistente y tabulaciones. Plantillas HTML extensas formateadas.
- CSS unificado en `public/style.css` conservando el orden de cascada de las tres
  hojas anteriores. HTML, backend y exportador de Pages apuntan a la única hoja.
- Prettier fijado, EditorConfig y comandos format/format:check; CI exige el formato.
- Corregidas dependencias del exportador respecto a espacios del código comprimido.
  Se conservan las rutas de Pages, metadatos y aviso de presentación estática.
- No cambia la lógica de login, permisos, loot, raids ni recuperación de copias.
- Validación: 48 pruebas Node aprobadas; comparación Chromium de inicio, raids,
  candidatura y exportación del líder a 1440 y 390 px, sin errores de JavaScript.
  Las páginas públicas comparadas conservan los mismos píxeles; el panel conserva
  dimensiones y contenido (variación visual limitada al estado de sus pestañas).
- Guía de mantenimiento en `docs/CODE_STYLE.md`. La modularización adicional de
  vistas puede continuar en próximas tandas; no se presenta el formato como una
  reescritura de toda la arquitectura.

## Vistas separadas en módulos — 11 de octubre de 2026

- `app.js` reducido de más de 1.200 líneas a unas 180: arranque, navegación,
  petición API y utilidades comunes. Sin dependencias circulares entre vistas.
- Nuevos módulos: `public-views.js` (rutas públicas y sus eventos),
  `public-layout.js` (composición visual), `profile-view.js` (perfil y personajes)
  y `panel-view.js` (pestañas y configuración). Reciben contexto explícito.
- Backend y exportador sirven/copían los nuevos módulos. Los enlaces de candidatura
  de la presentación siguen apuntando a la aplicación cuando MEMBER_APP_URL existe.
- Pruebas Pages verifican que cada import estático resuelva en el artefacto.
- Verificación: 48 pruebas Node; Chromium sobre todas las rutas públicas, filtros
  del roster, perfil miembro y todas las pestañas del líder, sin errores JavaScript.
  Comparación móvil/escritorio conserva dimensiones y diseño de las vistas revisadas.
- No cambia el CSS unificado ni las reglas del backend, login o sincronización.

## Wishlist por encuentro y roster visual — 11 de octubre de 2026

- Roster público y de panel con tarjetas compactas por rol, colores/distintivos
  por clase y filtros existentes. Respeta la separación entre datos públicos y privados.
- Wishlist extraída a módulo propio: agrupación raid/boss, prioridades, búsqueda,
  filtro de personaje, alta y retirada. Las entradas antiguas siguen funcionando.
- Backend conserva `raid` opcional en el JSON de wishlist, validado a 120 caracteres;
  sin migración de esquema. La vista de oficiales muestra raid y boss.
- Investigación: página oficial de Forever consultada; no se identificó en ella
  una lista verificable de bosses y loot. No se han cargado encuentros inventados.
- Catálogo extensible en `public/encounter-catalog.js`: fuentes/estado, raids,
  bosses y espacio para objetos. Las entradas verificadas podrán sugerirse en el
  formulario. Hasta entonces se permite entrada manual explícita.
- Fuentes, alcance y mantenimiento documentados en `docs/WISHLIST_CATALOG.md`.
- Validación: 48 pruebas Node y runtime Cloudflare aprobados; Chromium a 1440,
  390 y 320 px verifica roster, filtros, privacidad, wishlist antigua, creación,
  persistencia tras recarga y retirada. Sin errores JavaScript ni desbordamiento.

## Avisos privados al GM — 11 de octubre de 2026

- Webhook `DISCORD_GM_WEBHOOK_URL` exclusivo del backend; avisos genéricos con
  enlaces al panel para nuevas candidaturas, contactos e incidencias.
- Formulario de contacto para miembros autenticados y pestaña «Mensajes y avisos»
  privada del GM/oficiales; permisos comprobados en backend y CSRF existente.
- Cola persistente con deduplicación, reintentos de límites de Discord, auditoría
  y revisión manual de entregas inciertas para evitar duplicados por timeout.
- Incidencias manuales y trabajos recientes bloqueados de Raid-Helper. No incluye
  monitorización universal de errores ni reenvío de candidaturas históricas.
- Migración 006 y copias de esquema 6 compatibles con restauración de esquema 5.
- Procedimiento y límites: `docs/GM_NOTIFICATIONS.md`. Workflow manual comprueba
  servidor, envío/lectura de prueba e instala secretos sin imprimir sus valores.
- Validación: 55 pruebas Node, runtime Cloudflare, compilación backend/Pages y
  Chromium a 320/390/1440 px aprobados (contacto, privacidad y panel).
- Desplegado: backend `ee1981a`, Actions 38138933814 correcto. API pública de salud
  responde y `/api/gm-messages` devuelve 401 sin sesión; módulo UI publicado verificado.
- Activación real completada en Actions 38138936000: servidor del webhook validado,
  mensaje de PRUEBA enviado y releído desde Discord, secreto instalado en backend
  y `GM_NOTIFICATIONS_ENABLED=true`. No se crearon candidaturas ficticias en producción.
- Primera validación rechazó una variante de URL; corregido soporte para variantes
  oficiales (dominio antiguo, token con punto, barra final y parámetro wait).
- Pendiente externo: permisos del canal NO verificados. No existe token de bot
  disponible para consultarlos; revisar en Discord @everyone sin Ver canal y
  acceso solo GM/oficiales, teniendo en cuenta administradores/propietario.
- Siguiente comprobación de uso: observar en el panel el estado de entrega de la
  próxima candidatura real. Pruebas de formularios y cola realizadas localmente;
  prueba de webhook y lectura realizadas contra Discord real.

## Corrección del aviso automático de candidaturas — 11 de octubre de 2026

- La candidatura sí generaba su aviso, pero Workers rechazaba `redirect: error`
  antes de realizar el envío. La prueba anterior desde Node no detectaba esta
  incompatibilidad; no demostraba el recorrido completo en Cloudflare.
- Cambiado a `redirect: manual`; las redirecciones se rechazan explícitamente sin
  seguirlas ni reenviar la credencial a otro destino.
- Prueba de regresión workerd: POST real al endpoint de candidaturas, comprobación
  de cola, envío con Discord simulado y estado entregado. Reproduce el fallo antes
  del arreglo y pasa después; sin datos privados en el contenido del aviso.
- Recuperación única y auditada en Workers de los avisos anteriores al
  11/10/2026 12:29:08 UTC con el error concreto del despliegue inicial. El runtime
  rechazaba la petición antes de enviarla; se reencolan sin recrear candidaturas.
  No se reenvían entregados, restaurados, interrumpidos ni fallos posteriores.
- Despliegue correctivo `3a94811` completado: Actions 38139501462 correcto,
  56 pruebas Node y prueba workerd aprobadas. Salud HTTPS y login verificados.
  Recuperación automática instalada; la recepción final del aviso del usuario
  debe confirmarse en Discord/panel. No se ha accedido a su sesión privada.

## Borrado de candidaturas — 11 de octubre de 2026

- Botón «Borrar candidatura» en cada tarjeta, con confirmación de borrado definitivo.
  Actualiza tarjetas y contador conservando filtros; muestra errores sin ocultar datos.
- Endpoint DELETE protegido con `recruitment.manage` (Líder/Oficiales), sesión,
  origen y CSRF. Borrado atómico de candidatura, cola antigua y avisos asociados;
  auditoría por referencia sin copiar el contenido personal de la solicitud.
- No elimina mensajes ya publicados en Discord ni altera otras candidaturas.
- Validación: 57 pruebas Node, runtime Cloudflare y Chromium a 320/390/1440 px
  (cancelar, confirmar, persistencia tras recargar y estado vacío) aprobados.
- Publicación mediante el workflow de backend existente.
- Despliegue confirmado: `94b580f`, Actions 38164777202 correcto. Módulo de
  candidaturas servido en producción idéntico al probado y salud HTTPS correcta.

## Integración del roster de Qwen — 12 de octubre de 2026

Base revisada: `12ca327` (último commit de main al iniciar esta tanda).
La implementación recibida no estaba lista para publicación: los 35 supuestos PNG
contenían XML AccessDenied, faltaban módulos/recursos en el servidor y el exportador,
el CSS de iconos no se cargaba y el editor intentaba añadir opciones a un input.

Correcciones locales:
- Iconos JPEG válidos, alojados en public/assets/icons; rutas explícitas en el backend
  y recursos incluidos en la exportación de Pages. CSS integrado en style.css.
- Catálogo único en public/specs.js, reexportado por src/specs.mjs. Etiquetas corregidas
  y compatibilidad con textos antiguos. Selector de especialización según clase.
- La edición conserva la selección y los valores personalizados; cambiar de clase
  limpia la especialización. No hay migración destructiva de personajes existentes.
- Componentes con rutas controladas, escape de etiquetas y alternativa para clases
  desconocidas. No se amplían los datos del roster público ni los permisos.
- Las clases siguen almacenadas con sus nombres actuales; los IDs de especialización
  se utilizan en el selector. No afirmar que se ha migrado toda la base a IDs de clase.
- Catálogo heredado de Qwen: no constituye confirmación de especializaciones o talentos
  específicos de Forever. No se deducen automáticamente roles ni reglas de guild.

Validación: 58 pruebas Node correctas, integración workerd correcta, build Pages y
build backend (dry-run) correctos. Chromium local: crear/editar, conservar una spec
personalizada e iconos sin errores/overflow a 320, 390 y 1440px.
Publicación autorizada por el propietario, incluida la retirada de la restricción
anterior sobre commits, push y despliegues para las tareas encargadas.
Commit de integración: `2b876ba`. Pages publicado correctamente (Actions 38253556095);
icono público comparado con el archivo local. Cloudflare bloqueado por errores de
respuesta de su API, incluidos respuestas malformadas y timeout en varios intentos.

## Sesiones de siete días — 12 de octubre de 2026

A petición del propietario, las nuevas sesiones duran siete días desde el login
(604800 segundos), tanto en SQLite como en la cookie persistente HttpOnly/Secure.
Las sesiones existentes conservan su vencimiento; volver a entrar crea la de siete días.
Se conserva cierre de sesión, CSRF y consulta del rango local en cada petición.
No se almacenan tokens de Discord. Limitación existente: los cambios de rango o bajas
hechos únicamente en Discord se sincronizan al volver a entrar, no continuamente;
al ampliar la sesión se amplía también ese intervalo máximo. No se afirma revocación
inmediata desde Discord. Prueba añadida: duración, cookie, vigencia al sexto día,
vencimiento exacto, cambios de rango local y revocación de sesión.

Resultado de publicación: commit `4419c2e` subido a main, 59 pruebas Node y prueba
workerd correctas. Backend Actions 38254036285 falló también en el reintento durante
el despliegue del gateway; no llegó a desplegar el backend con sesiones de siete días.
La aplicación existente responde correctamente a /api/health. No afirmar activación
del cambio hasta completar un despliegue y sus comprobaciones.
Pages Actions 38254035223 queda esperando aprobación del entorno github-pages;
la conexión actual indica current_user_can_approve=false. No se modificaron protecciones.
Siguiente paso: reintentar backend.yml cuando la API de Cloudflare se estabilice;
revisar la aprobación de GitHub Pages desde GitHub.

## Recuperación de la carga de la web — 12 de octubre de 2026

Se detectó un reemplazo del historial de main: `53115d4` se publicó sobre `12ca327`,
sin las correcciones `2b876ba` ni las sesiones de siete días `4419c2e`.
En producción /components.js devolvía 404 y detenía la carga del frontend.
Se fusiona la nueva hoja de estilos con las correcciones anteriores, conservando
ambas líneas de trabajo y sin force-push. La prueba workerd comprueba ahora también
components.js, specs.js, roster-ui.js e iconos de clase/especialización.
Navegador local: edición de personajes y roster correctos a 320/390/1440px.
Recuperación desplegada: `e276d11`. Cloudflare Actions 38269207941, Pages
38269202768 y validación 38269202747 completados correctamente.
Verificado el contenido público servido: components.js responde 200 y coincide con
el local; icono mage.jpg idéntico al local. Portada de la aplicación y roster de Pages
renderizados sin errores JavaScript en Chromium con recursos HTTPS obtenidos mediante
curl (validación TLS del entorno; el almacén de Chromium no confía en la CA del proxy).
Las sesiones de siete días están incluidas en el backend publicado; no se realizó
un login real de Discord en esta comprobación. Pages sigue siendo una presentación
estática: el roster con datos reales está en la aplicación Cloudflare.

## Convocatorias de portada — 13 de octubre de 2026

Revisión del intento de Qwen `c6aefb8`: se completa su objetivo sobre main sin
incorporar la sustitución del historial ni las afirmaciones de trabajo no incluido.
- Contenedor real en la portada y módulo home-events.js compartido por ambos builds.
- Tres eventos futuros abiertos, orden cronológico, fechas Europe/Madrid con DST.
- Solo datos devueltos por la API existente según los permisos del visitante.
- Estado de carga, vacío y fallo diferenciados, botón de reintento y acceso a raids.
- Pages enlaza a las convocatorias de la aplicación, sin API ni datos simulados.
- No se cambian OAuth, sesiones, permisos ni integraciones. No se afirman nuevas
  animaciones o rediseños que no se han realizado en esta corrección.
- Verificación: 60 pruebas Node; navegador local con proveedor simulado para error,
  reintento y evento futuro, y API local real para vacío; 320/390/768/1440px sin overflow.
  Build Pages y prueba workerd con nueva ruta de módulo. Pendiente verificar publicación.

Publicación confirmada de `82d8f46`: Cloudflare 38319233011, Pages 38319230583 y
validación 38319230616 correctos. Módulo home-events.js servido idéntico al local.
Portada real renderizada como visitante: bloque visible con estado vacío y enlace
al calendario, sin errores JavaScript. Eventos futuros y reintento se comprobaron
con datos sintéticos localmente, no creando convocatorias en Discord.

## Google Calendar y borrado de convocatorias — 13 de octubre de 2026

- El botón del planificador abre Google Calendar con el horario recurrente de las
  próximas doce semanas, zona de la hermandad y final al día siguiente. El usuario
  guarda la copia en Google; no se descarga ICS ni se abre la aplicación del sistema.
- Borrar convocatoria disponible solo para Líder y Oficial, validado en backend
  con sesión, origen y CSRF. Los Raid Leaders no tienen permiso de borrado.
- Borrado lógico de la web: desaparece de las convocatorias y de la portada,
  conserva historial y referencias para impedir reimportación por Raid-Helper.
  No cancela ni borra en Discord; la confirmación lo indica expresamente.
- Se rechaza borrar si hay una operación pendiente, en ejecución o incierta.
- Verificación: 62 pruebas Node, workerd y build Pages correctos; navegador local
  comprueba destino Google (sin crear eventos reales), cancelar/confirmar borrado
  y tamaños 320/390/1440. Pruebas de permisos, CSRF y no reaparición al sincronizar.
- Publicación pendiente de verificar mediante los workflows existentes.

Publicación confirmada: `d66b8b2`, Cloudflare 38320290060, Pages 38320289855 y CI
38320289882 correctos. Los módulos de calendario y convocatorias servidos en la web
coinciden con los probados. No se borraron convocatorias reales durante la verificación.

## Preparación de Google Analytics — 13 de octubre de 2026

Integración local pendiente del ID público de medición GA4 proporcionado por el
propietario. No se ha activado ni desplegado. Carga solo tras aceptar estadísticas;
excluye panel, perfil, login, candidaturas y contacto. No se envían query strings,
referencias de candidaturas, IDs de usuarios ni contenido de formularios.
Solo aplicación principal; Pages queda excluido de esta primera integración.
Pendiente: añadir el ID G-…, revisar configuración de medición mejorada de la propiedad,
comprobar consentimiento en navegador y comprobar recepción real en Google Analytics.
No afirmar que registra visitas antes de esa comprobación. Nunca pedir claves secretas.

## Activación GA4 — 13 de octubre de 2026

ID público confirmado por el propietario: G-CEGJTCH2DX. Se configura la integración
preparada, con consentimiento previo opcional y retirada desde el pie de página.
Al rechazar se deshabilita GA, se limpian sus cookies accesibles y se recarga si estaba activo.
Rutas medidas: inicio, hermandad, roster, raids y progreso. No Pages, formularios,
autenticación, perfil ni panel. Sin parámetros de URL, referrer ni identificación de usuarios.
Se indicó desactivar Medición mejorada en GA4; no se ha verificado esa configuración
remota. CSP permite los hosts de carga y recogida de GA4 sin habilitar inline scripts.
Validación: 63 pruebas Node, build Pages, workerd y navegador local con script de
Google simulado: aceptar/rechazar/retirar, rutas excluidas y URL limpia correctos.
Pendiente comprobar publicación y recepción en el informe Tiempo real de la propiedad;
no se dispone de acceso de lectura al panel de Analytics ni se afirma recepción confirmada.

GA4 publicado: e784ed8; Cloudflare 38321203958, Pages 38321203008 y validación
38321202815 completados correctamente. analytics.js servido en producción idéntico
al probado. Falta confirmación del propietario en Tiempo real de GA4 tras aceptar
estadísticas en la portada; no se ha accedido a su cuenta de Google.

## SEO técnico — 13 de octubre de 2026

- Metadatos HTML por ruta pública entregados por el servidor: título, descripción,
  canonical sin parámetros, Open Graph y Twitter Card con el logo existente.
- Resumen editorial público y enlaces en el HTML inicial, legibles sin JavaScript;
  la interfaz interactiva lo sustituye al cargar. Sin personajes ni datos privados.
- /sitemap.xml con siete páginas públicas y /robots.txt con referencia al sitemap.
  Rutas privadas, login, API y errores llevan X-Robots-Tag noindex; no es sustituto
  de los controles de acceso. No se bloquea el rastreo de privadas en robots para
  que el buscador pueda observar sus respuestas noindex/autenticación.
- URLs públicas con barra final redirigen a su versión sin barra; raíz conservada.
- Pages permanece noindex y su canonical apunta a la aplicación, no a la copia estática.
- Pruebas de metadatos, escape de HTML, sitemap, rutas servidas por workerd y canonical
  de Pages. Navegador local confirma que la portada interactiva sigue funcionando.
- No se inventan logros, bosses, valoraciones ni datos estructurados de eventos.
  Pendiente Search Console: verificar propiedad de prefijo de URL y enviar sitemap.
  No hay acceso a esa cuenta ni se ha solicitado indexación; no prometer posiciones.
- El propietario confirmó recepción de visitas GA4 en el turno anterior.

SEO publicado en 099522b: backend 38321839599, Pages 38321838603 y CI 38321838641
correctos. 64 pruebas Node y workerd pasan. HTTP real verifica título, canonical,
contenido inicial de Reclutamiento y las siete URLs del sitemap. No equivale a
confirmación de indexación de Google, pendiente de Search Console.

## Search Console — etiqueta de propiedad

Añadida al head de public/index.html la etiqueta google-site-verification entregada
por el propietario para la propiedad de prefijo de URL de la aplicación. Mantenerla
tras verificar. No equivale a confirmación de propiedad: el propietario debe pulsar
Verificar en Search Console cuando el despliegue esté comprobado.

## Corrección de riesgo Soft 404 — 13 de octubre de 2026

Search Console: portada obtenida correctamente, rastreo e indexación permitidos,
pero clasificada Soft 404. Reproducción local: bloquear /api/* hacía que boot()
reemplazara el resumen del servidor por una pantalla de error con respuesta HTML 200.
robots.txt bloqueaba también /api/public, necesario para renderizar el contenido.
Ahora permite esa ruta pública exacta; la sesión opcional puede fallar sin bloquear
las páginas públicas y el contenido inicial se conserva si falla la carga. Privadas
mantienen su comportamiento autenticado y noindex. No se cambia la respuesta según bot.
64 pruebas Node y navegador con API bloqueada: contenido público conservado.
La causa concreta que observó Google no está confirmada sin su HTML renderizado;
volver a probar URL publicada tras desplegar. El sitemap válido continúa accesible.

Despliegue a0a7947: backend 38383799650, Pages 38383799539 y CI 38383799507 correctos.
Versión backend reportada por Wrangler: 50434130-3443-4ae2-9430-6361c8d8bf6a.
Verificación externa pendiente: las peticiones públicas inmediatamente después del
éxito (incluyendo no-cache y parámetros distintos) todavía devolvieron app.js y
robots.txt anteriores. No declarar corregido el resultado de Search Console hasta
observar la nueva versión y repetir su prueba en tiempo real.
