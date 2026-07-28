# Wave C Appointment Compatibility and Activation Follow-up Remediation

Tanggal: 2026-07-27

Status: **LOCAL REMEDIATION COMPLETE - READY FOR REVIEWER GATE, NOT GIT/STAGING SIGN-OFF**

Branch kerja: `feat/appointment-governance-wave-c-activation-20260725`

## Ringkasan Gate

Follow-up ini sekarang sudah mengimplementasikan Gate 2 **Opsi A - internal automation token** sesuai approval Director. Perubahan tetap bersifat local-only: belum ada PostgreSQL dry-run, commit, push, PR, merge, deploy, Keycloak live change, VPS change, atau browser/staging QA.

Invariant yang dipakai:

> Appointment DIIS yang `ACTIVE`, berada pada tahun ajaran aktif, dan berlaku pada tanggal sekarang adalah satu-satunya sumber jabatan efektif dan permission jabatan.

Konsekuensi:

- `StaffPosition` hanya legacy migration/reconciliation data, bukan authority UI, sidebar, diagnostic, permission, atau mutation.
- `POST /appointments/activate-due` punya satu pemilik operasional, yaitu n8n, dengan token internal `x-diis-automation-token` yang fail-closed.
- Tidak ada PostgreSQL dry-run, commit, push, PR, merge, deploy, Keycloak live change, VPS change, atau browser/staging QA dalam sesi ini.

## Source Documents Read

- `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\WAYS-OF-WORKING.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\decision-log.md`
- `docs/audits/APPOINTMENT-GOVERNANCE-KEYCLOAK-TRANSITION-HANDOFF-2026-07-23.md`
- `docs/audits/PROMPT-ARCHITECT-APPOINTMENT-GOVERNANCE-KEYCLOAK-TRANSITION-WAVES-2026-07-23.md`
- `docs/audits/PROMPT-ARCHITECT-FOLLOWUP-APPOINTMENT-GOVERNANCE-WAVE-B-2026-07-24.md`
- `docs/audits/PROMPT-ARCHITECT-WAVEC-APPOINTMENT-ACTIVATION-SESSION-TRANSITION-2026-07-25.md`
- `docs/audits/APPOINTMENT-GOVERNANCE-WAVEC-ARCHITECTURAL-REREVIEW-2026-07-27.md`
- `docs/audits/PROMPT-ARCHITECT-FOLLOWUP-APPOINTMENT-GOVERNANCE-WAVEC-ARCHITECTURAL-2026-07-27.md`
- `docs/audits/WAVEC-APPOINTMENT-ARCHITECTURAL-REMEDIATION-2026-07-27.md`
- `docs/audits/WAVEC-APPOINTMENT-ARCHITECTURAL-FOLLOWUP-REREVIEW-2026-07-27.md`
- `docs/audits/PROMPT-ARCHITECT-FOLLOWUP-WAVEC-COMPATIBILITY-ACTIVATION-2026-07-27.md`
- `docs/audits/PROMPT-ARCHITECT-TF2-P1-1-SECURITY-DATA-MIGRATION-2026-07-23.md`

## Worktree State

`git status --short --branch` menunjukkan branch benar dan worktree mixed:

- Tracked Wave C files sudah modified dari pekerjaan sebelumnya, termasuk `appointments`, `positions`, `permissions`, `school-config`, test fokus, dan `packages/database/prisma/schema.prisma`.
- Banyak untracked historis/scratch di root, `docs/audits`, `.tmp`, dan migration draft.
- Tidak ada staging dilakukan. Packaging nanti wajib explicit file list, bukan `git add .` atau `git add -A`.

## Gate 1 Map A - Read Projection

