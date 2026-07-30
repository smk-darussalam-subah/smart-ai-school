# TF2 + Wave B Integration Dry-Run Report

Tanggal: 2026-07-24
Peran: Codex Executor (PostgreSQL disposable-copy dry-run gate)
Prompt: `PROMPT-ARCHITECT-TF2-WAVEB-INTEGRATION-RECOVERY-GATE-2026-07-24.md` Section 5
Director Decisions: 1 (KEEP+FREEZE), 2 (1fad5e3 debt), 3 (snapshot secepatnya) — semua LOCKED.

## Verdict

`BLOCKED — DATABASE GATE NOT MET`

Runtime PostgreSQL dry-run **tidak dapat dijalankan** di sesi executor ini karena environment tidak memiliki akses ke PostgreSQL disposable copy. Static analysis mendalam telah dilakukan sebagai pengganti, dan menemukan **3 konflik kritis** yang harus diselesaikan sebelum rebase Wave B ke `develop@37d41e6`.

Pernyataan eksplisit: **tidak ada commit, push, PR, merge, deploy, atau perubahan source code yang dilakukan dalam sesi ini.**

---

## 1. Database Gate — STOP Condition Terpenuhi

### Environment Probe (2026-07-24)

| Resource | Status | Detail |
|---|---|---|
| `psql` | NOT available | Tidak ada di PATH |
| `pg_dump` | NOT available | Tidak ada di PATH |
| Docker CLI | Available | Tapi daemon NOT reachable (`Server: null`) |
| Docker daemon | NOT reachable | `docker ps` gagal, `docker_engine` pipe tidak ditemukan |
| `DATABASE_URL` env | NOT set | Kosong |
| `.env` live files | Tidak ada | Hanya `.env.example` dan `.env.production` (tanuk kredensial aktif) |
| Local PostgreSQL | NOT reachable | Tidak ada TCP listener di `localhost:5432` |

### Keputusan Gate

Sesuai Section "Gate Database — STOP jika tidak terpenuhi":
> "Jika URL, snapshot mechanism, atau otoritas membuat copy belum jelas: STOP dan minta konfirmasi Director."

**STOP.** Tidak ada disposable PostgreSQL copy yang dapat dibuat atau diakses dari sesi ini. Identik dengan temuan TF2 report 2026-07-23 (L133-151).

### Eskalasi ke Director/Operator

Director Decision 3 (snapshot secepatnya) LOCKED. Snapshot dan disposable copy harus disiapkan oleh operator dengan akses VPS atau tool `pg_dump` + restore. Executor ini tidak memiliki akses tersebut.

**Prasyarat operator sebelum dry-run dapat dijalankan ulang:**
1. Akses SSH ke VPS atau tool yang dapat melakukan `pg_dump` dari `smk_staging_db`.
2. Restore ke database baru dengan suffix `-copy` / `-snapshot` / `-dryrun`.
3. Berikan `DATABASE_URL` yang menunjuk ke copy disposable tersebut ke sesi executor baru.
4. Pastikan tidak mencetak/melog `DATABASE_URL`, password, atau secret apa pun.

---

## 2. Static Analysis Mendalam (Pengganti Sementara Runtime Proof)

Karena runtime dry-run tidak dapat dijalankan, static analysis komprehensif dilakukan terhadap:
- Kedua migration SQL files.
- Kedua schema.prisma versions.
- Kedua permissions.service.ts versions (resolver).
- Production code path untuk Wave A containment.
- File overlap map antara TF2 dan Wave B.

### 2.1 File Overlap Map

**File dimodifikasi oleh KEDUA branch (CONFLICT ZONES — rebase akan menghasilkan conflict marker):**

| File | TF2 perubahan | Wave B perubahan |
|---|---|---|
| `packages/database/prisma/schema.prisma` | `UserPermissionOverride` model: +5 kolom, unique constraint berubah, +2 enum | +5 Appointment models, +5 enum, komentar update |
| `apps/api/src/permissions/permissions.service.ts` | `resolvePermissions()`: filter `status=ACTIVE` + `academicYearId`; `writeGlobalOverride()`: source/status-aware | `resolvePermissions()`: +appointment resolver, filter `isPrimaryRole`; `grantUserPermission()`: upsert `userId_permissionId` |
| `apps/api/src/__tests__/permissions.spec.ts` | +zombie migration tests | +appointment permission tests |

