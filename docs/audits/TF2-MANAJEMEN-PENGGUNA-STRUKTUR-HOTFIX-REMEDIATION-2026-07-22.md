# TF2 Manajemen Pengguna & Struktur Organisasi Hotfix — Remediation Report

Date: 2026-07-22
Role: Codex Executor
Source audit: `MANAJEMEN-PENGGUNA-STRUKTUR-ORGANISASI-COMPREHENSIVE-AUDIT-2026-07-22.md`
Source prompt: `PROMPT-ARCHITECT-TF2-MANAJEMEN-PENGGUNA-STRUKTUR-HOTFIX-2026-07-22.md`
Branch: `fix/tf2-users-struktur-hotfix` (not yet committed — per prompt: stop at review gate)

## Scope

5 findings executor scope:
- P0-NEW-1: TATA_USAHA diblokir Manajemen Pengguna
- P0-KS-2: `httpError()` tidak handle 403
- P1-SEC-1: `/positions/access-check/:userId` tanpa ParseUUIDPipe
- P1-SEC-2: `/positions/assignments/:id` DELETE tanpa ParseUUIDPipe
- P1-NEW-2: Silent-fail pada `loadUserPermissions`

## Decision: P0-NEW-1 Opsi B (UI-only refactor)

**Pilihan:** Opsi B — hapus fetch `/permissions` dari page-level Promise.all, lazy-load di UsersClient saat SA klik "Izin".

**Justifikasi:**

1. **Least-privilege preserved.** Opsi A membuka class-level `@Roles('SUPER_ADMIN', 'TATA_USAHA')` di PermissionsController → semua endpoint termasuk `permissions.manage` (grant/revoke) kebuka untuk TU. Padahal TU seharusnya tidak boleh manage permissions, hanya manage users.

2. **No seed change required.** Seed TATA_USAHA (`packages/database/prisma/seed-permissions.ts:90-99`) tidak punya `permissions.read` atau `permissions.manage`. Opsi A butuh seed change; Opsi B tidak.

3. **Fail-soft principle untuk TU.** Page `/dashboard/users` jangan LoadError hanya karena salah satu fetch non-kritis gagal. `/permissions` tidak kritis untuk TU — mereka tidak butuh panel permission.

4. **Sumber audit kontradiksi dihilangkan.** `users/page.tsx:41` mengizinkan TU, `permissions.controller.ts:30` menolak TU. Dengan menghapus fetch page-level, kontradiksi tidak lagi terpicu.

**Trade-off:** SA sekarang lazy-load permission catalog saat pertama kali klik "Izin" (latensi +1 request pertama). Acceptable trade-off untuk correctness.

## Plan, Critique, Fixed Plan

### Initial Plan

1. P0-NEW-1: Opsi A — tambah TU di `@Roles` PermissionsController + seed change.
2. P0-KS-2: Tambah 403 handler di httpError.
3. P1-SEC-1/2: ParseUUIDPipe di 2 endpoint positions.
4. P1-NEW-2: Error state di loadUserPermissions.

### Self-Critique

1. **Opsi A berisiko fail-open.** Class-level `@Roles` membuka SEMUA endpoint PermissionsController. Endpoint `permissions.manage` (grant/revoke/create/delete) akan kebuka untuk TU. Workaround "pindah @Roles ke method-level" menambah kompleksitas dan rawan miss.
2. **Seed change Opsi A blast radius besar.** Backfill data existing tidak trivial; prisma migration diperlukan jika ada data historis.
3. **TU tidak butuh permissions.** TU fungsionalitas adalah manajemen user (CRUD), bukan manajemen permission. Opsi B lebih sesuai domain.
4. **P0-KS-2 message:** harus generic — "service account atau hubungi admin" — bukan mengasumsikan penyebab tunggal.
5. **P1-NEW-2 race condition:** bila user cepat klik 2 baris, response A bisa datang setelah B dimulai. Tapi ini P2 polish, tidak blocking fix ini.
6. **PermissionItem type:** Opsi B menghapus `initialPermissions` prop. Type `PermissionItem` harus di-import dari page.tsx (sudah di-export) — hindari duplikasi.