| Path | Current source found | Required source | Consumer risk |
| --- | --- | --- | --- |
| `/positions/assignments` -> `PositionsService.getAssignments()` | `prisma.staffPosition.findMany({ academicYearId, isActive: true })` | `Appointment` projection for selected/active academic year, with lifecycle status, effective dates, scope, staff display, and derived `isEffectiveNow` | Struktur Organisasi can display legacy holders even when appointment authority differs. |
| `/positions/my-positions` -> `PositionsService.getMyPositions()` | `prisma.staffPosition.findMany()` | Only `Appointment` rows with `status=ACTIVE`, active academic year, `effectiveFrom <= today`, and `effectiveUntil is null or >= today` | Sidebar `positionRoles` can miss a real active appointment or show stale legacy state. |
| `/positions/access-check/:userId` -> `PositionsService.accessCheck()` | Active positions and `positionPermissions` from `StaffPosition` | Explicit diagnostic: stable identity, Keycloak stable roles, active appointments, appointment permissions, manual overrides, final effective permissions | Users dialog can show legacy position authority beside a different effective permission result. |
| `/dashboard/struktur-organisasi` | Fetches `/positions/assignments` and groups by `positionId` | Consume appointment projection and show appointment lifecycle truthfully | Current UI is read-only but still says transition happens in Wave B; copy is stale. |
| `/dashboard/layout.tsx` | Maps `/positions/my-positions` to `positionRoles` | Keep same sidebar contract but fed only by active effective appointments | `APPROVED`, `SUSPENDED`, future, old-year, or legacy rows must not reach sidebar. |
| `/dashboard/users` access dialog | Types `activePositions` and `positionPermissions` | Rename/copy to appointment language: `activeAppointments`, `appointmentPermissions` | Avoid implying StaffPosition is still active authority. |

Before/after intended contract:

- Before: `StaffPosition.isActive` decides visible structure/sidebar.
- After: effective appointment state decides authority; non-effective appointment states can appear only in admin lifecycle projection with explicit status, never as sidebar role.

## Gate 1 Map B - Positional Authorization Inventory

Already appointment-aware:

- `RolesGuard` resolves required position codes through `PermissionsService.getActivePositionCodes()`.
- `PermissionsService.resolvePermissions()` grants appointment-derived permissions only from active appointment, active academic year, and effective dates.
- `PermissionsService` applies only `MANUAL` overrides as explicit exceptions.

Still synchronous/stale and needs targeted follow-up:

- Shared helper `apps/api/src/common/helpers/role-helpers.ts` defines `ELEVATED_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA']`.
- Services using `isElevated()` or `isGuruOnly()` include attendance, grade, class activities, analytics, badges, WA logs, student access, schedule, question bank, and gamification paths.
- Local copies or role constants exist in report cards, teaching assignment, teacher attendance, assessment, announcements, LMS, AI, finance, school-config, and some controller metadata.

Classification:

- Stable identity policy that may remain synchronous: `SUPER_ADMIN`, `TATA_USAHA`, `GURU`, `SISWA`, `ORANG_TUA`, `INDUSTRI`.
- `@Roles('KEPALA_SEKOLAH')` may remain valid at route level because `RolesGuard` is appointment-aware, but downstream service checks must not assume `KEPALA_SEKOLAH` is present in JWT/user.roles.
- Principal capability should be explicit: `SUPER_ADMIN` or active `KEPALA_SEKOLAH` appointment for the intended domain action.
- WAKA/KAPROG/BKK/Hubin must not become globally elevated. Their access remains permission-specific or route-specific.
- Normal `GURU` without appointment must remain scoped to owned teaching/student/class data.

Implementation direction after Gate 2:

- Add a central async capability resolver or small helper service that can answer `hasActivePosition(keycloakId, 'KEPALA_SEKOLAH')` and domain-specific capability checks.
- Replace only intended principal capabilities, not every `isElevated()` occurrence blindly.
- Add tests proving stable `GURU` plus active KS appointment passes the intended KS path, while ordinary `GURU` remains scoped.

## Gate 1 Map C - Activation and Lock

Current code evidence:

- `AppointmentsController` exposes `POST /appointments/activate-due` under class-level `@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')`.
- `AppointmentsService.activateDueAppointments()` already uses `pg_advisory_xact_lock(hashtext('appointment_due_activation'))` and calls `applyAcademicYearActivation()`.
- `SchoolConfigService.createAcademicYear()` and `updateAcademicYear()` call `applyAcademicYearActivation()` inside the academic-year transaction, but do not currently obtain the same lock domain.
- `infrastructure/n8n/workflows/health-check.json` and `backup-daily.json` show n8n schedule-trigger patterns. No appointment due activation workflow exists.
- `docs/decision-log.md` states n8n is the external scheduled trigger owner and NestJS remains the domain logic owner.

