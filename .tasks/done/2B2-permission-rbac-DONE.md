# 2B-2 — Permission-Based RBAC — DONE

**Branch:** `feat/2B-2-permission-rbac`
**PR:** #90 → `develop`
**Tanggal:** 2026-06-09

---

## Ringkasan

Migrasi dari role-based authorization ke permission-based authorization. **7 role tetap sebagai dasar** (Keycloak realm roles). Permission = granular aksi di DB, Super Admin bisa ubah izin role/user **tanpa deploy**.

---

## A. Schema — 3 model baru di `auth` (ADDITIVE ONLY)

### Permission
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | PK |
| `code` | VARCHAR(100) UNIQUE | `student.create`, `spp.approve` |
| `description` | VARCHAR(255) | Deskripsi human-readable |
| `module` | VARCHAR(50) | `student`, `finance`, `academic`, dll. |

### RolePermission
| Kolom | Tipe | Keterangan |
|---|---|---|
| `role` | UserRole enum | PK composite (role, permissionId) |
| `permissionId` | UUID FK | → permissions.id |

### UserPermissionOverride
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | PK |
| `userId` | UUID | FK → auth.users |
| `permissionId` | UUID FK | → permissions.id |
| `grant` | BOOLEAN | true = beri, false = cabut |
| UNIQUE(userId, permissionId) | | Satu override per permission per user |

Migration: `20260609000002_2B2_permission_rbac` — additive CREATE-only.

---

## B. Seed — 40 Permission + Default Mapping

File: `packages/database/prisma/seed-permissions.ts`

40 permission codes mencakup semua modul: student (6), academic (8), grade (2), attendance (2), ppdb (4), finance (5), ai (5), notification (2), audit (1), permissions (2).

Default mapping ke 7 role sesuai matriks CLAUDE.md §6 + audit SMA-51:
- SUPER_ADMIN → semua 40
- KEPALA_SEKOLAH → 10 (read-only + approve)
- TATA_USAHA → 10 (student.*, ppdb.*, finance)
- GURU → 7 (academic + student read + ppdb stats)
- SISWA → 5 (own data + AI chat)
- ORANG_TUA → 4 (child data)
- INDUSTRI → 1 (student read)

---

## C. PermissionGuard (APP_GUARD, urutan 3)

File: `apps/api/src/permissions/permissions.guard.ts`

```
ThrottlerGuard → KeycloakGuard → PermissionGuard → RolesGuard
      1                2                3               4
```

**Flow:**
1. Cek `@Public()` → bypass
2. Cek `@RequirePermission('code')` metadata
3. Jika tidak ada → pass-through (RolesGuard handle)
4. Jika ada → `PermissionsService.hasPermission()` → allow/403

**Decorator:** `@RequirePermission('student.create')` di controller/method level.

---

## D. PermissionsService

File: `apps/api/src/permissions/permissions.service.ts`

- **Cache in-memory** (Map<keycloakId, {permissions, expiresAt}>) → TTL 5 menit
- **resolvePermissions():** query `RolePermission` (via user.roles) + `UserPermissionOverride` (via keycloakId)
- **SUPER_ADMIN shortcut:** return true tanpa query DB
- **invalidateUser():** hapus cache spesifik user
- **invalidateRole():** cleanup expired entries (full invalidation butuh Redis → backlog)

---

## E. PermissionsController (SUPER_ADMIN only)

File: `apps/api/src/permissions/permissions.controller.ts`

| Method | Endpoint | Permission | Fungsi |
|---|---|---|---|
| GET | `/api/v1/permissions` | `permissions.read` | List semua permission |
| POST | `/api/v1/permissions` | `permissions.manage` | Buat permission baru |
| DELETE | `/api/v1/permissions/:id` | `permissions.manage` | Hapus permission |
| GET | `/api/v1/permissions/roles/:role` | `permissions.read` | Lihat permission per role |
| PUT | `/api/v1/permissions/roles/:role` | `permissions.manage` | Set permission role (delete+insert) |
| GET | `/api/v1/permissions/users/:userId` | `permissions.read` | Lihat override per-user |
| POST | `/api/v1/permissions/users/:userId/grant` | `permissions.manage` | Grant override user |
| DELETE | `/api/v1/permissions/users/:userId/revoke` | `permissions.manage` | Revoke override user |

---

## F. Delta app.module.ts

```diff
- // Guard urutan: ThrottlerGuard → KeycloakGuard → RolesGuard
+ // Guard urutan: ThrottlerGuard → KeycloakGuard → PermissionGuard → RolesGuard

+ import { PermissionModule } from './permissions/permissions.module';
+ import { PermissionGuard } from './permissions/permissions.guard';

  imports: [
    ...
+   PermissionModule,
  ],
  providers: [
    ...
+   { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
```

---

## Bukti Runtime

| Check | Hasil |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint` | 0 errors |
| `nest build` | OK |
| `prisma validate` | OK |
| `jest` (28 suites, 497 tests) | **ALL PASS** |
| Unit tests permissions (20/20) | **ALL PASS** |
| GitHub CI — Lint & Type Check | ✅ pass (1m31s) |
| GitHub CI — Build Check | ✅ pass (2m14s) |
| GitHub CI — Unit Tests | ✅ pass (2m14s) |

---

## Backward Compatibility

- **@Roles() decorator tetap berfungsi** — tidak ada perubahan di endpoint existing
- **RolesGuard tetap menjadi APP_GUARD** (sekarang urutan 4, setelah PermissionGuard)
- PermissionGuard **pass-through** jika tidak ada `@RequirePermission()` metadata
- **Semua 497 test existing tetap PASS**

---

## Backlog / Enhancement

1. **Redis cache** — saat ini in-memory (Map), swappable ke Redis saat BullMQ diintroduksi
2. **Role-based invalidation** — `invalidateRole()` saat ini hanya cleanup expired, belum selective flush
3. **Migrasi bertahap endpoint** — ganti `@Roles()` → `@RequirePermission()` di endpoint yang sudah stabil
4. **UI Manajemen User** — halaman CRUD permission di frontend (Tahap 2C)

---

## Catatan

- **Tidak ada dependency baru** — semua pakai Prisma + NestJS built-in
- **Seed dijalankan via:** `npx ts-node packages/database/prisma/seed-permissions.ts`
- **Setelah merge:** jalankan `prisma migrate deploy` + `prisma generate` di staging → prod
