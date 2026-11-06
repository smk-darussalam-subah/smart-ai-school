# Teacher workspace, session recovery, calendar and credentials

Authorization: user-approved local implementation, 2026-11-02. Base staging source `f5dea2e2dce1dc81748768fd1f392fb475da74ee`, tree `b4b0da0cda2a9965c15cde8fa64e42a057ff9ef7`.

## Acceptance and order

1. Session/logout: reproduce late cookie response; prevent renewed authority after logout, retain secure token refresh and #310 guard/attendance recovery. Bound cookies and callbacks. Do not infer that the original nginx 400 is reproduced by a clean jar.
2. Passive JP refresh: stable dependencies, no repeated loading when idle; explicit refresh and authoritative changes remain functional.
3. Approved Teacher Home: active/next session, Presensi Saya, real follow-up tasks, daily recap, quick links. Full JP detail remains in learning/recap. Existing DIIS colors and session flow; useful concise error/empty/loading states.
4. Waka Humas: active appointment authorizes school events, holidays, examinations and academic calendar. Date/time/location extend existing calendar only. Migration on disposable DB, no change to seven base roles, no blanket Guru grants.
5. Selected student/parent password reissue: existing authority, forced change, deduplicate parents, retain partial results. Memory-only credentials, PDF print and real XLSX export, no reset on re-export.
6. Production Guru access: exact dry-run reconciliation plan for missing LMS definition/grants. Preserve already-reviewed journal producer and manual overrides. No production apply.

## Verification

Focused negative/race/auth tests, schema/migration on disposable PostgreSQL, type checks, real Linux build and browser authorized/denied/recovery, keyboard/dark/mobile checks, before/after refresh/logout controls, actual changed-surface screenshots. Preserve failed receipts and distinguish stubbed local integration from authenticated staging evidence.

## Boundary

Local source and disposable fixtures only. Git packaging, remote mutations, staging/production data/config/permissions/password resets, shared ingress and commissioning HOLD. Stop for independent source review after a complete self-validation sweep and literal file manifest.

## Next reviewer

GPT-6.1 Sol / xhigh (availability to be checked at handoff): independent semantic review of session revocation races, calendar appointment scope and credential privacy. Quality criteria: late responses cannot restore authority, no unauthorized calendar changes, exports never reset accounts. Actual current session model/effort unverified.

## Completion record

Local implementation and verification completed on 2026-11-02; status **SOURCE COMPLETE — STAGING HOLD**, pending independent source re-review. Git index remains empty. No remote/environment/configuration/real-account mutation.

Final built Web image: `diis-teacher-workspace-web:final-v6-20261102`, digest `sha256:94849e60a3d6db39e731149c6c9c4d6c95a36176baec7f02451cc3865442d5f5`. The local dependency builder was reused; this is a clean Next build, not a fresh npm clean-install or CI result. All 855 bound Web/package inputs match.

Verification: API 232 tests (including 15 PostgreSQL and 13 real Fastify/JWT/JWKS/PostgreSQL controls), Web 123, shared auth package 52; actual built-browser workflow 9 journeys, router/denial recovery 5 journeys plus 9 HTTP metadata controls, and one separate native snooze control. Fresh final receipts must be used, while previous failures remain preserved. These layers are not authenticated staging E2E.

Additional refinements found during completion: exact-session deep links reject the wrong selected period; calendar date-only values stay on the school date in a foreign browser timezone; credential dialogs return focus to the stable user-list heading; the existing presensi Nanti reminder now repaints immediately; scheduled sessions are not described as completed attendance. None of these changes disables the attendance provider or access guards.

Evidence and final screenshots: `C:/Users/USER/Documents/Claude/Projects/DIIS/output/teacher-workspace-remediation-20261102/`. Consolidated handoff: `C:/Users/USER/Documents/Claude/Projects/DIIS/docs/audits/DIIS-TEACHER-WORKSPACE-LOCAL-CONSOLIDATED-HANDOFF-2026-11-02.md`. Production LMS minimum reconciliation remains a separate unapplied plan.

Open: original live nginx 400 cause, production Guru grant reconciliation, stable OIDC session-claim inventory, standard Linux API/clean-install CI, authenticated staging/device/PWA and rollout/performance acceptance, and inherited advisory/runtime residuals. No blanket clean acceptance or production-readiness claim.
