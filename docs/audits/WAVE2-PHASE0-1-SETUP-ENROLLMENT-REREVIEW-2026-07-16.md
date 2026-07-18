# Wave 2 Phase 0/1 Setup Enrollment Re-Review

Date: 2026-07-16
Role: reviewer
Scope: follow-up review for Wave 2 Phase 0/1 setup enrollment changes after executor fixes.

## Verdict

READY FOR GIT GATE, with one non-blocking P2 residual and explicit staging required.

Confidence: 86%.

Rationale:
- The prior P1 PPDB accepted CTA dead handoff is fixed in the web flow.
- The prior P1 SPP manual setup approval dead-end is fixed for newly-created unpaid manual records.
- The prior P2 malformed email preview gap is fixed.
- Automated verification passed for the focused API/web suites, type-check, lint, and whitespace checks.
- Manual browser/staging QA was not run.
- The worktree is still mixed Wave 1 + Wave 2 + follow-up + historical untracked files, so broad staging remains unsafe.

## Findings

### P2 - Legacy SPP paid-but-unapproved UI state does not match API approval rules

Files:
- `apps/web/src/app/dashboard/keuangan/_components/spp-ui.ts`
- `apps/web/src/__tests__/spp-ui.test.ts`
- `apps/api/src/finance/finance.service.ts`

The follow-up helper correctly makes newly-created unpaid manual SPP records approvable:

```ts
return payment.status === 'unpaid' || payment.status === 'paid';
```

However, the helper and test also treat `paid + approvedAt null` as approvable, while the API approval service rejects `status === 'paid'` as already approved:

```ts
if (payment.approvedBy || payment.status === 'paid') {
  throw new ConflictException('Pembayaran ini sudah disetujui sebelumnya');
}
```

Impact:
- This does not reopen the original P1 for new manual setup records, because those records are now created as `unpaid` and the API approves `unpaid`.
- If legacy `paid` rows with missing approval metadata exist, the UI may show `Terima`, then the API will return conflict.

Recommendation:
- Do not block Git Gate for the Wave 2 follow-up on this item.
- Before staging QA or production release, either hide `Terima` for `paid` rows or explicitly support/migrate legacy `paid + approvedAt null` records. The current web test should then be aligned with the intended API contract.

## Prior Findings Re-Checked

### PPDB accepted CTA handoff

Status: fixed.

Evidence:
- `apps/web/src/app/dashboard/siswa/page.tsx` reads `ppdbLeadId`, validates UUID shape, fetches `/ppdb/leads/{id}` only when the user can edit, and passes only `accepted` leads into the table.
- `apps/web/src/app/dashboard/siswa/_components/SiswaTable.tsx` auto-opens `SiswaWizard` when an accepted lead is present and passes `initialLead`.
- `apps/web/src/app/dashboard/siswa/_components/SiswaWizard.tsx` pre-fills student name and parent/contact phone, while NIS, class, wali, and consent remain manual.
- `apps/web/src/app/dashboard/siswa/_components/ppdb-enrollment-handoff.ts` keeps the mapping narrow and explicit.
- `apps/web/src/__tests__/ppdb-enrollment-handoff.test.ts` covers accepted-only mapping, phone normalization, and no invented NIS/class/wali/consent values.

### SPP manual setup approval CTA

Status: fixed for the target workflow.

Evidence:
- `apps/api/src/finance/finance.service.ts` approves `unpaid` payments and transitions them to `paid` with `approvedBy`, `approvedAt`, and `paidAt`.
- `apps/web/src/app/dashboard/keuangan/_components/spp-ui.ts` returns approvable for unpaid unapproved records.
- `apps/web/src/app/dashboard/keuangan/_components/KeuanganTable.tsx` uses `isSppApprovable()` for the `Terima` button.
- `apps/web/src/__tests__/spp-ui.test.ts` covers unpaid unapproved records.

### CSV malformed email preview

Status: fixed.

Evidence:
- `apps/web/src/app/dashboard/users/_components/add-user-csv.ts` now validates non-empty email with `EMAIL_RE`.
- `apps/web/src/__tests__/add-user-csv.test.ts` covers malformed email rejection with `email tidak valid`.

### Git Gate / dirty worktree

Status: still requires discipline, not a code blocker.

The worktree remains mixed and contains unrelated tracked/untracked historical artifacts. Do not use broad `git add .` or broad `git add -A`.

Use explicit file staging for the intended Wave 1/Wave 2 reviewed file set only.

## Verification Run

Commands run from `smart-ai-school/`:

```powershell
npm.cmd --workspace @smk/web run test -- add-user-csv.test.ts ppdb-enrollment-handoff.test.ts spp-ui.test.ts --runInBand --cacheDirectory=.tmp/jest-cache/web-followup
npm.cmd --workspace @smk/api run test -- ppdb.spec.ts classes-heatmap.spec.ts finance.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache/api-followup
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
git diff --check
```

Results:
- Web follow-up tests: pass, 3 suites / 10 tests.
- API focused tests: pass, 3 suites / 90 tests.
- API type-check: pass.
- Web type-check: pass.
- API lint: pass.
- Web lint: pass. Output includes existing Next lint deprecation/plugin warnings only.
- `git diff --check`: pass.

## Recommendation

Proceed to Git Gate / PR packaging for Wave 2 follow-up after explicit file staging.

Do not treat this as staging/production-ready until:
- Manual browser QA validates PPDB accepted lead to student enrollment creation.
- Manual browser QA validates unpaid SPP manual setup approval from the finance dashboard.
- The staging set is reviewed with `git diff --cached --stat`.
- The P2 legacy SPP `paid + approvedAt null` mismatch is either accepted as known residual risk or corrected before staging if legacy data exists.