Required target flow after Gate 2:

```text
n8n daily schedule
  -> authenticated machine-only POST /appointments/activate-due
  -> activateDueAppointments()
  -> shared advisory lock helper
  -> applyAcademicYearActivation()

academic-year cutover
  -> SchoolConfigService transaction
  -> same shared advisory lock helper
  -> applyAcademicYearActivation()
```

There must be no second transition logic inside n8n.

## Gate 1 Map D - Capacity and Cutover Matrix

| Scenario | Required behavior |
| --- | --- |
| Capacity 1, definitive holder active | New open candidate without `replacesAppointmentId` is blocked if it would exceed capacity. Successor/PLT must explicitly reference replaced appointment. |
| Capacity 2, independent deputy holders | Two independent `ACTIVE` appointments can coexist in same scope if `maxActiveHolders = 2`; a third is blocked. |
| Definitive holder `SUSPENDED` plus linked active PLT | Linked active PLT blocks resume of the definitive holder, even when capacity remains. |
| Resume after linked PLT ended | Definitive holder may resume if no linked PLT is active and `other active holders + 1 <= maxActiveHolders`. |
| Resume with independent deputy and free slot | Allowed when capacity remains after excluding the appointment being resumed. |
| Resume with independent deputy but full capacity | Blocked with clear conflict telling admin to end/clear an active holder, not raw DB constraint. |
| Old-year `ACTIVE` at annual cutover | Becomes `ENDED` with truthful reason/audit history. |
| Old-year `SUSPENDED` at annual cutover | Becomes `ENDED` with truthful reason/audit history. |
| Old-year `DRAFT`, `PENDING_APPROVAL`, `APPROVED` | Becomes `CANCELLED` because the academic year ended before activation. |
| Terminal old-year states | `REJECTED`, `CANCELLED`, `ENDED`, `SUPERSEDED` unchanged. |
| Same-person continuation across years | Old-year authority ends and new-year approved appointment activates in one transaction, with no committed authority gap. |

Capacity governance policy for this wave:

`Position.maxActiveHolders` is seed/migration-only in Wave C. There is no arbitrary UI/API capacity editor in this wave. Future editable catalog governance needs a separate audited wave.

## Execution Result After Gate 2 Approval

Gate 2 approved option:

- **Opsi A: internal automation token untuk n8n appointment due activation.**

Implemented changes:

- Added fail-closed `AppointmentAutomationGuard` using header `x-diis-automation-token` and env `APPOINTMENT_AUTOMATION_TOKEN`.
- Changed `POST /appointments/activate-due` to machine-only public route with custom guard, not human SUPER_ADMIN/KS token.
- Added shared advisory lock helper used by due activation and academic-year activation.
- Kept position codes out of JWT/Keycloak while allowing `RolesGuard` to enrich request context with matching active appointment codes for downstream service checks.
- Converted Struktur Organisasi assignments, sidebar my-positions, and Users access diagnostics from `StaffPosition` authority to `Appointment` authority.
- Updated Users access dialog to show active appointments and appointment-derived permissions explicitly.
- Added n8n workflow `appointment-due-activation-daily.json` with env-only token reference and safe summary counts.
- Added env placeholders in `.env.example`, staging example, docker compose API/n8n wiring, and nginx public-route block for prod/staging API.
- Added DTO validation for `effectiveUntil < effectiveFrom` so API rejects with validation error before DB.
- Updated focused API/web tests and this report.

Residual gates intentionally not executed:

- No PostgreSQL migration apply/dry-run.
- No runtime n8n import/execution.
- No staging/browser QA.
- No commit, push, PR, merge, deploy, Keycloak live change, or VPS change.

## P1 Follow-up After Re-review

Reviewer re-review `WAVEC-APPOINTMENT-COMPATIBILITY-ACTIVATION-FOLLOWUP-REREVIEW-2026-07-27.md` found two P1 issues at the automation boundary. Both are now remediated locally:

1. **Automation endpoint cannot select arbitrary academic year.**
   - Removed `academicYearId` from `POST /appointments/activate-due`.
   - `activateDueAppointments()` now always resolves `academicYear.findFirst({ where: { isActive: true } })`.
   - Even if a caller passes an extra runtime argument, the service ignores it and never calls `academicYear.findUnique()` for due activation.

