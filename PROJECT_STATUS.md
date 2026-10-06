# Project status — 2026-10-07

## Current state
Initial local functional development build. NOT a finished release and NOT publicly deployed.

## Completed
- Local Git checkout, zero external dependency Node 24 stack, modular API and SQLite schema.
- Public responsive pages: home, about, roster filters, raid information, recruitment, contact, login status.
- Server RBAC for visitor/member/raider/raid_leader/officer/leader, direct URL enforcement, privacy projection.
- Discord OAuth code/state flow, guild membership check, mapped roles, secure-cookie support, short hashed sessions and CSRF. Live provider test pending credentials.
- Character creation, multiple characters per account, atomic single Main, owner checks, profiles and own attendance metrics.
- Leader configuration for identity, server/ruleset/days/hours, recruitment state, composition goals, Discord invitation and loot method.
- Officer recruitment pipeline, notes/history, private notification outbox, audit API, JSON export, SQLite backup command.

## Partial / pending
- Phases 0–1 partial: production deployment and private GitHub still pending; original logo unavailable. Typography monogram is explicitly provisional, NOT the original logo.
- Phase 2: actual OAuth end-to-end and continuous Discord role refresh pending; mapping only at login, sessions 30m.
- Phase 3: editing/deleting characters, gear/stats, detailed filters and provider integrations pending.
- Phase 4: more dynamic forms, granular member management and remaining config pending.
- Phase 5: configurable form fields, retention tools, notifications mentioning staff roles, delivery admin and live webhook test pending.
- Phases 6–8: raid write/import, attendance editing, loot/wishlist/council/progress/logs screens and APIs pending. Schema/provider boundaries exist only. No invented statistics.
- Phase 9: export/audit/backup implemented; CSV, encrypted offsite scheduling and restore drill pending.
- Phase 10: automated security tests authored, final results recorded below after execution; browser QA and production hardening pending.

## Broken / blockers
- Sites source helper cannot connect to git.chatgpt-team.site:443 in this restricted environment. No remote source read or deployment succeeded.
- GitHub connector has no repository-create operation and shell has no gh. Browser security rejected https://github.com/new because permission was declined. Do not bypass this rejection. User must enable access or create the PRIVATE repository. Never reuse unrelated MonkWOW repository.
- Browser security also rejected localhost preview. Visual QA not performed; code/API tests are not a substitute for desktop/mobile browser QA.
- Need original guild logo file; attachment download has repeatedly failed in this session.
- Discord app secrets/IDs and private recruitment webhook not supplied. Never ask for passwords or paste secrets into Git.

## Decisions / architecture
Node.js 24 native HTTP + SQLite WAL, browser ES modules, backend RBAC, adapter boundaries. Chosen to deliver/test substantive work without network package installation. Cloudflare Workers/D1 remains cloud target; port data access before deployment, don't try to deploy Node DatabaseSync to Workers. Existing Sites id: appgprj_6ac53fab059c8191bbdaab52a6e9b211. No paid services activated. Normal production zero-cost not yet verified.

## Integration / environment
Configured: local SQLite, local application. Pending: GitHub private, Sites/Cloudflare runtime, Discord, Raid-Helper, Warcraft Logs/Forever support verification. `.env.example` lists PORT, HOST, APP_ORIGIN, DATABASE_PATH, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID, DISCORD_ROLE_MAP, DISCORD_LEADER_ID, DISCORD_RECRUITMENT_WEBHOOK.

## Next task
1. Ask user to enable GitHub/preview browser access or supply a private repository. Existing browser rejection must be respected.
2. Push existing commits to authorized PRIVATE GitHub, then desktop/mobile visual QA once allowed. Do not recreate the source or restart analysis.
3. Resolve cloud source access, implement D1 adapter and configure public hosting without ChatGPT login for members.
4. Complete remaining phases in order. Don't mistake empty-state UI or schema tables for completed integrations.

## Start / deploy
`node src/server.mjs`; http://localhost:3000. `node --test tests/*.test.mjs`; `node scripts/build.mjs`. README documents backup/restore. Cloud deployment pending adapter and network access.

## Last stable commit / validation
Last verified feature commit: b156747 (all 9 security suites passed; build syntax verification passed). Foundation commit: 08de4b0. Documentation checkpoint follows; use `git log -3 --oneline` for its hash. Local server started successfully at http://localhost:3000; will be stopped at session teardown. No browser QA or live OAuth/deployment has been verified. Workflow for Node 24 CI supplied but not run on GitHub. No production release claimed.
