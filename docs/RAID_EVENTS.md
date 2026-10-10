# Convocatorias con Raid-Helper

Auditoría de documentación oficial: 10 de octubre de 2026.

## Decisión y fuentes

Reutilizamos Raid-Helper, que ya utiliza la hermandad. Su documentación **actual**
soporta lectura y escritura oficiales; no hay motivo para crear un segundo bot.

- API oficial: https://raid-helper.dev/documentation/api
- Precios publicados: https://raid-helper.dev/premium/
- Alternativa Discord HTTP Interactions: https://docs.discord.com/developers/interactions/receiving-and-responding
- Mensajes y deduplicación limitada con nonce: https://docs.discord.com/developers/resources/message

La documentación de Raid-Helper se sirve en una aplicación JavaScript. Se consultó
el contenido de la sección API oficial, no se dedujeron endpoints privados del dashboard.
El ejemplo público de evento que ofrece la documentación devolvió 404: no se consideró
una prueba real del esquema de vuestro servidor.

| Capacidad | API documentada |
| --- | --- |
| Listar eventos publicados del servidor | GET `/api/v4/servers/{server}/events` |
| Listar eventos programados aún no publicados | GET `/api/v4/servers/{server}/scheduledevents` (no importados en esta tanda) |
| Detalle con clases, specs, roles e inscripciones | GET `/api/v4/events/{id}` |
| Crear convocatoria/mensaje interactivo | POST `/api/v4/servers/{server}/channels/{channel}/event` |
| Modificar / eliminar convocatoria | PATCH / DELETE `/api/v4/events/{id}` |
| Añadir inscripción | POST `/api/v4/events/{id}/signups` |
| Editar / retirar inscripción | PATCH / DELETE `/api/v4/events/{id}/signups/{signup}` |

Cabecera `Authorization`: clave del **servidor Raid-Helper**, obtenida con `/apikey`
por un administrador con los permisos exigidos por Raid-Helper. No es el secreto
OAuth, token personal de Discord ni token de bot. No se solicitan claves individuales.
Listado paginado con cabecera `Page`, máximo documentado de 1000 eventos por página;
`ChannelFilter` limita al canal elegido. El adaptador exige páginas completas y
rechaza respuestas inválidas. No hay una cuota numérica estable indicada en la
sección consultada: no se inventa. Se respeta `Retry-After`/429 y se limita el trabajo.

Los webhooks `event.create`, `event.update` (incluye inscripciones), `event.delete`
y `comp.update` requieren **Premium**. No los activamos. La API consultada no marca
los endpoints básicos anteriores como Premium; se comprueba el acceso real antes
de instalar la clave. Eventos nativos de Discord y anuncios de composición que se
actualizan/permiten confirmar también se documentan como Premium.

Precios publicados en esa fecha por servidor: 10 € / 3 meses, 15 € / 6 meses,
25 € / 12 meses, 55 € vitalicio, pagos únicos. Pueden cambiar: consultar checkout.
No se ha contratado ningún servicio. La implementación usa polling y los Workers /
Durable Object existentes; su consumo sigue sujeto a cuotas y facturación de Cloudflare.

Un bot propio con Interactions HTTP también sería viable sin Gateway, verificando
Ed25519 y respondiendo en 3 segundos (tokens de interacción 15 minutos). Requeriría
bot, instalación/permisos, registro de comandos y mantener otra lógica de inscripción.
No se implementa ni se solicita ese acceso porque Raid-Helper cubre la integración.

## Fuentes de verdad y alcance

- **Raid-Helper:** eventos, organizador, horarios, capacidad, límites de roles,
  opciones de plantilla e inscripciones. Discord usa sus comandos y botones actuales.
- **Web SQLite existente:** clasificación (Oficial/Extraordinaria/Voluntaria), nombre
  libre del roster, visibilidad pública, vínculo explícito con personaje registrado,
  cola, auditoría y copia del último estado confirmado por Raid-Helper.