**File dimodifikasi HANYA oleh TF2 (auto-merge, no conflict):**
- `apps/api/src/__tests__/positions.spec.ts`
- `apps/api/src/__tests__/school-config.spec.ts`
- `apps/api/src/__tests__/tf2-zombie-migration.spec.ts` (file baru)
- `apps/api/src/positions/positions.service.ts`
- `apps/api/src/school-config/school-config.module.ts`
- `apps/api/src/school-config/school-config.service.ts`
- `packages/database/prisma/migrations/20260722000001_tf2_p1_1_zombie_permissions/migration.sql` (file baru)

**File dimodifikasi HANYA oleh Wave B (auto-merge, no conflict):**
- `apps/api/src/__tests__/auth-me.spec.ts`, `roles.spec.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth/guards/roles.guard.ts`
- `apps/api/src/permissions/permissions.controller.ts`
- `apps/api/src/report-cards/report-cards.controller.ts`, `report-cards.service.ts`
- `packages/auth/src/index.ts`, `__tests__/auth.test.ts`
- `packages/database/prisma/seed.ts`, `seed-permissions.ts`
- File baru: `appointments/` module, migration, dry-run script, audit docs

---

### 2.2 Finding 1 — CRITICAL: Resolver Regression di permissions.service.ts

**Severity: CRITICAL (security regression)**

TF2 menutup celah "zombie permissions" dengan memfilter override hanya yang `status = ACTIVE` dan scoped ke active academic year. Wave B's `permissions.service.ts` **tidak memiliki filter ini** dan akan membuka kembali celah tersebut jika naively merged.

**TF2 resolvePermissions() (develop@37d41e6):**
```typescript
// Filter: status = ACTIVE + academicYearId matching
this.prisma.userPermissionOverride.findMany({
  where: {
    userId: authUserId,
    status: PermissionOverrideStatus.ACTIVE,  // ← TF2 security fix
    OR: activeYearId
      ? [{ academicYearId: activeYearId }, { academicYearId: null }]
      : [{ academicYearId: null }],
  },
})
```

**Wave B resolvePermissions() (worktree):**
```typescript
// NO status filter, NO academicYearId filter
this.prisma.userPermissionOverride.findMany({
  where: { userId: authUserId },  // ← REGRESSION: reads ALL overrides including QUARANTINED
  select: { grant: true, permission: { select: { code: true } } },
})
```

**Dampak jika Wave B's resolver menang setelah rebase:**
- Semua row `QUARANTINED` oleh TF2 migration akan dibaca kembali sebagai aktif.
- Semua row dengan `academicYearId` tahun lama akan tetap berlaku setelah tahun berganti.
- Ini persis-menyebabkan celah "zombie permissions" yang TF2 dirancang untuk menutup.

**Rekomendasi resolusi:**
Wave B's `resolvePermissions()` harus diperbarui untuk menggabungkan appointment resolver dengan TF2's filter (`status = ACTIVE`, `academicYearId` scope). Bukan mengganti satu dengan yang lain.

---

### 2.3 Finding 2 — CRITICAL: Prisma Composite Key Mismatch

**Severity: CRITICAL (compile-time failure — fail-fast, tapi harus diperbaiki)**

TF2 mengubah unique constraint `UserPermissionOverride` dari `@@unique([userId, permissionId])` menjadi `@@unique([userId, permissionId, academicYearId])`. Wave B's write path masih menggunakan composite key lama.

**Wave B grantUserPermission()/revokeUserPermission():**
```typescript
// Wave B uses OLD composite key
this.prisma.userPermissionOverride.upsert({
  where: {
    userId_permissionId: { userId, permissionId },  // ← TIDAK ADA setelah TF2 rebase
  },
  // ...
})
```

Setelah rebase, Prisma client akan generate type `userId_permissionId_academicYearId` (3-field composite). `userId_permissionId` tidak akan ada di generated types. **TypeScript compile akan gagal** — ini adalah fail-fast yang baik, tapi code Wave B harus diperbarui.

