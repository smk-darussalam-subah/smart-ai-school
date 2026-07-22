# TF Struktur Organisasi & Users Hotfix Remediation

Date: 2026-07-21
Branch: `fix/tf-struktur-organisasi-users-hotfix`
Base: `develop` (`cf9cbc8`, post-PR #376 Wave 3 Phase 2)
Status: Code complete; ready for reviewer handoff.

## Source Documents Read

- `AGENTS.md` (outer DIIS workspace)
- `docs/AI_CONTEXT.md`
- `smart-ai-school/AGENTS.md`
- `smart-ai-school/docs/architecture/academic-lifecycle.md` §14.1 (fail-soft principle)
- `smart-ai-school/docs/audits/STRUKTUR-ORGANISASI-USERS-QA-FINDINGS-2026-07-20.md` (review dengan code reference)
- `smart-ai-school/docs/audits/PROMPT-ARCHITECT-TF-STRUKTUR-ORGANISASI-USERS-HOTFIX-2026-07-20.md`
- Reference pattern: `apps/api/src/positions/positions.service.ts:228-237, 293-303, 337-344` (proven fail-soft implementation)

## Plan, Critique, Fixed Plan

### Initial Plan
1. **TF-4 `updateActive()`:** Replace KC-first strategy with DB-first + KC best-effort fail-soft. Keep last-SA protection. Invalidate cache after DB commit, before KC sync.
2. **TF-4 `updateRole()`:** Same DB-first pattern. Multi-role detection via `kc.getUserRealmRoles()` becomes fail-soft (try/catch → return empty array).
3. **TF-1 StrukturClient:** Actionable empty state with link to `/dashboard/users`. Add role label to dropdown items.
4. **TF-2 StrukturClient:** Clarify microcopy "selama penugasan aktif" → "aktif segera setelah disimpan..."
5. **TF-3 StrukturClient:** Tooltip "jabatan bisa dipegang bersama" + dynamic button label.

### Critique
1. **Return type change:** New optional field `keycloakSyncPending?: boolean` is additive — old frontend code that ignores it continues to work. ✓
2. **Cache invalidation sequence:** MUST be after DB commit, before KC sync attempt — otherwise race window where cache is invalid but DB unchanged. ✓
3. **Multi-role detection fail-soft:** Must NOT throw when KC is down for `getUserRealmRoles()` — pattern from positions.service.ts:337-344 (return empty array + log warning). ✓
4. **Compensation logic removal:** Old KC-first compensation code (lines 240-251, 308-319) must be **deleted**, not commented out — dead code is technical debt. ✓
5. **Frontend contract:** `UsersClient.tsx` must check `result.data?.keycloakSyncPending` and show toast warning with actionable recovery guidance. ✓
6. **Last-SA protection:** Must remain at the start of both methods (DB-side, runs first, never skipped). ✓
7. **StaffCandidate role display:** `StaffCandidate` already has `role` field (page.tsx:55) — no schema change needed. ✓
8. **`useRouter()` in StrukturClient:** Already imported — `router.push('/dashboard/users')` works directly. ✓

### Fixed Plan Applied
Same as Initial Plan with explicit commitments:
- Type signature: return type becomes `User & { keycloakSyncPending?: boolean }` (additive, backwards-compatible).
- Multi-role detection: try/catch returns empty array on failure, not throw.
- Compensation logic: deleted entirely (not commented).

## Closed Findings

### TF-4 (P1) — Deactivasi/Role-Change Gagal saat Keycloak Down
**Status:** CLOSED.

**Files:**
- `apps/api/src/users/users.service.ts`:
  - `updateActive()`: Refactored to DB-first + KC best-effort. Last-SA protection preserved. Cache invalidation (`userStatus.invalidate`) runs after DB commit. KC sync wrapped in try/catch → `keycloakSyncPending: true` on failure. Old compensation logic (lines 308-319) deleted.
  - `updateRole()`: Same pattern. Multi-role detection (`kc.getUserRealmRoles()`) wrapped in try/catch → on failure, logs warning and skips check (primaryRoleCount stays 0). Cache invalidation (`permissions.invalidateUser` + `userStatus.invalidate`) runs after DB commit. KC sync best-effort. Old compensation logic (lines 240-251) deleted.
- `apps/web/src/app/dashboard/users/_components/UsersClient.tsx`:
  - `handleRoleChange()`: Checks `result.data?.keycloakSyncPending`. If true, shows warning message: "Peran diubah di database. ⚠ Sinkronisasi Keycloak tertunda — coba sync ulang nanti atau hubungi teknisi."
  - `handleToggleActive()`: Same pattern for activate/deactivate.

**API Contract Change:** Response from `PATCH /users/:id/role` and `PATCH /users/:id/active` now includes optional `keycloakSyncPending?: boolean` field. Additive, backwards-compatible.

### TF-1 (P1) — Dropdown Pegawai Kosong (Actionable Empty State)
**Status:** CLOSED.
**File:** `apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx`
- Empty state now shows: "Belum ada pegawai (Guru/TU/KS). Tambahkan di Manajemen Pengguna."
- Helper link button navigates to `/dashboard/users` (uses existing `router.push`).
- Info banner below dropdown explains: "Hanya user dengan peran Guru, Tata Usaha, atau Kepala Sekolah yang muncul di daftar ini."
- Dropdown items now show: `{fullName} · {roleLabel(role)} · {email}` instead of just `{fullName} · {email}`.
- Added `ROLE_LABELS` map + `roleLabel()` helper function.

### TF-2 (P2) — Microcopy "Penugasan Aktif" Ambigu
**Status:** CLOSED.
**File:** `apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx`
- Old: "Akses modul terkait jabatan diberikan otomatis selama penugasan aktif."
- New: "Izin modul terkait jabatan aktif segera setelah disimpan, dan dicabut otomatis saat penugasan dilepas atau tahun ajaran berganti. Berlaku di tahun ajaran {code}."

### TF-3 (P2) — Jabatan Bisa Dipegang Bersama
**Status:** CLOSED.
**File:** `apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx`
- Button label now dynamic: "Tetapkan" (empty position) vs "+ Tambah Penanggung Jawab" (position already has assignees).
- `title` attribute tooltip: "Jabatan bisa dipegang bersama oleh beberapa pegawai."

## Deferred

- **TF-5a (P2):** Confirmation dialogs untuk role change/deactivation. → Wave 8 Polish.
- **TF-5b (P2):** Visual coherence (hardcoded colors, Unicode icons). → Wave 8 Polish.
- **TF-5c (P2):** Permission grid grouping + progressive disclosure. → Wave 8 Polish.
- **TF-5d (P2):** Cross-module navigation Users ↔ Struktur. → Wave 8 Polish.
- **TF-5e (P2):** Empty state Users module. → Wave 8 Polish.

## Verification

Executed locally on `fix/tf-struktur-organisasi-users-hotfix`:

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
npm.cmd --workspace @smk/api test -- users.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-tf
```

Results:
- API type-check: clean.
- Web type-check: clean.
- API lint: clean.
- Web lint: "No ESLint warnings or errors".
- API build: clean.
- API focused tests: **1 suite / 38 tests passed** (including 2 new TF-4 fail-soft tests + updated assertions for DB-first strategy).

## Schema/Dependency Decisions

- **Prisma schema changes:** No.
- **Dependency additions:** No.
- **Migration generated/applied:** No.
- **API contract changes:** Yes (additive) — `keycloakSyncPending?: boolean` optional field added to `updateRole` and `updateActive` responses.

## Positive Controls Preserved

- **Last-SA protection** (C3-a): tetap di awal kedua method, DB-side check, tidak di-skip.
- **Multi-role detection** (C3-b): tetap berjalan bila KC tersedia; fail-soft bila KC down (tidak throw, skip dengan warning).
- **Cache invalidation:** `userStatus.invalidate()` dan `permissions.invalidateUser()` tetap dipanggil setelah DB commit.
- **`KeycloakAdminService`:** tidak diubah (sudah membungkus error sebagai `ServiceUnavailableException`).
- **Modul Positions:** tidak diubah (sudah fail-soft dengan benar).

## Residual Risk

- **TF-1 root cause data staging:** UI sekarang actionable, tetapi bila penyebab dropdown kosong adalah belum ada user GURU/TU/KS di staging DB, admin harus membuat user tersebut. Director-side SQL query untuk verifikasi:
  ```sql
  SELECT id, "fullName", role FROM "auth"."users"
  WHERE role IN ('GURU','TATA_USAHA','KEPALA_SEKOLAH')
  AND "deletedAt" IS NULL;
  ```
- **TF-4 KC sync pending:** bila KC sync gagal, DB sudah benar tetapi KC mungkin masih punya role lama. Token JWT lama akan valid hingga expiry (default 5 menit). Setelah refresh, `KeycloakGuard` akan validasi token baru; bila KC masih down, refresh akan gagal dan user logout otomatis. Tidak ada cara untuk user dengan token lama bypass DB status — `userStatus.isValid()` membaca dari DB.
- **TF-4 re-sync manual:** saat ini tidak ada endpoint "re-sync Keycloak untuk user X". Admin harus tunggu KC up atau manual via Keycloak Admin Console. Re-sync endpoint bisa menjadi Wave 8 enhancement.

## Manual Browser QA Matrix (Post-Merge, Post-Staging)

1. **TF-4 happy path:** Login SA → `/dashboard/users` → nonaktifkan user (bukan SA terakhir) → toast "Pengguna dinonaktifkan" → refresh → user tetap nonaktif.
2. **TF-4 KC down simulation (bisa di-stage):** Stop container Keycloak → nonaktifkan user → toast warning "Sinkronisasi Keycloak tertunda" → DB tetap ter-update → start KC → verify user nonaktif di KC juga.
3. **TF-4 role change:** Ubah role GURU → TATA_USAHA → toast sukses → permission cache di-invalidate → akses modul berubah.
4. **TF-1 empty dropdown:** Buka `/dashboard/struktur-organisasi` → klik "Tetapkan" → lihat actionable empty state dengan link "Kelola Pengguna →".
5. **TF-1 staff with role:** Setelah ada GURU/TU/KS → klik "Tetapkan" → item dropdown menampilkan "Nama · Peran · email".
6. **TF-2 microcopy:** Buka dialog penugasan → kalimat klarifikasi "aktif segera setelah disimpan" terlihat.
7. **TF-3 tooltip:** Hover tombol "Tetapkan" → tooltip "bisa dipegang bersama"; bila sudah berisi, label berubah menjadi "+ Tambah Penanggung Jawab".

## File Change Summary

**Modified (4 files):**
- `apps/api/src/users/users.service.ts` — DB-first refactor untuk `updateActive()` dan `updateRole()`.
- `apps/api/src/__tests__/users.spec.ts` — updated tests untuk DB-first strategy + 2 new TF-4 fail-soft tests.
- `apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx` — TF-1 + TF-2 + TF-3 UI fixes.
- `apps/web/src/app/dashboard/users/_components/UsersClient.tsx` — TF-4 frontend handling `keycloakSyncPending`.

**No Prisma schema, dependency, migration, seed, Docker, GitHub Actions, staging, or production changes.**
