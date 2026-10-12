# Backend Node.js y SQLite

Estas funciones requieren ejecutar `npm start` en un servidor con almacenamiento persistente. GitHub Pages solo publica el contenido estático. El código actual proviene de darkness-of-the-fallen-proyecto.zip e incluye las operaciones de raids, asistencia, loot, wishlist, consejo y progreso, con migración SQL 002.

## Discord configuration

In the Discord Developer Portal configure the exact redirect `${APP_ORIGIN}/auth/discord/callback`. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_LEADER_ID` and `DISCORD_ROLE_MAP` JSON. No local password accounts. Roles default to visitor, never member/admin by first login. OAuth uses `identify guilds.members.read`; guild membership is required. Roles synchronize at login. New sessions expire after seven days (persistent HttpOnly/Secure cookie and matching server expiry); existing sessions retain their original expiry until the next login; continuous role revocation sync remains pending. Production requires HTTPS with secure cookies. State is random, hashed, expiring, one-use and bound to an HttpOnly cookie. Tokens are used transiently and never stored/logged.

Recruitment webhook must target a private officers channel. Its URL is an environment secret; public settings never contain it. Outbox retries run every minute, up to five attempts. Mentions are disabled to prevent candidate-controlled pings. Officer/leader role mentions and administrative failed-delivery management remain pending.

## Privacy and security

Public characters have ONLY name/class/role. Attendance API restricts members to their user ID. Recruitment is officer+. Export is leader-only and omits sessions/OAuth states. Unknown permissions/ranks fail closed. Mutations require matching Origin, JSON and CSRF token for authenticated requests. Parameterized SQL, output escaping, CSP and body limits apply. In-memory rate limiting is single-process only; distributed limiter is required for cloud. Never trust forwarded IP headers without explicit trusted proxy configuration.

## Backup / restore

Ver [Copias y recuperación](RECOVERY.md). La exportación del líder ahora incluye
formato versionado y checksum; `npm run restore -- copia.json` ensaya su recuperación
en memoria. `npm run backup` solo copia una base Node local existente, no Cloudflare.
Las copias externas siguen siendo manuales; no hay restauración pública sobre producción.
