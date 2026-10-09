# Activar el acceso con Discord

1. Abrir https://discord.com/developers/applications y crear o elegir la aplicación
   **Darkness of the Fallen**. No se necesita un bot ni permisos de administrador
   del servidor para este inicio de sesión OAuth.
2. En **OAuth2 → Redirects**, añadir y guardar exactamente:

   ```text
   https://darknessofthefallen.eltryt-darknessofthefallen.workers.dev/auth/discord/callback
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
5. Abrir https://darknessofthefallen.eltryt-darknessofthefallen.workers.dev/login
   y autorizar con tu cuenta. Debes pertenecer al servidor configurado.
   Comprobar el acceso al perfil y al panel con el rango líder. El consentimiento
   y la pertenencia real no se pueden verificar mediante una prueba simulada.

## Rangos del resto de miembros

Los roles confirmados están versionados en `.github/workflows/discord.yml`,
en la variable `DISCORD_ROLE_MAP`. Son IDs públicos, no credenciales. El flujo
los instala en Cloudflare junto a las credenciales guardadas en GitHub Secrets.

| Rol de Discord | ID | Rango web |
| --- | --- | --- |
| Miembro | `1550998252449435662` | `member` |
| Raider | `1550998241917534248` | `raider` |
| Raid Leader | `1550998186162782218` | `raid_leader` |
| Oficial | `1550998307801927802` | `officer` |

Para cambiar la asignación, editar ese mapa y ejecutar **Configure Discord login**.
Este flujo usa el mapa versionado, no un secreto `DISCORD_ROLE_MAP` de GitHub.
Si alguien tiene varios roles, recibe el mayor rango de los asignados.
Sin coincidencia, se asigna `visitor`; no se promociona automáticamente al primer
usuario. El usuario de `DISCORD_LEADER_ID` mantiene su rango líder explícito.
Los rangos se actualizan al cerrar sesión e iniciar sesión otra vez con Discord.

El webhook privado de candidaturas es una integración independiente y opcional.
