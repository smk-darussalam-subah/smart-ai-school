# SMA-37 — Grade Module DONE

**Status:** ✅ SELESAI 2026-05-31
**Branch:** `feat/SMA-37-grade-module` (commit `4a80b94`)
**Depends on:** SMA-36 (TeachingAssignment), SMA-35 (Auth/Guard)

---

## Ringkasan Deliverable

### A. PrismaExceptionFilter (global)

- **File baru:** `apps/api/src/common/filters/prisma-exception.filter.ts`
- **Registered di:** `apps/api/src/main.ts` — `useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter())`
  - NestJS evaluasi filter dari belakang → PrismaExceptionFilter dicek lebih dulu (spesifik), HttpExceptionFilter berikutnya (catch-all)
- **Peta error:**

| Prisma Code | HTTP | Keterangan |
|---|---|---|
| P2002 | 409 Conflict | Unique constraint violated |
| P2003 | 409 Conflict | FK restrict — ada data terkait |
| P2025 | 404 Not Found | Record tidak ditemukan saat update/delete |
| lainnya | 500 + logError | Tidak dikenal |

- **Cleanup:** Hapus try/catch P2002 manual dari `TeachingAssignmentService.create()` dan `update()` — kini andalkan filter global
- **Test update:** `teaching-assignment.spec.ts` — 2 test diubah untuk expect `PrismaClientKnownRequestError` propagate (bukan ConflictException dari service)

### B. Grade Module

**Files dibuat:**
- `apps/api/src/grade/dto/create-grade.dto.ts`
- `apps/api/src/grade/dto/update-grade.dto.ts`
- `apps/api/src/grade/dto/list-grades.dto.ts`
- `apps/api/src/grade/grade.service.ts`
- `apps/api/src/grade/grade.controller.ts`
- `apps/api/src/grade/grade.module.ts`

**File diupdate:**
- `apps/api/src/app.module.ts` — tambah `GradeModule`

#### Endpoints

| Method | Path | Roles | Catatan |
|---|---|---|---|
| POST | `/api/v1/grades` | GURU | Input nilai baru |
| GET | `/api/v1/grades` | SA, KS, TU, GURU, SISWA, ORANG_TUA | Ownership difilter di service |
| PATCH | `/api/v1/grades/:id` | SA, GURU | Edit nilai |

#### RBAC Ownership (service layer)

- **GURU (POST):** Verifikasi `assignment.teacherId === teacher.id` (resolve keycloakId→userId→teacherId). FK error → NotFoundException.
- **GURU (GET):** Filter `assignment.teacherId === myTeacherId` via nested Prisma relation filter.
- **SISWA (GET):** Force `studentId = ownStudentId` (query.studentId diabaikan).
- **ORANG_TUA (GET):** Filter `studentId IN [childIds]` via `student.findMany({ where: { parentId: userId } })`.
- **SA/KS/TU (GET):** Tidak ada filter ownership, pakai query params opsional.
- **SA (PATCH):** Akses penuh, tidak ada batasan waktu.
- **GURU (PATCH):** `submittedBy === userId` + `createdAt + 7 hari > now` — ForbiddenException jika salah satu gagal.

#### DOBEL GUARD UTS/UAS

Sebelum INSERT, jika `type === 'uts' || type === 'uas'`:
```
grade.findFirst({ where: { studentId, assignmentId, semester, type } })
→ jika ada → ConflictException 409
```
UH/praktik/sikap: boleh banyak, tidak ada guard.

#### Zod Validation

- `score`: `number().min(0).max(100)`
- `type`: `enum(['uts', 'uh', 'uas', 'praktik', 'sikap'])`
- `semester`: `number().int().min(1).max(2)`
- Update: hanya `score` dan `notes` — `type/studentId/assignmentId/semester` immutable

#### submittedBy

`auth.users.id` (bukan teacherId) — konsisten dengan kebijakan audit field (lihat feedback.md).

---

## Bukti Runtime

### tsc
```
npx tsc --noEmit → 0 errors (clean)
```

### ESLint
```
npx eslint "src/**/*.ts" --max-warnings=0 → 0 errors, 0 warnings (clean)
```

### Jest Coverage
```
Test Suites: 16 passed, 16 total
Tests:       216 passed, 216 total

Statements   : 82%    (565/689)   ← target ≥70% ✅
Branches     : 87.58% (127/145)
Functions    : 85.96% (98/114)
Lines        : 83.07% (486/585)
```

### Skenario terverifikasi di test

| Skenario | File | Status |
|---|---|---|
| P2002 → 409 | `prisma-exception-filter.spec.ts` | ✅ |
| P2003 → 409 (bukan 500) | `prisma-exception-filter.spec.ts` | ✅ |
| P2025 → 404 | `prisma-exception-filter.spec.ts` | ✅ |
| UTS dobel → 409 ConflictException | `grade.spec.ts` | ✅ |
| UAS dobel → 409 ConflictException | `grade.spec.ts` | ✅ |
| UH dobel → OK (boleh banyak) | `grade.spec.ts` | ✅ |
| PATCH >7 hari → ForbiddenException | `grade.spec.ts` | ✅ |
| PATCH bukan miliknya → ForbiddenException | `grade.spec.ts` | ✅ |
| SISWA hanya lihat nilai sendiri | `grade.spec.ts` | ✅ |
| ORANG_TUA hanya lihat nilai anak | `grade.spec.ts` | ✅ |
| GURU hanya lihat nilai kelas sendiri | `grade.spec.ts` | ✅ |
| SA akses penuh tanpa batas | `grade.spec.ts` | ✅ |
| 401 tanpa token | `auth-guard.spec.ts` | ✅ (existing) |
| 403 role salah | `roles.spec.ts` | ✅ (existing) |

---

## Catatan Arsitektur

- `academicYear` di Grade diambil dari `TeachingAssignment.academicYear` — tidak ada di body POST. Konsisten: siswa tidak bisa input academicYear salah.
- `submittedBy` = `auth.users.id`, bukan `teacherId`. Sesuai keputusan audit field (feedback.md).
- PATCH `score` menerima `number` (Zod) → Prisma convert ke `Decimal` tanpa masalah.
- Tidak ada `/grades/:id/approve` di task ini (POST /grades/:id/approve = SA lock — SMA sprint berikutnya per sprint-plan §3.3).
