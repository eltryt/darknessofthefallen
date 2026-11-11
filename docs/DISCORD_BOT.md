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

La hermandad ya no usa Raid-Helper para convocatorias nuevas: en cuanto el token del bot está
instalado, todas las convocatorias que se crean en la web las publica este bot. Las de
Raid-Helper anteriores se quedan como historial.

Todo está en **Panel → Convocatorias → 🤖 Bot de inscripciones en Discord** (Oficiales y Líder).

### Puesta en marcha (una vez)

1. **Conectar con Discord**: sube los iconos de la web (clases, especializaciones y los de rol
   de WoW) como emojis de la aplicación y conecta los botones de Discord con
   `https://darknessofthefallen.com/api/discord/interactions`. Discord limita cuántos emojis
   se suben seguidos: si faltan, el paso lo dice; se vuelve a pulsar al cabo de un minuto.
2. **Dar permisos**: el enlace pide Ver canal, Enviar mensajes, Insertar enlaces, Leer el
   historial y Usar emojis externos.
3. **Canal**: el ID del canal de convocatorias (vacío: el de siempre).

Cuando está todo, la puesta en marcha se pliega y el editor queda en una línea.

### Cómo se apunta un jugador

1. Entra en la web con su cuenta de Discord.
2. En **Mi perfil → Personajes** pulsa **Actualizar desde Battle.net**.
3. En la convocatoria de Discord pulsa **✅ Apuntarme**.

Solo cuentan los personajes **validados con Battle.net** (importados desde Mi perfil). Con uno
solo, entra directamente con su clase y la especialización guardada en la web; con varios,
elige personaje en un menú privado; si la web no sabe su especialización, la elige en otro.
La respuesta privada permite cambiarla. Suplente, Tentativo y Ausente piden también un
personaje validado. Sin él, el bot responde en privado con los tres pasos y el enlace a Mi
perfil, y el mensaje de cada convocatoria lo recuerda. Desde la web se aplica la misma regla.

Las plazas van por orden de llegada; por encima del límite de la raid, del rol o de la clase
se queda en cola y sube solo cuando alguien se retira.

### Ajustes (plegados)

«⚙️ Ajustes del mensaje, roles y clases»: texto por defecto, rol a mencionar, cierre de
inscripciones, color, imagen, pie, agrupación por clase o rol; roles con su icono y máximo;
clases con su icono, máximo y especializaciones (icono y rol de cada una); y los botones extra.
Al guardar, se actualizan los mensajes de las convocatorias abiertas. «Restaurar plantilla por
defecto» vuelve a las 9 clases con sus iconos. El título, horario, plazas y texto de cada
convocatoria se editan en su ficha; cancelarla borra su mensaje.

### Seguridad y fallos

- Discord firma cada pulsación (Ed25519) y la web la comprueba con la clave pública de la
  aplicación; no hace falta Gateway ni otro servidor aparte del Worker.
- Si Discord no responde al publicar, se reintenta buscando antes el mensaje en el canal, para
  no publicarlo dos veces. Sin permisos en el canal, la convocatoria queda «Requiere revisión»
  con el motivo.
