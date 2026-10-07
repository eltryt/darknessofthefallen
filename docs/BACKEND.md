# Backend Node.js y SQLite

Estas funciones requieren ejecutar `npm start` en un servidor con almacenamiento persistente. GitHub Pages solo publica el contenido estático. El código actual proviene de darkness-of-the-fallen-proyecto.zip e incluye las operaciones de raids, asistencia, loot, wishlist, consejo y progreso, con migración SQL 002.

## Discord configuration

In the Discord Developer Portal configure the exact redirect `${APP_ORIGIN}/auth/discord/callback`. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_LEADER_ID` and `DISCORD_ROLE_MAP` JSON. No local password accounts. Roles default to visitor, never member/admin by first login. OAuth uses `identify guilds.members.read`; guild membership is required. Roles synchronize at login. Sessions expire after 30 minutes; continuous role revocation sync remains pending. Production requires HTTPS with secure cookies. State is random, hashed, expiring, one-use and bound to an HttpOnly cookie. Tokens are used transiently and never stored/logged.

Recruitment webhook must target a private officers channel. Its URL is an environment secret; public settings never contain it. Outbox retries run every minute, up to five attempts. Mentions are disabled to prevent candidate-controlled pings. Officer/leader role mentions and administrative failed-delivery management remain pending.

## Privacy and security

Public characters have ONLY name/class/role. Attendance API restricts members to their user ID. Recruitment is officer+. Export is leader-only and omits sessions/OAuth states. Unknown permissions/ranks fail closed. Mutations require matching Origin, JSON and CSRF token for authenticated requests. Parameterized SQL, output escaping, CSP and body limits apply. In-memory rate limiting is single-process only; distributed limiter is required for cloud. Never trust forwarded IP headers without explicit trusted proxy configuration.

## Backup / restore

`node scripts/backup.mjs` uses the SQLite online-backup API (consistent with WAL). Copy backups to a separate private device/provider and retain daily/weekly generations. A local copy alone does not protect against device loss. To restore: stop the server; keep a copy of the current database directory; copy a verified backup to a NEW database path; set `DATABASE_PATH` to that path; run tests and start; verify counts and representative records. Do not overwrite an active database or mix an old main database with current WAL files. JSON export is portable and includes version metadata; JSON import is NOT implemented. Encrypted offsite backup scheduling remains pending.
