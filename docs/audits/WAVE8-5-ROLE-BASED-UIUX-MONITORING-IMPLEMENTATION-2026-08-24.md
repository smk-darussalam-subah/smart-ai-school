# Wave 8.5 Role-Based UI/UX and Operational Monitoring Implementation

Date: 2026-08-24

Status: FOLLOW-UP COMPLETE - ready for independent source re-review

## Baseline And Preconditions

- Branch: `feat/wave8-5-role-uiux-monitoring-20260824`.
- Baseline: `origin/develop@84a46af6052085dd4bce96a4d039560fdc3d9810`.
- Baseline product tree: `05441762615cc731332e3c00bc4754f987eb75e1`.
- `origin/develop`, `origin/staging`, and `origin/main` had the same product tree before work began.
- Wave 8 was already present in `main`; no pull request was open.
- Classic protection for `develop`, `staging`, and `main` required one approval.
- `Protect Staging` and `Protect main` rulesets were active.
- The Director-approved D6 wording matched the Prompt Architect contract exactly.
- Work is isolated from the mixed canonical worktree. No historical artifact was removed.

## Fixed Scope Inventory

### Authority

- Stable identity roles remain exactly: `SUPER_ADMIN`, `TATA_USAHA`, `GURU`, `SISWA`, `ORANG_TUA`, and `INDUSTRI`.
- Kepala Sekolah, Waka, Kaprog, and other period-bound offices remain active Appointments.
- Wali Kelas and Teaching Assignment remain academic assignments.
- Display devices are neither users nor Keycloak roles.

### Existing Gaps Verified

- Bell time is a frontend constant and cannot drive authoritative server reminders.
- The legacy room display uses one plaintext `SchoolProfile.kioskToken`, a bearer URL, and one global payload.
- No durable `ClassSession`, alert stage, device delivery, or acknowledgement model exists.
- The current dashboard enlarges a signed-in SA/staff surface for room mode and carries user session authority into that experience.
- Existing monitoring infers activity from grades, attendance, and journals rather than authoritative class-session state.
- Login exists twice: restrained `/login` and an unrelated Aurora/AI-network `/auth` experience.
- Home and shell still contain legacy position-role labels and role-first decisions in several paths.
- Executive monitoring uses a silent default threshold of 75 in paths that should use authoritative KKTP provenance.

### Page Classification

- Deep: `/login`, `/auth`, `/dashboard`, shell, `/dashboard/monitoring`, room displays, schedule/session controls, device pairing.
- Moderate: Executive, Health, Audit, Knowledge, WA Log, Profile, Academic Year, Subjects, Grades, Jobs, Finance, Announcements, AI Chat, Teacher Attendance, Organization, Classes, PPDB, Students.
- Regression-only unless a defect is reproduced: Wave 8 Users/Schedule/Calendar and mature Academic/Report Card/Assessment/Remedial flows.

## Design Plan

### Subject And Job

DIIS is an operational school workbench. Its audience must understand the current school period, their authority, today's work, and the next safe action without interpreting decorative dashboards.

### Tokens

- Institutional emerald `#064534`: canonical DIIS mark and context.
- Action blue `#1D4ED8`: primary commands and links.
- Ink `#0F172A`: high-contrast operational text.
- Canvas `#F8FAFC`: dense work surface.
- Warning amber `#B45309`: due/late attention.
- Critical red `#B91C1C`: failure, revoked, and escalation.

Typography keeps the existing Jakarta/system UI stack for operational density. Fraunces is reserved for the restrained institutional wordmark, not dashboard headings. Cards remain at 8px or less; page sections are unframed bands and nested cards are prohibited.

### Layout Contract

```text
Dashboard:  context strip -> Hari ini -> Perlu tindakan -> Akses cepat -> Ringkasan
Monitoring: status rail -> active/late/missed board -> queue -> device health -> detail
Room display: clock/bell -> primary session board -> visual alert rail -> agenda/recap
```

The signature element is the authoritative school-day rail: Bell Schedule segments and Class Session state form one consistent visual language across Home, Monitoring, and paired displays. It is functional, not decorative.

### Self-Critique Before Build

The initial temptation to reuse the existing card-heavy kiosk would preserve inconsistent authority and browser-clock behavior. The revised plan uses one server contract and distinct projections. Expressiveness is concentrated in the school-day rail; surrounding UI remains quiet, compact, and predictable.

