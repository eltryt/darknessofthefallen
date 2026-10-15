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

## Roster manual — 13 de octubre de 2026

- Panel → Roster: «Añadir o gestionar jugador manualmente», para Líder, Oficial y
  Raid Leader mediante roster.manage validado en backend, origen y CSRF.
- Alta de personaje Main independiente con nombre, clase, rol, especialización,
  profesiones, disponibilidad y notas privadas; editar y archivar desde el selector.
- Identidad local manual:UUID con rango técnico visitor y source=staff. No representa
  una cuenta Discord ni concede acceso; issueSession rechaza estas identidades.
  Se reutilizan tablas y referencias existentes, sin migración ni pérdida de datos.
- Visible en roster/contadores y disponible para asistencia/loot mediante sus IDs;
  información pública limitada a nombre/clase/rol. Notas y contacto solo en panel.
- Evita nombres completos duplicados activos; solo modifica registros staff,
  nunca los personajes de una cuenta Discord mediante este endpoint.
- Archivado conserva historial. Auditoría de altas, ediciones y archivados.
- No vincula automáticamente registros si una persona inicia sesión posteriormente;
  no simula inscripciones de Discord/Raid-Helper ni permite asignar rangos de acceso.
- Validación: 65 pruebas Node, workerd y build Pages; Chromium local creación,
  edición y archivado, identificación manual y anchuras 320/390/1440 sin overflow.
- Publicación pendiente de comprobación. No se han añadido personas reales en pruebas.

Roster manual publicado en a2910a6: Cloudflare 38384865084, Pages 38384863650 y
validación 38384863642 correctos. Los módulos manual-roster-ui.js y operations-ui.js
servidos en producción coinciden con los comprobados localmente. No se realizó
alta de jugadores reales ni se usó una sesión del propietario para la validación.

## Edición de personajes existentes — 13 de octubre de 2026

- Panel → Roster → «Añadir o editar personajes del roster» permite seleccionar
  cualquier personaje activo, también los registrados por usuarios de Discord.
- PATCH /api/roster/characters/:id exige roster.manage (Líder, Oficial o Raid Leader),
  sesión, origen y CSRF. Actualiza nombre/apellido, clase, rol, especialización,
  profesiones, disponibilidad y notas del personaje; rechaza nombres duplicados.
- Conserva propietario, rango, nombre de cuenta Discord, Main/Alter, origen,
  referencias e historial. El propietario mantiene su edición desde el perfil.
- Auditoría roster.character.updated. Los registros archivados no pueden editarse.
  El botón Archivar continúa limitado a los registros manuales.
- Validación: 66 pruebas Node, build Pages, formato y prueba Chromium con datos
  sintéticos (alta/edición/archivado manual, edición de personaje con cuenta y móvil).
- Sin nuevas variables, secretos, dependencias o migraciones. Despliegue mediante
  los workflows existentes; no se modificaron personajes reales para las pruebas.

## Importación del roster de Raid-Helper — 13 de octubre de 2026

- La edición de personajes existentes se publicó en 4823ac0, Cloudflare 38424672159 correcto.
- El propietario facilita una captura con 22 jugadores e indica Raider para todos
  excepto Mishuka (Oficial) y Tryt (Líder). Lista preparada fuera del repositorio;
  los datos de jugadores no se incluyen en el código ni en los commits.
- Nueva importación JSON autenticada en Panel → Roster, con vista previa y botón
  Aplicar lista. POST /api/roster/import exige roster.manage y CSRF. Compara nombre
  completo normalizado, conserva campos adicionales e historial y evita duplicados.
- Transacción completa: errores de clase, rango, nombres ambiguos o duplicados
  revierten toda la lista. Los registros manuales admiten rango informativo hasta
  Raider, pero siguen sin poder iniciar sesión. No cambia rangos de cuentas Discord.
- Rango visible y filtro del roster incluyen también los registros manuales.
- Lista externa preparada: 16 altas, 6 actualizaciones; Nøxik tanque y darthom DPS
  melee. Roles totales: 2 tanques, 3 sanadores, 7 melee y 10 distancia. Sin inventar
  disponibilidad o especialización; nombres nuevos son los de la captura y no se
  presentan como personajes verificados ni se vinculan a Discord automáticamente.
