# Activar el acceso con Discord

1. Abrir https://discord.com/developers/applications y crear o elegir la aplicación
   **Darkness of the Fallen**. No se necesita un bot ni permisos de administrador
   del servidor para este inicio de sesión OAuth.
2. En **OAuth2 → Redirects**, añadir y guardar exactamente:

   ```text
   https://darknessofthefallen-backend.eltryt-darknessofthefallen.workers.dev/auth/discord/callback
   ```

3. En los [secretos de Actions](https://github.com/eltryt/darknessofthefallen/settings/secrets/actions),
   crear cuatro **Repository secrets**:

   | Nombre | Valor |
   | --- | --- |
   | `DISCORD_CLIENT_ID` | Application ID / Client ID de la aplicación |
   | `DISCORD_CLIENT_SECRET` | Client Secret de OAuth2, no el token de un bot |
   | `DISCORD_GUILD_ID` | ID del servidor de Discord de la hermandad |
   | `DISCORD_LEADER_ID` | ID de tu usuario de Discord, que recibirá el rango líder |

   Para copiar IDs de servidor y usuario: Discord → Ajustes → Avanzado →
   Modo desarrollador; después clic derecho en servidor/usuario → Copiar ID.
   Introducir credenciales únicamente en los secretos, nunca en commits o chats.

4. Ejecutar **Actions → Configure Discord login → Run workflow**. El flujo
   instala las credenciales en el Worker existente y comprueba el redirect OAuth
   por HTTPS. No cambia los datos de la hermandad ni publica secretos en Pages.
5. Abrir https://darknessofthefallen-backend.eltryt-darknessofthefallen.workers.dev/login
   y autorizar con tu cuenta. Debes pertenecer al servidor configurado.
   Comprobar el acceso al perfil y al panel con el rango líder. El consentimiento
   y la pertenencia real no se pueden verificar mediante una prueba simulada.

## Rangos del resto de miembros

Opcionalmente crear `DISCORD_ROLE_MAP` como secreto con un objeto JSON que mapee
IDs de roles de Discord a `member`, `raider`, `raid_leader`, `officer` o `leader`.
Ejemplo de estructura (sustituir el ID por el real):

```json
{"123456789012345678":"member"}
```

Sin coincidencia, se asigna `visitor`; no se promociona automáticamente al primer
usuario. El usuario de `DISCORD_LEADER_ID` recibe el rango líder explícitamente.
Omitir el mapa en GitHub conserva el mapa remoto existente. Para vaciarlo de forma
intencional, guardar `{}` y ejecutar de nuevo el flujo. Los rangos se actualizan
al iniciar sesión otra vez con Discord.

El webhook privado de candidaturas es una integración independiente y opcional.
