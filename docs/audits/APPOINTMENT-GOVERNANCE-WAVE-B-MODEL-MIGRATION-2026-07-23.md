# Appointment Governance Wave B - Model and Migration

Tanggal kerja: 2026-07-24
Branch lokal: `feat/appointment-governance-wave-b-model-20260724`
Base: `origin/develop` setelah Wave A containment

## Verdict Executor

Status kode lokal: implemented dan focused checks pass.

Status Git gate: HOLD.

Alasan hold: PostgreSQL disposable/staging-copy dry-run belum dijalankan karena environment lokal ini tidak memiliki `DATABASE_URL`. Sesuai kontrak Wave B, mock/unit test saja tidak cukup untuk migration dan partial unique index proof.

## Implementasi

### Additive schema

- Menambahkan model `Appointment`, `AppointmentApproval`, dan `AppointmentMigrationReview` di schema `school`.
- Menambahkan enum lifecycle `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `ENDED`, `REJECTED`, `CANCELLED`, `SUPERSEDED`.
- Menambahkan tipe `DEFINITIVE` dan `PLT`.
- Menambahkan source `MANUAL` dan `STAFF_POSITION_MIGRATION`.
- Menambahkan deputy position codes `WAKIL_KOOR_BKK` dan `WAKIL_KOOR_HUBIN`.
- Menjaga `StaffPosition` sebagai legacy source untuk bridge, bukan source of truth baru.

### Migration fail-closed

- Migration membuat tabel appointment dan review secara additive.
- StaffPosition legacy diklasifikasi di migration SQL:
  - role pegawai eligible `GURU`/`TATA_USAHA` + scope/tanggal valid -> dimigrasikan ke Appointment.
  - role identitas historis/position code, non-employee identity pada StaffPosition, scope invalid, tanggal invalid, inactive/deleted user, deleted staff, atau duplicate live scope -> `appointment_migration_reviews` dengan status `QUARANTINED`.
- Hanya `auth.users.role` yang masih position code masuk quarantine review eksplisit agar tidak ada silent demotion. Akun stabil normal seperti `SISWA`, `ORANG_TUA`, dan `INDUSTRI` tanpa StaffPosition tidak dibuatkan review palsu.
- Partial unique indexes:
  - `ACTIVE` mengonsumsi kapasitas school-scope per position/year.
  - `ACTIVE` mengonsumsi kapasitas major-scope per position/year/major.
  - `ACTIVE` mengonsumsi kapasitas staff-position-scope.
  - Kandidat terbuka tanpa incumbent (`PENDING_APPROVAL`/`APPROVED` tanpa `replacesAppointmentId`) juga unik per scope agar dua draft paralel tidak bisa sama-sama submit.
  - Successor/PLT terbuka dengan `replacesAppointmentId` unik per target appointment.

### Runtime resolver

- `RolesGuard` sekarang membaca:
  - stable identity roles dari JWT.
  - position codes dari `PermissionsService.getActivePositionCodes()` berbasis Appointment aktif.
- `PermissionsService`:
  - memfilter `role_permissions` hanya untuk `PRIMARY_ROLES`.
  - menambahkan permission dari Appointment aktif + `PositionPermission`.
  - menerapkan `UserPermissionOverride grant=false` setelah appointment permission, sehingga override TF2 tetap bisa menarik izin.
- `PermissionsController` menolak manajemen permission untuk position-code roles.

### Appointment API

- Menambahkan `AppointmentsModule`, `AppointmentsController`, DTO Zod, dan `AppointmentsService`.
- Lifecycle awal:
  - create draft.
  - submit ke `PENDING_APPROVAL`.
  - approve ke `APPROVED`.
  - suspend/resume/end/supersede untuk lifecycle cuti, PLT, dan successor.
  - reject/cancel terminal.
- Wave B sengaja belum mengaktifkan appointment `APPROVED` menjadi `ACTIVE`; aktivasi akademik tetap Wave C.
- Policy:
  - hanya `SUPER_ADMIN` dapat menyiapkan/menyetujui `KEPALA_SEKOLAH`.
  - `SUPER_ADMIN` atau active `KEPALA_SEKOLAH` dapat menyiapkan/menyetujui appointment selain KS.
  - target staff harus active, non-deleted, dengan user active non-deleted dan role stabil pegawai `GURU`/`TATA_USAHA`.
  - `PLT` wajib `reason` dan `effectiveUntil`.

### Compatibility fixes

- Seed demo `kepala@smkdarussalamsubah.sch.id` dipetakan ke stable identity role `TATA_USAHA`, lalu diberi Appointment `KEPALA_SEKOLAH` aktif untuk active academic year.
- `ROLE_PERMISSIONS.KEPALA_SEKOLAH` di seed permission dihapus; KS permission berasal dari `PositionPermission` + Appointment aktif.
- Report card principal lookup menggunakan Appointment aktif `KEPALA_SEKOLAH`, bukan `auth.users.role`.
- Report card transition manual reviewer check menggunakan active appointment codes untuk `KEPALA_SEKOLAH` dan `WAKA_KURIKULUM`.

## Verification Lokal

Prisma:

```powershell
npm.cmd --workspace @smk/database run db:generate
```

Hasil: pass. Catatan lokal: worktree baru memakai junction dependency ke worktree utama agar binary `prisma` dan package dev tersedia.

Focused tests:

```powershell
npm.cmd --workspace @smk/auth run test -- --runInBand --cacheDirectory=.tmp/jest-cache-appointment-b auth
npm.cmd --workspace @smk/api run test -- --runInBand --cacheDirectory=.tmp/jest-cache-appointment-b --runTestsByPath src/__tests__/appointments.spec.ts src/__tests__/permissions.spec.ts src/__tests__/roles.spec.ts src/__tests__/auth-me.spec.ts src/__tests__/report-cards-activities.spec.ts src/__tests__/positions.spec.ts src/__tests__/users.spec.ts src/__tests__/keycloak-admin.spec.ts
```

Hasil:

- Auth: 1 suite / 52 tests pass.
- API focused: 8 suites / 133 tests pass.

Type-check:

```powershell
npm.cmd --workspace @smk/auth run type-check
npm.cmd --workspace @smk/database run type-check
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
```

Hasil: pass semua.

Lint/build:

```powershell
npm.cmd --workspace @smk/auth run lint
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
```

Hasil:

- Auth lint pass.
- API lint pass.
- Web lint pass dengan warning existing `next lint` deprecation / plugin.
- API build pass.

Diff:

```powershell
git diff --check
```

Hasil: pass.

## Dry-run Gate

Belum dijalankan.

Local environment check:

- `DATABASE_URL env: absent`
- file env lokal yang terlihat hanya `.env.example`

Dry-run script sudah disediakan:

```powershell
npx ts-node --project apps/api/tsconfig.json scripts/appointment-wave-b-dry-run.ts
npx ts-node --project apps/api/tsconfig.json scripts/appointment-wave-b-dry-run.ts --prove-indexes
```

Ketentuan menjalankan:

- Jalankan hanya setelah migration diaplikasikan ke disposable/staging copy.
- Jangan jalankan migration ini langsung ke production/staging live.
- Output script PII-minimal: hanya count/status, tanpa nama, email, telepon, NIY, atau Keycloak ID.
- `--prove-indexes` melakukan rollback-write proof untuk partial unique indexes dan harus dijalankan hanya di database copy.

Gate evidence yang masih wajib:

- count StaffPosition sebelum/sesudah migration.
- count Appointment dan AppointmentMigrationReview.
- count quarantine role historis/position identity.
- proof school-scope duplicate live appointment ditolak index.
- proof KAPROG duplicate per major/year ditolak index.
- proof KAPROG berbeda major bisa lanjut, bila fixture staging-copy tersedia.
- rehearsal rollback database copy.

## Residual / Deferred

- Git gate belum boleh sampai PostgreSQL staging-copy dry-run dan index proof selesai.
- Wave C tetap diperlukan untuk activation transaction: `APPROVED` -> `ACTIVE`, former holder ended/superseded, cache/session refresh.
- Beberapa service domain lama masih punya business-scope helper berbasis `user.roles` untuk KS/Waka. Guard dan permission resolver sudah appointment-aware; service-level semantic refactor untuk RPP/LMS/assessment tetap perlu dilakukan pada Wave C atau follow-up khusus agar active Waka/KS tidak tergantung role JWT.
- TF2 compatibility perlu diverifikasi bersama dry-run karena override `grant=false` kini sengaja menang atas permission appointment aktif.

## Explicit Packaging Candidate

Jangan stage sebelum dry-run gate pass. Jika gate pass, gunakan explicit file list; jangan `git add .`.

Candidate files:

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260724000001_appointment_governance_wave_b/migration.sql`
- `packages/database/prisma/seed.ts`
- `packages/database/prisma/seed-permissions.ts`
- `packages/auth/src/index.ts`
- `packages/auth/src/__tests__/auth.test.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth/guards/roles.guard.ts`
- `apps/api/src/permissions/permissions.service.ts`
- `apps/api/src/permissions/permissions.controller.ts`
- `apps/api/src/appointments/`
- `apps/api/src/__tests__/appointments.spec.ts`
- `apps/api/src/__tests__/roles.spec.ts`
- `apps/api/src/__tests__/permissions.spec.ts`
- `apps/api/src/__tests__/auth-me.spec.ts`
- `apps/api/src/report-cards/report-cards.controller.ts`
- `apps/api/src/report-cards/report-cards.service.ts`
- `scripts/appointment-wave-b-dry-run.ts`
- `docs/audits/APPOINTMENT-GOVERNANCE-WAVE-B-GATE0-PROPOSAL-2026-07-24.md`
- `docs/audits/APPOINTMENT-GOVERNANCE-WAVE-B-MODEL-MIGRATION-2026-07-23.md`