- Pruebas Node: 67; prueba local de lista de 22 y repetición sin duplicados.
- Bloqueo operativo: este entorno no tiene sesión autenticada del propietario en
  el panel. La lista NO se ha aplicado a producción; debe elegirse el JSON y pulsar
  Aplicar lista desde una sesión autorizada. No se ha creado un acceso alternativo.

Importación publicada en 54639fc: Cloudflare 38425441823, Pages 38425441986 y
validación 38425441891 correctos. Módulo manual-roster-ui.js servido en producción
idéntico al local. Chromium comprobó carga del archivo y aplicación autenticada
con datos sintéticos; workerd y build correctos. Pendiente únicamente aplicar el
archivo del propietario desde su sesión; no se modificaron sus jugadores reales.

## Interfaz dinámica del roster — 13 de octubre de 2026

- Grupos por rol distribuidos en filas de tarjetas adaptables, en lugar de cuatro
  columnas desiguales. Colores e iconos de clase conservados; texto secundario reducido.
- Tarjetas privadas desplegables mediante ratón/teclado, con disponibilidad, jugador
  y tipo de registro. Editar personaje abre y selecciona su ficha cuando el usuario
  tiene roster.manage; datos privados no se añaden al roster público.
- Filtros rápidos por rol, estado pulsado accesible y búsqueda conservada al cambiar
  filtros. Roster del panel hasta 100 por página; otros listados mantienen 20.
- CSS en style.css; transiciones discretas desactivadas con reduced-motion.
- Validación: 67 pruebas Node, build Pages y formato. Chromium: 22 tarjetas, filtros,
  búsqueda combinada, acceso a edición, teclado y sin overflow a 320/390/1440 px.
- Solo presentación: no modifica personajes, clases, rangos, cuentas o datos reales.

Rediseño publicado en 0b30521. Cloudflare 38432556423, Pages 38432557149 y
validación 38432557148 correctos. Tras propagación, roster-ui.js, operations-ui.js
 y style.css coinciden con los archivos locales comprobados (consulta versionada).

## Referencia visual y fundación — 13 de octubre de 2026

- Preferencias del propietario guardadas en docs/DESIGN_REFERENCES.md: referencia
  Guilds of WoW, iconos y prioridades de reclutamiento y tarjetas de progreso.
- Año de fundación confirmado: 2026. Añadido en portada y Hermandad, con descripción
  SEO de inicio actualizada. No se inventa una fecha completa.
- El rediseño de reclutamiento/progreso queda pendiente; sigue el reclutamiento
  abierto. APIs del ejemplo y compatibilidad con WoW Forever no verificadas.

Fundación y referencia publicadas en 737e0c3: Cloudflare 38433741408, Pages
38433743047 y validación 38433743060 correctos; public-views.js verificado en vivo.

## Botones y navegación de fantasía oscura — 13 de octubre de 2026

- Controles con degradado carmesí, bisel y bordes metálicos, estados hover/activo,
  secundarios oscuros y botones deshabilitados sin movimiento. CSS en style.css.
- Cabecera con iluminación tenue, navegación activa con rombo luminoso y menú móvil
  enmarcado. Conserva etiquetas, enlaces, permisos y comportamiento existentes.
- Foco visible y preferencias de movimiento reducido respetadas, sin assets externos.
- Comprobación Chromium de Inicio, Raids, Reclutamiento y Panel a 1440/1100/768/390/320;
  menú, Escape, foco por teclado y reduced-motion correctos, sin errores JavaScript.
- Corregidas reglas de reclutamiento sobrescritas por la cascada que provocaban
  desbordamiento móvil en la introducción y los pasos de candidatura.
- Build Pages y formato comprobados; no cambia datos ni lógica de autenticación.

Controles publicados y verificados en fc95c64: Cloudflare 38434498549, Pages
38434498202 y validación 38434498329 correctos. style.css servido en producción
coincide con el archivo local y /roster responde HTTP 200. Tanda finalizada.

