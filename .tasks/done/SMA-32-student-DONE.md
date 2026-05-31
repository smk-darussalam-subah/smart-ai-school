# SMA-32 — Student Module CRUD — DONE

**Status:** ✅ Selesai  
**Branch:** `feat/SMA-32-student-module` (commit `c996395`)  
**Tanggal:** 2026-05-31  
**Model:** Claude Sonnet 4.6  

---

## File Baru

| File | Deskripsi |
|---|---|
| `apps/api/src/student/student.module.ts` | NestJS module |
| `apps/api/src/student/student.controller.ts` | 7 endpoints dengan @Roles() |
| `apps/api/src/student/student.service.ts` | CRUD + ownership checks |
| `apps/api/src/student/dto/create-student.dto.ts` | Zod schema CreateStudentSchema |
| `apps/api/src/student/dto/update-student.dto.ts` | Zod schema UpdateStudentSchema (partial) |
| `apps/api/src/student/dto/list-students.dto.ts` | Zod schema ListStudentsQuerySchema |
| `apps/api/src/__tests__/student.spec.ts` | 26 tests, 100% coverage student module |
| `apps/api/src/__tests__/prisma.spec.ts` | 2 tests PrismaService lifecycle |

## File Diubah

| File | Perubahan |
|---|---|
| `apps/api/src/app.module.ts` | Tambah StudentModule |
| `apps/api/src/__tests__/auth-guard.spec.ts` | +1 test success path coverage |
| `apps/api/src/__tests__/auth-me.spec.ts` | +AuthService unit tests + controller.updateMe |
| `apps/api/src/__tests__/roles.spec.ts` | +1 test user-undefined edge case |

---

## Endpoints

| Method | Path | @Roles | Ownership Check |
|---|---|---|---|
| GET | `/api/v1/students` | SA, KS, TU, Guru | — |
| GET | `/api/v1/students/:id` | SA, KS, TU, Guru, Siswa, OrangTua | service: Siswa=self, OrangTua=anak |
| POST | `/api/v1/students` | SA, TU | — |
| PATCH | `/api/v1/students/:id` | SA, TU | — |
| DELETE | `/api/v1/students/:id` | SA | — |
| GET | `/api/v1/students/:id/grades` | SA, KS, TU, Guru, Siswa, OrangTua | service: same as :id |
| GET | `/api/v1/students/:id/attendance` | SA, KS, TU, Guru, Siswa, OrangTua | service: same as :id |

**DELETE = Soft delete**: set `deletedAt = now()`, record TIDAK dihapus dari DB.  
**TODO SMA-36**: GURU ownership untuk grades/attendance (filter by assigned class via TeachingAssignment).

---

## Ownership Check — Service Layer

```
needsOwnershipCheck(user) → true jika user.roles contains SISWA atau ORANG_TUA

findById(id, user):
  1. fetch student from DB
  2. if needsOwnershipCheck: resolveAuthUserId(keycloakId) → DB id
  3. SISWA: student.userId !== authUserId → ForbiddenException
  4. ORANG_TUA: student.parentId !== authUserId → ForbiddenException
```

---

## ⚠️ Gate Consent (R-05)

**JANGAN** input data siswa NYATA sebelum SMA-55 (consent UU PDP Pasal 20) aktif.  
Gunakan data dummy/seed (`npm run db:seed`) untuk development dan testing.  
Gate ini berlaku hingga Kang Sholah + TU menyelesaikan pengumpulan consent orang tua.

---

## Bukti Runtime

```
npx tsc --noEmit          →  (0 errors)
npx eslint src --ext .ts  →  (0 errors)

npx jest --coverage
  Test Suites: 12 passed, 12 total
  Tests:       117 passed, 117 total

  Coverage summary:
  Statements : 71.35% (269/377) ≥70% ✓
  Branches   : 84.21% (48/57)   ≥70% ✓
  Functions  : 73.77% (45/61)   ≥70% ✓
  Lines      : 71.96% (231/321) ≥70% ✓
```

### Verifikasi Skenario Kunci (via tests)

| Skenario | Guard/Layer | Expected | ✓ |
|---|---|---|---|
| GET /students tanpa token | KeycloakGuard | 401 | ✅ |
| GET /students role INDUSTRI | RolesGuard | 403 | ✅ |
| GET /students/:id SISWA self | service ownership | 200 | ✅ |
| GET /students/:id SISWA other | service ownership | 403 | ✅ |
| GET /students/:id ORANG_TUA anak | service ownership | 200 | ✅ |
| GET /students/:id ORANG_TUA non-anak | service ownership | 403 | ✅ |
| DELETE /students/:id SA | soft delete | deletedAt terisi, record ada | ✅ |

---

## Catatan untuk Sprint Berikutnya

- **SMA-36** — Tambah GURU ownership filter untuk `/grades` dan `/attendance` via TeachingAssignment
- **SMA-55** — Consent R-05 harus selesai sebelum input data siswa nyata ke production