## Follow-up Review Closure - 2026-07-24

Status: implemented locally, reviewer re-review required before PostgreSQL dry-run copy, commit, push, or PR.

### P1/P2 Closure Table

| Item | Status | Closure |
| --- | --- | --- |
| P1-1 successor/PLT blocked by live unique index | Closed in code/migration draft | Partial unique indexes now consume capacity only for `status = 'ACTIVE'`. `PENDING_APPROVAL` and `APPROVED` successor/PLT can coexist with incumbent `ACTIVE` when `replacesAppointmentId` is explicit. Duplicate open replacement for the same target is blocked by service and `appointment_unique_replaces_open`. |
| P1-2 lifecycle cuti missing | Closed in code/migration draft | Added `SUSPENDED`, `suspend`, `resume`, `end`, and `supersede`. Suspended definitive appointments grant no permission; PLT can become `ACTIVE` only while the replaced definitive appointment is `SUSPENDED`; definitive successor supersedes old holder atomically. |
| P1-3 candidate validation too loose | Closed in code/migration draft | Candidate must be active, non-deleted `Staff` linked to active, non-deleted `User`. Auto-eligible roles are `GURU` and `TATA_USAHA` only. `SUPER_ADMIN`, `SISWA`, `ORANG_TUA`, `INDUSTRI`, deleted/inactive identities, and historical position roles are rejected/quarantined fail-closed. |
| P1-4 dry-run proof incomplete | Closed in script contract; runtime proof pending | Dry-run script now supports `--mode pre`, `--mode post`, `--prove-indexes`, and `--prove-rollback`. Index proof includes school-scope duplicate `ACTIVE` rejection, Kaprog same-major rejection, Kaprog different-major acceptance, and `APPROVED` successor while incumbent `ACTIVE`. |
| P2-1 `effectiveUntil < effectiveFrom` | Closed | Service returns `BadRequestException` before Prisma write. DB check remains defense in depth. |
| P2-2 deputy capacity | Decided conservative Option A | Exactly one `WAKIL_KOOR_BKK` and one `WAKIL_KOOR_HUBIN` per academic year/school scope. Multi-deputy requires a future slot/capacity model and is not silently allowed in this migration. |