## Transición de carga uniforme — 14 de octubre de 2026

- Las páginas públicas muestran «Abriendo las puertas de Azeroth…» durante el
  arranque, igual que Perfil, sin mostrar fugazmente la presentación SEO simplificada.
- boot-state.js activa el estado antes del primer pintado. El HTML público permanece
  en la respuesta, visible sin JavaScript o al fallar la API. Un límite de 8 segundos
  recupera la presentación si el módulo no arranca; no introduce un retraso mínimo.
- Boot elimina siempre el estado al terminar. Sin detección especial de Google,
  sin relajar CSP, sin cambios de sesión o autenticación. Asset incluido en Pages.
- Chromium: carga lenta, render completado, JavaScript desactivado, error de API y
  módulo bloqueado comprobados. Suite Node y build Pages correctos.

Carga uniforme publicada en c09c087: Cloudflare 38482320338, Pages 38482319564 y
validación 38482319589 correctos; boot-state.js comprobado en producción.

## Rediseño de lectura, reclutamiento y progreso — 14 de octubre de 2026

- Tipografía sans-serif para información y controles, mejor contraste, tamaños y
  espaciado; títulos, tarjetas, formularios, menú y panel mantienen una identidad
  oscura con acentos carmesí. Capa visual en public/theme.css.
- Portada con ilustración vectorial original night-sanctum.svg y el logo existente;
  año 2026 conservado en Inicio/Hermandad. Sin copiar HTML/CSS ni fondos de referencias.
- Reclutamiento: horario/filosofía/expectativas a simple vista, CTA al formulario
  existente, nueve tarjetas con tintes e iconos de clase/especialización y filtros
  combinables de prioridad/rol. Formulario, privacidad y envío existentes conservados.
- Configuración exclusiva del Líder para classPriorities (abierta/alta/media/baja),
  validada en backend y auditada. Por defecto Abierta; no se cambian prioridades reales.
  No se rechazan candidaturas por clase/prioridad; niveles por especialización pendientes.
- Progreso: tarjetas visuales, contadores, barras, estados de jefes y primeras victorias
  procedentes del panel. Sin datos, Onyxia es una referencia explícita sin progreso;
  no crea registros, no simula kills ni conexión a Raider.IO. Portadas fotográficas
  por encuentro y fuentes externas compatibles quedan pendientes de verificación.
- Icono Onyxia local verificado JPEG; procedencia documentada. CSS/JS/SVG incluidos
  en backend y Pages. Sin dependencias, secretos, servicios o migraciones nuevos.
- Validación: pruebas de prioridades autorizadas/inválidas y tarjetas; Chromium en
  ocho rutas y cinco anchuras, guardado/recarga de prioridades, filtros y CTA; sin
  errores de JavaScript ni assets fallidos. No se alteraron jugadores o progreso real.

## 2026-10-14 — Rediseño ilustrado, pendiente de revisión

Rama local `visual/illustrated-guild`. Sin push ni despliegue en esta fase.

- Inicio: castillo panorámico, título y lema oficiales como texto HTML, cuatro accesos ilustrados; horarios y próximas convocatorias conservados.
- Raids: cabecera con expedición, navegación hacia convocatorias/progreso y tarjeta vertical de Onyxia sin datos ficticios. Convocatorias, inscripción y calendario siguen usando sus componentes actuales.
- Roster público: sala de guerra, tabla semántica con iconos de clase, búsqueda/filtros/reset y resumen de composición de la selección. Solo nombre, clase y rol públicos; no se exponen datos privados ni se modifica el editor del panel.
- Sistema visual compartido: negro/carmesí/marfil/oro envejecido, superficies y marcos finos, ilustraciones y degradados independientes. Logo original conservado. Calendario semanal y enlaces inferiores adaptados a móvil.
- Assets: siete WebP en public/assets/art; originales intactos en docs/design-originals. Publicación estática incluida en los exportadores. Único cambio de servidor: registro autorizado de esas siete rutas y su MIME image/webp; no cambia APIs, permisos, autenticación ni base de datos.
- Validación: 69 pruebas Node; build Pages; smoke de ocho rutas y cinco anchuras; revisión adicional de Inicio/Raids/Roster a 1920/1440/768/390 px, búsqueda, rol y reset con datos sintéticos en SQLite en memoria. Capturas en /workspace/pages-validation/illustrated-{home,raids,roster}-{1440,390}.png.
- Diferencias deliberadas con los mockups: no se añaden niveles, presencia online, asistencia pública, raids inexistentes, botín destacado ni guías sin respaldo funcional. Se conserva el contenido y navegación real. La ilustración vertical de Onyxia se muestra completa en su tarjeta.
- Siguiente paso: revisión visual del propietario antes de publicar. No se han tocado datos de producción.