**Demikian juga** Wave B's `getUserEffectivePermissions()`:
```typescript
// Wave B reads ALL overrides — no status/year filter
const overrides = await this.prisma.userPermissionOverride.findMany({
  where: { userId },
  include: { permission: true },
})
```
TF2 version memfilter ini dengan `status = ACTIVE` + `academicYearId`.

**Rekomendasi resolusi:**
Wave B's write path harus diadopsi dari TF2's `writeGlobalOverride()` pattern yang menggunakan `findFirst` + `update/create` dengan handle P2002 retry, bukan `upsert` dengan composite key lama.

---

### 2.4 Finding 3 — HIGH: schema.prisma Git Merge Conflict

**Severity: HIGH (rebase akan produce conflict marker)**

Kedua branch memodifikasi region `UserPermissionOverride` di `schema.prisma`:

- **TF2** mengubah model fields dan unique constraint.
- **Wave B** TIDAK mengubah model fields (masih versi lama), tapi mengubah komentar sekitarnya dan menambah Appointment models di section lain.

Setelah rebase Wave B ke `develop@37d41e6`, git akan menghasilkan conflict marker di:
1. `UserPermissionOverride` model block — karena TF2 mengubah fields/unique tetapi Wave B masih punya versi lama.
2. Comment block tentang PositionPermission — keduanya mengubah teks komentar.

**Resolusi yang BENAR:**
- Pertahankan SEMUA perubahan TF2 pada `UserPermissionOverride` (kolom, unique, index, enum).
- Pertahankan SEMUA perubahan Wave B pada Appointment models.
- Update komentar untuk mencerminkan appointment resolver.

**Resolusi yang SALAH (dilarang):**
- Menghapus kolom TF2 untuk menghindari konflik.
- Mengambil Wave B's `UserPermissionOverride` (versi lama) karena "Wave B adalah branch yang lebih baru".

---

### 2.5 Finding 4 — MEDIUM: Data Classification Overlap (StaffPosition)

**Severity: MEDIUM (tidak merusak data, tapi semantic risk)**

Kedua migration membaca `StaffPosition` + `PositionPermission` sebagai data sumber:

| Migration | Sumber dibaca | Target ditulis | Filter |
|---|---|---|---|
| TF2 (`20260722000001`) | `staff_positions` WHERE `is_active = TRUE` + `position_permissions` | `user_permission_overrides` (POSITION_ASSIGNMENT / ACTIVE) | Hanya active positions |
| Wave B (`20260724000001`) | SEMUA `staff_positions` + join `users`, `positions`, `academic_years` | `appointments` + `appointment_migration_reviews` | Klasifikasi MIGRATED vs QUARANTINED |

**Tidak ada konflik SQL langsung** karena kedua migration menulis ke tabel yang berbeda. TF2 tidak menulis ke `appointments`; Wave B tidak menulis ke `user_permission_overrides`.

**Tapi risiko semantic:**
- Setelah kedua migration, permission dari jabatan aktif ada di DUA tempat:
  1. TF2: `user_permission_overrides` dengan `source = POSITION_ASSIGNMENT`.
  2. Wave B: `appointments` yang dibaca dinamis oleh Wave B resolver.
- Jika resolver merged tidak hati-hati, user bisa mendapat permission ganda atau konflik.
- Wave B's design intent: appointment permissions dihitung dinamis, TIDAK ditulis sebagai `UserPermissionOverride` permanen. Tapi TF2 sudah menulisnya sebagai override.
- **Resolver yang benar setelah merge**: appointment permissions dari Wave B dynamic resolver; TF2 POSITION_ASSIGNMENT overrides harus diabaikan atau dihapus setelah appointment resolver aktif (Wave C concern).

---

### 2.6 Finding 5 — INFO: Migration Timestamp Ordering — AMAN

| Migration | Timestamp | Urutan apply |
|---|---|---|
| TF2 | `20260722000001` | Pertama |
| Wave B | `20260724000001` | Kedua |

Urutan benar: TF2 schema changes (auth enum + kolom + index) dulu, Wave B appointment tables kemudian. Tidak ada konflik timestamp.

---

### 2.7 Finding 6 — INFO: Wave B Enum Addition — AMAN

