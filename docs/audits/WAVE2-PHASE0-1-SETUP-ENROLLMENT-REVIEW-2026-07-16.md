# Wave 2 Phase 0/1 Setup Enrollment Review - 2026-07-16

## 1. Verdict

**FOLLOW-UP REQUIRED.**

Wave 2 has good local verification and closes several backend pieces, but it is not ready for Git Gate/PR yet. I found two P1 workflow blockers in the reviewed scope:

- PPDB accepted CTA links to `/dashboard/siswa?ppdbLeadId=...`, but Data Siswa does not consume or preserve `ppdbLeadId`; the enrollment handoff is effectively a dead link.
- SPP setup now correctly creates `unpaid` records, but the finance UI only renders the approve button for `paid` records without `approvedAt`, so newly-created manual SPP records cannot be approved through the UI.

Manual browser/staging QA was not run.

## 2. Source Docs And Diffs Reviewed

- `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
- `AGENTS.md`
- `docs/WAYS-OF-WORKING.md`
- `docs/decision-log.md`
- `docs/architecture/academic-lifecycle.md`
- `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
- `docs/audits/WAVE1-RBAC-OWNERSHIP-PRIVACY-REREVIEW-2026-07-16.md`
- `docs/audits/PROMPT-ARCHITECT-WAVE2-PHASE0-1-SETUP-ENROLLMENT-2026-07-16.md`
- `docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REMEDIATION-2026-07-16.md`
- `docs/audits/PHASE0-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `docs/audits/PHASE1-COMPREHENSIVE-AUDIT-2026-07-15.md`

Scoped diffs reviewed:

- `apps/api/src/ppdb/ppdb.service.ts`
- `apps/api/src/classes/classes.controller.ts`
- `apps/api/src/finance/*`
- `apps/api/src/__tests__/ppdb.spec.ts`
- `apps/api/src/__tests__/classes-heatmap.spec.ts`
- `apps/api/src/__tests__/finance.spec.ts`
- `apps/web/src/app/dashboard/users/*`
- `apps/web/src/app/dashboard/ppdb/*`
- `apps/web/src/app/dashboard/kelas/*`
- `apps/web/src/app/dashboard/keuangan/*`
- `apps/web/src/__tests__/add-user-csv.test.ts`

## 3. Verification Commands And Results

Run from `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school`.

```powershell
npm.cmd --workspace @smk/api run test -- ppdb.spec.ts classes-heatmap.spec.ts finance.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache/api
```

Result: **PASS**, 3 suites, 90 tests.

```powershell
npm.cmd --workspace @smk/web run test -- add-user-csv.test.ts --runInBand --cacheDirectory=.tmp/jest-cache/web
```

Result: **PASS**, 1 suite, 3 tests.

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
git diff --check
```

Result: **PASS** for all. Web lint prints the existing Next.js `next lint` deprecation/plugin warning, with no ESLint warnings or errors.

No schema, dependency, package, or Prisma migration diff was found in the scoped check.

## 4. Findings

### P1 - PPDB accepted enrollment CTA is not consumed by Data Siswa

Files:

- `apps/api/src/ppdb/ppdb.service.ts:81`
- `apps/api/src/ppdb/ppdb.service.ts:87`
- `apps/web/src/app/dashboard/ppdb/_components/PpdbTable.tsx:112`
- `apps/web/src/app/dashboard/ppdb/_components/PpdbTable.tsx:114`
- `apps/web/src/app/dashboard/siswa/page.tsx:36`
- `apps/web/src/app/dashboard/siswa/page.tsx:44`
- `apps/web/src/app/dashboard/siswa/_components/SiswaTable.tsx:76`
- `apps/web/src/app/dashboard/siswa/_components/SiswaTable.tsx:260`
- `apps/web/src/app/dashboard/siswa/_components/SiswaWizard.tsx:26`

The API adds an accepted-lead action pointing to `/dashboard/siswa?ppdbLeadId=<id>`, and the PPDB UI renders that link. However, `/dashboard/siswa` only reads pagination/search/class/status/sort params and never reads `ppdbLeadId`. `SiswaTable` only opens the wizard from the normal `+ Tambah Siswa` button, and `SiswaWizard` has no prop or effect for lead prefill, banner, preserved source ID, or required enrollment context.

This does not satisfy the Wave 2 acceptance question: "Does the Data Siswa target page actually consume or at least preserve `ppdbLeadId`, or is this only a dead link?" It is currently only a navigation link to the generic student list.

Required follow-up:

- Read `ppdbLeadId` in `/dashboard/siswa`.
- Fetch or preserve the lead handoff in a visible enrollment state.
- Open or prefill the student wizard, or show a clear lead-specific enrollment panel.
- Add a web/server component or integration test proving the handoff is not lost.

### P1 - Manual SPP setup creates unpaid records that cannot be approved from the finance UI

Files:

- `apps/api/src/finance/finance.service.ts:93`
- `apps/api/src/finance/finance.service.ts:95`
- `apps/api/src/finance/finance.service.ts:209`
- `apps/api/src/finance/finance.service.ts:213`
- `apps/api/src/finance/finance.service.ts:219`
- `apps/api/src/finance/finance.service.ts:232`
- `apps/web/src/app/dashboard/keuangan/_components/KeuanganTable.tsx:123`
- `apps/web/src/app/dashboard/keuangan/_components/KeuanganTable.tsx:125`

The service now creates setup records as `unpaid` with `paidAt: null`, and approval transitions them to `paid`, sets approval fields, and emits `payment.received`. That service behavior is correct. The UI, however, still renders the approve button only when `p.status === 'paid' && !p.approvedAt`.

Result: a TU-created manual SPP record appears as `unpaid`, but SA/KS users do not get an approve button for that row. The setup/approval workflow is blocked in the reviewed UI path.

Required follow-up:

- Render approve action for approvable unpaid records, not only paid/unapproved legacy rows.
- Preserve "already approved" display for `approvedAt`.
- Add a focused UI/component test or browser QA step for TU record unpaid -> SA/KS approve.

### P2 - CSV preview still accepts malformed email strings before submit

Files:

- `apps/web/src/app/dashboard/users/_components/add-user-csv.ts:85`
- `apps/web/src/app/dashboard/users/_components/add-user-csv.ts:91`
- `apps/web/src/__tests__/add-user-csv.test.ts:34`

The Wave 2 template fix is useful: `email` is now in `CSV_COLUMNS`, the template header is generated from that source, and missing email is tested. But `validateRaw()` only checks that email is non-empty. It does not reject malformed email before submit, despite the review prompt requiring missing and malformed email rejection before submit.

Backend Zod should still reject malformed email, so this is not a data-integrity hole. It is a preview/UX and coverage gap.

Required follow-up:

- Add a small email format check in `validateRaw()`.
- Add a web unit test for malformed email.

### P2 - Git Gate packaging is not ready because the worktree is mixed Wave 1 and Wave 2

Files/scope:

- `git status --short`
- `git diff --stat`

The worktree still contains Wave 1 and Wave 2 source diffs plus many historical untracked artifacts. The executor correctly did not commit/push/PR pending review, but Git Gate must not use broad `git add apps/api/src apps/web/src`.

Required follow-up:

- Fix the P1s first.
- Stage intentionally by file/path.
- Prefer separate commits inside one PR if still local: Wave 0 docs, Wave 1 security remediation, Wave 2 setup/enrollment remediation.
- Do not stage `.tmp`, `.agents`, `.codex`, PR-body scratch files, or historical test artifacts unless explicitly intended.

## 5. Claim-by-claim Audit

| ID | Status | Notes |
|---|---|---|
| W2-01 CSV bulk user email | Mostly closed, P2 follow-up | Template/parser/test include `email`; malformed email preview validation is missing. |
| W2-02 PPDB accepted enrollment CTA | Follow-up required | API/UI link exists and avoids PII, but target Data Siswa page ignores `ppdbLeadId`. |
| W2-03 PPDB state machine | Closed | Server transition map and terminal protection exist; focused tests pass. |
| W2-04 assign lead eligibility | Closed for current policy | Validates active, non-deleted user with active staff and SA/TU role; unassign remains allowed; tests cover wrong role and inactive staff. |
| W2-05 class actor policy | Accepted with deferral | Backend and UI now align on KS read-only, SA/TU create-update, SA delete. Class-specific permission catalog remains deferred. |
| W2-06 SPP manual-only contract | Follow-up required | Manual-only text and service semantics are good, but UI approval affordance is wrong for newly-created unpaid records. |

## 6. Test Coverage Assessment

Strong:

- PPDB service tests cover invalid jump, accepted terminal protection, paid -> accepted enrollment action, TU assignment, GURU rejection, and inactive/deleted staff rejection.
- Class RBAC metadata test covers create/update/remove roles.
- Finance tests cover create as unpaid/no event and approve transition/event.
- CSV test covers header/source alignment, template parseability, and missing email.

Missing:

- Data Siswa handoff test for `ppdbLeadId`.
- Finance UI test for unpaid row approval button.
- Malformed email preview test.
- Browser/manual QA for full PPDB accepted enrollment and SPP record/approve.

## 7. Manual QA Status

Manual browser/staging QA was **not run** in this reviewer session.

Recommended smoke after follow-up:

1. PPDB paid lead -> accepted -> click `Daftarkan sebagai siswa` -> Data Siswa preserves/prefills lead handoff.
2. Refresh Data Siswa with `ppdbLeadId` and confirm the handoff remains clear or safely expires with a visible message.
3. TU creates manual unpaid SPP; SA/KS sees approve action and approval transitions to paid.
4. CSV import rejects missing and malformed email at preview.
5. KS can read classes but cannot create/update/delete via UI or direct API.

## 8. Git Gate Readiness

Commit/push/PR should **not** proceed yet.

Reason:

- P1 blockers remain in Wave 2 scope.
- The worktree is mixed Wave 1 and Wave 2, so careless staging would produce an unauditable PR.

After follow-up passes:

1. Re-run the same focused tests, type-check, lint, and `git diff --check`.
2. Inspect `git diff --cached --stat` before commit.
3. Use intentional staging only.
4. Open PR to `develop`; do not push directly to protected branches.
5. Keep staging promotion separate and only after review/CI/merge authorization.

## 9. Recommendation

Run a narrow Wave 2 follow-up before Git Gate:

1. Make PPDB accepted CTA a real Data Siswa enrollment handoff using `ppdbLeadId`.
2. Fix finance UI approve affordance for unpaid SPP records.
3. Add malformed-email CSV preview validation/test.
4. Re-run API focused tests, web CSV/handoff tests, API/web type-check, API/web lint, and `git diff --check`.

After that, re-review Wave 2 for `COMPLETE - READY FOR GIT GATE`.