Ajuste solicitado durante la revisión: Google Calendar queda en un desplegable nativo cerrado por defecto, con próximo horario y zona visibles en el resumen. Se conservan selector, fechas y enlace de copia. Comprobados apertura con Enter, cierre y destino calendar.google.com sin enviar datos a Google. 69 pruebas pasan tras el ajuste; formato correcto. Prueba Cloudflare SQLite: 1/1 aprobada antes del ajuste visual del calendario.

Publicación autorizada por el propietario el 14/10/2026: se prepara push a main y despliegue mediante el workflow backend.yml. Los resultados se registrarán al finalizar la comprobación pública.

### Publicación verificada — 14/10/2026

Rediseño publicado con commit `3aeca5e`. Push autorizado a main. Workflows completados correctamente: Cloudflare `38500174193`, Pages `38500168448`, validación `38500168675`. Tras la propagación, las tres rutas públicas responden correctamente y CSS, módulos visuales y siete WebP coinciden byte a byte con los archivos locales. Google Calendar continúa en el desplegable compacto. Sustituye el estado anterior de pendiente de publicación.

## 2026-10-14 — Marcos e iconos en tarjetas de Inicio

Marco metálico fino con cuatro esquinas ornamentales en CSS e iconos SVG decorativos de comunidad, montañas, espadas cruzadas y casco. Títulos actualizados a Explora Azeroth y Raids; descripciones y destinos conservados. Sin nuevas imágenes, dependencias ni cambios de backend. Verificado build y navegador a 1920/1440/768/390 px, sin desbordamientos ni errores JS. Publicación siguiendo la autorización vigente del propietario.

## 2026-10-14 — Menú ilustrado propio y encuadre

Iconos SVG de línea decorativos en los siete enlaces públicos y Panel (solo usuarios autorizados). Barra oscura con borde metálico, activo carmesí y foco visible; todos los nombres y destinos conservados. Panel recibe aria-current después de insertar su enlace. Logo alineado y encuadre del castillo ajustado a escritorio/móvil. Menú adaptable con pruebas de abrir/cerrar y Escape a 900/800/768/390 px, siete iconos públicos, siete anchuras sin overflow. 69 pruebas aprobadas; pruebas existentes de ocho rutas también pasan. Sin cambios backend.

## 2026-10-14 — Continuidad visual y segunda serie de ilustraciones

Rediseñados los bloques antiguos señalados en Inicio, Hermandad, Progreso, Reclutamiento y Contacto: superficies carbón/carmesí, marcos metálicos finos, cabeceras ilustradas y tarjetas de clase con acento de su color. Calendario compacto conservado. Los nueve assets nuevos se incorporan con autorización expresa; ubicaciones y originales en docs/design-originals/README.md. Onyxia usa la ilustración del dragón tanto en la referencia vacía como en progreso registrado; reconoce también el nombre existente «Guarida de Onixya». No altera nombres, cifras, estados, prioridades ni formularios.

Nueve WebP añadidos al registro estático y exportadores; sin cambios en APIs, permisos o base de datos. Validación: 69 pruebas aprobadas, incluyendo construcción Pages; navegador en ocho rutas/cinco anchuras, filtros de reclutamiento, persistencia de prioridades y ausencia de errores/recursos fallidos. Capturas de las cinco páginas a 1440/390 en /workspace/pages-validation/finish-*.png. Fixture sintético de Onixya mantiene 0/1 y muestra el fondo del dragón. Corregido desbordamiento móvil del layout antiguo de Hermandad. Publicación autorizada dentro de la iteración visual vigente.

