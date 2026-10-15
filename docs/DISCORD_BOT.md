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