### Fixed Plan

- P0-NEW-1: Opsi B (UI-only, no backend change, no seed change).
- P0-KS-2: 403 handler dengan pesan generic "periksa izin service account atau hubungi admin".
- P1-SEC-1/2: ParseUUIDPipe (default v4) di 2 endpoint positions.
- P1-NEW-2: `permissionError` state + error banner merah, dengan reset saat load baru.

## Temuan Closed

### P0-NEW-1 — CLOSED (Opsi B)

Files changed:
- `apps/web/src/app/dashboard/users/page.tsx` — hapus `apiFetch('/permissions')` dari Promise.all; hapus `initialPermissions` prop; export `PermissionItem` type.
- `apps/web/src/app/dashboard/users/actions.ts` — tambah `fetchPermissionCatalog()` server action (SA-only).
- `apps/web/src/app/dashboard/users/_components/UsersClient.tsx` — hapus `initialPermissions` prop; tambah `permissions` + `permissionsLoaded` state; lazy-load via `fetchPermissionCatalog` di `loadUserPermissions` saat `isSuperAdmin && !permissionsLoaded`.

### P0-KS-2 — CLOSED

File: `apps/api/src/keycloak-admin/keycloak-admin.service.ts`
- Tambah `ForbiddenException` ke imports.
- Tambah `if (status === 403) return new ForbiddenException(...)` setelah handler 400 di `httpError()`.
- Pesan: `"Keycloak menolak akses — periksa izin service account (butuh realm-admin atau manage-realm) atau hubungi admin"`.

### P1-SEC-1 — CLOSED

File: `apps/api/src/positions/positions.controller.ts`
- Tambah `ParseUUIDPipe` ke import dari `@nestjs/common`.
- `@Param('userId', ParseUUIDPipe) userId: string` di endpoint `GET /positions/access-check/:userId`.

### P1-SEC-2 — CLOSED

File: same as P1-SEC-1.
- `@Param('id', ParseUUIDPipe) id: string` di endpoint `DELETE /positions/assignments/:id`.

### P1-NEW-2 — CLOSED

File: `apps/web/src/app/dashboard/users/_components/UsersClient.tsx`
- Tambah `permissionError` state (`useState<string | null>(null)`).
- Di `loadUserPermissions`: reset `permissionError` saat mulai load; bila `overrideResult.error || effectiveResult.error`, set `permissionError(msg)` + kosongkan permissions, BUKAN swallow sebagai empty.
- Tambah red banner di CardContent panel izin saat `permissionError && !overrideLoading`.

## Temuan NOT Executor Scope (Director Action)

- **P0-KS-1**: Service account `diis-api` tidak berizin `manage-realm`. Director perlu tambah role via Keycloak Admin Console (5 menit). Lihat `STRUKTUR-ORGANISASI-KEYCLOAK-SYNC-DEEP-REVIEW-2026-07-22.md`.
- **TF2-P1-1**: Zombie Permissions — schema change butuh keputusan Director. Lihat `TF2-P1-1-ZOMBIE-PERMISSIONS-ESCALATION-2026-07-21.md`.

## Temuan Deferred Wave 8

- TF2-P2-2: Combobox swap (cross-module).
- P2-NEW-3: Debounce `handleSearch`.
- P2-NEW-4: Loading state tombol role-change.
- P2-NEW-5: Unicode → Lucide icons.
- P2-NEW-6: Permission grid grouping.

## File Changed (5 files, +94/-27)

1. `apps/web/src/app/dashboard/users/page.tsx` — P0-NEW-1 (Opsi B)
2. `apps/web/src/app/dashboard/users/actions.ts` — P0-NEW-1: `fetchPermissionCatalog` action
3. `apps/web/src/app/dashboard/users/_components/UsersClient.tsx` — P0-NEW-1 + P1-NEW-2
4. `apps/api/src/keycloak-admin/keycloak-admin.service.ts` — P0-KS-2
5. `apps/api/src/positions/positions.controller.ts` — P1-SEC-1 + P1-SEC-2

## Schema / Dependency / Seed Decisions