### Corrección de alineación en Reclutamiento — 14/10/2026

Dos paneles con la misma altura, bordes superior/inferior alineados y espaciado uniforme; CTA y nota inferior colocados al pie. Horario y filosofía mantienen alturas iguales. Textos y acciones conservados. Comprobación de geometría a 1440/1280/1024 y sin overflow a 768/390/320, captura alignment-1440.png; smoke de ocho rutas aprobado. Ajuste exclusivamente CSS.

## 2026-10-14 — Corrección de pestañas del panel

Causa: Convocatorias refrescaba cada 30 segundos sobre #panel-body, reutilizado por Progreso; host.isConnected seguía siendo true. Cada selección ahora crea su propio contenedor y desconecta el anterior. Los errores tardíos solo se muestran si el host sigue activo. Convocatorias no renderiza ni inicia polling tras una carga si su host ya está desconectado. Sin cambios de backend.

Validación: 69 pruebas aprobadas. Regresión de navegador /workspace/pages-validation/panel-race-regression.mjs con SQLite en memoria: polling acelerado, respuesta tardía correcta, error tardío y vuelta a Raids; Progreso y aria-pressed permanecen sincronizados, sin errores JS.

## 2026-10-14 — Revisión de errores de frontend

Cambios exclusivamente CSS, sin modificar funciones, endpoints ni datos:
- Checkbox «Solo mis inscripciones»: ya no hereda ancho mínimo de campos de texto (desbordaba 13 px); alineación y área de etiqueta corregidas.
- Tipografía de campos móviles: 16 px hasta 900 px para evitar el zoom automático habitual de Safari iOS (no se ha ejecutado Safari).
- Formularios a 320 px: fechas de Asistencia y creación de convocatorias contenidas; filtros apilados y columnas sin mínimo intrínseco.
- Foco visible explícito para desplegable de Google Calendar; hover de enlaces respeta movimiento reducido.

Verificación en Chromium: nueve páginas a 1440/1024/900/768/390/320, medición de overflow de textos/controles/formularios; todas las pestañas del panel a 1440/390/320, sin incidencias restantes en esta comprobación. Smoke existente de ocho rutas, filtros/prioridades/calendario aprobado. La corrección anterior del panel 326e4ed está desplegada (workflow 38560504905) y su módulo público coincide con el local.

## 2026-10-14 — Coherencia visual entre páginas públicas (Claude)

Trabajo coordinado con Codex en main; archivo tocado: `public/theme.css` (bloque final «Consistency pass»). Solo CSS, sin cambios de datos, APIs, permisos ni textos.

- Pie de página alineado con el contenedor de las páginas (mismos márgenes laterales y ancho máximo); aviso legal y botón de estadísticas en una fila más compacta.
- Inicio: títulos de las cuatro tarjetas ilustradas alineados aunque la descripción ocupe una o dos líneas.
- Raids: la tarjeta de Onyxia ocupa todo el ancho del contenido y la ilustración llena su marco (antes quedaba centrada y con bandas negras en móvil); título con la tipografía serif común.
- Progreso: nota «Progreso registrado…» alineada con la tarjeta. La tarjeta «Guarida de Onixya» sigue mostrando el dragón y los datos reales (Normal, Onyxia «No intentado», 0/1, comprobado contra /api/public de producción y replicado en QA local).
- Reclutamiento: nueve clases en rejilla 3×3 (sin Druida huérfano), 2 columnas en tableta y 1 en móvil con tarjetas más compactas; titular de «Así jugamos» en serif.
- Horario semanal: en móvil pasa de siete losetas altas a una lista compacta día · tipo · horario (dos líneas por debajo de 380 px); textos auxiliares a 12–13 px.
- Roster: las etiquetas de rol no se parten en dos líneas.