### Second Follow-up P1 Closure

| Reviewer P1 | Status | Closure |
| --- | --- | --- |
| Global quarantine polluted by all non-`GURU`/`TATA_USAHA` accounts | Closed | Standalone `auth.users` quarantine now catches only explicit historical/position roles: roles outside the six stable identities. Normal `SISWA`, `ORANG_TUA`, `INDUSTRI`, and `SUPER_ADMIN` accounts without StaffPosition are not given false `AppointmentMigrationReview` rows. StaffPosition rows tied to non-employee identities remain quarantined through the source-row classifier. |
| Empty-scope open candidate race | Closed in migration draft and service tests | Added partial unique indexes for `PENDING_APPROVAL`/`APPROVED` candidates without `replacesAppointmentId` per school/major scope. Service also prechecks on submit for a clearer 409, while the DB catches parallel submit races with P2002 -> `ConflictException`. |

### State Machine Final

Wave B model:

`DRAFT -> PENDING_APPROVAL -> APPROVED -> ACTIVE -> ENDED`

Additional lifecycle:

- `ACTIVE` definitive -> `SUSPENDED` via `suspend(reason, expectedReturnDate)`.
- `SUSPENDED` definitive -> `ACTIVE` via `resume` only when no other `ACTIVE` appointment consumes the same scope.
- `APPROVED` PLT -> `ACTIVE` via `supersede` only when its replaced definitive appointment is `SUSPENDED`; replaced definitive remains `SUSPENDED`.
- `APPROVED` definitive successor -> `ACTIVE` via `supersede`; replaced `ACTIVE`/`SUSPENDED` appointment becomes `SUPERSEDED`.
- `ACTIVE`, `SUSPENDED`, and `APPROVED` may become `ENDED`.
- Terminal: `REJECTED`, `CANCELLED`, `SUPERSEDED`, `ENDED`.