- El identificador local estable también se utiliza en `raids` para asistencia/loot.
  Los registros manuales anteriores se conservan, pero los importados no se editan
  desde el endpoint manual. No hay migración a D1 ni nueva base de datos externa.
- Los eventos creados en Discord se importan **privados y sin clasificar**. Un
  responsable clasifica/elige visibilidad una vez; no vuelve a introducir fecha,
  inscritos ni cambios. La clasificación local no se reescribe desde Discord.
- Los eventos web incluyen una referencia `[DOTF:UUID]` en la descripción para
  reconciliar una creación cuya respuesta se pierda. No contiene credenciales.
- El enlace guardado es al **mensaje de Raid-Helper**. No se promete un Scheduled
  Event nativo de Discord, ni sincronización de eventos ajenos al canal configurado.
- No importamos futuros borradores/repeticiones aún no publicados: cuando Raid-Helper
  publica el mensaje, aparece en la siguiente sincronización.

## Funcionamiento y sincronización

Panel → Raids permite crear, clasificar, cambiar horarios/capacidad/límites de los
roles de la plantilla, administrar inscripciones y cancelar convocatorias. Miembros
usan `/raids` o su perfil para consultar y apuntarse con un personaje propio registrado.
Las fechas del formulario son **Europe/Madrid**, independientemente del dispositivo;
se almacenan en UTC. Horas inexistentes o ambiguas del cambio de hora se rechazan
con explicación. El calendario no limita días. La finalización se deriva del fin.

La API web devuelve 202 al guardar una operación. El formulario muestra que sigue
pendiente; no presenta la escritura como confirmada antes de recibirla de Raid-Helper.
El Durable Object programa alarmas: escrituras pendientes desde 15 segundos, lectura
periódica cada 5 minutos. Node ejecuta el mismo sincronizador cada minuto.
Cada tanda procesa una escritura y hasta 16 detalles; conjuntos grandes se recorren
con cursor. El intervalo real aumenta si hay fallos, rate limits o mucha actividad.
La interfaz refresca cada 30 segundos sin cerrar un formulario o detalle abierto.

- Clave idempotente por envío y una operación pendiente por evento.
- Índice único por ID externo; repetir importaciones no crea otro evento local.
- Lease persistente para evitar sincronizadores concurrentes.
- GET 404 del detalle confirma retirada; una lista incompleta o un timeout **no**
  cancela eventos. Eventos ya terminados se conservan como finalizados.
- Se relee el evento antes de escribir y se vuelven a comprobar autor y permisos.
  `lastUpdated`, cuando existe, permite rechazar cambios externos concurrentes.
  Raid-Helper no documenta CAS/ETag para escritura: existe una ventana residual de
  carrera entre GET y PATCH; la siguiente lectura converge al estado remoto.
- 429 se reintenta con espera. Errores de acceso/validación quedan bloqueados para
  revisión. Una respuesta perdida tras escritura se marca `uncertain`; se busca el
  resultado remoto. **No se repite automáticamente un POST ambiguo**, pues la API no
  documenta idempotencia. Si no aparece el resultado, requiere revisión técnica;
  no basta pulsar «Reintentar» para crear otro mensaje. Prioridad: no duplicar.
- No hay websocket ni webhook propio recibido: no hay interacción entrante sin
  firma que verificar. El tráfico remoto sale por HTTPS al host oficial fijo,
  sin seguir redirects con la clave.

## Inscripciones, privacidad y permisos

- La clase/spec/opción se toma de la plantilla remota, sin inventar IDs o botones.
  Las clases principales se validan contra el personaje registrado (nombre español
  o inglés estándar). El jugador selecciona su spec de la plantilla explícitamente.
- `primary` en una clase principal se presenta como Confirmado; `queued` y Bench
  como Suplente; Absence como Ausente; Tentative y opciones no interpretables como
  Pendiente de confirmación. «Confirmado» significa inscripción activa en Raid-Helper,
  **no** aprobación de un oficial ni asistencia histórica. No se impone una norma nueva.