## Planned Ownership Manifest

- Database: Prisma schema and one additive Wave 8.5 migration only.
- Backend: Bell Schedule, display devices, class sessions/alerts, operational monitoring, permission correction, legacy kiosk cutover, notification integration.
- Frontend: canonical brand/login, role context shell/home, monitoring, pairing and paired displays, teacher session actions, executive threshold/freshness correction, curated rare-page defects.
- Verification: focused unit/component tests, PostgreSQL disposable migration/concurrency/restore proof, full source gates, and local/disposable browser candidate QA.

## Agent Contracts And Execution Boundary

- Frontend track received the fixed baseline, role/Appointment authority model, existing design
  tokens, no-schema ownership boundary, and staging-only E2E restriction. Its ownership was
  limited to login/shell/home, Executive presentation, Monitoring, display, schedule controls,
  assets, Keycloak CSS, and focused web tests.
- Backend/database track received the same baseline plus the single approved additive migration,
  fail-closed authority requirements, durable event/delivery contract, no dependency/infra/realm
  change, PostgreSQL proof requirements, and focused API test ownership.
- Executor re-read and integrated both tracks, reviewed cross-track contracts, and closed two
  integration findings before final gates: durable server-side audio fencing and KAPROG
  major-scoped Monitoring.
- No agent was authorized to stage, commit, push, create a PR, deploy, access production, or mutate
  shared staging.

## Implementation Evidence

### Brand, Login, And Shell

- `/login` is the canonical Indonesian NextAuth surface with bounded callback handling, explicit
  session-expired/OAuth/offline feedback, retry, focus-visible controls, reduced-motion behavior,
  and 44px targets.
- `/auth` is now a bounded redirect to `/login`; the unrelated Aurora/AI-network shell was removed.
- Canonical DIIS assets now cover favicon 16/32, Apple touch 180, PWA 192/512, maskable manifest,
  metadata, Sidebar/mobile identity, and the institutional Keycloak theme.
- The application shell resolves human-readable active Appointment labels and keeps compact route,
  period, and authority context. Room-display controls no longer appear as a global user feature.
- Dashboard home is role/Appointment aware and follows `Hari ini -> Perlu tindakan -> Akses cepat
  -> Ringkasan` without fabricated metrics. Unsupported Lowongan capability remains explicit.

### Executive Accuracy

- Executive academic panels expose numerator, denominator, period, freshness, and authoritative
  KKTP provenance.
- Silent `75` fallback was removed from academic threshold paths. Missing or partial KKTP sources
  remain visible as incomplete rather than receiving a fabricated score.
- Existing chart-oriented analysis remains intact; roadmap content stays semantically separate
  from operational data.

### Bell Schedule And Class Sessions

- Added effective-dated, school-scoped Bell Schedule profiles and ordered JP segments in
  `Asia/Jakarta`, including strict minute bounds, `end > start`, JP uniqueness, segment no-overlap,
  and profile effective-range exclusion.
- The migration seeds one baseline profile and ten segments from the previously recorded frontend
  Bell values with explicit migration provenance. Resolver ambiguity or absence fails closed.
- Schedule management can create, inspect, close/update an effective range, and revoke a profile.
  This enables a Ramadan/exam/special successor without deleting historical provenance.
- Added authoritative daily Class Session materialization from Schedule, active Academic Year,
  active Semester, Teaching Assignment, Bell Schedule, calendar suppression, and immutable
  snapshots.
- Lifecycle includes scheduled, started, completed, missed, cancelled, reassigned, and superseded
  states with version/CAS, bounded start window, late minutes, reasoned manager actions, recovery,
  and immutable event evidence.
- Teacher controls only act on the authoritative assigned session. Schedule managers receive
  reasoned cancel/reassign controls. Journal and attendance remain separate contracts.
- KAPROG Class Session reads are fail-closed to the active Appointment's Academic Year and major;
  forged cross-major class filters return no data.
- Existing day-based Jadwal coloring and per-day style mapping are unchanged. The new session rail
  and Bell controls are additive and do not replace or recolor `JadwalMatrix`.

### Alert, Notification, And Recovery

- Added immutable session events and durable T+5, T+10, and T+15 alert stages with unique
  `(session, stage)` identity, lease/claim fencing, retry release, and 60-second due reconciliation.