Wave B menambah enum values `WAKIL_KOOR_BKK` dan `WAKIL_KOOR_HUBIN` ke `auth.UserRole` via:
```sql
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKIL_KOOR_BKK';
ALTER TYPE "auth"."UserRole" ADD VALUE IF NOT EXISTS 'WAKIL_KOOR_HUBIN';
```

`ADD VALUE IF NOT EXISTS` bersifat idempotent. PostgreSQL `ALTER TYPE ... ADD VALUE` membutuhkan lock eksklusif pada enum type, tapi Prisma migrate berjalan sequential (satu migration per transaksi), jadi tidak ada konflik lock paralel.

---

## 3. Wave A Containment Verification — PASS

### Director Decision 2 Verification (LANGSUNG dari develop@37d41e6)

**Commit `1fad5e3` — test-only bypass:**
- `git show 1fad5e3 --stat` → hanya menyentuh `apps/api/src/__tests__/positions.spec.ts` (1 file, +6/-1). TEST-ONLY. ✅

**Production code `positions.service.ts` di develop@37d41e6:**
```
Line 82:  private isAppointmentMutationDisabled(): boolean {
            return true;   ← HARDCODED TRUE
          }
Line 140:   if (this.isAppointmentMutationDisabled()) {
              throw new ConflictException(APPOINTMENT_TRANSITION_MUTATION_DISABLED_MESSAGE);
            }               ← assign() BLOCKED
Line 277:   if (this.isAppointmentMutationDisabled()) {
              throw new ConflictException(APPOINTMENT_TRANSITION_MUTATION_DISABLED_MESSAGE);
            }               ← unassign() BLOCKED
```

`git grep` di production path (exclude `__tests__`) mengkonfirmasi: method hanya ada di `positions.service.ts:82/140/277`. `jest.spyOn(... 'isAppointmentMutationDisabled')` hanya di `positions.spec.ts`.

**Kesimpulan: Wave A containment AKTIF di production path. Assign/unassign fail-closed sampai Wave C.** ✅

---

## 4. Migration SQL Analysis

### 4.1 TF2 Migration (`20260722000001`) — Reviewed

- Membuat temp table inventory dari `user_permission_overrides`.
- Klasifikasi: `grant=true` historical → `QUARANTINED`; `grant=false` → `ACTIVE` global revoke.
- Recreate position grants dari active `StaffPosition` + `PositionPermission` → `POSITION_ASSIGNMENT / ACTIVE`.
- Drops old unique index `user_permission_overrides_user_id_permission_id_key`.
- Creates partial unique index `user_permission_overrides_global_active_uniq` (`WHERE academic_year_id IS NULL AND status = 'ACTIVE'`).
- Creates unique index `user_permission_overrides_user_perm_year_key` (`user_id, permission_id, academic_year_id`).
- Emits NOTICE dengan aggregate counts only (total, recreated, quarantined, global_revokes, single_match_candidates).
- **Catatan SQL**: Tidak ada `BEGIN/COMMIT` eksplisit (commit `9cdc772` menghapus ini — benar karena Prisma membungkus migration dalam transaction sendiri).
- **Catatan SQL**: Reserved keyword `grant` di-quote dengan benar (commit `effe218`).

### 4.2 Wave B Migration (`20260724000001`) — Reviewed

- Membuat 5 enum baru di schema `school`.
- `ALTER TYPE auth.UserRole ADD VALUE IF NOT EXISTS` untuk 2 deputy position codes.
- Insert deputy position catalog rows (`WAKIL_KOOR_BKK`, `WAKIL_KOOR_HUBIN`).
- Insert position_permissions untuk deputy positions.
- Membuat `appointments`, `appointment_approvals`, `appointment_migration_reviews` tables.
- 7 partial unique indexes untuk appointment exclusivity policy.
- Bridge classification dari `staff_positions` ke `appointments` + `appointment_migration_reviews`.
- Standalone quarantine untuk `auth.users.role` position-code di luar 6 stable identities.
- **Catatan SQL**: Migration tidak menyentuh `user_permission_overrides` tabel — tidak ada konflik DDL langsung dengan TF2.
- **Catatan SQL**: CHECK constraints untuk PLT (requires `effective_until` + `reason`) dan SUSPENDED status — defense in depth.

