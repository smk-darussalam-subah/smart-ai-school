# Wave 2 Phase 0/1 Setup Enrollment Follow-up

Tanggal: 2026-07-16
Status commit/push: belum dilakukan; masih menunggu re-review Wave 2.

## Review Input

Review Wave 2 menghasilkan verdict `FOLLOW-UP REQUIRED` di:

- `docs/audits/WAVE2-PHASE0-1-SETUP-ENROLLMENT-REVIEW-2026-07-16.md`

Blocker yang ditindaklanjuti:

- P1: PPDB accepted CTA ke `/dashboard/siswa?ppdbLeadId=...` belum dikonsumsi oleh Data Siswa.
- P1: SPP manual setup membuat record `unpaid`, tetapi UI hanya menampilkan approve untuk `paid && !approvedAt`.
- P2: CSV preview menolak email kosong tetapi belum menolak email malformed.

## Fixes

### P1 - PPDB Accepted Enrollment Handoff

Status: fixed for local code review.

Perubahan:

- `/dashboard/siswa` sekarang membaca `ppdbLeadId` dari querystring.
- Page fetch `/ppdb/leads/:id` hanya jika user bisa edit dan `ppdbLeadId` valid UUID.
- Lead hanya dipakai sebagai handoff jika statusnya `accepted`.
- `SiswaTable` menampilkan konteks enrollment PPDB dan auto-open wizard.
- `SiswaWizard` menerima `initialLead` dan prefill:
  - nama siswa dari `lead.fullName`
  - nomor kontak ke field telepon wali/orang tua dengan format `+62...`
- NIS, kelas, wali, dan consent tetap wajib diisi/diverifikasi operator; tidak ada auto-create atau data yang dikarang.

Evidence:

- `apps/web/src/app/dashboard/siswa/page.tsx`
- `apps/web/src/app/dashboard/siswa/_components/SiswaTable.tsx`
- `apps/web/src/app/dashboard/siswa/_components/SiswaWizard.tsx`
- `apps/web/src/app/dashboard/siswa/_components/ppdb-enrollment-handoff.ts`
- `apps/web/src/__tests__/ppdb-enrollment-handoff.test.ts`

### P1 - SPP Manual Setup Approval UI

Status: fixed for local code review.

Perubahan:

- Finance UI approve action sekarang muncul untuk record yang belum `approvedAt` dengan status `unpaid` atau legacy `paid`.
- Button label diubah menjadi `Terima` supaya sesuai dengan service behavior: approval/receipt mengubah `unpaid` menjadi `paid`.
- Helper pure `isSppApprovable()` ditambahkan dan dites.

Evidence:

- `apps/web/src/app/dashboard/keuangan/_components/KeuanganTable.tsx`
- `apps/web/src/app/dashboard/keuangan/_components/spp-ui.ts`
- `apps/web/src/__tests__/spp-ui.test.ts`

### P2 - CSV Malformed Email Preview Validation

Status: fixed.

Perubahan:

- `validateRaw()` sekarang menolak email malformed dengan pesan `email tidak valid`.
- Test CSV ditambah untuk malformed email.

Evidence:

- `apps/web/src/app/dashboard/users/_components/add-user-csv.ts`
- `apps/web/src/__tests__/add-user-csv.test.ts`

## Verification

Passed:

- `npm.cmd --workspace @smk/web run test -- add-user-csv.test.ts ppdb-enrollment-handoff.test.ts spp-ui.test.ts --runInBand --cacheDirectory=.tmp/jest-cache/web-followup`
  - 3 suites passed
  - 10 tests passed
- `npm.cmd --workspace @smk/api run test -- ppdb.spec.ts classes-heatmap.spec.ts finance.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache/api-followup`
  - 3 suites passed
  - 90 tests passed
- `npm.cmd --workspace @smk/web run type-check`
- `npm.cmd --workspace @smk/api run type-check`
- `npm.cmd --workspace @smk/web run lint`
  - no ESLint warnings/errors
  - existing Next lint deprecation/plugin notice remains
- `npm.cmd --workspace @smk/api run lint`
- `git diff --check -- <follow-up files>`

## Residuals

- Manual browser QA was not run.
- Full PPDB auto-create/idempotent Student remains deferred pending schema/product decision.
- Worktree is still mixed with Wave 1, Wave 2, follow-up changes, and historical untracked artifacts. Git Gate must stage by explicit file list only.

## Post Re-review P2 Closure

The re-review report identified one non-blocking P2: `paid + approvedAt null` legacy SPP rows were still treated as approvable in the UI helper, while the API rejects `status === 'paid'` as already approved.

Status: fixed before Git Gate.

Change:

- `isSppApprovable()` now returns `true` only for `unpaid` records with no `approvedAt`.
- `spp-ui.test.ts` now asserts `paid + approvedAt null` is not approvable, aligning UI with `FinanceService.approve()`.

Additional verification:

- `npm.cmd --workspace @smk/web run test -- spp-ui.test.ts add-user-csv.test.ts ppdb-enrollment-handoff.test.ts --runInBand --cacheDirectory=.tmp/jest-cache/web-gitgate`
  - 3 suites passed
  - 9 tests passed
- `npm.cmd --workspace @smk/web run type-check`
- `npm.cmd --workspace @smk/web run lint`
- `npm.cmd --workspace @smk/api run test -- ppdb.spec.ts classes-heatmap.spec.ts finance.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache/api-gitgate`
  - 3 suites passed
  - 90 tests passed
- `npm.cmd --workspace @smk/api run type-check`
- `npm.cmd --workspace @smk/api run lint`
- `git diff --check`
