# SMA-35 — Auth /me + RolesGuard — DONE

**Status:** ✅ Selesai  
**Branch:** `feat/SMA-35-auth-me-rolesguard` (commit `b6181cd`)  
**Tanggal:** 2026-05-31  
**Model:** Claude Sonnet 4.6  

---

## File Baru

| File | Deskripsi |
|---|---|
| `apps/api/src/auth/guards/roles.guard.ts` | RolesGuard — cek @Roles() vs user.roles |
| `apps/api/src/auth/dto/update-me.dto.ts` | Zod schema UpdateMeSchema (phone, avatarUrl) strict |
| `apps/api/src/auth/auth.service.ts` | AuthService.getMe() + updateMe() via Prisma |
| `apps/api/src/auth/auth.controller.ts` | GET + PATCH /auth/me, throttle 15 req/menit |
| `apps/api/src/__tests__/roles.spec.ts` | 6 unit tests RolesGuard |
| `apps/api/src/__tests__/auth-me.spec.ts` | 5 tests (3 wajib) |

## File Diubah

| File | Perubahan |
|---|---|
| `apps/api/src/auth/auth.module.ts` | Tambah AuthController, AuthService, RolesGuard |
| `apps/api/src/app.module.ts` | Tambah RolesGuard sebagai APP_GUARD ke-3 |

---

## Guard Order Final

```
ThrottlerGuard → KeycloakGuard → RolesGuard
```

- `@Public()` → bypass ThrottlerGuard saja tidak, tapi bypass KeycloakGuard + RolesGuard
- Endpoint tanpa `@Roles()` → any authenticated user OK (hanya butuh JWT valid)
- `@Roles('X')` → user.roles harus mengandung X, jika tidak → 403

---

## Bukti Runtime

```
npx tsc --noEmit  →  (0 errors)

npx jest
  PASS src/__tests__/roles.spec.ts
  PASS src/__tests__/auth-me.spec.ts
  PASS src/__tests__/auth-guard.spec.ts
  ... 7 suite lain
  Test Suites: 10 passed, 10 total
  Tests:       74 passed, 74 total
```

### 3 Integration Tests Wajib (SMA-35)

| # | Skenario | Guard | Expected | Hasil |
|---|---|---|---|---|
| 1 | GET /auth/me tanpa token | KeycloakGuard | UnauthorizedException (401) | ✅ |
| 2 | GET /auth/me dengan token valid | AuthController.getMe() | profil {id, email, fullName, role, keycloakId} | ✅ |
| 3 | @Roles('SUPER_ADMIN') diakses GURU | RolesGuard | ForbiddenException (403) | ✅ |

---

## Catatan Desain

- **`role` dari DB, bukan JWT** — `getMe()` query DB by keycloakId. Jika user update role di Keycloak admin tapi DB belum di-sync, `/auth/me` tetap return role dari DB. Single source of truth = DB.
- **`strict()` di UpdateMeSchema** — field `role`, `email`, `keycloakId` dalam body → Zod reject 400 (anti role-escalation).
- **`avatarUrl` nullable** — user bisa clear avatar dengan `null`.
- **Tidak ada DB query di RolesGuard** — hanya baca `user.roles` dari request (sudah diset KeycloakGuard). Guard tetap O(1).
