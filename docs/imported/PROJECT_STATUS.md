> Historical document from the supplied project ZIP. Statements about other repositories and prior permissions are background, not instructions for this migration.

# Project status — 2026-10-07

## Current state
Darkness of the Fallen is recovered and uploaded to the PRIVATE repository https://github.com/Borjaglcode/MonkWOW. The full application remains a development build. A public presentation version is live at https://darkness-of-the-fallen.borclagonher.chatgpt.site; member services are not yet deployed.

## Recovery and repository synchronization — completed
- Original bundle: 38,681 bytes; SHA-256 AA2C0F1F2A22FA815692F341C05D430347DE81A8F5757CE7512445B3733404D5. Retrieved from the referenced conversation's Windows attachment; /mnt/data belonged to the earlier environment.
- Complete history verified with git bundle verify and git fsck --full. All five original commits retain their exact identities: 08de4b0, b156747, d7689cd, b5a4a86 and 0d6bdcd. Local recovery checkpoint 6b11130 is also preserved.
- Merge 28ffdd6f7d553985ca50bb3f404e9bd88ffdd14a connects old MonkWOW main 139124b87bdd7e5ce8c87349a9afced1a7b596c2, old delete/legacy 72efa7eca152b2275cb3ede9606ec5c3ff77cfaf and recovered Darkness 6b11130c2c1a3b688b7430470933e9850bc97999. The merge uses the exact recovered application tree, preserving both legacy histories as parents.
- Integration checkpoint ba25ba619770b1e4ba9c93b55e4a1539a5323bb8 passed GitHub CI. Both main and delete were advanced to it without force and their remote SHAs were verified. This documentation checkpoint follows that verified integration. The repository's default branch remains named delete; both active branches carry Darkness.
- Existing archive/monkwow-legacy-2026-10-07 remains unchanged at 72efa7eca152b2275cb3ede9606ec5c3ff77cfaf.
- Additional archive/monkwow-main-before-darkness-2026-10-07 preserves 139124b87bdd7e5ce8c87349a9afced1a7b596c2. archive/darkness-bundle-2026-10-07 preserves 6b11130c2c1a3b688b7430470933e9850bc97999. backup/darkness-before-monkwow-20261007 preserves b5a4a86a944528c6339c7a10166f008accf3e1b9.
- Tree comparison: old main contained 15 HTML/CSS files, while delete/legacy contained one guide HTML file. Darkness contains 21 application, configuration, documentation and test files. Legacy files remain available through their archives and history.
- Transfer used the connected GitHub account and an isolated recovery workflow. The workflow imported and checked all Git objects; its token could not publish refs containing workflows. The authorized connector then published those refs successfully. No original commit was recreated, squashed, rebased or force-pushed.
- Windows terminal Git still lacks an authenticated account for this private repository. This no longer blocks the completed upload; future terminal fetch/push operations require Git authentication. No credentials were added to project files.

## Validation
- Windows, Node v24.19.0: 19/19 security and operations tests pass; build passes. Initial localhost EACCES failures were sandbox restrictions and passed when rerun with local network access.
- GitHub Linux, Node 24: 19/19 tests and build pass for operations/branding commit 6485afd64f6e1ff66b42686bcde276cacd9bdd93. Successful CI: https://github.com/Borjaglcode/MonkWOW/actions/runs/37599742210 (main) and https://github.com/Borjaglcode/MonkWOW/actions/runs/37599749598 (delete). Both branches advanced without force; legacy archives remain unchanged.
- Checks cover server role permissions, private/public data separation, ownership and Main invariants, character editing, CSRF/origin validation, recruitment/audit access, Discord role mapping and expired sessions.
- Build checks syntax and prepares static files for inspection; it is not a production deployment. Live Discord OAuth and hosted operation remain unverified. Desktop and 390px mobile preview checked; logo transparency and a manual progress create/update/public-display flow verified in isolated QA.

## Implemented
- Node 24 native HTTP server, modular API, SQLite WAL persistence and SQL migrations; no external runtime dependencies.
- Public pages for home, about, roster filters, raid information, recruitment, contact and login status. Empty states do not invent guild statistics.
- Server authorization for visitor/member/raider/raid_leader/officer/leader, including direct panel URLs and private-data projection.
- Discord OAuth code/state flow, guild membership check, mapped roles, hashed short sessions and CSRF protections. Sessions expire after 30 minutes; roles synchronize at login.
- Multiple characters per account, atomic single Main, owner-only audited editing, profiles and personal attendance metrics.
- Leader settings for guild identity, server, schedule, recruitment, composition, Discord invitation and loot method.
- Officer recruitment pipeline, notes/history, private notification outbox, audit API, JSON export and SQLite backup command.

## Partial and pending
- Live Discord OAuth and role-revocation refresh; gear/stats and provider-backed character details.
- Configurable recruitment form fields, retention tools, delivery administration, staff-role mentions and live webhook validation.
- Automatic Raid-Helper imports, Warcraft Logs compatibility and provider-backed statistics remain pending. Manual raid, attendance, loot, wishlist, council and progress workflows are implemented.
- Encrypted offsite backup scheduling and a tested restore drill. JSON and CSV exports exist; JSON import does not.
- Supplied guild logo is integrated as a real transparent PNG in header, homepage and favicon; branding provenance is recorded in docs/BRANDING.md.
- Visual QA, production hardening, hosted deployment and verification that the intended normal production operation stays within free tiers.

