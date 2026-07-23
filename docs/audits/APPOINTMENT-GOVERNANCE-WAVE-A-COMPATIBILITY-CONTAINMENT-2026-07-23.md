# Appointment Governance Wave A - Compatibility and Containment

Tanggal: 2026-07-23
Branch: `fix/appointment-governance-wave-a-20260723`
Base lokal saat mulai: `746c2c9` (`origin/develop`)
Status executor: siap untuk re-review lokal; push/PR develop menunggu reviewer dan explicit user gate. Belum staging sign-off.

## Scope

Wave A ini hanya containment kompatibilitas setelah role jabatan dihapus dari Keycloak. Tidak ada schema baru, migration, perubahan TF2, atau ekspansi LMS WAKA reviewer.

Sumber dibaca:

- `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
- `docs/WAYS-OF-WORKING.md`
- `docs/decision-log.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\docs\audits\PROMPT-ARCHITECT-APPOINTMENT-GOVERNANCE-KEYCLOAK-TRANSITION-WAVES-2026-07-23.md`
- Handoff appointment/TF2 dari worktree utama, karena clean worktree `origin/develop` belum membawa dokumen audit terbaru itu.

Catatan: `smart-ai-school-appointment-wave-a/AGENTS.md` dan prompt handoff audit tidak ada pada clean worktree dari `origin/develop`; konteks mandatory yang hilang di branch clean dibaca dari workspace utama tanpa menyalin file prompt ke commit Wave A.

## Plan Gate

Rencana awal:

1. Pisahkan stable identity roles dari position codes.
2. Blokir semua mutasi Keycloak realm role untuk position code.
3. Nonaktifkan sync position role dari UI/API secara jujur.
4. Update provisioning/user management agar role akun baru hanya enam identity roles.
5. Update realm seed/runbook agar Keycloak tidak membuat `KEPALA_SEKOLAH` atau `WAKA_*`.
6. Tambahkan tests dan inventory residual `@Roles(positionCode)`.

Self-critique:

- Risiko deleted role direcreate: ada di `PositionsService.syncKeycloakRoles`, assign/unassign jabatan, dan helper Keycloak role mutation.
- Stable identity roles harus tetap dapat diprovision: `SUPER_ADMIN`, `TATA_USAHA`, `GURU`, `SISWA`, `ORANG_TUA`, `INDUSTRI`.
- Banyak `@Roles('KEPALA_SEKOLAH'...)` dan beberapa `@Roles('WAKA_KURIKULUM'...)` masih ada; Wave A harus fail-closed, bukan pura-pura sudah ada resolver appointment.
- PR #389 WAKA LMS harus tetap excluded.
- TF2 migration compatibility hanya dicatat; tidak boleh dicampur ke Wave A.

Fixed plan yang dijalankan:

- Token extraction API/web hanya menerima `PRIMARY_ROLES` enam identity roles. Stale JWT role jabatan diabaikan, sehingga route lama berbasis position role menjadi fail-closed.
- `KeycloakAdminService` menolak `assignRealmRole`, `removeRealmRole`, `createRealmRole`, dan `createRealmRoleIfNotExists` untuk semua position codes.
- `PositionsService.assign/unassign` ditahan fail-closed dengan `409 Conflict` sebelum menyentuh `StaffPosition`, permission override, cache, atau Keycloak. `syncKeycloakRoles` tetap no-op compatibility endpoint.
- UI Struktur Organisasi menjadi mode baca saja. Tombol penugasan/pelepasan diganti dialog transisi appointment, tanpa janji kandidat atau multi-holder sebelum Wave B.
- User/provisioning UI dan DTO hanya menerima role akun stabil.
- Realm seed/runbook Keycloak hanya memuat enam identity roles.

## Implementation Summary

Auth contract:

- `packages/auth/src/index.ts`
  - `PRIMARY_ROLES` menjadi enam role identity stabil.
  - `KEPALA_SEKOLAH` dipindahkan menjadi position code saja.
  - `PrimaryRoleSchema` dan `isPrimaryRole()` ditambahkan.
  - `extractAuthUser()` membuang position code dari JWT.
  - `isAdmin()` hanya true untuk `SUPER_ADMIN`.

Keycloak containment:

- `apps/api/src/keycloak-admin/keycloak-admin.service.ts`
  - Menolak semua mutasi realm role untuk position code dengan `BadRequestException`.
  - Pesan missing role tidak lagi menyarankan sync jabatan.

Positions containment:

- `apps/api/src/positions/positions.service.ts`
  - Assign/unassign jabatan ditahan fail-closed selama transisi Appointment Governance.
  - Tidak ada `StaffPosition`, `UserPermissionOverride`, cache invalidation, atau mutasi Keycloak yang dijalankan dari endpoint assign/unassign.
  - `syncKeycloakRoles()` menjadi compatibility endpoint no-op: mengembalikan stable roles dan blocked position codes tanpa memanggil Keycloak atau query position list.
- `apps/api/src/positions/positions.controller.ts`
  - Management struktur organisasi dibatasi ke `SUPER_ADMIN` selama containment.

User/provisioning containment:

- `apps/api/src/users/dto/update-user.dto.ts` dan `apps/api/src/provisioning/dto/provision.dto.ts`
  - Role input memakai `PrimaryRoleSchema`.
- `apps/api/src/users/users.service.ts`
  - Reject role jabatan sebelum DB/Keycloak.
  - Tidak memanggil `removeRealmRole()` untuk `oldRole` historis yang merupakan jabatan.
  - Grouped user list hanya menampilkan enam role identity stabil.
- `apps/web/src/app/dashboard/users/_components/*`
  - Role picker/template CSV tidak lagi menawarkan `KEPALA_SEKOLAH`.
  - Copy menjelaskan jabatan struktural dikelola di alur appointment, bukan sebagai role akun.

Web containment:

- `apps/web/src/lib/auth.ts`
  - Role session web difilter ke `PRIMARY_ROLES`.
- `apps/web/src/app/dashboard/struktur-organisasi/*`
  - Tombol dan hasil sync role Keycloak dihapus dari UI.
  - Mutasi assign/remove tidak lagi tersedia dari UI; pengguna hanya melihat katalog/riwayat dan dialog penjelasan transisi appointment.
  - Copy kandidat berikutnya menyebut role stabil `Guru` dan `Tata Usaha`, tanpa menjanjikan kapasitas/multi-holder sebelum Wave B.

Seed/runbook:

- `infrastructure/keycloak/realm-diis.json`
  - `KEPALA_SEKOLAH` dihapus dari realm roles.
- `docs/deployment/keycloak-setup.md`
  - Realm roles dijelaskan sebagai enam stable identity roles saja.
- `packages/database/prisma/seed.ts`
  - Summary seeding diselaraskan: Keycloak identity roles stabil enam; data jabatan historis tetap menunggu migration Wave B.

## Tests Added/Changed

- `packages/auth/src/__tests__/auth.test.ts`
  - `PRIMARY_ROLES` tepat enam role stabil.
  - JWT role jabatan historis dibuang dari `extractAuthUser()`.
  - `KEPALA_SEKOLAH` bukan admin identity role.
- `apps/api/src/__tests__/keycloak-admin.spec.ts`
  - `assignRealmRole('WAKA_KURIKULUM')` reject sebelum fetch.
  - `createRealmRoleIfNotExists('KEPALA_SEKOLAH')` reject sebelum fetch.
- `apps/api/src/__tests__/positions.spec.ts`
  - Assign/unassign reject `409 Conflict` sebelum DB, cache, atau Keycloak.
  - Sync role jabatan mengembalikan status disabled tanpa create realm role.
- `apps/api/src/__tests__/users.spec.ts`
  - Update role ke `KEPALA_SEKOLAH` reject sebelum DB/Keycloak.
  - Old historical position role tidak dicabut dari Keycloak saat user dimigrasi ke stable role.
  - Grouped users hanya enam identity roles.
- `apps/api/src/__tests__/provisioning.spec.ts`
  - Schema provisioning menolak `KEPALA_SEKOLAH` sebagai role akun baru.

## Verification

Setup worktree baru:

- `npm.cmd ci --ignore-scripts --prefer-offline --cache .tmp/npm-cache` lulus setelah eskalasi network. Percobaan sandbox sebelumnya gagal `EACCES` registry.
- `npm.cmd --workspace @smk/auth run build` lulus.
- `npm.cmd --workspace @smk/logger run build` lulus.
- `npm.cmd --workspace @smk/types run build` lulus.
- `npm.cmd --workspace @smk/database run db:generate` lulus setelah eskalasi network untuk Prisma engine.

Follow-up rerun setelah temuan reviewer:

- `npm.cmd --workspace @smk/auth run test -- --runInBand --cacheDirectory=.tmp/jest-cache-appointment-a auth`
  - PASS: 1 suite / 52 tests.
- `npm.cmd --workspace @smk/api run test -- --runInBand --cacheDirectory=.tmp/jest-cache-appointment-a --runTestsByPath src/__tests__/positions.spec.ts src/__tests__/keycloak-admin.spec.ts src/__tests__/users.spec.ts src/__tests__/provisioning.spec.ts src/__tests__/permissions.spec.ts`
  - PASS: 5 suites / 113 tests.
  - Warning only: expected log from disabled `syncKeycloakRoles`.
- `npm.cmd --workspace @smk/api run type-check` PASS.
- `npm.cmd --workspace @smk/web run type-check` PASS.
- `npm.cmd --workspace @smk/api run lint` PASS.
- `npm.cmd --workspace @smk/web run lint` PASS, with existing Next lint deprecation/plugin warning.
- `git diff --check` PASS.

Focused tests:

- `npm.cmd --workspace @smk/auth run test -- --runInBand --cacheDirectory=.tmp/jest-cache-appointment-a auth`
  - PASS: 1 suite / 52 tests.
- `npm.cmd --workspace @smk/api run test -- --runInBand --cacheDirectory=.tmp/jest-cache-appointment-a --runTestsByPath src/__tests__/users.spec.ts src/__tests__/positions.spec.ts src/__tests__/keycloak-admin.spec.ts src/__tests__/provisioning.spec.ts src/__tests__/permissions.spec.ts`
  - PASS before reviewer follow-up: 5 suites / 118 tests.
  - Warning only: existing `ts-jest` transform warning for compiled `.js` files in shared package `dist`.
- `npm.cmd --workspace @smk/web run test -- --runInBand --cacheDirectory=.tmp/jest-cache-appointment-a add-user-csv`
  - PASS: 1 suite / 4 tests.

Static/build checks:

- `npm.cmd --workspace @smk/auth run type-check` PASS.
- `npm.cmd --workspace @smk/api run type-check` PASS.
- `npm.cmd --workspace @smk/web run type-check` PASS.
- `npm.cmd --workspace @smk/auth run lint` PASS.
- `npm.cmd --workspace @smk/api run lint` PASS.
- `npm.cmd --workspace @smk/web run lint` PASS, with existing Next lint deprecation/plugin warning.
- `npm.cmd --workspace @smk/api run build` PASS.
- `npm.cmd --workspace @smk/web run build` PASS after escalation; sandbox attempt failed only because `next/font` could not fetch Google Fonts. Build produced 39/39 pages.

## Inventory: Position Codes Still In `@Roles`

`rg -n "@Roles(... position codes ...)" apps/api/src apps/web/src packages` still finds legacy role metadata in these API domains:

- announcements
- analytics
- attendance / teacher-attendance
- assessment / submissions
- badges / gamification
- classes / class activities
- LMS
- RPP and report cards, including `WAKA_KURIKULUM`
- AI generate/admin surfaces
- student
- schedule / teaching assignment
- PPDB
- finance
- school-config
- question-bank
- push / wa-log

Wave A containment status:

- Contained fail-closed: API and web token extraction now ignore position codes from Keycloak JWT, so these decorators cannot be satisfied by deleted/stale Keycloak role jabatan.
- Deferred: these route guards must be converted to appointment/permission resolver in Wave B/C. This PR intentionally does not rewrite all feature authorization semantics.
- Highest-priority deferred paths for Wave B reviewer attention: `rpp`, `report-cards`, `lms`, `school-config`, `finance`, `ppdb`, `student`, and `classes`.

## Residual Risks

- Historical `User.role = KEPALA_SEKOLAH` can still exist in DB/schema and seed data. Wave A does not migrate it. New role selection/provisioning blocks it, and JWT role extraction ignores it.
- User grouped list now shows six identity roles; any historical users with position role need an explicit Wave B migration/recovery path.
- Route decorators with position codes remain in code and fail closed via role filtering. This is containment, not final appointment authorization.
- `syncRolesAction` remains as a compatibility export for the existing route, but the UI no longer imports it and API returns disabled/no mutation.
- Assignment lifecycle is intentionally frozen: assigning/removing position holders must wait for Wave B approval, exclusivity, and appointment state model.
- TF2-P1-1 remains separate and still requires PostgreSQL staging-copy dry-run before its own PR/runtime claim.
- No browser staging QA was run in this executor pass. Staging sign-off still requires runtime role/session checks after reviewer approval.
- Generated local folders from verification (`.tmp/`, package `.tmp/`) are untracked and must not be staged.

## Explicit Packaging List

Only these files should be staged for Wave A:

- `packages/auth/src/index.ts`
- `packages/auth/src/__tests__/auth.test.ts`
- `apps/api/src/keycloak-admin/keycloak-admin.service.ts`
- `apps/api/src/__tests__/keycloak-admin.spec.ts`
- `apps/api/src/positions/positions.service.ts`
- `apps/api/src/positions/positions.controller.ts`
- `apps/api/src/__tests__/positions.spec.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/users.controller.ts`
- `apps/api/src/users/dto/update-user.dto.ts`
- `apps/api/src/__tests__/users.spec.ts`
- `apps/api/src/provisioning/dto/provision.dto.ts`
- `apps/api/src/__tests__/provisioning.spec.ts`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/app/dashboard/users/_components/UsersClient.tsx`
- `apps/web/src/app/dashboard/users/_components/AddUserDialog.tsx`
- `apps/web/src/app/dashboard/users/_components/add-user-csv.ts`
- `apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx`
- `apps/web/src/app/dashboard/struktur-organisasi/page.tsx`
- `apps/web/src/app/dashboard/struktur-organisasi/actions.ts`
- `infrastructure/keycloak/realm-diis.json`
- `docs/deployment/keycloak-setup.md`
- `packages/database/prisma/seed.ts`
- `docs/audits/APPOINTMENT-GOVERNANCE-WAVE-A-COMPATIBILITY-CONTAINMENT-2026-07-23.md`

Do not stage:

- `apps/api/src/lms/lms.service.ts`
- `apps/api/src/__tests__/lms.spec.ts`
- TF2 migration/schema files
- `.tmp/`, `apps/api/src/.tmp/`, `apps/web/.tmp/`, `packages/auth/src/.tmp/`, `node_modules/`

## Executor Verdict

Wave A code containment is ready for reviewer gate and PR to `develop`.

Not ready for staging sign-off until reviewer approval plus runtime QA:

- stale/former Keycloak JWT with deleted position roles cannot access protected position-role-only route,
- stable role user provisioning still works,
- Struktur Organisasi assign/remove succeeds without Keycloak position role mutation,
- `sync-roles` compatibility endpoint returns disabled notice,
- legacy `User.role = KEPALA_SEKOLAH` migration/recovery policy is decided in Wave B.
