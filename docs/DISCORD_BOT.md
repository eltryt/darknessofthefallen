# Bot de Discord para avisos de convocatoria

Los mensajes privados de las alineaciones los envía un bot propio de la hermandad. Un webhook
no puede escribir por privado y Raid-Helper no ofrece una API documentada para hacerlo.
Sin el bot, las convocatorias funcionan igual (tablero, perfiles y asistencia) y quedan
marcadas como «Sin aviso».

## Crear el bot (lo hace el propietario)

1. Entra en https://discord.com/developers/applications → **New Application** → nombre
   «Darkness of the Fallen».
2. Pestaña **Bot**: desactiva **Public Bot** para que nadie más pueda invitarlo. No hace falta
   activar ningún _Privileged Gateway Intent_.
3. En la misma pestaña, **Reset Token** y copia el token. Es una contraseña: no lo pegues en
   el chat ni en el repositorio.
4. Pestaña **OAuth2 → URL Generator**: marca el ámbito `bot` y ningún permiso. Abre la URL
   generada y añade el bot a tu servidor. Para escribir por privado solo necesita compartir
   servidor con el jugador.
5. Guarda el token como secreto de GitHub desde una terminal propia:

   ```bash
   gh secret set DISCORD_BOT_TOKEN -R eltryt/darknessofthefallen
   ```

   Pega el token cuando lo pida. `DISCORD_GUILD_ID` ya existe por Raid-Helper.

6. Lanza **Deploy backend to Cloudflare**. El paso «Configure Discord bot private messages»
   comprueba el token y que el bot está en el servidor, e instala el secreto en el Worker
   sin imprimirlo.

## Funcionamiento

- Panel → Raids → **Alineación** en una convocatoria: inscritos de Raid-Helper, grupos de 5
  según la capacidad (20 → 4 grupos, 40 → 8) y banquillo. Arrastrar con ratón, asa ⠿ en
  pantallas táctiles o el selector «Mover a…».
- **Enviar convocatoria**: crea o actualiza la convocatoria de cada jugador y encola el
  mensaje privado. Si se reenvía, solo reciben aviso quienes cambian de puesto o salen.
- Entrega: cola persistente con reintentos (límite de Discord 429 y errores 5xx). Un fallo
  después de que Discord pudo recibir el mensaje queda «sin confirmar» y no se repite.
  Jugadores con los privados cerrados quedan «Aviso fallido» con el motivo.
- Perfil → Convocatorias muestra al jugador su grupo y el estado de la asistencia.
- Tras la raid, **Confirmar asistencia** (prerrellenado: grupos «Asistió», banquillo
  «Reserva») guarda la asistencia con el mismo sistema de Panel → Asistencia. Solo cuenta
  para jugadores con cuenta y personaje en la web.

## Limitaciones

- Discord solo entrega privados a quien comparte servidor con el bot y permite mensajes
  directos de miembros del servidor (ajuste de privacidad de cada jugador).
- La alineación vive en la web; no se modifica la inscripción en Raid-Helper.
- Los inscritos sin cuenta en la web reciben el aviso, pero su asistencia no puede
  registrarse hasta que entren con Discord y creen un personaje.

## Inscripciones a convocatorias con el bot propio

El mismo bot puede publicar las convocatorias en Discord en lugar de Raid-Helper, con un botón
por clase y los iconos de clase y especialización de la web. Todo se edita en
**Panel → Convocatorias → Bot de inscripciones en Discord** (Oficiales y Líder):

1. **Conectar con Discord y subir iconos**: lee la aplicación del bot, sube los 35 iconos de
   `public/assets/icons` como emojis de la aplicación (no ocupan huecos del servidor) y apunta
   los botones de Discord a `https://darknessofthefallen.com/api/discord/interactions`.
   Se puede pulsar otra vez sin duplicar nada.
2. **Dar permisos al bot en el servidor**: el enlace pide Ver canal, Enviar mensajes, Insertar
   enlaces, Leer el historial y Usar emojis externos. En el canal de convocatorias tienen que
   estar permitidos.
3. Indicar el canal (vacío: el de Raid-Helper), el rol a mencionar y activar «Publicar las
   convocatorias nuevas con este bot». Las de Raid-Helper ya publicadas siguen como estaban.

Desde el editor se cambian clases, especializaciones, iconos (de la web, emoji estándar o
`<:nombre:id>` del servidor), roles y sus límites, límite por clase, opciones extra (suplente,
tentativo, ausente), texto, imagen, color, pie, agrupación por clase o rol y el cierre de
inscripciones antes del inicio. Al guardar, los mensajes de las convocatorias abiertas se
editan en Discord en unos segundos. El título, horario, plazas y texto de cada convocatoria se
editan en su ficha; cancelarla borra su mensaje.

Funcionamiento:

- Solo se apuntan quienes tienen un **personaje registrado en la web**: para una clase, un
  personaje de esa clase (el principal si hay varios); para suplente, tentativo o ausente,
  cualquier personaje. Si no, el bot responde en privado con el enlace a /perfil. La inscripción
  queda vinculada a ese personaje para la alineación y la asistencia.
- Clase con varias especializaciones → menú privado para elegir una. Las plazas van por orden
  de llegada; por encima del límite de la raid, del rol o de la clase se queda en cola y sube
  sola cuando alguien se retira.
- Discord firma cada pulsación (Ed25519) y la web la comprueba con la clave pública de la
  aplicación; no hace falta Gateway ni ningún servidor encendido aparte del Worker.
- Si Discord no responde al publicar, se reintenta buscando antes el mensaje en el canal, para
  no publicarlo dos veces. Sin permisos en el canal, la convocatoria queda «Requiere revisión»
  con el motivo y se reintenta desde la web.
