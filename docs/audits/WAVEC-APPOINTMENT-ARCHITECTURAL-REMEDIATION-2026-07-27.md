# Wave C Appointment Architectural Remediation

Tanggal: 2026-07-27
Executor: Codex
Scope: local code follow-up only. No PostgreSQL dry-run, migration apply, commit, push, PR, deploy, browser QA, staging QA, or Keycloak/VPS change was performed.

## Source Docs

- `AGENTS.md`
- `docs/AI_CONTEXT.md`
- `smart-ai-school/AGENTS.md`
- `docs/WAYS-OF-WORKING.md`
- `docs/decision-log.md`
- `docs/audits/APPOINTMENT-GOVERNANCE-KEYCLOAK-TRANSITION-HANDOFF-2026-07-23.md`
- `docs/audits/PROMPT-ARCHITECT-APPOINTMENT-GOVERNANCE-KEYCLOAK-TRANSITION-WAVES-2026-07-23.md`
- `docs/audits/PROMPT-ARCHITECT-FOLLOWUP-APPOINTMENT-GOVERNANCE-WAVE-B-2026-07-24.md`
- `docs/audits/APPOINTMENT-GOVERNANCE-WAVEC-ARCHITECTURAL-REREVIEW-2026-07-27.md`
- `docs/audits/PROMPT-ARCHITECT-WAVEC-APPOINTMENT-ACTIVATION-SESSION-TRANSITION-2026-07-25.md`
- `docs/audits/WAVEC-APPOINTMENT-ACTIVATION-SESSION-TRANSITION-REMEDIATION-2026-07-25.md`
- `docs/audits/PROMPT-ARCHITECT-TF2-P1-1-SECURITY-DATA-MIGRATION-2026-07-23.md`

## Corrected Invariant

Active DIIS `Appointment` is the only period-bound source of position-code authority and appointment-derived permissions.

`StaffPosition` remains a legacy migration/compatibility projection. It must not create, change, or delete effective appointment-derived `UserPermissionOverride` rows. `UserPermissionOverride` is applied only for explicit `MANUAL` exceptions. Historical `POSITION_ASSIGNMENT` rows can remain in data for TF2/migration review, but they no longer grant authority.

## Gate 1 Decisions

- Outbox: Director approved Option A. The uncommitted Wave C outbox model, migration, processor, and appointment-driven Keycloak session logout path were removed. Appointment and approval records are the business history.
- Capacity: Director approved Option A. `Position.maxActiveHolders` was added. Core positions default to `1`; `WAKIL_KOOR_BKK` and `WAKIL_KOOR_HUBIN` are initialized to `2` and remain configurable.

## Plan and Critique

Initial plan:

1. Close legacy `PositionsService.assign/unassign` so they cannot write `StaffPosition` or `POSITION_ASSIGNMENT` overrides.
2. Remove appointment outbox/logout as a second lifecycle/history mechanism.
3. Keep permission cache invalidation after successful lifecycle writes.
4. Add capacity metadata and database guard for ACTIVE/open appointment capacity.
5. Route annual cutover and due activation through the same appointment transition helper.
6. Expand focused tests and write this remediation report.

Self-critique before implementation:

- A lingering `StaffPosition -> UserPermissionOverride` writer would keep a second authority path alive.
- `APPROVED` future appointments must not grant permissions before activation.
- For definitive replacement, old holder must be ended/superseded before successor becomes ACTIVE.
- Concurrent due activation needs a database lock or equivalent.
- Academic-year activation must rollback if appointment transition fails.
- Outbox removal and capacity schema both required Director decision.
- History must not expose outbox retry payload, Keycloak IDs, or infrastructure errors.

Fixed plan after Director decisions:

- Use Outbox Option A: delete uncommitted outbox artifacts and keep history business-only.
- Use Capacity Option A: add `maxActiveHolders` and enforce capacity in database trigger.
- Keep legacy Structure Organisasi mutations fail-closed until UI uses Appointment lifecycle explicitly.
- Filter permission overrides by `source = MANUAL` in resolvers.
- Keep TF2 cleanup scoped to legacy `POSITION_ASSIGNMENT`, preserving manual exceptions.

## Before and After Authority Path

Before remediation:

- Legacy path risk: `StaffPosition` mutation could create/delete `POSITION_ASSIGNMENT` `UserPermissionOverride`, making a position-derived permission effective outside appointment lifecycle.
- Outbox risk: appointment outbox was becoming an operational/history surface and implied appointment-driven Keycloak logout.
- Capacity risk: one-holder indexes did not express approved deputy capacity.

After remediation:

- `PositionsService.assign()` and `unassign()` return `409 Conflict` before any `StaffPosition`, override, cache, or Keycloak mutation.
- `PermissionsService` applies only `MANUAL` user overrides plus dynamic permissions from ACTIVE appointments and role permissions.
- Appointment-derived permissions are resolved from ACTIVE appointments, active academic year, effective dates, and `PositionPermission`.
- Keycloak remains limited to stable identity roles. Appointment changes do not force logout.

## Flow Coverage