- T+5 creates durable private push/in-app intent for the assigned teacher. T+10 creates per-device
  display delivery. T+15 resolves active Waka Kurikulum/KS Appointments and the permitted TU queue;
  SA is not a routine recipient.
- Holiday, invalid/ambiguous period or Bell configuration, stale Schedule, started/cancelled/
  reassigned/terminal session, and explicit display acknowledgement suppress remaining work.
- Notification logs are created inside the transaction and handed to the existing queue only after
  commit. Queue failure leaves durable pending state for the existing recovery path.
- Delivery, played, acknowledgement, cancellation, and recovery are durable. The API transition
  returns a `transitioned` fence; only the winning `played` transition may call browser speech, so
  reload/reconnect cannot replay audio.

### Device Security And Display UX

- Added private management for device list/health, one-time pairing, credential rotation,
  individual revoke, emergency revoke-all, and Ruang Guru audible-leader selection.
- Pairing challenges are hashed, short-lived, attempt-limited, single-use, and mutation-locked.
  Opaque device credentials are stored only as SHA-256 hashes and returned once.
- The browser stores the credential only in a same-origin `HttpOnly`, `SameSite=Strict`, Secure
  production cookie. Mutations enforce same-origin requests, bounded bodies/IDs, generic failures,
  and rate limits. The device credential never enters a URL, localStorage, report, or log.
- Public display API responses are profile allowlists. A paired display is not a user and receives
  no Keycloak/general API authority.
- Legacy `/ruang-guru/[token]` and kiosk-token management fail closed and provide generic pairing
  guidance without consuming or reflecting the old bearer token.
- `/display/room` is a clean shell without Sidebar, TopBar, avatar, logout, user navigation, or
  hidden admin DOM. It includes server Bell time, session board, visual alerts, freshness,
  reconnect, fullscreen, details, acknowledgement, and permitted room projections.
- Ruang Guru audio requires a user gesture, prefers an Indonesian browser voice, uses neutral copy
  without teacher names, supports mute/test, and always preserves a visual equivalent. Wake lock is
  progressive enhancement only.

### Monitoring And Authority

- `/dashboard/monitoring` is permission checked and distinguishes SA recovery/configuration, active
  KS oversight, and TU operational queue. Device mutation controls require
  `operational.display.manage`; read authority alone cannot rotate/revoke credentials.
- Monitoring is intentionally restricted to SA, active KS, and TU as specified by Track 6. Waka
  Kurikulum and KAPROG retain scoped academic Class Session reads, not direct Monitoring access.
- Display devices are never modeled as stable roles or Appointments. Six stable identity roles and
  the existing Appointment authority model remain unchanged.

## Database Runtime Proof

Disposable resources used only synthetic identifiers and were bound to loopback:

- PostgreSQL container `diis-wave85-pg` on `127.0.0.1:55485`.
- Redis container `diis-wave85-redis` on `127.0.0.1:56379`.
- Baseline snapshot contained 44 completed migrations. The single new migration applied cleanly as
  migration 45.
- Post-migration proof: one baseline Bell profile, ten Bell segments, and exactly four new
  permission codes.
- The final migration was reapplied from an empty pgvector PostgreSQL instance after Monitoring
  authority was tightened. Final grants are: TU monitoring read; active KS monitoring read,
  display manage, and Class Session read; Waka Kurikulum/KAPROG Class Session read only; GURU Class
  Session read/manage.
- Constraint proof passed for profile effective-range exclusion, segment no-overlap, unique daily
  Schedule session, unique alert stage, and unique delivery per alert/device.
- Two-connection concurrency proof passed:
  - active audible leader: one winner, final count one;
  - open pairing challenge: one winner, final count one;
  - pairing consume CAS: one update and one no-op;
  - daily session materialization: one insert and one unique rejection;
  - session start CAS: one version transition and one no-op;
  - alert claim with `FOR UPDATE SKIP LOCKED`: one claimant;
  - delivery and acknowledgement: one canonical row each.
- A physical pre-migration dump was restored into `diis_wave85_restore`; the restored database
  contained exactly 44 migrations and no Wave 8.5 schema. This is schema restore proof, not merely a
  transaction rollback.
- No existing migration was edited and no legacy row was guessed.

## Local Browser Candidate Evidence

This was local/disposable candidate QA, not staging E2E:

- Canonical `/login`: Indonesian identity/copy, one primary CTA, 192px canonical mark, 44px target,
  no horizontal overflow.
- `/auth?reason=session`: bounded handoff to `/login` with actionable session notice.
- `/display/pair`: public without login redirect; a synthetic one-time code was consumed and the
  browser moved to a clean `/display/room` URL.
- Paired Ruang TU display: server snapshot rendered, SSE stayed live after reconciliation, no user
  navigation appeared, and desktop/mobile layouts had no horizontal overflow.
- Legacy bearer URL redirected to generic pairing guidance.
- Browser console had no application exception. One Chrome extension message was classified as a
  non-application artifact. An early local SSE 429 was reproduced, traced to the initial stream
  handling, fixed with one authenticated Fastify stream subscription, and did not recur.
- Visual inspection used desktop 1600px and the available Chrome mobile viewport 433px. Exact
  1920x1080, 1366x768, 1440x900, 390x844, 200% zoom, manual speaker output, and authenticated
  SA/TU/GURU/KS role switching remain the staging matrix after the reviewed SHA is deployed.
- A disposable Keycloak realm was deliberately not improvised during this source run. Therefore no
  authenticated browser result is claimed from source/unit evidence.

## Automated Verification

- Focused API Wave 8.5: 2 suites / 16 tests pass.
- Focused web Wave 8.5: 4 suites / 35 tests pass.
- Full API: 65 suites / 1,286 tests pass with `--runInBand --detectOpenHandles`.
- Full web: 42 suites / 282 tests pass with `--runInBand --detectOpenHandles`.
- Root type-check: 9/9 tasks pass.
- Root lint: 3/3 tasks pass. Web emitted only the existing Next lint deprecation/plugin notices.
- Root production build: 6/6 tasks pass; Next generated 47/47 pages.
- Prisma validate and Prisma generate: pass against the disposable PostgreSQL URL.
- `git diff --check` and `git diff --cached --check`: pass.
- Untracked text-file diff check: 53/53 files pass.
- Secret-marker and conflict-marker scans: clean.
- `JadwalMatrix` day-style source check: unchanged.
- Cached diff is empty; no file is staged.

## Scope And Hygiene

- Explicit Reviewer manifest (88 files):

