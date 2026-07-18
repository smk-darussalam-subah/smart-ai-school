# Wave 1 RBAC Ownership Privacy Re-review - 2026-07-16

## 1. Verdict

**APPROVED FOR WAVE 2 CODE WORK.**

Follow-up Wave 1 sufficiently closes the prior `FOLLOW-UP REQUIRED` findings for local code/test gate purposes:

- Parent ORANG_TUA dashboard no longer fetches only the first child for the reviewed datasets.
- Grouped `/student-dashboard/spp` and `/student-dashboard/assignments` payloads are normalized into child-tagged flat arrays before UI filtering.
- Scoped list endpoints for students and class activities now fail closed with `ForbiddenException` when a non-elevated user requests an out-of-scope `classId`.
- `resolveGuruClassIds()` now includes both teaching-assignment classes and active wali classes from `Class.teacherId`.
- Report-card GURU list ownership now reuses the shared class resolver.

No remaining P0/P1 blocker was confirmed in this re-review. Manual browser/staging QA was not run, so this is not a production/staging sign-off.

Confidence: **88%**.

## 2. Scope Reviewed

Primary follow-up artifacts:

- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-FOLLOWUP-2026-07-16.md`
- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REVIEW-2026-07-16.md`
- Current Wave 1 diff in API services/tests and ORANG_TUA akademik UI.

Primary files inspected:

- `apps/web/src/app/dashboard/akademik/page.tsx`
- `apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/ortu/ortu-mappers.ts`
- `apps/web/src/__tests__/ortu-mappers.test.ts`
- `apps/api/src/student/student.service.ts`
- `apps/api/src/class-activities/class-activities.service.ts`
- `apps/api/src/common/helpers/role-helpers.ts`
- `apps/api/src/report-cards/report-cards.service.ts`
- `apps/api/src/__tests__/student.spec.ts`
- `apps/api/src/__tests__/report-cards-activities.spec.ts`

## 3. Finding Closure

### Prior P1: ORANG_TUA multi-child and SPP payload mismatch

Status: **Closed for local review.**

Evidence:

- `page.tsx` fetches child-specific grades, attendance, schedules, badges, and WA logs for all registered child IDs and tags each row with `studentId`.
- `normalizeSppGroups()` converts grouped parent-wide SPP payloads to flat child-tagged rows.
- `normalizeAssignmentGroups()` does the same for grouped assignments.
- `OrtuWorkspace` filters grades, attendance, schedule, SPP, badges, WA log, and rank by active `studentId`.
- Web mapper test proves SPP normalization, active-child filtering, and assignment normalization.

Residual: no browser/component interaction test was run for the full child switch UI.

### Prior P1: Scoped list `classId` silently broadened

Status: **Closed.**

Evidence:

- `StudentService.findAll()` throws `ForbiddenException` for GURU `classId` outside resolved class scope.
- `ClassActivitiesService.findAll()` throws `ForbiddenException` for GURU/SISWA/ORANG_TUA out-of-scope `classId`.
- Tests prove GURU allowed assignment/wali class, wali-only access, and forbidden `classId` denial without querying list data.

### Prior P2: Wali-only class access missing from shared resolver

Status: **Closed.**

Evidence:

- `resolveGuruClassIds()` merges teaching assignments and active `Class.teacherId` wali classes with dedupe.
- Student list, class activity list, and report-card ownership now use or are covered by the shared resolver.

### Prior P2: Coverage gaps

Status: **Mostly closed for Wave 1 gate.**

Evidence:

- Parent mapper coverage added.
- Forbidden list-filter tests added.
- Class activity read scoping for GURU/SISWA/ORANG_TUA added.
- Wali-only resolver behavior covered through service tests.

Residual:

- Position transaction proof remains unit/mocked, not a real database transaction integration test.
- Browser/staging QA remains pending.

## 4. Verification Re-run

Run from `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school`.

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/student.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/positions.spec.ts
```

Result: **PASS**, 3 suites, 79 tests.

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/permissions.spec.ts src/__tests__/student.spec.ts src/__tests__/finance.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/wa-log.spec.ts src/__tests__/analytics.spec.ts src/__tests__/positions.spec.ts
```

Result: **PASS**, 7 suites, 175 tests.

```powershell
npm.cmd --workspace @smk/api test -- --runInBand --cacheDirectory ../../.tmp/jest-cache src/__tests__/attendance.spec.ts
```

Result: **PASS**, 1 suite, 27 tests.

```powershell
npm.cmd --workspace @smk/web test -- --runInBand --cacheDirectory ../../.tmp/jest-cache-web src/__tests__/ortu-mappers.test.ts
```

Result: **PASS**, 1 suite, 3 tests.

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
git diff --check
```

Result: **PASS** for all. Web lint prints existing Next.js `next lint` deprecation/plugin-detection warning, with no ESLint warnings or errors.

## 5. Remaining Risks

- Manual browser/staging QA has not been run.
- Parent dashboard fetches all child data server-side on page render; no client-side lazy refetch per child switch.
- Position transaction behavior is still unit/mocked proof, not real DB integration proof.
- Report-card live-vs-snapshot section correctness remains deferred Wave 6 scope.
- School period/org permission catalog remains an accepted Wave 1 deferral.

## 6. Recommendation

Proceed to **Wave 2 code work**.

Do not treat this as production readiness. Before staging/prod promotion, run browser QA for:

1. ORANG_TUA two-child switch across grades, attendance, SPP, WA log, badges, rank, and report modal.
2. GURU assigned/wali class access and unrelated class `403`.
3. SISWA/ORANG_TUA report-card `distributed` visibility.
4. Finance SPP create/approve/re-approve denial.
5. WAKA academic review paths versus non-academic high-power denial.
