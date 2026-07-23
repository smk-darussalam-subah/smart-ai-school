# Wave 3 Follow-up LMS WAKA and Draft ID Packaging

Date: 2026-07-23
Role: Codex Executor
Branch: `fix/wave3-followup-lms-waka-draft-id-20260723`
Target: PR to `develop`

## Verdict

Implementation status: code complete and locally verified for Prompt B scope.

Git Gate status: ready for explicit staging after local checks. This package is intentionally separated from TF2-P1-1 permission migration.

Staging promotion status: HOLD until reviewer gate and browser/runtime QA.

## Source Documents Read

- `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
- `docs/WAYS-OF-WORKING.md`
- `docs/decision-log.md`
- `docs/audits/WAVE3-PHASE2-ACADEMIC-PREPARATION-REMEDIATION-2026-07-20.md`
- `docs/audits/WAVE3-PHASE2-ACADEMIC-PREPARATION-REVIEW-2026-07-20.md`
- `docs/audits/REVIEW-HANDOFF-POST-WAVE3-TF2-2026-07-23.md`
- Prompt Architect Output - Prompt B: Wave 3 Follow-up Packaging

## Scope and Non-goals

In scope:
- LMS reviewer-role alignment for `WAKA_KURIKULUM` in the existing reviewer path.
- Modul Ajar draft id continuity after first draft create.
- Focused API and web tests.
- Packaging report.

Out of scope:
- Prisma schema, migration, permission override resolver, positions, school-config, and TF2-P1-1 work.
- LMS student visibility changes.
- SPMB/PPDB, finance, attendance, report card, and infrastructure changes.
- New dependencies.

## Plan, Self-critique, Fixed Plan

Initial plan:
1. Add `WAKA_KURIKULUM` to LMS reviewer roles.
2. Store created RPP id after first draft save.
3. Add focused tests.
4. Package as separate PR.

Self-critique:
- WAKA access must only affect reviewer bypass when `rppId` is supplied; it must not weaken GURU ownership.
- GURU other-teacher RPP must remain forbidden.
- LMS student visibility must remain unchanged.
- Duplicate draft proof must cover create then second save/update in the same dialog state.
- The worktree is mixed, so Prompt B must be isolated from TF2 files.

Fixed plan implemented:
1. Created a clean worktree from `origin/develop`.
2. Added `WAKA_KURIKULUM` only to `LmsService` reviewer role list.
3. Kept existing LMS student read/list/progress code untouched.
4. Added `currentRppId` state to `ModulAjarForm`.
5. Added pure helper `getDraftWriteTarget()` and `readCreatedRppId()` so create/update decision is testable without a new browser-test dependency.
6. Updated `saveDraft()` and submit path to update/submit the persisted id after first draft create.
7. Added focused API and web tests.
8. Preserved TF2 files out of this branch/package.

## Files Changed

- `apps/api/src/lms/lms.service.ts`
- `apps/api/src/__tests__/lms.spec.ts`
- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
- `apps/web/src/app/dashboard/akademik/_components/modul-ajar-draft-state.ts`
- `apps/web/src/__tests__/modul-ajar-draft-state.test.ts`
- `docs/audits/WAVE3-FOLLOWUP-LMS-WAKA-DRAFT-ID-PACKAGING-2026-07-23.md`

## Implementation Notes

LMS reviewer alignment:
- `REVIEWER_ROLES` now includes `WAKA_KURIKULUM`.
- Existing `rppId` path still derives `classId`, `subject`, and `academicYear` from the authorized RPP, not from client payload.
- Existing GURU negative tests still prove other-teacher RPP is forbidden.
- Existing SISWA list/read tests still prove student visibility remains published/class-scoped.

Modul Ajar draft id continuity:
- `currentRppId` starts from `editing?.id`.
- `currentRppId` resets when dialog context changes.
- First new draft save calls `createRpp(... submit: false)`.
- Successful create response id is stored in `currentRppId`.
- Second save in the same dialog calls `updateRpp(currentRppId, ...)`.
- Submit after draft save calls `updateRpp(currentRppId, ...)` then `submitRpp(currentRppId)`.

## Verification Run

PASS:
- `npm.cmd --workspace @smk/api run test -- lms.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-wave3-followup`
  - 1 suite / 20 tests pass.
- `npm.cmd --workspace @smk/web run test -- --runInBand --cacheDirectory=.tmp/jest-cache-wave3-followup modul-ajar`
  - 1 suite / 4 tests pass.
- `npm.cmd --workspace @smk/api run type-check`
- `npm.cmd --workspace @smk/web run type-check`
- `npm.cmd --workspace @smk/api run lint`
- `npm.cmd --workspace @smk/web run lint`
  - Existing Next lint deprecation/plugin warning only.
- `npm.cmd --workspace @smk/api run build`
- `npm.cmd --workspace @smk/web run build`
  - Exit code 0; compile and 39/39 static pages succeeded.
  - Warning: standalone trace copy could not symlink verification junction `apps/web/node_modules`. This is a local worktree verification artifact, not a source-code issue.

Verification setup notes:
- The clean worktree used ignored `node_modules` junctions to the existing installed dependency tree because dependencies were not installed in the new worktree.
- Prisma Client was generated for this clean branch before API type-check because the shared dependency tree had previously been generated for TF2 schema work.

## Browser QA

NOT RUN in this executor session.

Reason:
- No local authenticated browser/runtime environment with GURU and WAKA_KURIKULUM sessions was available in this clean worktree.

Required before staging sign-off:
1. GURU: open `/dashboard/akademik`, create Modul Ajar, save draft, edit in the same dialog, save again, refresh/reopen, verify one RPP only with latest data.
2. GURU: submit after draft save, verify the same RPP id is submitted and no duplicate appears.
3. WAKA_KURIKULUM: create LMS module from authorized approved RPP owned by another teacher.
4. GURU negative: attempt create LMS from another teacher's RPP and confirm 403/no module created.
5. SISWA smoke: verify LMS visibility remains only published/class-scoped.

## Explicit No-TF2 Evidence

The Prompt B package does not include:
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260722000001_tf2_p1_1_zombie_permissions/**`
- `apps/api/src/permissions/permissions.service.ts`
- `apps/api/src/positions/positions.service.ts`
- `apps/api/src/school-config/school-config.service.ts`
- `apps/api/src/school-config/school-config.module.ts`
- `apps/api/src/__tests__/permissions.spec.ts`

## Packaging Status

Staged files: pending.
Commit: pending.
PR: pending.
CI: pending.

## Residual Risks

- Browser QA is still required for real dialog behavior, refresh/reopen, and role-session runtime proof.
- WAKA access depends on the user's Keycloak/DB role state being current in staging.
- This package does not address TF2-P1-1 PostgreSQL migration proof; that remains a separate gate.

## Reviewer Gate Request

Please review Prompt B as a small, isolated package. Recommended focus:
- Confirm WAKA only changes reviewer bypass and does not widen student LMS visibility.
- Confirm draft id continuity prevents duplicate RPP after two saves in one dialog.
- Confirm staged file list excludes TF2 permission/schema/migration work.