```text
apps/api/src/__tests__/analytics.spec.ts
apps/api/src/__tests__/notification.spec.ts
apps/api/src/__tests__/wave8-5-class-session.spec.ts
apps/api/src/__tests__/wave8-5-operational-security.spec.ts
apps/api/src/__tests__/wave8-5-postgres-proof.spec.ts
apps/api/src/analytics/analytics.service.ts
apps/api/src/app.module.ts
apps/api/src/bell-schedule/bell-schedule.controller.ts
apps/api/src/bell-schedule/bell-schedule.dto.ts
apps/api/src/bell-schedule/bell-schedule.module.ts
apps/api/src/bell-schedule/bell-schedule.service.ts
apps/api/src/class-sessions/class-session-due.service.ts
apps/api/src/class-sessions/class-session.controller.ts
apps/api/src/class-sessions/class-session.dto.ts
apps/api/src/class-sessions/class-session.module.ts
apps/api/src/class-sessions/class-session.service.ts
apps/api/src/display-devices/display-device.controller.ts
apps/api/src/display-devices/display-device.dto.ts
apps/api/src/display-devices/display-device.module.ts
apps/api/src/display-devices/display-device.service.ts
apps/api/src/operational-monitoring/operational-monitoring.controller.ts
apps/api/src/operational-monitoring/operational-monitoring.dto.ts
apps/api/src/operational-monitoring/operational-monitoring.module.ts
apps/api/src/operational-monitoring/operational-monitoring.service.ts
apps/api/src/notification/notification-worker.ts
apps/api/src/public-kiosk/public-kiosk.controller.ts
apps/api/src/public-kiosk/public-kiosk.service.ts
apps/api/src/school-config/school-config.service.ts
apps/web/public/apple-touch-icon.png
apps/web/public/favicon.ico
apps/web/public/manifest.json
apps/web/src/__tests__/keycloak-theme.test.ts
apps/web/src/__tests__/mobile-nav.test.ts
apps/web/src/__tests__/sidebar-position-roles.test.ts
apps/web/src/__tests__/wave8-5-auth-shell.test.ts
apps/web/src/__tests__/wave8-5-class-session-ui.test.ts
apps/web/src/__tests__/wave8-5-display-boundary.test.ts
apps/web/src/__tests__/wave8-5-monitoring.test.ts
apps/web/src/app/api/display/activate/route.ts
apps/web/src/app/api/display/alerts/[id]/ack/route.ts
apps/web/src/app/api/display/deliveries/[id]/[transition]/route.ts
apps/web/src/app/api/display/disconnect/route.ts
apps/web/src/app/api/display/snapshot/route.ts
apps/web/src/app/api/display/stream/route.ts
apps/web/src/app/auth/AuthShell.tsx (deleted)
apps/web/src/app/auth/auth-redirect.ts
apps/web/src/app/auth/page.tsx
apps/web/src/app/dashboard/_components/RoleBasedHome.tsx
apps/web/src/app/dashboard/executive/_components/AcademicPanels.tsx
apps/web/src/app/dashboard/executive/actions.ts
apps/web/src/app/dashboard/executive/types.ts
apps/web/src/app/dashboard/jadwal/_components/BellScheduleManager.tsx
apps/web/src/app/dashboard/jadwal/_components/TodayClassSessions.tsx
apps/web/src/app/dashboard/jadwal/_components/class-session-ui.ts
apps/web/src/app/dashboard/jadwal/actions.ts
apps/web/src/app/dashboard/jadwal/page.tsx
apps/web/src/app/dashboard/monitoring/actions.ts
apps/web/src/app/dashboard/monitoring/loading.tsx
apps/web/src/app/dashboard/monitoring/MonitoringClient.tsx
apps/web/src/app/dashboard/monitoring/page.tsx
apps/web/src/app/dashboard/page.tsx
apps/web/src/app/display/page.tsx
apps/web/src/app/display/pair/page.tsx
apps/web/src/app/display/room/page.tsx
apps/web/src/app/layout.tsx
apps/web/src/app/login/login-ui.ts
apps/web/src/app/login/page.tsx
apps/web/src/app/ruang-guru/[token]/_components/PublicKioskBoard.tsx (deleted)
apps/web/src/app/ruang-guru/[token]/legacy-handoff.ts
apps/web/src/app/ruang-guru/[token]/page.tsx
apps/web/src/components/display/DisplayPairing.tsx
apps/web/src/components/display/RoomDisplay.tsx
apps/web/src/components/layout/AppShell.tsx
apps/web/src/components/layout/MobileNav.tsx
apps/web/src/components/layout/Sidebar.tsx
apps/web/src/components/layout/TopBar.tsx
apps/web/src/components/monitoring/monitoring-contract.ts
apps/web/src/lib/display-alerts.ts
apps/web/src/lib/display-contract.ts
apps/web/src/lib/display-proxy.ts
apps/web/src/lib/display-shell.ts
apps/web/src/lib/display-state.ts
apps/web/src/lib/class-session-status.ts
apps/web/src/middleware.ts
docs/audits/WAVE8-5-ROLE-BASED-UIUX-MONITORING-IMPLEMENTATION-2026-08-24.md
infrastructure/keycloak/themes/diis/login/resources/css/login.css
packages/database/prisma/migrations/20260824000001_wave8_5_operational_monitoring/migration.sql
packages/database/prisma/schema.prisma
```

  This literal list is the maximum future staging manifest. Reviewer approval must precede any Git
  staging, and cached inspection must still be repeated at that gate.
- One new migration only; existing migrations, dependencies, infrastructure services, Keycloak
  roles, stable roles, Appointment schema, and production data are unchanged.
- No secret, plaintext device credential, PII, screenshot containing PII, test cache, database dump,
  or disposable fixture is eligible for Git packaging.
- The worktree remains uncommitted and unpushed. No PR, shared staging mutation, production access,
  or deployment occurred.

## Independent Reviewer Handoff

Status: **READY FOR INDEPENDENT SOURCE AND DISPOSABLE-RUNTIME RE-REVIEW**.

Reviewer should inspect the explicit changed-file manifest, with particular attention to:

1. single additive migration and PostgreSQL constraints;
2. Class Session lifecycle/alert claim/notification handoff;
3. device credential and same-origin proxy boundaries;
4. durable `played` transition and neutral local audio;
5. Monitoring restricted to SA/active KS/TU and KAPROG major scope on Class Sessions;
6. canonical login/shell/home and Executive KKTP provenance;
7. unchanged per-day Jadwal color/style behavior.