2. **Automation response no longer leaks affected user identifiers.**
   - `applyAcademicYearActivation()` still returns internal `affectedKeycloakIds` to service/cutover code for cache invalidation only.
   - `activateDueAppointments()` now returns only safe counts: `endedCount`, `cancelledCount`, `activatedCount`, and `affectedUserCount`.
   - n8n workflow now reads `body.affectedUserCount`; it no longer reads or stores `body.affectedKeycloakIds`.

Focused regression added:

- `AppointmentsService cutover and history > due activator uses only active academic year, hides identifiers, and invalidates affected users after commit`
  - Calls `activateDueAppointments()` with an extra fake `academicYearId` via runtime cast.
  - Expects only active-year lookup.
  - Expects exact safe response keys.
  - Expects `affectedKeycloakIds`, `staffId`, and `fullName` absent from response.

## Self-Critique

1. Starting code before Gate 2 would risk choosing the wrong machine auth model and mixing security architecture with projection fixes.
2. Leaving `/appointments/activate-due` as human `@Roles` access would not satisfy n8n daily automation and would encourage manual SUPER_ADMIN calls.
3. Marking the scheduler endpoint `@Public()` without a fail-closed custom guard would be a serious auth regression.
4. Replacing every `isElevated()` with a broad async "position elevated" helper would over-grant WAKA/KAPROG/BKK/Hubin. The fix must be capability-specific.
5. Using `Appointment` projection but preserving stale labels like "assignment" or "StaffPosition" could confuse reviewer and operators.
6. `resume()` must not reject every other active holder when capacity is greater than one; it must distinguish linked PLT from independent capacity holders.
7. Annual cutover must terminalize old-year non-terminal states, not merely rely on inactive year filtering.
8. Existing `.env`/runtime secret files must not be quoted in docs, tests, or logs.

## Fixed Plan

The implementation plan is revised to:

- Gate scheduler auth first.
- Implement Opsi A or Opsi B exactly as approved.
- Use one exported advisory lock helper/constant for due activation and academic-year cutover.
- Treat appointment projection, capability policy, scheduler auth, resume/capacity, and cutover matrix as one reviewer batch after Gate 2.
- Keep schema/migration unchanged unless Director explicitly approves a separate schema change. Current follow-up should work against the existing Wave C schema draft.

## Gate 2 Scheduler Auth Recommendation

Recommendation: **Opsi A - internal automation token**.

Why Opsi A:

- The operation is narrow, idempotent, and machine-only.
- It avoids granting any human role or SUPER_ADMIN-like authority to n8n.
- It avoids adding Keycloak realm/client complexity during this follow-up.
- It matches existing n8n workflow style using environment/credential values while keeping domain logic in NestJS.

Required Opsi A contract:

- n8n calls an internal API URL, not the public browser URL, where deployment topology allows it.
- Endpoint uses a custom machine-only guard that fails closed.
- Secret is random, at least 32 bytes, from environment or n8n credential only.
- Compare token with constant-time comparison.
- No secret in logs, response, docs, workflow JSON literals, test fixtures, or Git.
- `.env.example` and staging example contain placeholders only.
- Logs are PII-minimal: execution id, status, counts, and error class/message without token or user data.
- If the route is reachable via public reverse proxy, nginx must block it or add an explicit internal-only rule as defense in depth.
- Rotation and emergency disable steps are documented.

Alternative: **Opsi B - Keycloak machine client with narrow scope**.

Opsi B contract:

- New Keycloak machine client/service account with one narrow claim/scope such as `appointment.activate-due`.
- No SUPER_ADMIN user token.
- No position realm role.
- API guard accepts machine claim only for this operation.
- Realm seed, secret deployment, rotation, and staging/prod credential alignment need separate review.

Not allowed:

- Human SUPER_ADMIN token.
- Password for a real user.
- Broad `diis-api` secret reuse.
- Plain `@Public()` endpoint without a custom fail-closed guard.
- Secret literals in n8n JSON, docs, logs, or Git.

## Threat Model For Opsi A

