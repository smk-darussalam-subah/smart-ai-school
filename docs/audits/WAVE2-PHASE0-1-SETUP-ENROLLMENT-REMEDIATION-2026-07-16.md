# Wave 2 Phase 0/1 Setup Enrollment Remediation

Tanggal: 2026-07-16
Branch saat eksekusi: `develop`
Status commit/push: ditahan untuk review Wave 2 sesuai instruksi user.

## Scope

Wave ini menutup gap setup/enrollment Phase 0/1 yang tersisa dari review:

- W2-01 Bulk user CSV template tidak memuat `email` padahal validator mewajibkan email.
- W2-02 PPDB `accepted` harus punya aksi enrollment eksplisit, bukan status buntu.
- W2-03 PPDB state machine harus ditegakkan server-side.
- W2-04 PPDB assign lead harus memvalidasi assignee.
- W2-05 Class management harus konsisten antara actor policy API dan UI.
- W2-06 Setup SPP harus jelas manual-only atau generator duplicate-safe.

## Changes

### W2-01 Bulk User CSV

Status: fixed.

Perubahan:

- Template CSV import pengguna sekarang memakai satu sumber kolom: `role,fullName,gender,email,phone,birthDate,niy,employmentStatus,address`.
- Contoh template memuat email unik untuk semua role.
- Parser/validator CSV dipindah ke helper pure agar bisa dites tanpa memuat komponen dialog.
- Preview template UI sekarang menampilkan 9 kolom, termasuk `email`.

Evidence:

- `apps/web/src/app/dashboard/users/_components/add-user-csv.ts`
- `apps/web/src/app/dashboard/users/_components/AddUserDialog.tsx`
- `apps/web/src/__tests__/add-user-csv.test.ts`

### W2-02 PPDB Accepted Enrollment

Status: partially closed with explicit enrollment action; full auto-create Student deferred.

Perubahan:

- Lead dengan status `accepted` sekarang diberi kontrak response:
  - `enrollmentRequired: true`
  - `enrollmentAction.type: create_student`
  - `enrollmentAction.href: /dashboard/siswa?ppdbLeadId=...`
- UI PPDB menampilkan CTA `Daftarkan sebagai siswa` untuk lead accepted.
- URL action hanya membawa `ppdbLeadId`; nama/HP tidak dibawa di querystring untuk menghindari PII di browser history/log.

Residual:

- Auto-create/idempotent Student dari PPDB belum dilakukan karena schema `PpdbLead` belum punya relasi `studentId`, NIS, class assignment, parent/guardian data, atau consent data yang cukup. Membuat Student otomatis dari data lead saat ini berisiko mengarang data inti dan melanggar kontrak PDP/consent.
- Full closure butuh approval schema/product untuk relasi PPDB-to-Student dan flow capture data enrollment.

### W2-03 PPDB State Machine

Status: fixed.

Perubahan:

- `PpdbService.updateStatus()` sekarang menolak transisi invalid.
- Terminal status `accepted` dan `rejected` tidak bisa direvert ke status lain.
- Transisi valid yang diterapkan:
  - `new -> contacted | cold | rejected`
  - `contacted -> interested | cold | rejected`
  - `interested -> registered | cold | rejected`
  - `registered -> paid | rejected`
  - `paid -> accepted | rejected`
  - `cold -> contacted | rejected`

Evidence:

- `apps/api/src/ppdb/ppdb.service.ts`
- `apps/api/src/__tests__/ppdb.spec.ts`

### W2-04 PPDB Assign Lead Eligibility

Status: fixed.

Perubahan:

- `assignLead()` now validates `assignedTo` before updating:
  - user exists
  - user is active
  - user is not soft-deleted
  - user has active `Staff`
  - role is `SUPER_ADMIN` or `TATA_USAHA`
- `assignedTo: null` remains allowed for unassign.

Evidence:

- `apps/api/src/ppdb/ppdb.service.ts`
- `apps/api/src/__tests__/ppdb.spec.ts`

### W2-05 Class Management Actor Policy

Status: fixed within current permission catalog; class-specific permission catalog deferred.

Perubahan:

- API create/update class now allow only `SUPER_ADMIN` and `TATA_USAHA`.
- `KEPALA_SEKOLAH` remains read-only for class list/detail.
- UI class page now passes `canManage`; create/edit/toggle/wali assignment controls render only for SA/TU.
- Delete remains `SUPER_ADMIN` only.

Residual:

- Permission catalog has no `class.read` / `class.manage` or equivalent. Adding class permissions would require seed/catalog change approval, which this Wave prompt explicitly says not to do without approval.

Evidence:

- `apps/api/src/classes/classes.controller.ts`
- `apps/api/src/__tests__/classes-heatmap.spec.ts`
- `apps/web/src/app/dashboard/kelas/page.tsx`
- `apps/web/src/app/dashboard/kelas/_components/KelasClient.tsx`

### W2-06 SPP Setup Schedule

Status: fixed as manual-only contract.

Perubahan:

- Finance UI states that SPP setup is manual per student/month and duplicate periods are rejected.
- Existing service behavior remains manual-only:
  - `createRecord()` creates a single `unpaid` record.
  - Prisma unique `[studentId, month, year]` remains the duplicate-safe guard.
  - payment event is emitted only on approval/receipt, not on setup.

Evidence:

- `apps/web/src/app/dashboard/keuangan/_components/KeuanganTable.tsx`
- Existing coverage in `apps/api/src/__tests__/finance.spec.ts` for `unpaid`, duplicate P2002 propagation, and no event on setup.

## Review Gate

Do not commit, push, or open PR yet. User instructed executor to wait for Wave 2 review first. If review passes, continue with the Gitflow protocol from the prompt.

## Verification

Initial Jest run without an explicit cache failed before executing tests because the sandbox could not write to `%LOCALAPPDATA%\Temp\jest`. Rerun used workspace-local cache directories.

Passed:

- `npm.cmd --workspace @smk/api run test -- ppdb.spec.ts classes-heatmap.spec.ts finance.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache/api`
  - 3 suites passed
  - 90 tests passed
- `npm.cmd --workspace @smk/web run test -- add-user-csv.test.ts --runInBand --cacheDirectory=.tmp/jest-cache/web`
  - 1 suite passed
  - 3 tests passed
- `npm.cmd --workspace @smk/api run type-check`
- `npm.cmd --workspace @smk/web run type-check`