Wave C remains separate: academic-year activation transaction, former-holder session logout, and Keycloak logout outbox are not implemented here.

### Index Strategy Final

Active capacity is enforced only by `status = 'ACTIVE'`:

- `appointment_unique_school_position_live`: one `ACTIVE` school-scope holder per position/year.
- `appointment_unique_major_position_live`: one `ACTIVE` major-scope holder per position/year/major.
- `appointment_unique_staff_position_scope_live`: one `ACTIVE` row per staff/position/year/scope.
- `appointment_unique_replaces_open`: one open `PENDING_APPROVAL`/`APPROVED`/`ACTIVE` successor or PLT per replaced appointment.
- `appointment_unique_school_position_open_candidate`: one open `PENDING_APPROVAL`/`APPROVED` candidate without incumbent per school-scope position/year.
- `appointment_unique_major_position_open_candidate`: one open `PENDING_APPROVAL`/`APPROVED` candidate without incumbent per major-scope position/year/major.

This allows successor/PLT preparation without blocking the current active holder, keeps two simultaneous active holders impossible at the DB layer, and prevents two empty-scope drafts from racing into duplicate pending candidates.

### Candidate Eligibility Policy

Auto-eligible appointment candidates:

- `GURU`
- `TATA_USAHA`

Rejected or quarantined:

- `SUPER_ADMIN` as appointment holder, until governance explicitly approves admin accounts as staff office holders.
- `SISWA`, `ORANG_TUA`, `INDUSTRI`.
- Historical position-code identities, including `KEPALA_SEKOLAH`.
- Deleted staff, deleted user, inactive user.

