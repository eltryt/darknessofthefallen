# Frontend review — 2026-10-07

Scope: polish the existing guild frontend against the master brief, while the owner is unavailable for backend/API setup. No authentication configuration, backend logic, secrets, access policy or guild rules were changed.

## Public experience
- Homepage retains the transparent emblem and confirmed PvP identity, and adds the configurable weekly schedule and useful links into the hub.
- About page explains the long-term community with values and the supplied guild emblem.
- Raid page shows the full week, the configured raid nights, midnight rollover guidance and the distinction between the weekly schedule and actual Discord/Raid-Helper signups.
- Recruitment explains the process, public opening state, configured class needs when present, privacy and FAQs. An open recruitment form remains connected to the existing API in the full application; the public presentation keeps submissions unavailable.
- Public roster distinguishes an empty guild roster from a filter with no matches; displays a live result count and reset button. Public columns remain name, class and role only.
- Progress explains encounter states without manufacturing raid results or player rankings.
- Contact and Discord login use distinct layouts, the transparent logo and actionable navigation. Pending connections are clearly labelled.
- Header includes Contact; current page is indicated for both trailing-slash and extensionless routes. Footer includes the emblem and key links. Each page has its own title; public exports include canonical/OpenGraph metadata.

## Member and staff interfaces
- Shared spacing, contrast, field sizes, focus outlines, scrollable keyboard-focusable tables and mobile scrolling guidance.
- Roster adds class and availability-text filters using existing response data, with translated guild ranks.
- Attendance adds the existing API's character filter.
- Panel buttons communicate selection; section errors replace the loading message. Forms retain entered values and display inline submission errors.
- Member loot/council tabs remain read-only in the profile even for staff; staff editing stays in the panel. This is UI organization only; existing server authorization remains authoritative.
- Pagination says no records when empty; search results and selected tabs expose accessible state. Mobile menu closes with Escape and restores focus to its toggle.

## Checks performed
- Existing 19 security/operations tests and build pass locally. GitHub CI passed for frontend commit 4e59d08bd3cefb929e2b5aa92ce6860336b79ea8: https://github.com/Borjaglcode/MonkWOW/actions/runs/37662065322.
- Eight public pages checked at 768px: one H1, no page-level horizontal overflow, no failed-page state.
- 390px mobile: all nine staff sections after roster loaded without overflow or section errors; roster role filtering returned the expected one synthetic character.
- 320px homepage: no horizontal overflow. Desktop public export and raid calendar visually checked.
- Synthetic recruitment submission completed in the isolated in-memory QA server. Public roster no-match/reset, mobile Escape behavior and member profile checked. No browser console errors during panel checks.
- Export uses public defaults only; no QA fixtures, database or private data is included.

## Boundaries and next work
This is a polished frontend over currently available data, not completion of the full application. Live Discord, production member persistence, recruitment delivery and provider integrations remain pending. No gear/log/parse screens with fabricated data were added. Attendance-percentage roster filters require an agreed existing data source or backend work; availability filtering currently searches the member's own free text.

Public content renders client-side; social metadata is provided by the static export. A screen-reader audit on real assistive hardware, real-account acceptance tests, and production performance monitoring remain future validation.

Run `node scripts/qa-preview.mjs` for disposable localhost-only UI fixtures (never deploy this entrypoint). Run `node scripts/export-showcase.mjs OUTPUT_DIRECTORY` for the public presentation. Sites publication uses the existing project identity and source helper, with the documented Windows packaging fallback.
