# Wave 3 Follow-up Draft ID Packaging

Date: 2026-07-23
Role: Codex Executor
Branch: `fix/wave3-followup-lms-waka-draft-id-20260723`
Target: PR to `develop`

## Verdict

Implementation status: draft-ID only patch complete for local review.

Git Gate status: ready after explicit staging and checks.

Staging promotion status: HOLD until reviewer gate and browser/runtime QA.

## Source Documents Read

- `docs/audits/PROMPT-ARCHITECT-WAVE3-FOLLOWUP-PACKAGING-2026-07-23.md`
- `docs/audits/PROMPT-ARCHITECT-APPOINTMENT-GOVERNANCE-KEYCLOAK-TRANSITION-WAVES-2026-07-23.md`
- `docs/audits/WAVE3-PHASE2-ACADEMIC-PREPARATION-REVIEW-2026-07-20.md`

## Scope and Non-goals

In scope:
- Preserve the created RPP id after the first `Simpan Draft` in `ModulAjarForm`.
- Ensure the second draft save in the same dialog targets `updateRpp(id, ...)`, not another `createRpp(...)`.
- Ensure submit after a draft save uses the same RPP id.
- Focused web test for create -> update -> submit target selection.

Out of scope:
- `apps/api/src/lms/lms.service.ts`
- `apps/api/src/__tests__/lms.spec.ts`
- LMS WAKA reviewer alignment.
- TF2 permission migration, Prisma schema, positions, school config, Keycloak, appointment model, PPDB/SPMB, finance, attendance, report card, and infrastructure.

## Plan, Self-critique, Fixed Plan

Initial plan:
1. Split PR #389 down to draft-ID only.
2. Keep only web Modul Ajar code, focused helper test, and this report.
3. Run focused web verification and packaging checks.
4. Push the narrowed PR to `develop`.

Self-critique:
- The duplicate-draft proof must represent two saves in one dialog session.
- Submit after draft save must target the id returned by the first create.
- Close/reopen/refresh proof cannot be fully proven by the current unit helper; it remains browser QA.
- File list must be free from TF2 migration and LMS WAKA files.

Fixed plan implemented:
1. Scoped-restored `apps/api/src/lms/lms.service.ts` and `apps/api/src/__tests__/lms.spec.ts` to `origin/develop`.
2. Kept `currentRppId` state in `ModulAjarForm`.
3. Kept helper functions `getDraftWriteTarget()` and `readCreatedRppId()` to make create/update decision deterministic and testable.
4. Strengthened the focused web test to model create draft, update draft, and submit using the same id.
5. Replaced the prior mixed LMS/WAKA report with this draft-ID only report.

## Files Changed

- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
- `apps/web/src/app/dashboard/akademik/_components/modul-ajar-draft-state.ts`
- `apps/web/src/__tests__/modul-ajar-draft-state.test.ts`
- `docs/audits/WAVE3-FOLLOWUP-DRAFT-ID-PACKAGING-2026-07-23.md`

## Implementation Notes

- `currentRppId` is initialized from `editing?.id`.
- `currentRppId` resets when the dialog context changes.
- First new draft save calls `createRpp(... submit: false)`.
- A successful create response id is stored in `currentRppId`.
- The next draft save in the same dialog calls `updateRpp(currentRppId, ...)`.
- Submit after draft save calls `updateRpp(currentRppId, ...)` then `submitRpp(currentRppId)`.

## Verification Run

PASS:
- `npm.cmd --workspace @smk/web run test -- --runInBand --cacheDirectory=.tmp/jest-cache-wave3-followup modul-ajar`
  - 1 suite / 5 tests pass.
- `npm.cmd --workspace @smk/web run type-check`
- `npm.cmd --workspace @smk/web run lint`
  - Existing Next lint deprecation/plugin warning only.
- `npm.cmd --workspace @smk/api run lint`
- `npm.cmd --workspace @smk/api run type-check`
  - First run failed because the shared Prisma Client had been generated from a TF2 schema variant. After `npm.cmd --workspace @smk/database run db:generate` against this branch schema, API type-check passed.

PASS packaging checks:
- `git diff --check origin/develop`
- `git diff --cached --check`
- Conflict marker scan on final target files.
- Net PR file list against `origin/develop`:
  - `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
  - `apps/web/src/app/dashboard/akademik/_components/modul-ajar-draft-state.ts`
  - `apps/web/src/__tests__/modul-ajar-draft-state.test.ts`
  - `docs/audits/WAVE3-FOLLOWUP-DRAFT-ID-PACKAGING-2026-07-23.md`

Not run by scope:
- API focused tests, because LMS WAKA changes were removed from this package.

## Browser QA

NOT RUN in this executor session.

Required before staging sign-off:
1. GURU: open `/dashboard/akademik`, create Modul Ajar, save draft, edit in the same dialog, save again, refresh/reopen, verify one RPP only with latest data.
2. GURU: submit after draft save, verify the same RPP id is submitted and no duplicate appears.

## Explicit Exclusion Evidence

This package must not stage or ship:
- `apps/api/src/lms/lms.service.ts`
- `apps/api/src/__tests__/lms.spec.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/**`
- `apps/api/src/permissions/**`
- `apps/api/src/positions/**`
- `apps/api/src/school-config/**`

## Packaging Status

Staged files for narrowing commit:
- `apps/api/src/lms/lms.service.ts` and `apps/api/src/__tests__/lms.spec.ts` are staged only as scoped restores to remove the previous mixed PR content. They are absent from the final net PR diff against `origin/develop`.
- `apps/web/src/__tests__/modul-ajar-draft-state.test.ts`
- `docs/audits/WAVE3-FOLLOWUP-DRAFT-ID-PACKAGING-2026-07-23.md`
- deletion of old mixed report `docs/audits/WAVE3-FOLLOWUP-LMS-WAKA-DRAFT-ID-PACKAGING-2026-07-23.md`

Commit: local package commit created in branch history.
PR: pending push/update for [#389](https://github.com/smk-darussalam-subah/smart-ai-school/pull/389).
CI: pending.

## Residual Risks

- Browser QA is still required for real dialog behavior and refresh/reopen proof.
- The branch name is historical from the original mixed PR, but the intended PR diff is draft-ID only.
- Appointment Governance Wave A remains a separate follow-up and must not be mixed into this PR.

## Reviewer Gate Request

Please review this as Wave 3 follow-up draft-ID only. Recommended focus:
- Confirm create -> update -> submit target continuity for new Modul Ajar drafts.
- Confirm no LMS WAKA, TF2 migration, Prisma schema, positions, school config, Keycloak, or appointment files are included.