No Git packaging is authorized until the independent Reviewer returns an explicit approval. After
source approval and reviewed-SHA deployment, staging browser QA remains mandatory for the exact
role, viewport, accessibility, reconnect, audio, and negative-authority matrix.

## Reviewer Follow-up Closure

The seven findings in
`WAVE8-5-ROLE-BASED-UIUX-MONITORING-SOURCE-REVIEW-2026-08-24.md` were closed on
the same branch without changing the approved migration, dependencies, infrastructure, Keycloak,
stable roles, Appointment model, or the per-day `JadwalMatrix` styling.

### P1-R01 - Durable pairing attempts

- Expected activation failures now return a transaction outcome and throw the generic
  `UnauthorizedException` only after the transaction commits.
- Wrong-code CAS increments persist from attempts 1 through 5; attempt 6 remains locked out.
- Expired and consumed challenges remain generic failures and do not mutate device authority.
- PostgreSQL actual-service proof passed wrong-attempt durability, lockout, concurrent wrong/correct
  activation, expiry, and replay. Credentials and pairing codes were not logged.

### P1-R02 - Resource-bound Class Session idempotency

- Every mutation reads and locks the route session before replay; teacher-owned transitions check
  ownership before any event data can be returned.
- The durable event key is scoped to action, actor, and opaque idempotency key. A normalized
  fingerprint binds action, route session, actor, and payload.
- A transaction advisory lock serializes the same identity across different session rows. Exact
  replay returns the prior session; route, actor, or payload mismatch returns actionable `409`.
- PostgreSQL two-request proof passed: one cross-session winner, one conflict, one event, and exact
  winner replay without a second mutation.

### P1-R03 - Reassignment alert lifecycle

- Reassignment no longer cancels the complete T+5/T+10/T+15 chain.
- Teacher-bound `PRIVATE_T5` is rebased for the replacement teacher. Pending, claimed, or previously
  cancelled room/escalation stages are rearmed; already dispatched room/escalation stages are kept
  to prevent duplicate display audio.
- Old pending private notification intents are marked inactive. The notification worker now reads
  the durable row before dispatch and skips a queued job that is no longer pending.
- Boundary tests cover before T+5, between T+5/T+10, between T+10/T+15, and after T+15. A
  PostgreSQL two-worker proof confirms one durable alert claim and lease across service instances.

### P1-R04 - Fail-closed review context

- `AppShell` derives one effective Appointment projection for Sidebar, TopBar, and MobileNav.
- Mode tinjau hides every real Appointment and labels the selected identity context on desktop and
  mobile. Returning to normal mode restores the real active Appointment display.
- Server-rendered component tests cover desktop, mobile, mixed context, and restoration.

### P2-R01 to P2-R03 - Date, labels, and device truthfulness

- Monitoring KBM derives the calendar day in `Asia/Jakarta`, then queries the database date column
  with an exact half-open date range. Tests cover 23:59:59.999 and 00:00 WIB.
- Home and Today Class Sessions use one exhaustive Indonesian status mapping with a safe unknown
  fallback; raw backend enums are not displayed.
- Active rows with expired credentials are projected as `EXPIRED`/`Kedaluwarsa`, never
  `Aktif`/`ONLINE`. UI offers an explicit recovery action and API/web tests cover the derived state.

### Follow-up verification

- Focused API: 4 suites / 74 tests pass.
- Focused web: 4 suites / 27 tests pass.
- PostgreSQL actual-service proof: 1 suite / 4 tests pass after all 45 migrations applied from an
  empty loopback-only pgvector database.
- Full API: 65 suites / 1,296 tests pass; the environment-gated PostgreSQL suite is intentionally
  skipped in the ordinary no-database run and passed separately above.
- Full web: 42 suites / 286 tests pass.
- Root type-check: 9/9 tasks pass.
- Root lint: 3/3 tasks pass, with only the existing Next lint deprecation/plugin notices.
- Root build: 6/6 tasks pass; Next generated 47/47 pages.
- Prisma validate/generate, diff checks, and source hygiene checks pass.
- Disposable PostgreSQL was removed after proof. No shared staging or production resource was
  accessed.

Git remains on hold pending the next independent Reviewer verdict. Browser E2E remains a separate
staging-only gate after a reviewed SHA is packaged and deployed.