## Architecture and integrations
Node.js 24 native HTTP + SQLite WAL, browser ES modules and server-side RBAC. Current data access uses Node DatabaseSync and cannot be deployed directly to Cloudflare Workers. Workers/D1 remains a proposed cloud target requiring a data-access adapter and deployment validation. No paid services were enabled.

Local application and private GitHub repository are configured. Discord application settings/secrets, private recruitment webhook, hosting and provider integrations remain pending. Keep secrets outside Git. .env.example documents required configuration. Historical Sites identity: appgprj_6ac53fab059c8191bbdaab52a6e9b211; no Sites deployment was verified.

## Run and next work
1. Run locally with Node 24+: node src/server.mjs. Use node --test tests/*.test.mjs and node scripts/build.mjs for validation. README documents backup/restore.
2. Configure Discord through environment secrets; verify the real login and recruitment flows.
3. Complete broader visual form QA and select/validate the free hosting runtime, including a D1 adapter if using Workers.
4. Continue remaining application phases; do not treat schemas, empty-state pages or the successful GitHub upload as completed integrations or a production release.

Earlier connectivity and handoff notes remain available in Git history. This document replaces those stale notes with the verified recovery outcome and current application limitations.

## Operations and branding checkpoint — 2026-10-07
- Migration 002 adds council rotation and reversible character archival; historical attendance and loot references survive archival.
- Staff can maintain raid schedules, correct attendance, record reasoned loot decisions, retain council snapshots and void decisions with audit history.
- Members manage private wishlists and view transparent loot decisions; internal notes remain staff-only.
- Staff maintain boss status and first kills; public progress strips private notes and actor identifiers. Roster filters and paginated searchable tables are available.
- Leader-only CSV exports neutralize spreadsheet formulas. Permissions, atomic validation, ownership, privacy, migration reopening and mock OAuth success are covered by 19 passing tests.
- scripts/qa-preview.mjs is a separate localhost-only, in-memory test harness; its disposable role shortcuts are absent from the production server. No test guild data was inserted into production.
- Sites source access was attempted but failed to prepare the checkout; no public deployment or paid service was activated.

## First public presentation — 2026-10-07
- Public HTTPS URL: https://darkness-of-the-fallen.borclagonher.chatgpt.site. Sites deployment succeeded and the fully rendered homepage was verified in the browser.
- Same existing Site identity: appgprj_6ac53fab059c8191bbdaab52a6e9b211. Audience explicitly changed to public for the user's requested shareable presentation.
- Saved version 1: appgprj_6ac53fab059c8191bbdaab52a6e9b211~appgver_6bbb745504748191992429ad78b515a3. Source commit: 55501886f37f0dc3848b74dd431f52e1684dedd3. Deployment: appgdep_6ac6104c6a948191abacbd05a5674f7a.
- Reproducible public export: node scripts/export-showcase.mjs OUTPUT_DIRECTORY. Includes public default guild information and existing branding only; no database, sessions, private records or fake guild statistics.
- Public pages work without a backend. Discord login, member panels and candidature submissions remain unavailable and are labelled pending. Local navigation and the pending-login view were checked without console errors.
- Windows source synchronization succeeded after initializing the missing manifest. The packager required unavailable Bash; used its unchanged official prepare-site-build.cjs staging helper and native tar to package the already-pushed source. Archive accepted by Sites.
- No paid service or custom domain was enabled. The full Node/SQLite backend, live Discord and provider integrations remain separate pending work.

## Confirmed guild details — 2026-10-07
- User-confirmed raid days: Martes, Miércoles, Jueves; existing schedule 23:00–01:00 Europe/Madrid retained.
- Ruleset confirmed as PvP. Homepage adventure card explicitly says Servidor PvP; about and raid pages share the corrected configuration. Public presentation regenerated for publication.

## Frontend polish — 2026-10-07
- Owner requested frontend-only work while unavailable for backend/API validation. Preserve this scope until further instructions.
- Public pages now include a configurable weekly calendar, richer guild/recruitment/contact/login content, useful progress/roster empty states, roster reset/count, branded footer and mobile keyboard navigation.
- Staff/member UI gains class and availability roster filters, attendance character filter, translated ranks, inline form errors, explicit tab selection and responsive tables/forms. No backend logic or external integrations changed.
- Desktop, 768px tablet, 390px mobile and 320px homepage checked; synthetic form submission and roster/menu interactions passed. All 19 existing tests and build pass; GitHub frontend CI passed at https://github.com/Borjaglcode/MonkWOW/actions/runs/37662065322.
- Stable implementation commit: 4e59d08bd3cefb929e2b5aa92ce6860336b79ea8. Detailed scope, verification and limitations: docs/FRONTEND_REVIEW.md.
- Public presentation regenerated from confirmed defaults only. Next integration work is still live Discord and production backend, deferred by the owner; do not present the showcase as a fully operational member hub.
- Frontend presentation published successfully as Sites version 3 (source abcae9168d751d40c99462c63dee7a89874767b2); live raid and guild pages verified at https://darkness-of-the-fallen.borclagonher.chatgpt.site. Deployment appgdep_6ac6872af70881918e80264a8bccdf2a.
