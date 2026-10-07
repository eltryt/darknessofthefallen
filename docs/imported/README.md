> Historical document from the supplied project ZIP. Statements about other repositories and prior permissions are background, not instructions for this migration.

# Darkness of the Fallen

Guild hub for WoW Forever. Spanish interface, Alliance, Discord-only identity.

## Run

Requires Node.js 24+. No external runtime packages, CDN assets or package install required.

```sh
node src/server.mjs
node --test tests/*.test.mjs
node scripts/build.mjs
node scripts/backup.mjs
```

Open http://localhost:3000. Copy `.env.example` to `.env` and configure locally. Never commit `.env`, the database, backups or tokens. `APP_ORIGIN` must equal the browser origin exactly. SQLite data defaults to `data/guild.sqlite`. No sample users or fake statistics are created.

## Architecture

- Native Node HTTP application with a small modular JSON API; browser uses ES modules and semantic HTML/CSS.
- SQLite with WAL, foreign keys, prepared statements, versioned SQL migrations. Database access remains server-only.
- Domain validation / RBAC in `src/domain.mjs`; Discord authorization / sessions in `src/auth.mjs`; data migration and configuration in `src/db.mjs`.
- `src/integrations.mjs` defines provider boundaries for character data, raids and logs. Manual data is authoritative until verified providers are configured.
- Thin frontend with no privileged state in localStorage. Server denies direct URL/API access independently of UI visibility.
- Free local runtime. Planned cloud target: Cloudflare Workers + D1 free tier, requiring a D1 repository adapter before production. The current Node SQLite server is NOT directly deployable as a Worker. Do not mark cloud phase complete until adapter and deployment are verified.
- Existing Sites identity: `appgprj_6ac53fab059c8191bbdaab52a6e9b211`; repository access failed due to network restrictions. No existing remote source was overwritten.

## Discord configuration

In the Discord Developer Portal configure the exact redirect `${APP_ORIGIN}/auth/discord/callback`. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_LEADER_ID` and `DISCORD_ROLE_MAP` JSON. No local password accounts. Roles default to visitor, never member/admin by first login. OAuth uses `identify guilds.members.read`; guild membership is required. Roles synchronize at login. Sessions expire after 30 minutes; continuous role revocation sync remains pending. Production requires HTTPS with secure cookies. State is random, hashed, expiring, one-use and bound to an HttpOnly cookie. Tokens are used transiently and never stored/logged.

Recruitment webhook must target a private officers channel. Its URL is an environment secret; public settings never contain it. Outbox retries run every minute, up to five attempts. Mentions are disabled to prevent candidate-controlled pings. Officer/leader role mentions and administrative failed-delivery management remain pending.

## Privacy and security

Public characters have ONLY name/class/role. Attendance API restricts members to their user ID. Recruitment is officer+. Export is leader-only and omits sessions/OAuth states. Unknown permissions/ranks fail closed. Mutations require matching Origin, JSON and CSRF token for authenticated requests. Parameterized SQL, output escaping, CSP and body limits apply. In-memory rate limiting is single-process only; distributed limiter is required for cloud. Never trust forwarded IP headers without explicit trusted proxy configuration.

## Backup / restore

`node scripts/backup.mjs` uses the SQLite online-backup API (consistent with WAL). Copy backups to a separate private device/provider and retain daily/weekly generations. A local copy alone does not protect against device loss. To restore: stop the server; keep a copy of the current database directory; copy a verified backup to a NEW database path; set `DATABASE_PATH` to that path; run tests and start; verify counts and representative records. Do not overwrite an active database or mix an old main database with current WAL files. JSON export is portable and includes version metadata; JSON import is NOT implemented. Encrypted offsite backup scheduling remains pending.

## Development and deployment

Read `PROJECT_STATUS.md` first. Keep coherent commits. Private GitHub repository: https://github.com/Borjaglcode/MonkWOW. Darkness and both previous MonkWOW histories are preserved, with dedicated archive branches. See PROJECT_STATUS.md for verified recovery and CI details. Build checks syntax and copies the public shell for inspection, not a production bundle. Deploy full Node app only on a host with persistent storage; static-only hosting cannot run this backend. Do not purchase a service or enable paid usage. Cloudflare adapter and hosted migration plan need completion before the production release.

## Verified official references

- Discord OAuth: https://discord.com/developers/docs/topics/oauth2
- Discord user membership: https://github.com/discord/discord-api-docs/blob/main/developers/resources/user.mdx
- Raid-Helper documentation: https://www.raid-helper.dev/documentation/intro
- Raid-Helper API candidate: https://raid-helper.dev/documentation/api — endpoint/plan eligibility must be verified before implementing synchronization; no scraping.

See project status for incomplete modules; this is an early functional development version, not version 1.0.