---

## 5. Pre/Post Count Queries — Disiapkan untuk Dry-Run

Query berikut disiapkan untuk dieksekusi pada disposable copy ketika database tersedia. Semua PII-minimal (count/status only).

### Pre-Count Baseline (sebelum kedua migration)

```sql
-- TF2 baseline
SELECT COUNT(*) FROM "auth"."user_permission_overrides";
SELECT "grant", COUNT(*) FROM "auth"."user_permission_overrides" GROUP BY "grant" ORDER BY "grant";

-- Shared source data
SELECT COUNT(*) FROM "school"."staff_positions" WHERE "is_active" = TRUE;
SELECT COUNT(*) FROM "school"."staff_positions";
SELECT COUNT(*) FROM "school"."position_permissions";
SELECT COUNT(*) FROM "auth"."users" WHERE "deletedAt" IS NULL;
SELECT role, COUNT(*) FROM "auth"."users" WHERE "deletedAt" IS NULL GROUP BY role;
```

### Post-Count Setelah TF2

```sql
SELECT source, status, "grant", COUNT(*)
FROM "auth"."user_permission_overrides"
GROUP BY source, status, "grant"
ORDER BY source, status, "grant";
```

### Post-Count Setelah Wave B

```sql
SELECT "kind", "status", COUNT(*) FROM "school"."appointments" GROUP BY "kind", "status";
SELECT "migration_status", COUNT(*) FROM "school"."appointment_migration_reviews"
WHERE "source_staff_position_id" IS NOT NULL GROUP BY "migration_status";
SELECT "status", COUNT(*) FROM "school"."appointment_migration_reviews" GROUP BY "status";
SELECT unnest(enum_range(NULL::"auth"."UserRole"))::text;
```

---

## 6. Concurrency/Index Proof Scenarios — Disiapkan untuk Dry-Run

Skenario berikut HARUS dibuktikan pada PostgreSQL aktual (bukan unit test) ketika disposable copy tersedia:

| # | Skenario | Expected | Verification Method |
|---|---|---|---|
| C1 | Duplicate `ACTIVE` school-scope appointment (same position/year) | REJECTED (unique violation) | Insert 2 rows, expect 23505 |
| C2 | Duplicate `ACTIVE` Kaprog same major/year | REJECTED | Insert 2 rows, expect 23505 |
| C3 | `ACTIVE` Kaprog different majors/year | ACCEPTED | Insert 2 rows, expect success |
| C4 | `APPROVED` successor coexist with incumbent `ACTIVE` | ACCEPTED | Insert both, expect success |
| C5 | Duplicate `PENDING_APPROVAL` open candidate without incumbent | REJECTED | Insert 2 rows, expect 23505 |
| C6 | TF2 duplicate `ACTIVE` global override (`academic_year_id IS NULL`) | REJECTED | Insert 2 rows, expect 23505 |
| C7 | TF2 duplicate `[user_id, permission_id, academic_year_id]` | REJECTED | Insert 2 rows with same triple, expect 23505 |
| C8 | Insert 2 position-derived overrides with same `staffPositionId` for same year | REJECTED | Insert 2 rows, expect 23505 |

Wave B dry-run script (`scripts/appointment-wave-b-dry-run.ts`) mendukung C1-C5 via `--prove-indexes`. C6-C8 (TF2 index proof) harus dilakukan dengan SQL manual atau script tambahan.

---

## 7. Resolver Behavior Proof Scenarios — Disiapkan untuk Dry-Run

| # | Skenario | Expected |
|---|---|---|
| R1 | Bekas pejabat (position-ended) setelah academic-year switch | Tidak punya izin position-derived |
| R2 | Active pejabat | Masih punya izin |
| R3 | User dengan hanya `MIGRATION_QUARANTINE` rows | Tidak dapat izin |
| R4 | Manual `grant=false` global override tetap menarik permission meski appointment aktif memberikan izin yang sama | Permission dicabut (least-privilege) |
| R5 | `APPROVED` future appointment (belum `ACTIVE`) | Tidak mempengaruhi RolesGuard atau PermissionsService |

---

## 8. Restore Rehearsal Plan — Belum Dijalankan