| Decision | Yes/No | Justifikasi |
|---|---|---|
| Schema change | **No** | Tidak ada schema diubah. |
| Dependency baru | **No** | `ParseUUIDPipe` dari `@nestjs/common` (sudah ada). |
| Seed change | **No** | Opsi B tidak butuh seed change. Opsi A butuh, tapi tidak dipilih. |
| Migration | **No** | Tidak ada schema change. |

## Test Commands + Results

| Command | Hasil |
|---|---|
| `apps/web: npx tsc --noEmit` | ✅ PASS, 0 errors |
| `apps/api: npx tsc --noEmit` | ✅ PASS, 0 errors |
| `apps/web: npx next lint` (changed files) | ✅ "No ESLint warnings or errors" |
| `apps/web: npx next build` | ✅ "Compiled successfully in 22.1s", 39/39 static pages |
| `apps/api: npx jest --testPathPattern="(users\|permissions\|positions\|keycloak).spec"` | ✅ 71/71 tests pass (3 suites) |

## Manual QA Status

**Not yet executed** — prompt architect requires browser QA:

1. **P0-NEW-1 happy path (CRITICAL):**
   - Login sebagai TATA_USAHA.
   - Buka `/dashboard/users`.
   - Expected: page terbuka, list user tampil, TIDAK LoadError.
   - Panel permission tidak muncul untuk TU.

2. **P0-NEW-1 SA regression:**
   - Login sebagai SUPER_ADMIN.
   - Buka `/dashboard/users`.
   - Klik tombol "Izin" di baris user.
   - Expected: panel izin muncul, permission catalog ter-load (lazy).

3. **P1-NEW-2 error state:**
   - Login SA → klik "Izin" → stop API sebentar.
   - Expected: red error banner muncul, BUKAN empty panel.

4. **P1-SEC-1 + P1-SEC-2 (curl):**
   - `curl .../positions/access-check/abc` → 400 Bad Request.
   - `curl -X DELETE .../positions/assignments/123` → 400 Bad Request.

5. **P0-KS-2 (post Director P0-KS-1):**
   - Setelah Director tambah realm-admin, klik "Sync Role Keycloak".
   - Bila masih 403, expected error message: "Keycloak menolak akses — periksa izin service account...".

## Residual Risk

1. **P0-KS-1 masih OPEN (Director action).** Sinkronisasi role Keycloak tetap gagal sampai Director tambah `realm-admin` ke service account. P0-KS-2 hanya memperbaiki pesan error, bukan root cause.
2. **TF2-P1-1 Zombie Permissions masih OPEN.** Berisiko P0 saat tahun ajaran 2027/2028 diaktifkan.
3. **P1-NEW-2 race condition.** Klik cepat 2 baris user bisa menyebabkan state mismatch. P2 polish, tidak blocking.
4. **Lazy-load first-click latency.** SA akan merasakan delay singkat saat pertama kali klik "Izin". Acceptable.
5. **Permission panel tidak tersedia untuk TU.** Ini by design — TU fungsionalitas adalah manage users, bukan manage permissions. Bila di masa depan TU butuh read-only permission view, tambahkan endpoint khusus dengan permission terpisah.

## Recommended Next Steps

1. **Director: jalankan P0-KS-1 Opsi A** (5 menit via Keycloak Admin Console) → tambah `realm-admin` ke service account `diis-api`. Lalu klik "Sync Role Keycloak" di Struktur Organisasi.
2. **Director: putuskan TF2-P1-1** — pilih Opsi A (schema change), B (app cascade), atau C (defer + SOP). Lihat `TF2-P1-1-ZOMBIE-PERMISSIONS-ESCALATION-2026-07-21.md`.
3. **Browser QA staging** setelah hotfix ini di-merge + deploy. Prioritas: TU login ke `/dashboard/users` (P0-NEW-1 happy path).
4. **Wave 8 Polish** — sisanya dari audit komprehensif (P2 series + TF2-P2-2).

## Path ke Report

`docs/audits/TF2-MANAJEMEN-PENGGUNA-STRUKTUR-HOTFIX-REMEDIATION-2026-07-22.md` (file ini).