- Annual continuation: successor can be prepared with `replacesAppointmentId` for the next academic year. Same-person same-year reappointment is rejected; cross-year continuation remains `DRAFT/APPROVED` until cutover.
- Mid-year replacement: current-year successor must be `APPROVED`; activation supersedes incumbent before activating successor in one transaction.
- PLT/cuti: definitive holder can be suspended with reason and expected return date. PLT can become active only when replacing a suspended holder. Resume still requires no active scope conflict.
- Due activation: `activateDueAppointments()` uses `pg_advisory_xact_lock(hashtext('appointment_due_activation'))`, then calls the same activation helper and invalidates affected users after commit.
- Annual cutover: `SchoolConfigService` calls `applyAcademicYearActivation()` inside the same academic-year transaction. If appointment transition fails, the academic-year mutation rolls back.

## Transaction and Cache Boundaries

- Appointment approve/reject/supersede/end/cutover writes are transactional where multiple records are touched.
- Cache invalidation happens after successful write/transaction resolution.
- Academic-year activation collects affected Keycloak IDs inside the transaction and invalidates after commit.
- When no affected appointment user is known, active-year changes still call `invalidateAll()` to avoid stale authorization cache.

## Outbox and History

- Removed uncommitted `AppointmentOutboxEvent` schema and outbox migration.
- Removed appointment outbox processor from module wiring.
- Removed appointment-driven `logoutAllSessions()` from Keycloak admin service.
- `getHistory()` returns appointment state and approval decisions only. It does not expose outbox events, retry payloads, approver user IDs, or Keycloak IDs.

## Capacity

- Added `Position.maxActiveHolders`.
- Draft migration adds `positions.max_active_holders`, check constraint `>= 1`, and initializes `WAKIL_KOOR_BKK`/`WAKIL_KOOR_HUBIN` to at least `2`.
- Draft migration replaces old one-holder partial unique indexes with trigger `appointment_enforce_active_capacity()`.
- Trigger counts `ACTIVE` appointments plus open no-replacement candidates (`PENDING_APPROVAL`/`APPROVED`) in the same scope and blocks writes that exceed configured capacity.
- Migration was not applied locally or to any database.

## Files Changed

- `apps/api/src/appointments/appointments.controller.ts`
- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/permissions/permissions.service.ts`
- `apps/api/src/positions/positions.service.ts`
- `apps/api/src/school-config/school-config.module.ts`
- `apps/api/src/school-config/school-config.service.ts`
- `apps/api/src/__tests__/appointments.spec.ts`
- `apps/api/src/__tests__/permissions.spec.ts`
- `apps/api/src/__tests__/positions.spec.ts`
- `apps/api/src/__tests__/school-config.spec.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260727000001_appointment_capacity_wave_c_architecture/migration.sql`
- Deleted uncommitted local outbox artifacts:
  - `apps/api/src/appointments/appointment-outbox.processor.ts`
  - `packages/database/prisma/migrations/20260725000001_appointment_outbox_wave_c/migration.sql`

## Verification

- `npm.cmd --workspace @smk/database run db:generate`: pass.
- `npm.cmd --workspace @smk/api run test -- --runInBand --cacheDirectory=.tmp/jest-cache-wavec-architectural-followup src/__tests__/appointments.spec.ts src/__tests__/positions.spec.ts src/__tests__/school-config.spec.ts src/__tests__/permissions.spec.ts`: pass, 4 suites / 91 tests.
- `npm.cmd --workspace @smk/api run type-check`: pass.
- `npm.cmd --workspace @smk/web run type-check`: pass.
- `npm.cmd --workspace @smk/api run lint`: pass.
- `npm.cmd --workspace @smk/web run lint`: pass, with existing Next lint deprecation/plugin warning.

Static checks:

- Outbox/logout grep: pass. Hits are limited to this report, history wording, and a history test; no production outbox processor or appointment-driven logout path remains.
- Position writer grep: pass. No production `staffPosition.create/delete` or `userPermissionOverride.upsert` remains in `PositionsService`; hits are negative tests, cleanup of legacy `POSITION_ASSIGNMENT`, or migration classifier context.
- Keycloak role grep: pass semantically. Hits are provisioning/users stable-role operations and Keycloak admin guard tests; no appointment position-role sync path remains.
- `git diff --check -- apps/api/src/positions apps/api/src/appointments apps/api/src/school-config apps/api/src/permissions apps/api/src/keycloak-admin packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260725000001_appointment_outbox_wave_c packages/database/prisma/migrations/20260727000001_appointment_capacity_wave_c_architecture apps/api/src/__tests__ docs/audits/WAVEC-APPOINTMENT-ARCHITECTURAL-REMEDIATION-2026-07-27.md`: pass.

## Explicit Non-Actions

- No PostgreSQL dry-run.
- No Prisma migration apply.
- No schema push.
- No commit, push, PR, merge, or staging promotion.
- No browser QA or staging QA.
- No Keycloak realm/client/env/VPS change.
- No TF2 dry-run or Wave B migration execution.

## Reviewer Request

Please re-review this local Wave C architectural remediation before any Git gate. Focus areas:

- `StaffPosition` no longer creates or deletes effective appointment-derived permission authority.
- `PermissionsService` only applies manual overrides plus ACTIVE appointment permissions.
- Outbox/session logout removal matches Director Option A.
- `maxActiveHolders` trigger migration matches Director Capacity Option A and is suitable for later PostgreSQL staging-copy dry-run.
- Annual cutover and due activation share the same transition helper and preserve transaction/cache boundaries.