Restore rehearsal nyata (drop + recreate dari snapshot) **tidak dapat dijalankan** karena tidak ada disposable copy. Ini WAJIB dijalankan ketika database tersedia.

**Restore rehearsal procedure:**
1. Snapshot copy-A sebelum migration.
2. Pre-count copy-A.
3. Apply TF2 + Wave B ke copy-A.
4. Post-count copy-A.
5. Drop copy-A sepenuhnya.
6. Restore copy-B dari snapshot yang sama.
7. Verifikasi schema copy-B kembali ke baseline (tanpa kolom TF2, tanpa tabel Wave B).
8. Verifikasi count copy-B kembali ke pre-count.
9. Ulangi siklus pre → apply → post sekali lagi pada copy-B untuk consistency evidence.

**Catatan:** Transaction fixture rollback dari Wave B dry-run script (`--prove-rollback`) TIDAK menggantikan restore rehearsal. Migration yang mengubah enum atau menambah kolom TIDAK bisa di-rollback via ROLLBACK transaksi karena DDL sudah committed.

---

## 9. Defects Ditemukan (Static Analysis)

### Defect D1 — CRITICAL: Resolver regression jika Wave B permissions.service.ts menang setelah rebase

- **Root cause:** Wave B's `resolvePermissions()` tidak memfilter `status = ACTIVE` dan `academicYearId`.
- **Impact:** Zombie permissions yang di-quarantine oleh TF2 akan dibaca kembali sebagai aktif.
- **Minimal fix scope:** Update Wave B's `resolvePermissions()` dan `getUserEffectivePermissions()` untuk menggabungkan appointment resolver dengan TF2's filter (`status = ACTIVE`, `academicYearId` scope). Satu file: `apps/api/src/permissions/permissions.service.ts`.
- **Resolusi yang dilarang:** Mengembalikan ke TF2-only resolver (kehilangan appointment dynamic resolver Wave B).

### Defect D2 — CRITICAL: Prisma composite key mismatch di Wave B write path

- **Root cause:** Wave B's `grantUserPermission()`/`revokeUserPermission()` menggunakan `userId_permissionId` composite key yang tidak ada setelah TF2 mengubah unique constraint.
- **Impact:** TypeScript compile failure (fail-fast — baik, tapi harus diperbaiki sebelum code bisa berjalan).
- **Minimal fix scope:** Update Wave B's write path untuk menggunakan TF2's `writeGlobalOverride()` pattern (`findFirst` + `update/create` + P2002 retry). Satu file: `apps/api/src/permissions/permissions.service.ts`.

### Defect D3 — HIGH: schema.prisma merge conflict

- **Root cause:** Kedua branch memodifikasi `UserPermissionOverride` model region.
- **Impact:** Rebase akan produce conflict marker. Resolusi naive bisa kehilangan TF2 changes.
- **Minimal fix scope:** Manual conflict resolution yang preserve TF2 field changes + Wave B appointment models. Satu file: `packages/database/prisma/schema.prisma`.

---

## 10. Checklist untuk Dry-Run Ketika Disposable Copy Tersedia

Reviewer/executor berikutnya harus menjalankan SEMUA berikut pada disposable copy:

### Setup
- [ ] Disposable copy dari staging snapshot dibuat (host ter-redaksi, nama dengan suffix `-copy`/`-snapshot`).
- [ ] `DATABASE_URL` menunjuk ke copy disposable. Verifikasi `SELECT current_database(), current_user, inet_server_addr()`.
- [ ] BUKAN `smk_staging_db` live, BUKAN production.

### Sequence 1 (copy-A)
- [ ] Pre-count gabungan (Section 5 queries).
- [ ] Apply TF2 migration: `npx prisma migrate deploy`.
- [ ] Post-count setelah TF2.
- [ ] Apply Wave B migration.
- [ ] Post-count setelah Wave B.
- [ ] Concurrency/index proof C1-C8 (Section 6).
- [ ] Resolver behavior proof R1-R5 (Section 7).
- [ ] Restore rehearsal nyata (drop + recreate dari snapshot).

### Sequence 2 (copy-B — consistency evidence)
- [ ] Ulangi pre → apply TF2 → apply Wave B → post → proof pada copy disposable baru.