- Cancelar elimina la inscripción remota y conserva su historial como Cancelado.
- Nombres importados de Discord no se convierten automáticamente en personajes.
  Solo una selección autorizada de un personaje existente crea un vínculo. Si cambia
  la inscripción externa, el vínculo se retira para no asociar el personaje equivocado.
- La suplencia/promoción y reparto de plazas los decide la configuración de Raid-Helper;
  no se añade una segunda política local. Los límites de roles son opcionales, según
  los roles que contenga la plantilla. No se fija una composición de 10/20/40.
- Un miembro modifica solo su inscripción. Raid leader administra solo eventos de los
  que es responsable remoto; Oficiales y Líder administran todos. Visitantes solo ven
  resúmenes expresamente públicos, sin usuarios, personajes ni enlaces privados.
- Eventos con `allowed_roles`/`banned_roles` se mantienen fuera del acceso de miembros
  por la web, salvo sus responsables: la inscripción se remite a Discord, que sí puede
  comprobar esas restricciones actuales. No se intenta saltarlas usando la clave admin.
- Origen, CSRF, sesión y permisos se validan en backend. La clave no llega al navegador.
- El login existente conserva su límite actual: rol/membresía se actualiza al iniciar
  sesión, no instantáneamente al cambiar roles en Discord.

## Configuración y despliegue

1. En GitHub Actions guardar `RAID_HELPER_API_KEY` como secreto de repositorio.
2. Se reutiliza `DISCORD_GUILD_ID` ya configurado; no cambiar los secretos OAuth.
3. Canal confirmado: `1550997172982382723`, variable de Wrangler.
4. Plantilla oficial WoW Forever de la documentación: `wowforever`.
   Se puede cambiar `RAID_HELPER_TEMPLATE_ID` por la plantilla de la hermandad.
5. Ejecutar **Deploy backend to Cloudflare**. El workflow comprueba lectura autenticada,
   instala solo la nueva clave con `wrangler secret bulk`, despliega y comprueba login.
   Si no se aporta la clave, conserva la configuración remota previa.
6. Abrir la web dispara la programación inicial de alarmas (el smoke de despliegue
   ya hace peticiones HTTP). Comprobar «Última sincronización» en Panel → Raids.
7. En Discord mantener los permisos de Raid-Helper restringidos a responsables autorizados.
   La web no puede cambiar las reglas de autorización del bot de terceros.

Desarrollo local: `npm ci`, variables de `.env.example`, `npm start` (Node 24) o
`npm run dev:backend` con `.dev.vars` local ignorado por Git. No registrar secretos.
Comprobaciones: `npm test`, `npm run test:backend`, `npm run build`,
`npm run build:backend`. No hay dependencias npm nuevas.

## Verificación y límites de entrega

Automatizadas con proveedor simulado: importación, creación/POST perdido sin duplicar,
permisos/CSRF, propietario remoto cambiado, horarios/DST, inscripción/cambio de personaje,
cancelación, suplentes, recuperación 429/503, privacidad y paginación.
Chromium local: creación y clasificación, inscripción de miembro, controles por rango,
ancho 1440/768/390/320. Estos resultados **no equivalen** a pruebas reales en Discord.
Registrar en PROJECT_STATUS los resultados reales de conexión y las pruebas externas
que falten antes de considerar completamente aceptada la integración.

El workflow manual **Verify Raid-Helper real integration** ejecuta los handlers web
con una base efímera y la API real: crea un único mensaje marcado PRUEBA TÉCNICA,
prueba cambios/inscripciones y lo elimina en `finally`. Solo usa el ID del propietario
para un participante de prueba y personajes registrados explícitamente en esa base
local desechable; no crea perfiles ni sesiones en producción. No sustituye probar
los botones de Discord con una sesión real del usuario. No se ejecuta en cada deploy.

La documentación declara las plantillas como objetos `{id, name, image}`.
El ID para esta guild es **`wowforever`**, no el número de la imagen/emoji.
La primera prueba usó por error ese número y recibió `401 locked template`; se
corrigió el identificador. No se infiere de ese error un requisito Premium.