### Dry-run Script Contract

Commands for reviewer-approved disposable/staging-copy DB only:

```powershell
npx ts-node --project apps/api/tsconfig.json scripts/appointment-wave-b-dry-run.ts --mode pre
npx ts-node --project apps/api/tsconfig.json scripts/appointment-wave-b-dry-run.ts --mode post
npx ts-node --project apps/api/tsconfig.json scripts/appointment-wave-b-dry-run.ts --mode post --prove-indexes
npx ts-node --project apps/api/tsconfig.json scripts/appointment-wave-b-dry-run.ts --mode post --prove-rollback
```

Output remains PII-minimal: counts/status only, no names, email, phone, NIY, Keycloak IDs, or raw UUIDs.

Expected JSON shape:

```json
{
  "mode": "post",
  "counts": {
    "legacyStaffPositions": 0,
    "appointments": 0,
    "migrationReviews": 0,
    "historicalPositionIdentityUsers": 0,
    "classification": {}
  },
  "postReconciliation": {
    "staffPositionRowsReviewed": true,
    "migratedRowsHaveAppointments": true
  },
  "indexProof": {
    "schoolPositionActiveDuplicateRejected": { "status": "PASS" },
    "kaprogSameMajorActiveDuplicateRejected": { "status": "PASS" },
    "kaprogDifferentMajorAccepted": { "status": "PASS" },
    "approvedSuccessorWhileActiveAccepted": { "status": "PASS" },
    "openCandidateWithoutIncumbentDuplicateRejected": { "status": "PASS" }
  }
}
```

The sample is a shape example only, not runtime dry-run proof.

### Follow-up Verification

```powershell
npm.cmd --workspace @smk/database run db:generate
npm.cmd --workspace @smk/api run test -- --runInBand --cacheDirectory=.tmp/jest-cache-appointment-b-followup --runTestsByPath src/__tests__/appointments.spec.ts src/__tests__/permissions.spec.ts src/__tests__/roles.spec.ts src/__tests__/auth-me.spec.ts
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
git diff --check -- packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260724000001_appointment_governance_wave_b/migration.sql apps/api/src/appointments apps/api/src/__tests__/appointments.spec.ts apps/api/src/__tests__/permissions.spec.ts scripts/appointment-wave-b-dry-run.ts docs/audits/APPOINTMENT-GOVERNANCE-WAVE-B-MODEL-MIGRATION-2026-07-23.md
```

Results:

- Prisma generate: pass.
- API focused tests: 4 suites / 78 tests pass.
- Coverage includes duplicate empty-scope candidate precheck and parallel submit race mapping P2002 to `ConflictException`.
- API type-check: pass.
- Web type-check: pass.
- API lint: pass.
- Web lint: pass, with existing Next lint deprecation/plugin notice.
- API build: pass.
- Targeted `git diff --check`: pass.

### Follow-up Files Changed

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260724000001_appointment_governance_wave_b/migration.sql`
- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/appointments/appointments.controller.ts`
- `apps/api/src/appointments/dto/appointment.dto.ts`
- `apps/api/src/appointments/appointment-migration.classifier.ts`
- `apps/api/src/__tests__/appointments.spec.ts`
- `apps/api/src/__tests__/permissions.spec.ts`
- `scripts/appointment-wave-b-dry-run.ts`
- `docs/audits/APPOINTMENT-GOVERNANCE-WAVE-B-MODEL-MIGRATION-2026-07-23.md`

### Gate Statement

PostgreSQL staging-copy dry-run has intentionally not been run in this executor follow-up. The migration draft is now ready for reviewer re-review. If reviewer approves, the next gate is disposable/staging-copy PostgreSQL proof: pre counts, migration apply, post reconciliation, index proof, rollback rehearsal, then Git gate with explicit file list.