| Threat | Mitigation |
| --- | --- |
| Public caller hits `/appointments/activate-due` | Custom machine guard rejects missing/wrong token. Public reverse proxy blocks route if exposed. |
| Token leaks from workflow JSON | Workflow must reference env/credential expression only; no literal token committed. |
| Token leaks in logs | Guard and workflow log only safe metadata; tests assert rejected logs do not include credential. |
| Replay | Operation is idempotent and protected by advisory lock. Repeated valid calls only activate due appointments once. |
| n8n compromised | Token authorizes only due activation, not human/admin APIs. Rotation and workflow disable documented. |
| Race with academic-year cutover | Due activation and cutover use the same advisory lock helper in the same transaction boundary. |
| Wrong URL/env | README documents internal URL per environment and manual test expected response. |

## Planned Files After Opsi A Approval

Likely product files:

- `apps/api/src/appointments/appointments.controller.ts`
- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/positions/positions.service.ts`
- `apps/api/src/school-config/school-config.service.ts`
- `apps/api/src/common/helpers/role-helpers.ts` or a new focused capability helper/service
- `apps/api/src/auth/guards/internal-automation.guard.ts` or a scoped guard under `appointments`
- `apps/api/src/__tests__/appointments.spec.ts`
- `apps/api/src/__tests__/positions.spec.ts`
- `apps/api/src/__tests__/permissions.spec.ts`
- `apps/api/src/__tests__/school-config.spec.ts`
- Additional focused service tests for appointment-aware policy if needed
- `apps/web/src/app/dashboard/layout.tsx`
- `apps/web/src/app/dashboard/struktur-organisasi/page.tsx`
- `apps/web/src/app/dashboard/struktur-organisasi/actions.ts`
- `apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx`
- `apps/web/src/app/dashboard/users/actions.ts`
- `apps/web/src/app/dashboard/users/_components/UserAccessDialog.tsx`
- `infrastructure/n8n/workflows/appointment-due-activation-daily.json`
- `infrastructure/n8n/README.md`
- `.env.example`
- `infrastructure/docker/.env.staging.example`
- Possible nginx route config only if required to block public scheduler access
- This report

No schema/migration file should be edited unless a new Director approval is requested first.

## Test Plan After Gate 2

API focused:

```powershell
npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/appointments.spec.ts src/__tests__/positions.spec.ts src/__tests__/permissions.spec.ts src/__tests__/school-config.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-wavec-compatibility
```

API policy focused:

```powershell
npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/attendance.spec.ts src/__tests__/grade.spec.ts src/__tests__/analytics.spec.ts src/__tests__/badges.spec.ts src/__tests__/gamification.spec.ts src/__tests__/wa-log.spec.ts src/__tests__/student.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/teaching-assignment.spec.ts src/__tests__/teacher-attendance.spec.ts src/__tests__/question-bank.spec.ts src/__tests__/schedule.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-wavec-policy
```

Workspace checks:

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/web run lint
npx prisma validate --schema packages/database/prisma/schema.prisma
git diff --check -- apps/api/src apps/web/src packages/database/prisma infrastructure/n8n docs/audits
```

## Verification Run

Executed locally on 2026-07-27:

- `npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/appointments.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-wavec-activation-p1`
  - Result: **PASS**, 1 suite / 21 tests.
  - Purpose: focused P1 follow-up for active-year-only due activation and safe automation response.
- `node -e "const text=require('fs').readFileSync('infrastructure/n8n/workflows/appointment-due-activation-daily.json','utf8'); JSON.parse(text); if(text.includes('affectedKeycloakIds')) { process.exitCode=1; console.error('unsafe key found'); } else { console.log('workflow JSON ok; no affectedKeycloakIds'); }"`
  - Result: **PASS**.
- `rg -n "academicYearId|affectedKeycloakIds|staffId|fullName" apps/api/src/appointments/appointments.controller.ts infrastructure/n8n/workflows/appointment-due-activation-daily.json`
  - Result: **PASS**, no matches at HTTP/n8n boundary.
- `rg -n "activateDueAppointments\\(" apps/api/src apps/api/src/__tests__`
  - Result: **PASS**, only service definition and controller call remain in product code.
- `npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/appointments.spec.ts src/__tests__/positions.spec.ts src/__tests__/permissions.spec.ts src/__tests__/school-config.spec.ts src/__tests__/roles.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-wavec-compatibility`
  - Result: **PASS**, 5 suites / 107 tests.
  - Note: existing ts-jest warnings about compiled `.js` files under `packages/*/dist`.
