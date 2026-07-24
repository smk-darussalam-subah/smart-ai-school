# Wave 3 Follow-up Draft ID Packaging

Date: 2026-07-23
Role: Codex Executor
Branch: `fix/wave3-followup-lms-waka-draft-id-20260723`
Target: PR to `develop`

## Verdict

Implementation status: draft-ID only patch complete for local review.

Git Gate status: ready for local re-review after explicit staging and checks; push/update PR requires explicit user gate.

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
- Preserve the created draft id when the dialog is closed and reopened before the parent list refreshes.
- Focused web test for create -> update -> submit and close -> reopen target selection.

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
- Close/reopen proof needs parent state propagation, not only form-local `currentRppId`.
- File list must be free from TF2 migration and LMS WAKA files.

Fixed plan implemented:
1. Scoped-restored `apps/api/src/lms/lms.service.ts` and `apps/api/src/__tests__/lms.spec.ts` to `origin/develop`.
2. Kept `currentRppId` state in `ModulAjarForm`.
3. Added `onDraftCreated` propagation so `PembelajaranGuru` can reopen the newly created draft as edit mode until the server list includes that id.
4. Kept helper functions `getDraftWriteTarget()`, `readCreatedRppId()`, `readCreatedRpp()`, and `getPendingCreatedDraft()` to make create/update/reopen decisions deterministic and testable.
5. Strengthened the focused web test to model create draft, update draft, submit, close/reopen before list refresh, and reopen after list refresh.
6. Replaced the prior mixed LMS/WAKA report with this draft-ID only report.

## Files Changed

- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
- `apps/web/src/app/dashboard/akademik/_components/PembelajaranGuru.tsx`
- `apps/web/src/app/dashboard/akademik/_components/modul-ajar-draft-state.ts`
- `apps/web/src/__tests__/modul-ajar-draft-state.test.ts`
- `docs/audits/WAVE3-FOLLOWUP-DRAFT-ID-PACKAGING-2026-07-23.md`

## Implementation Notes

- `currentRppId` is initialized from `editing?.id`.
- `currentRppId` resets when the editing context changes, not merely when `open` toggles.
- First new draft save calls `createRpp(... submit: false)`.
- A successful create response id is stored in `currentRppId`.
- A successful create response object is propagated to `PembelajaranGuru` through `onDraftCreated`.
- If the dialog is closed and reopened before server data refresh includes the new id, `PembelajaranGuru` uses the pending created draft as `editing`, so the next save/submit targets `updateRpp(id, ...)`.
- Once the parent `rpp` list includes the created id, the pending created draft is cleared and the create button opens a blank draft again.
- The next draft save in the same dialog calls `updateRpp(currentRppId, ...)`.
- Submit after draft save calls `updateRpp(currentRppId, ...)` then `submitRpp(currentRppId)`.

## Verification Run

PASS:
- `npm.cmd --workspace @smk/web run test -- --runInBand --cacheDirectory=.tmp/jest-cache-wave3-followup modul-ajar`
  - Follow-up rerun: 1 suite / 7 tests pass.
- `npm.cmd --workspace @smk/web run type-check`
- `npm.cmd --workspace @smk/web run lint`
  - Existing Next lint deprecation/plugin warning only.
- `git diff --check`

Prior narrowing verification before this close/reopen follow-up also passed API lint/type-check after database client regeneration against this branch schema.

PASS packaging checks:
- `git diff --check`
- `git diff --cached --check` pending after explicit staging.
- Conflict marker scan on final target files.
- Net PR file list against `origin/develop`:
  - pending final `git diff --cached --stat`; intended files are listed in "Files Changed".

Not run by scope:
- API focused tests, because LMS WAKA changes were removed from this package.

## Browser QA

NOT RUN in this executor session.

Required before staging sign-off:
1. GURU: open `/dashboard/akademik`, create Modul Ajar, save draft, edit in the same dialog, save again, refresh/reopen, verify one RPP only with latest data.
2. GURU: save draft, close dialog before table refresh, open create again, save/submit, verify the same RPP id is updated and no duplicate appears.
3. GURU: submit after draft save, verify the same RPP id is submitted and no duplicate appears.

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

Explicit staging target:
- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
- `apps/web/src/app/dashboard/akademik/_components/PembelajaranGuru.tsx`
- `apps/web/src/app/dashboard/akademik/_components/modul-ajar-draft-state.ts`
- `apps/web/src/__tests__/modul-ajar-draft-state.test.ts`
- `docs/audits/WAVE3-FOLLOWUP-DRAFT-ID-PACKAGING-2026-07-23.md`

Commit: pending local follow-up commit.
PR: update for [#389](https://github.com/smk-darussalam-subah/smart-ai-school/pull/389) pending explicit push approval after re-review.
CI: pending after push.

## Residual Risks

- Browser QA is still required for real dialog behavior and refresh/reopen proof.
- The branch name is historical from the original mixed PR, but the intended PR diff is draft-ID only.
- Appointment Governance Wave A remains a separate follow-up and must not be mixed into this PR.

## Reviewer Gate Request

Please review this as Wave 3 follow-up draft-ID only. Recommended focus:
- Confirm create -> update -> submit target continuity for new Modul Ajar drafts.
- Confirm no LMS WAKA, TF2 migration, Prisma schema, positions, school config, Keycloak, or appointment files are included.
