# Wave 1 RBAC Ownership Privacy Follow-up - 2026-07-16

## Scope

Follow-up kecil setelah review Wave 1 dengan verdict `FOLLOW-UP REQUIRED`. Scope dibatasi ke dua P1 dan P2 murah yang disebut reviewer:

- Parent ORANG_TUA multi-child data contract dan SPP grouped payload mapping.
- GURU/non-elevated scoped list endpoint yang sebelumnya silently ignored forbidden `classId`.
- Wali-only class access di shared GURU class resolver.
- Coverage tambahan untuk list scoping, wali resolver, mapper parent, dan posisi transaction status dokumentasi.

Tidak ada Wave 2, schema, dependency, seed/catalog, Docker, CI, staging, production, deploy, full report-card pipeline, RPP body, assessment, atau semester-close change.

## Source Docs Read

- `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
- `AGENTS.md`
- `docs/WAYS-OF-WORKING.md`
- `docs/decision-log.md`
- `docs/architecture/academic-lifecycle.md`
- `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
- `docs/audits/PROMPT-ARCHITECT-WAVE1-RBAC-OWNERSHIP-PRIVACY-2026-07-16.md`
- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md`
- `docs/audits/PROMPT-ARCHITECT-REVIEW-WAVE1-RBAC-OWNERSHIP-PRIVACY-2026-07-16.md`
- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REVIEW-2026-07-16.md`
- Attached follow-up Prompt Architect handoff.

## Plan, Critique, Fixed Plan

Initial plan:

1. Fail closed forbidden `classId` filters for student and class activity list.
2. Add wali classes to `resolveGuruClassIds()`.
3. Fetch/normalize all ORANG_TUA child data at the dashboard boundary.
4. Add API and web mapper tests.
5. Run focused verification and write report.

Critique:

- Scope must stay follow-up-only and avoid Wave 2 or Phase 5/6 report-card workflow work.
- Parent fix must not add another client-side hide-only layer; data needs `studentId` tags before render.
- Forbidden `classId` needs explicit policy. Chosen policy: `403 Forbidden`.
- Wali resolver change affects shared helper callers, so focused tests must cover adjacent services.

Fixed plan executed:

- Implement `ForbiddenException` for out-of-scope requested `classId`.
- Merge teaching assignment classes and active wali classes in shared resolver with dedupe.
- Fetch all ORANG_TUA children data server-side where child-specific endpoints exist, normalize grouped SPP and assignments, compute rank by `studentId`, and filter active child panels by `studentId`.
- Add focused API tests and pure web mapper tests.

## Review Findings Addressed

### P1 - Parent multi-child binding and SPP payload mismatch

Closed in code:

- `apps/web/src/app/dashboard/akademik/page.tsx`
  - Removed first-child-only parent data fetch.
  - Fetches grades, attendance, schedules, badges, and WA logs for every registered child.
  - Uses `/student-dashboard/spp` as grouped parent-wide data and normalizes it.
  - Uses `/student-dashboard/assignments` grouped parent-wide data and normalizes it.
  - Computes `childRanks` keyed by `studentId`.
- `apps/web/src/app/dashboard/akademik/_components/ortu/ortu-mappers.ts`
  - Added `normalizeSppGroups()`, `normalizeAssignmentGroups()`, and `filterByStudentId()`.
- `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx`
  - Filters grades, attendance, schedule, SPP, badges, WA log, and report modal grades by active child.
  - Uses `childRanks[activeStudentId]` instead of one first-child `childRank`.

Test proof:

- `apps/web/src/__tests__/ortu-mappers.test.ts`
  - Verifies grouped SPP shape becomes flat child-tagged UI payments.
  - Verifies active-child filtering excludes other child rows.
  - Verifies grouped assignments become child-tagged items.

### P1 - Forbidden `classId` list filter silently ignored

Policy chosen: **fail closed with `ForbiddenException`** for scoped non-elevated list endpoints when a caller requests an out-of-scope `classId`.

Closed in code:

- `apps/api/src/student/student.service.ts`
  - GURU `/students?classId=...` now throws 403 for forbidden classId.
- `apps/api/src/class-activities/class-activities.service.ts`
  - GURU, SISWA, and ORANG_TUA list reads now throw 403 for forbidden classId.
  - Parent child class scopes are deduped before querying.