Validación: 69 pruebas Node y build Pages correctos. Capturas de página completa con Edge (playwright-core, fuera del repo) de las siete páginas públicas a 1440/1024/768/390/320 px: sin desbordamiento horizontal, sin errores JavaScript ni recursos fallidos.
Publicado: commit `a3ad894` en main; Pages `38635391332` y validación `38635391300` correctos; backend Cloudflare `38645488758` correcto (lanzado con gh). theme.css servido en producción idéntico al local; siete rutas públicas y /api/health responden 200; capturas reales a 1440/390 sin desbordamiento ni errores JS, «Guarida de Onixya» con datos reales 0/1.
Pendiente propuesto: botón «Acceso de miembros» a ancho completo en la cabecera móvil (ocupa espacio en todas las páginas), orden de bloques en Raids (pestañas tras el filtro vacío) y tipografía de las cabeceras de sección sans/serif aún mixta en algunos bloques.

## 2026-10-15 — Enlace de afiliado RestedXP

A petición del propietario (código de afiliado Tryt; su cupón ofrece un 10% de descuento a quien compre desde el enlace, comprobado por él con otra persona).
- Botón persistente en la cabecera de todas las páginas: «10% de descuento · RestedXP», estilo carmesí/oro propio, abre https://shop.restedxp.com/forever/ref/Tryt/ en otra pestaña con rel="sponsored noopener" y texto accesible que indica enlace de afiliado. En móvil comparte fila con «Acceso de miembros» (la cabecera queda más baja que antes).
- Un único banner discreto (728×90) al final de Inicio, rotulado «Aliado de la hermandad · Enlace de afiliado», hacia https://shop.restedxp.com/ref/Tryt/. Copia local en public/assets/partners/ (la CSP solo admite imágenes propias y así no se carga nada de terceros sin pulsar). Los banners de 160×600 y 320×365 no se usan para no recargar la web.
- Sin scripts ni seguimiento de terceros; no cambia CSP, analítica, APIs ni datos. Registrado el asset en app.mjs, build y exportador de Pages.
- Corrección de paso: a más de 1640 px las ilustraciones de cabecera llegan ahora a ambos bordes; el menú de escritorio pasa a segunda fila hasta 1380 px para dejar sitio al botón.
- Validación: 69 pruebas Node, prueba workerd y build Pages correctos; capturas de las siete páginas a 2560/1920/1440/1381/1280/1100/900/768/390/320 px sin desbordamiento ni errores JS.
Publicado: commit `0feb409`; Pages `38648958730`, validación `38648958780` y backend Cloudflare `38648980775` correctos. theme.css y public-layout.js servidos idénticos al local; banner servido (200); capturas reales de siete rutas a 1920/1440/390/320 sin desbordamiento ni errores JS.

## 2026-10-15 — Horario semanal legible, lista de valores e icono de Raids

- Calendario semanal rehecho (Inicio, Hermandad y Raids): nombres de día 14 px, títulos 22–26 px, horario 16 px con icono de reloj y detalle de cada noche («Continuación · Progreso pendiente o contenido alternativo», «Raid de 20 · Empieza el progreso semanal», «Raid de 40 · Roster conjunto de la hermandad»). Las noches de raid ocupan más ancho; marca «Hoy» según Europe/Madrid. Por debajo de 1100 px pasa a filas legibles; en móvil, filas compactas. Días y horas siguen leyéndose de la configuración.
- Nota del horario reescrita con los mismos hechos y a 15 px.
- Hermandad: números 01–03 con ancho fijo para alinear los títulos; textos a 15 px. Eliminada la franja clara que la ilustración del campamento trae en sus últimas filas (el fondo se extiende por debajo del marco).
- Icono de Raids del menú redibujado (dos espadas cruzadas limpias, trazo de línea como el resto).
- Validación: 69 pruebas Node, prueba workerd y build Pages; siete páginas a 1920/1440/1280/1024/768/390/320 px sin desbordamiento ni errores JS.
Publicado: `0e8ee4d`; backend `38650997078`, Pages `38650986419` y validación `38650986410` correctos; theme.css/public-layout.js servidos idénticos y capturas reales de Inicio/Hermandad/Raids a 1440/390 sin incidencias.

## 2026-10-15 — Panel y perfil con la línea visual actual