### Static Analysis Verification (sudah dilakukan di sesi ini)
- [x] Wave A containment verified: `isAppointmentMutationDisabled()` = `true` hardcoded di production.
- [x] Commit `1fad5e3` test-only verified.
- [x] Migration timestamp ordering verified (TF2 < Wave B).
- [x] Schema conflict zones identified (3 files).
- [x] Resolver regression risk identified.
- [x] Prisma composite key mismatch identified.

---

## 11. Rekomendasi Path Forward

### Sebelum Rebase Wave B

1. **Perbaiki Defect D1 dan D2** di Wave B's `permissions.service.ts`:
   - Gabungkan appointment resolver dengan TF2's `status = ACTIVE` + `academicYearId` filter.
   - Ganti `upsert` dengan TF2's `writeGlobalOverride()` pattern.
   - Ini adalah perbaikan code-level yang bisa dilakukan di worktree Wave B sebelum rebase.

2. **Sketsa resolusi schema.prisma conflict** (Defect D3):
   - Pertahankan TF2 `UserPermissionOverride` changes.
   - Tambahkan Wave B `Appointment` models.
   - Update komentar.

### Setelah Rebase

3. **Jalankan TypeScript type-check** untuk memverifikasi tidak ada compile error dari composite key mismatch.
4. **Jalankan focused tests** (4 suites / 77+ tests TF2 + 4 suites / 78 tests Wave B).
5. **Jalankan dry-run gabungan** pada disposable copy (Section 10 checklist).

### Setelah Dry-Run Lulus

6. Reviewer menyetujui secara eksplisit dengan signature di report.
7. Prompt Architect membuat prompt Git gate dengan explicit file list.
8. Baru kemudian PR ke `develop`, CI hijau, dan pertimbangan promosi staging.

---

## 12. Pernyataan Eksplisit

- **Tidak ada commit, push, PR, merge, atau deploy yang dilakukan dalam sesi ini.**
- **Tidak ada perubahan source code yang dilakukan** (kecuali pembuatan report ini).
- **Tidak ada sentuhan ke staging live, production, Keycloak, VPS, GitHub, atau CI.**
- **Tidak ada `git add .`, `git add -A`, `git reset --hard`, atau pembersihan untracked.**
- **Tidak ada secret, DATABASE_URL, password, PII, Keycloak ID, UUID mentah, nama, email, telepon, NIS/NIP/NIY yang dicetak atau dicatat.**
- **Worktree Wave B tidak dimodifikasi** (status dirty tetap utuh: 15 modified + 7 untracked).
- **Branch protection dikonfirmasi utuh**: `develop` masih di `37d41e6`, `staging` masih di `e7c71f0` (pre-PR-#392).

---

## 13. Ringkasan Tegas

| Pertanyaan | Jawaban | Status |
|---|---|---|
| Apakah disposable PostgreSQL copy tersedia? | TIDAK. psql/pg_dump/docker/DB semua unavailable. | BLOCKED |
| Apakah runtime dry-run dapat dijalankan? | TIDAK. Gate STOP condition terpenuhi. | BLOCKED |
| Apakah static analysis menghasilkan temuan? | YA. 3 defect kritis/high ditemukan. | DONE |
| Apakah Wave A containment intact di production? | YA. `return true` hardcoded. | VERIFIED |
| Apakah commit `1fad5e3` test-only? | YA. Hanya `positions.spec.ts`. | VERIFIED |
| Apakah migration timestamp ordering benar? | YA. TF2 (0722) < Wave B (0724). | VERIFIED |
| Apakah ada konflik schema antara TF2 dan Wave B? | YA. 3 file overlap, `permissions.service.ts` paling kritis. | IDENTIFIED |
| Apakah resolver regression risk ada? | YA. Wave B tidak filter `status = ACTIVE` / `academicYearId`. | IDENTIFIED |
| Apakah Prisma composite key mismatch ada? | YA. `userId_permissionId` tidak ada setelah TF2. | IDENTIFIED |
| Apakah ada commit/push/PR yang dilakukan? | TIDAK. | CONFIRMED |
| Langkah berikutnya? | Operator siapkan disposable copy. Executor perbaiki D1/D2 sebelum rebase. | PENDING |