Test proof:

- `apps/api/src/__tests__/student.spec.ts`
  - GURU list allowed assignment/wali class.
  - GURU wali-only class allowed.
  - GURU forbidden classId rejects and does not query students.
- `apps/api/src/__tests__/report-cards-activities.spec.ts`
  - Class activity GURU forbidden classId rejects and does not query activities.
  - SISWA and ORANG_TUA read scopes are tested.

### P2 - Wali-only class access

Closed in code:

- `apps/api/src/common/helpers/role-helpers.ts`
  - `resolveGuruClassIds()` now returns teaching assignment classIds plus active `Class.teacherId` wali classes, deduped.
- `apps/api/src/report-cards/report-cards.service.ts`
  - GURU report-card list ownership now uses the shared resolver too, so wali-only scope is consistent with section checks and other services.

Test proof:

- Student list and class activity tests cover wali-only class access.
- Report-card ownership test now proves assignment plus wali class resolution.

### P2 - Coverage gaps

Closed or documented:

- Parent multi-child mapper coverage added.
- Student list and class activity forbidden classId tests added.
- Class activity read scoping for GURU/SISWA/ORANG_TUA added.
- Wali-only resolver behavior covered through service tests.
- Position transaction proof remains the existing mocked unit-level proof; no real DB transaction integration was added in this follow-up.

## Files Changed

- `apps/api/src/common/helpers/role-helpers.ts`
- `apps/api/src/student/student.service.ts`
- `apps/api/src/class-activities/class-activities.service.ts`
- `apps/api/src/report-cards/report-cards.service.ts`
- `apps/api/src/__tests__/student.spec.ts`
- `apps/api/src/__tests__/report-cards-activities.spec.ts`
- `apps/api/src/__tests__/analytics.spec.ts`
- `apps/api/src/__tests__/attendance.spec.ts`
- `apps/web/src/app/dashboard/akademik/page.tsx`
- `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/ortu/ortu-mappers.ts`
- `apps/web/src/__tests__/ortu-mappers.test.ts`

## Verification

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/student.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/positions.spec.ts
```

PASS: 3 suites, 79 tests.

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/permissions.spec.ts src/__tests__/student.spec.ts src/__tests__/finance.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/wa-log.spec.ts src/__tests__/analytics.spec.ts src/__tests__/positions.spec.ts
```

PASS: 7 suites, 175 tests.

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/attendance.spec.ts
```

PASS: 1 suite, 27 tests.

```powershell
npm.cmd --workspace @smk/web test -- --runInBand --cacheDirectory ../../.tmp/jest-cache-web src/__tests__/ortu-mappers.test.ts
```

PASS: 1 suite, 3 tests.

Initial web Jest run without `--cacheDirectory` failed with `EPERM` writing to `C:\Users\USER\AppData\Local\Temp\jest`; rerun with workspace cache passed.

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
```

PASS for all. Web lint still prints existing Next.js `next lint` deprecation and plugin-detection warning, with no ESLint warnings or errors.

```powershell
git diff --check -- <follow-up files>
```

PASS.

## Manual QA

Manual browser/staging QA was not run in this workspace turn.

Recommended re-review smoke:

- ORANG_TUA with two children: switch child on `/dashboard/akademik`; verify grades, attendance, SPP/payment, WA log, badges, rank, and report modal use selected child or selected-child empty state.
- GURU: request assigned/wali class students and activities; request unrelated `classId`; expect 403.
- Wali-only teacher fixture: verify homeroom class access without teaching assignment; unrelated class denied.

## Schema Dependency Seed Migration

- Schema changes: No.
- Dependency changes: No.
- Seed/catalog changes: No.
- Migration generated/applied: No.

## Residual Risks

- Manual browser/staging QA is still pending.
- Parent dashboard now fetches all child data server-side at page render. It does not yet do client-side per-child lazy refresh after selector changes.
- Position transaction proof remains unit/mocked; no real DB transaction integration proof was added.
- Report-card section live-vs-snapshot correctness remains Wave 6 scope.
- School period/org permission catalog remains the accepted W1-08 deferral from the prior review.

## Recommendation

Ready for Wave 1 re-review: **yes**.

Do not proceed to Wave 2 until the reviewer confirms the follow-up fixes satisfy the previous `FOLLOW-UP REQUIRED` findings.
