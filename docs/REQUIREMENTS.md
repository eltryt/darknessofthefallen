# Historical product brief included in the project ZIP

Imported background specification from the earlier project. Current user instructions determine this migration’s scope. This checklist preserves the intended FULL product, not only currently implemented scope.

## Operating rules
- Build a real complete maintainable public/private guild hub, not just a landing page.
- Normal cost 0 EUR/month. Prefer reasonable scalability, generous free tiers, portability, maintainability, future integrations and low lock-in.
- Autonomous technical choices. Stop only for login/2FA/CAPTCHA/manual OAuth, sensitive external permissions, user-only secrets, payment/domain purchase, important irreversible actions or genuinely undefined guild rules. Never request passwords.
- PRIVATE GitHub repository, frequent coherent commits. Every batch updates PROJECT_STATUS.md: completed/partial/broken/pending, decisions, architecture, integrations, env, known issues, next task, start/deploy, last stable commit. Maintain README. No redundant re-analysis across sessions.

## Identity and visual design
- Darkness of the Fallen; World of Warcraft Forever; Alliance; PvE/progression primary, PvP secondary; enduring community.
- 23:00–01:00 Europe/Madrid, with configurable days/server/PvP-PvE ruleset, never permanently hardcoded.
- Dark fantasy, epic/elegant/modern gaming UI, readable clear panels, restrained animation. Avoid generic corporate design, excessive parchment/textures, dated or cluttered UI.
- Use existing guild logo as silhouette-cropped transparent PNG, no square background. Adapt header/navbar/favicon/login/hero/footer/OG. Derive palette from original logo with Alliance identity. Original supplied asset is now integrated as a transparent PNG; confirmed raid days are Martes, Miércoles and Jueves and ruleset is PvP.
- Full desktop/tablet/mobile support including administration. Semantic HTML, labels, focus, keyboard, contrast, alt text. Loading/skeleton/empty/error states, destructive confirmation, notifications, search/filter/pagination/mobile navigation.

## Accounts and privacy
- ONLY Discord OAuth; no local password or recovery accounts. Sync Discord roles where possible.
- Permission hierarchy Visitor > Member > Raider > Raid Leader > Officer > Leader (increasing privileges). Tank/healer/DPS are functional character labels, never permission ranks. RBAC enforced backend.
- Public: Home, About, PvE progress, roster, recruitment, raid info, contact/Discord. Public roster ONLY name/class/role; never Discord IDs, internal notes, attendance details, parses or admin history.
- One Discord user, multiple characters; one Main, rest Alters. Name, Forever surname, class/spec, combat role, professions, availability, notes, gear/stats/logs/future API data. Manual entry until suitable official API, provider adapter from outset.

## Roster and raids
- Composition against configurable tank/healer/DPS goals and availability totals. Filters class/role/availability/attendance/Main-Alter/guild rank; detect missing healers/classes, melee excess, availability and recruitment needs.
- Raid-Helper/Discord remains primary for scheduling/signups. Display events/participants; use official methods when possible, never fragile scraping if official option exists. Clean manual fallback and future adapter.
- Attendance: attended/absent/reserve/late, configurable additional states if needed. Counts and percentage, period/raid/character/member/status filters. Members see own detailed metrics only; RL/Officer/Leader see all. Percentage semantics beyond initial implementation require explicit guild policy before treating as loot criteria.

## Loot and progress
- Flexible loot: wishlist, priorities, history, recipient, raid/boss/date/reason/notes. Adaptable to Council/Roll/Soft Reserve/DKP/hybrid/future methods.
- Council: visible membership, rotations, item/boss/raid/candidates/winner/reason/date/participating council, auditable decisions.
- Warcraft Logs when Forever suitably supported: logs, characters, boss kills, parses, history, progress. Detailed individual parses visible only to self/RL/Officer/Leader. No aggressive public internal rankings. Public focus on guild progress/kills/relevant logs.
- PvE raid > bosses with Not attempted/In progress/Defeated, total/killed/percentage/first kill/history. Authorized manual editing until reliable automatic source.

## Administration
- Public configurable recruitment form: name, Discord, character, class/role, experience, availability/hours, motivation, extra info. Private pipeline New > Contacted > Trial > Accepted or Rejected; notes and change history; Kanban where useful.
- Every application automatically notifies PRIVATE Discord channel, leader/officers, name/class/role/availability/link. Never public candidate data.
- Leader edits guild name/description/faction/region/server/ruleset/raid times and days/recruitment/classes and roles sought/composition goals/links/Discord/progress/loot/attendance/integrations/public texts without code.
- Role-specific RL/Officer/Leader tools: advanced roster/attendance/recruitment/loot/progress/notes/composition/member management/change history, granular permissions.
- Audit key actions: actor/action/time/target/change, including rank/permissions/attendance/loot/deletion/config/candidates.
- Panel exports roster/characters/attendance/loot/recruitment/config as JSON and CSV where useful. Independent backup strategy, documented restore, don't depend solely on cloud provider.
- Security: backend RBAC, server validation, sanitization, CSRF/XSS/rate limits, protected endpoints, env-only secrets, OAuth validation, secure sessions, no token logs, correct webhooks/signature validation when relevant. No public API leaks.
- Start with free hosting subdomain, easy future custom domain without full migration.

## Phases and acceptance
0 architecture/repo/environment/design/deploy; 1 public/responsive/branding; 2 OAuth/RBAC; 3 roster/characters; 4 admin/config; 5 recruitment/webhook; 6 raids/attendance; 7 loot/wishlist/council; 8 progress/logs; 9 backups/exports/audit; 10 hardening/tests/docs/optimization/stable release. Order may change for sound technical reasons.

First major release requires ALL of: public HTTPS deployment, responsive final branding, live Discord login and feasible role sync, tested RBAC, roster/multiple characters/Main-Alter/profiles, leader/officer panels, recruitment/pipeline/Discord alerts, progress/raids/attendance/loot/wishlist/transparent council, backups/exports/audit/docs/tests, updated status, clean private GitHub and stable deployed build. Page loading alone is NOT completion.

Tests must cover login, role/private data, characters/Main-Alter, recruitment, attendance, loot, settings, critical APIs. Simulate all six ranks, explicitly deny member direct officer URL/API access.

Every next session: read status first, README only as needed, git status/recent commits, execute next task. Before ending: stable state, tests/build, commits, updated status, blockers and exact next action.