- Causa: Panel y Perfil no marcaban `data-page` en el body, así que no recibían la capa visual nueva (seguían las tarjetas azul marino antiguas). app.js lo marca ahora para esas dos rutas antes de renderizar; sin cambios de lógica, permisos ni datos.
- Cabecera ilustrada (sala de guerra en Panel, campamento en Perfil), títulos serif y pestañas en una barra enmarcada con activo carmesí; en móvil, una sola fila deslizable en lugar de cinco filas.
- Métricas en oro, avisos con filete dorado a 14 px, leyendas y desplegables en oro, casillas de días/clases/roles en cuadrícula compacta, tablas con cabecera dorada a 14 px, grupos del roster con marco y contador carmesí. Filtros en 2 columnas en móvil; contadores de composición en tres columnas.
- Validación: 69 pruebas Node, prueba workerd y build Pages; las 12 pestañas del Panel y el Perfil con sesión QA de líder (datos sintéticos) a 1440/1024/768/390/320 px sin desbordamiento ni errores JS; páginas públicas sin regresiones.
Publicado: `aa1b606`; backend `38652050382`, Pages `38652035269` y validación `38652035080` correctos. theme.css y app.js servidos idénticos al local tras la propagación; /panel y /perfil responden 401 sin sesión, como corresponde. No se ha visto el panel de producción con una sesión real: pendiente de revisión del propietario.

## 2026-10-15 — Imágenes en WebP

- Los 35 iconos JPEG de clase/especialización/Onyxia, el logo PNG y el banner de RestedXP pasan a WebP (sharp, calidad 85–88; logo reducido de 1254 a 1024 px). Recursos de imagen de 2,53 MB a 0,33 MB; el logo de 2,4 MB a ~0,25 MB.
- Se conserva guild-logo.png únicamente para og:image (vista previa en redes, compatibilidad). night-sanctum.svg sigue en SVG por ser vectorial. Las ilustraciones ya eran WebP.
- Actualizadas rutas del servidor (image/webp), build, exportador, favicon y pruebas (la de iconos verifica ahora la firma RIFF/WEBP). Originales eliminados del árbol; quedan en el historial de Git.
- Validación: 77 pruebas Node, workerd y build; 76 imágenes en 11 páginas (públicas, perfil, armería y panel) cargadas en WebP sin roturas.
- Publicado: `96bfb59`; backend 38716891939, Pages 38716871708 y validación 38716871683 correctos. En producción las 7 páginas públicas cargan solo WebP, sin imágenes rotas; los .jpg antiguos responden 404.

## 2026-10-15 — Armería estilo «paperdoll», cabecera y ajustes de personaje

- Componente común public/paperdoll.js en el perfil y en la pestaña Equipamiento de la ficha: columnas de objetos a izquierda y derecha, personaje en el centro, armas debajo y estadísticas al pie; nivel de objeto medio, ranuras registradas y origen. La calidad solo tiñe marco y nombre. Ranuras vacías con estado sereno; sin objetos ni estadísticas inventados.
- Disposición y lista de estadísticas definidas por versión de juego en armory-catalog.js. Imagen del personaje solo desde rutas locales (la CSP bloquea imágenes externas); hoy se muestra silueta con el emblema de clase.
- Migración 008 aditiva: `characters.stats` (JSON, solo para un futuro proveedor). Copias de seguridad en base 8, compatibles con 5–7.
- Cabecera del perfil rediseñada (marco con esquinas, emblema circular con distintivo Main, indicadores en franja con anillo de asistencia, botón «Salir» compacto). Tarjetas de personaje con «Ver ficha» y menú «Ajustes» (editar, marcar Main, archivar) que se cierra al pulsar fuera o con Escape.
- Validación: 77 pruebas Node, workerd y build; navegador con sesión QA y objetos ficticios solo en memoria a 1440/1024/768/390/320 sin desbordamiento ni errores.
- Publicado: `1c039e4`; backend 38715402437, Pages 38715383010 y validación 38715383021 correctos. Módulos servidos idénticos al local; /api/public conserva 23 personajes y el progreso tras la migración 008; /perfil pide sesión.

## 2026-10-15 — Perfil convertido en panel personal

