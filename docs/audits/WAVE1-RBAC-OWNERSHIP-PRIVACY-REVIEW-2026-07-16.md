# Wave 1 RBAC Ownership Privacy Review - 2026-07-16

## 1. Verdict

**FOLLOW-UP REQUIRED.**

Wave 1 closes several high-risk API-side RBAC and privacy issues, and the executor's focused verification is reproducible locally. I did not find a confirmed active P0 data leak in the reviewed diff. However, Wave 1 is not yet complete against its own acceptance contract because parent multi-child binding is still not data-driven beyond the first child, SPP data shape is mismatched between API and UI, and list endpoints for scoped GURU access can silently ignore a forbidden `classId` filter.

It is **not safe to proceed to Wave 2 yet**. Run a short Wave 1 follow-up first, then re-review.

Manual browser/staging QA was **not run** in this reviewer session.

## 2. Source Docs and Diffs Reviewed

- `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
- `docs/audits/PROMPT-ARCHITECT-WAVE1-RBAC-OWNERSHIP-PRIVACY-2026-07-16.md`
- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md`
- `docs/AI_CONTEXT.md`, `AGENTS.md`, `docs/WAYS-OF-WORKING.md`, `docs/decision-log.md`
- Current uncommitted Wave 1 diff across API tests/services/controllers and ORANG_TUA akademik UI.

## 3. Verification Commands and Results

Run from `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school`.

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/permissions.spec.ts src/__tests__/student.spec.ts src/__tests__/finance.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/wa-log.spec.ts src/__tests__/analytics.spec.ts src/__tests__/positions.spec.ts
```

Result: **PASS**, 7 suites, 168 tests.

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
```

Result: **PASS** for all. Web lint emitted existing Next.js `next lint` deprecation and plugin warnings, with no ESLint warnings or errors.

Targeted `rg` review for permission, deny override, transaction, distributed report, WAKA, and own/child patterns was also run.

## 4. Findings

### P1 - Parent multi-child binding is still first-child/server-incomplete, and SPP UI consumes the wrong payload shape

Files:

- `apps/web/src/app/dashboard/akademik/page.tsx:269`
- `apps/web/src/app/dashboard/akademik/page.tsx:273`
- `apps/web/src/app/dashboard/akademik/page.tsx:277`
- `apps/web/src/app/dashboard/akademik/page.tsx:313`
- `apps/api/src/student-dashboard/student-dashboard.service.ts:73`
- `apps/api/src/student-dashboard/student-dashboard.service.ts:85`
- `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx:108`
- `apps/web/src/app/dashboard/akademik/_components/ortu/ortu-mappers.ts:17`
- `apps/web/src/app/dashboard/akademik/_components/ortu/ortu-mappers.ts:41`

The ORANG_TUA server page selects `firstChild` and fetches grades, attendance, schedule, badges, WA log, rank, and assignment data for that child only. Switching child in `OrtuWorkspace` only filters already-fetched arrays. This prevents stale first-child rows from rendering when `studentId` exists, but it does not satisfy the Wave 1 requirement that the active child selection drive actual data shown.

The SPP path is worse: `page.tsx` types `/student-dashboard/spp` as a flat payment array, while `StudentDashboardService.getSpp()` returns grouped rows shaped as `{ studentId, studentName, payments: [...] }`. `OrtuWorkspace` and `mapSppToPembayaran()` expect top-level `id`, `month`, `amount`, `status`, and `dueDate`, so the payment badge and payment list can be wrong or empty even when real payments exist.

Required follow-up:

- Either fetch child-specific data on child switch, or fetch all children data and flatten/group it explicitly by `studentId`.
- Normalize `/student-dashboard/spp` response at the UI boundary before passing it to `OrtuWorkspace`.
- Add a parent-with-two-children component/browser test covering grades, attendance, SPP, WA log, rank, and reload/switch behavior.

### P1 - Scoped list endpoints silently ignore forbidden `classId` filters instead of failing closed or returning the requested intersection

Files:

- `apps/api/src/student/student.service.ts:149`
- `apps/api/src/student/student.service.ts:151`
- `apps/api/src/class-activities/class-activities.service.ts:85`
- `apps/api/src/class-activities/class-activities.service.ts:86`
- `apps/api/src/__tests__/student.spec.ts:219`
- `apps/api/src/__tests__/report-cards-activities.spec.ts:160`

For GURU list reads, if the caller supplies a `classId` outside readable classes, both services replace that requested filter with `{ in: readableClassIds }`. That does avoid leaking the forbidden class, but it also returns unrelated allowed-class data for a request that explicitly targeted an out-of-scope class. This is not fail-closed and can create misleading UI/API behavior.

The focused tests cover `findById` out-of-class denial, but do not cover `/students?classId=unassigned` or class-activity `findAll({ classId: unassigned })`.

Required follow-up:

- For non-elevated scoped list endpoints, treat forbidden `classId` as `403` or as a strict empty intersection, then document the chosen policy.
- Add negative tests for student list and class activity list with unassigned `classId`.

### P2 - Wali class access is not included in the shared GURU class resolver

Files:

- `apps/api/src/common/helpers/role-helpers.ts:71`
- `apps/api/src/classes/classes.service.ts:52`
- `packages/database/prisma/schema.prisma:174`
- `packages/database/prisma/schema.prisma:248`

Wave 1 acceptance says GURU scope can include assigned class, wali class, or explicit structural permission. The shared `resolveGuruClassIds()` only reads `TeachingAssignment`, while the schema and class service also model wali kelas through `Class.teacherId` and `Teacher.isWaliKelas`. If a wali teacher has homeroom responsibility without a teaching assignment row for that class, Wave 1 will deny access incorrectly.

This is a false-negative authorization risk rather than a privacy leak, so P2.

Required follow-up:

- Decide whether wali access should be included in `resolveGuruClassIds()` or a separate resolver.
- Add positive and negative tests for wali-only class access.

### P2 - Coverage is strong on API units but still misses the riskiest UI and list-filter cases

Files:

- `apps/api/src/__tests__/report-cards-activities.spec.ts:201`
- `apps/api/src/__tests__/report-cards-activities.spec.ts:208`
- `apps/api/src/__tests__/positions.spec.ts:21`
- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REMEDIATION-2026-07-16.md`

The 168 focused API tests are useful and pass. Remaining gaps:

- No class-activity read scoping test for GURU/SISWA/ORANG_TUA list paths.
- No unassigned `classId` list-filter negative tests.
- No parent multi-child UI/browser test.
- Position transaction coverage is still mocked unit-level, not a real DB transaction proof.

## 5. Claim-by-Claim Audit

| ID | Reviewer status | Notes |
|---|---|---|
| W1-01 GURU over-read | Mostly closed, follow-up required | Detail and grades/attendance section checks now deny unassigned students, but list-filter behavior and wali-only class semantics remain incomplete. |
| W1-02 PDP consent propagation | Accepted for assignment path | `assignParent()` writes `consentAt` for student and parent user in one transaction. I did not run a browser first-login consent QA. |
| W1-03 Permission/role mismatch | Mostly closed | Alternative permissions, finance own/child, WA child, analytics own/child, and WAKA review gates are internally consistent with current permission catalog. |
| W1-04 Report privacy | Closed for query/status gate | SISWA/ORANG_TUA list and section endpoints require distributed report presence. Live-vs-snapshot section data remains a valid deferred Wave 6 risk. |
| W1-05 Class activity ownership | Partial | Create/update/delete ownership is improved; read/list scoping lacks negative tests and has the forbidden `classId` fallback behavior. |
| W1-06 Finance semantics | Closed for API service | Create defaults unpaid/no event; approve transitions to paid and emits. Tests pass. |
| W1-07 Parent multi-child binding | Follow-up required | UI prevents some stale data display by filtering, but data fetch remains first-child-oriented and SPP shape is mismatched. |
| W1-08 Period/org catalog | Deferred accepted | No current permission catalog for school period/profile/major/calendar. Deferral is valid and not hiding an active P0 leak found in this review. |
| W1-09 Permission override deny | Closed | `grant:false` writes deny override and effective permission resolver removes role-derived permission. Cache invalidation is covered. |
| W1-10 Position transaction | Mostly closed | DB writes are in Prisma transactions; Keycloak remains fail-soft after commit. Coverage is unit/mocked only. |

## 6. Manual QA Status

Manual app/browser QA was not run. No staging/browser language should be used for Wave 1 completion yet.

Recommended smoke after follow-up:

1. GURU assigned vs unassigned student and class activity access.
2. SISWA/ORANG_TUA report-card `status=draft|checked|published|distributed`.
3. TU create SPP, KS/SA approve, repeated approve blocked.
4. ORANG_TUA with two children switches child and verifies finance, grades, attendance, WA, report panel, rank, and reload.
5. WAKA_KURIKULUM opens allowed academic review paths and is denied non-academic high-power paths.

## 7. Deferred Risks That Remain Valid

- Report-card section content still reads live data rather than immutable distributed snapshots.
- Position transaction behavior lacks real DB transaction proof.
- WAKA access depends on Keycloak position-role sync and effective permission overrides.
- School period/org permission catalog needs a future approved permission design.

## 8. Recommendation

Do a narrow Wave 1 follow-up before Wave 2:

1. Fix ORANG_TUA multi-child data contract and SPP payload mapping.
2. Fix or explicitly define forbidden `classId` list-filter behavior for scoped roles.
3. Add missing negative/component tests.
4. Re-run the same focused checks plus manual parent/GURU browser smoke if environment is available.