- `npm.cmd --workspace @smk/web run test -- --runTestsByPath src/__tests__/struktur-ui.test.ts --runInBand --cacheDirectory=.tmp/jest-cache-wavec-web`
  - Result: **PASS**, 1 suite / 3 tests.
- `npm.cmd --workspace @smk/api run type-check`
  - Result: **PASS**.
- `npm.cmd --workspace @smk/web run type-check`
  - Result: **PASS**.
- `npm.cmd --workspace @smk/api run lint`
  - Result: **PASS**.
- `npm.cmd --workspace @smk/web run lint`
  - Result: **PASS**, with existing Next lint deprecation / plugin warning only.
- `npm.cmd --workspace @smk/api run build`
  - Result: **PASS**.
- `npm.cmd --workspace @smk/web run type-check`
  - Result: **PASS** after P1 follow-up; no web source changes in this follow-up beyond previous verified batch.
- `npm.cmd --workspace @smk/web run build`
  - Result: **PASS**, 39/39 pages generated.
- `node -e "JSON.parse(require('fs').readFileSync('infrastructure/n8n/workflows/appointment-due-activation-daily.json','utf8')); console.log('n8n workflow JSON ok')"`
  - Result: **PASS**.
- `npx.cmd prisma validate --schema packages/database/prisma/schema.prisma`
  - First run failed because local `DATABASE_URL` was absent.
- `$env:DATABASE_URL = 'postgresql://user:pass@localhost:5432/smk_db'; npx.cmd prisma validate --schema packages/database/prisma/schema.prisma`
  - Result: **PASS**. Dummy URL used only for schema parsing; no DB connection or migration.

Pending final checks before reviewer handoff:

- `git diff --check -- .env.example apps/api/src apps/web/src infrastructure/docker infrastructure/n8n infrastructure/nginx docs/audits packages/database/prisma`
  - Result: **PASS**.
- `rg -n "activePositions|positionPermissions|prisma\\.staffPosition\\.findMany\\(|prisma\\.staffPosition\\.create\\(|prisma\\.staffPosition\\.delete\\(" apps/api/src/positions apps/web/src/app/dashboard/struktur-organisasi apps/web/src/app/dashboard/users apps/web/src/app/dashboard/layout.tsx`
  - Result: **PASS**, no matches.
- `rg -n "[ \\t]+$" apps/api/src/appointments/appointment-automation.guard.ts apps/web/src/app/dashboard/struktur-organisasi/struktur-ui.ts apps/web/src/__tests__/struktur-ui.test.ts infrastructure/n8n/workflows/appointment-due-activation-daily.json docs/audits/WAVEC-APPOINTMENT-COMPATIBILITY-ACTIVATION-FOLLOWUP-REMEDIATION-2026-07-27.md`
  - Result: **PASS**, no matches.

## Reviewer Focus List

Reviewer should inspect:

- `apps/api/src/appointments/appointment-automation.guard.ts`
- `apps/api/src/appointments/appointments.controller.ts`
- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/auth/guards/roles.guard.ts`
- `apps/api/src/positions/positions.service.ts`
- `apps/api/src/school-config/school-config.service.ts`
- `apps/web/src/app/dashboard/struktur-organisasi/*`
- `apps/web/src/app/dashboard/users/_components/UserAccessDialog.tsx`
- `infrastructure/n8n/workflows/appointment-due-activation-daily.json`
- `infrastructure/docker/docker-compose.yml`
- `infrastructure/docker/docker-compose.staging.yml`
- `infrastructure/nginx/nginx.conf`

Gate recommendation after this local pass:

- **Reviewer re-review: allowed next.**
- **PostgreSQL dry-run / staging sign-off: still hold** until reviewer approves this batch and runtime dry-run/QA evidence is produced.
- **Git gate / PR: still hold** until reviewer explicitly approves packaging.

Expected focused proof:

- Active appointment appears in structure projection, `/positions/my-positions`, sidebar input, and access diagnostic.
- `APPROVED`, future, `SUSPENDED`, `ENDED`, old-year appointments do not become sidebar authority.
- Access diagnostic does not query or report `StaffPosition` as active authority.
- Stable `GURU` plus active `KEPALA_SEKOLAH` appointment passes intended principal capability.
- Normal `GURU` remains scoped.
- WAKA/KAPROG are not globally elevated.
- Scheduler auth rejects missing/wrong credential.
- Valid scheduler credential is idempotent and PII-minimal in logs.
- Due activation and academic-year cutover use the same lock helper.
- Capacity-two holders, linked PLT blocking, and resume-after-PLT-ended follow the matrix.
- Cutover closes old-year non-terminal states and preserves same-person continuation with no committed gap.

## Commands Run For This Gate

- `git status --short --branch`
- `rg -n "getAssignments|getMyPositions|accessCheck|staffPosition|appointment.findMany|activateDueAppointments|applyAcademicYearActivation|assertNoActiveScopeConflict|resume\\(|ACTIVE_CAPACITY_STATUS|pg_advisory|appointment_due_activation|supersede|SUSPENDED|ENDED|CANCELLED|PENDING_APPROVAL|APPROVED" apps/api/src/positions/positions.service.ts apps/api/src/appointments/appointments.service.ts apps/api/src/school-config/school-config.service.ts apps/api/src/appointments/appointments.controller.ts apps/api/src/positions/positions.controller.ts`
- `rg -n "getAssignments|getMyPositions|accessCheck|positions/assignments|my-positions|access-check|positionRoles|activePositions|positionPermissions|StaffPosition|Wave B|mode transisi|transition" apps/web/src/app/dashboard/struktur-organisasi apps/web/src/app/dashboard/layout.tsx apps/web/src/app/dashboard/users`
- `rg -n "isElevated\\(|isGuruOnly\\(|ELEVATED_ROLES|ELEVATED|MANAGER_ROLES|REVIEWER_ROLES|KEPALA_SEKOLAH|WAKA_|KAPROG|KOOR_BKK|KOOR_HUBIN" apps/api/src --glob "*.ts"`
- `rg -n "activate-due|appointment_due_activation|APPOINTMENT.*TOKEN|Authorization|Public\\(|@Public|ScheduleTrigger|scheduleTrigger" apps/api/src infrastructure/n8n --glob "*.ts" --glob "*.json" --glob "*.md"`
- `rg -n -C 6 "Authorization|Bearer|scheduleTrigger|DIIS|API|WEBHOOK|BASE|secret|credential|health|backup" infrastructure/n8n/README.md infrastructure/n8n/workflows/health-check.json infrastructure/n8n/workflows/backup-daily.json`
- `rg -n "n8n|schedule|scheduled|trigger|cron|external trigger|NestJS domain|domain logic" docs/decision-log.md docs/WAYS-OF-WORKING.md`
- `rg -n "api\\.smk|staging-api|proxy_pass|location|nginx|server_name" infrastructure/nginx infrastructure/docker --glob "*.conf" --glob "*.yml" --glob "*.yaml" --glob "*.md"`
- `rg -n "Guard|UseGuards|APP_GUARD|Public\\(|RolesGuard|KeycloakGuard|permissions.guard|CurrentUser" apps/api/src/app.module.ts apps/api/src/auth apps/api/src/permissions apps/api/src/appointments`

No tests, type-check, lint, Prisma validate, Git staging, commit, push, PR, database dry-run, browser QA, or staging QA were run because Gate 2 blocks implementation.

## Current Residual Risk

- P1 issues from re-review remain open until implementation after Gate 2.
- Existing tracked worktree remains mixed with prior Wave C changes.
- The scheduler endpoint is currently human-role-gated, not n8n-machine-gated.
- Projection endpoints still read `StaffPosition`.
- Service-level authorization still contains synchronous role helper patterns that can fail-closed for KS-as-appointment.
- Cutover and due activation do not yet share an explicit lock helper in all paths.

## Director Decision Needed

Please choose one:

1. **Approve Opsi A**: internal automation token for n8n due activation.
2. **Approve Opsi B**: Keycloak machine client with narrow `appointment.activate-due` scope.

Recommended exact approval phrase:

`Saya menyetujui Gate 2 Opsi A: internal automation token untuk n8n appointment due activation.`

After that approval, executor can continue implementation locally and then hand off to Reviewer. No Git/PostgreSQL/staging gate should happen before fresh re-review.