- /perfil abre directamente la armería del personaje Main: mosaico de ranuras y tarjetas de lista BiS (progreso conseguido/prioritario), guías comprobadas y datos pendientes de la ficha, todas enlazadas a la ficha completa.
- Cabecera con emblema de clase, rango, asistencia y número de personajes como indicadores compactos; selector de personaje sin recarga.
- Menú fijo de secciones (Mi armería, Personajes, Wishlist, Botín, Convocatorias) con URL #sección, historial del navegador, animación de entrada, esqueleto de carga y movimiento reducido respetado. Todo a uno o dos clics.
- Personajes en tarjetas por clase (Ficha, Editar, Marcar Main, Archivar) y formulario plegable. Se reutilizan las APIs, la wishlist, el historial de loot, el consejo y las convocatorias existentes; sin cambios de backend ni datos.
- Validación: 77 pruebas Node, workerd y build; navegador con sesión QA a 1440/1024/768/390/320 sin desbordamiento ni errores, navegación por menú, atrás, cambio de personaje, edición y enlace a la lista BiS.
- Publicado: `fbff490`; backend 38713389293, Pages 38713376625 y validación 38713376874 correctos; módulos servidos idénticos al local; /perfil pide sesión (401). Pendiente de revisión del propietario con su sesión.

## 2026-10-15 — Armería, listas BiS y guías (rama feature/armeria, sin publicar)

- Ficha por personaje en `/armeria` (Resumen, Equipamiento, Mi BiS, Guías, Revisiones), enlazada desde el perfil y el roster del panel; Panel → Guías externas para el Líder.
- Migración 007 aditiva: amplía `characters` y crea equipamiento, listas/entradas BiS, proveedores y enlaces de guías, revisiones y notas internas. Copias de seguridad en base 7, compatibles con 5 y 6.
- Sin objetos, equipamiento, listas ni enlaces de guía precargados; solo los tres proveedores. WoW Forever marcado como provisional en el catálogo. Detalle en docs/ARMORY.md.
- Validación: 77 pruebas Node (6 nuevas de Armería y 2 de copias) y prueba workerd; navegador con sesión QA: recorrido completo, permisos y anchos 1440/1024/768/390/320 sin desbordamiento ni errores JS.
- Publicado con autorización del propietario: merge `33f0672` en main; backend `38658863757`, Pages `38658853228` y validación `38658853322` correctos. Los módulos de Armería, app.js y theme.css servidos idénticos al local; /armeria, /api/armory/* y panel/perfil responden 401 sin sesión; /api/public conserva los 23 personajes y el progreso real tras la migración 007; páginas públicas a 1440/390 sin regresiones.
- No se ha abierto una ficha real con sesión de Discord en producción: pendiente de prueba del propietario. Ningún enlace de guía cargado todavía.

## 2026-10-15 — Estados vacíos honestos en Asistencia, Loot y Wishlists

- El propietario señaló la tarjeta grande «Sin resultados · No hay registros que coincidan con esta búsqueda» en secciones que todavía no tienen datos (no hay APIs/catálogo de objetos ni de raids de Forever).
- Cuando la lista no tiene ningún registro se muestra un aviso compacto que explica la situación, sin buscador ni paginación vacíos: Asistencia (se anota a mano; sin conexión con registros de combate), Loot (asignación manual; sin catálogo verificado de objetos/bosses) y Wishlists (cada miembro desde su perfil; objetos escritos a mano). «Sin resultados» se conserva solo cuando una búsqueda o un filtro no encuentran coincidencias.
- Cambio en operations-ui.js (parámetro opcional de `paginated`) y estilo `.empty-note` en theme.css. Sin cambios de APIs ni datos.
- Validación: 69 pruebas Node, workerd y build; navegador local con sesión QA: avisos en las tres pestañas y en el historial de loot del perfil, «Sin resultados» al filtrar asistencia y al buscar en el roster, 1440/390 px sin errores.
Publicado: `7628b5a`; backend `38652910420`, Pages `38652910475` y validación `38652910464` correctos; theme.css y operations-ui.js servidos idénticos al local.
