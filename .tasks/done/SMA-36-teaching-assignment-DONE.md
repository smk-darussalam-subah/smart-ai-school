# SMA-36 — TeachingAssignment Module — DONE

**Status:** ✅ Selesai  
**Branch:** `feat/SMA-36-teaching-assignment` (commit `d2258af`)  
**Tanggal:** 2026-05-31  
**Model:** Claude Sonnet 4.6  

---

## Endpoints

| Method | Path | Roles | Catatan |
|---|---|---|---|
| GET | `/api/v1/teaching-assignments` | SA, KS, TU, Guru | Guru: auto-filter ke ID sendiri |
| GET | `/api/v1/teaching-assignments/:id` | SA, KS, TU, Guru | Guru: 403 jika bukan miliknya |
| POST | `/api/v1/teaching-assignments` | SA, TU | 400 jika FK invalid, 409 jika duplikat |
| PATCH | `/api/v1/teaching-assignments/:id` | SA, TU | Update subject/hours/year only |
| DELETE | `/api/v1/teaching-assignments/:id` | SA | Hard delete (record konfigurasi) |

---

## Ownership "Guru(own)" — Service Layer

```
isGuruOnly(user) → true jika role GURU tanpa SA/KS/TU

findAll(query, user):
  if isGuruOnly:
    1. user.findUnique({ keycloakId }) → auth.users.id
    2. teacher.findUnique({ userId }) → teacher.id
    3. force teacherId filter = teacher.id (abaikan teacherId dari query)

findById(id, user):
  1. fetch assignment
  2. if isGuruOnly: resolve teacher.id → cek assignment.teacherId === teacher.id
  3. tidak cocok → ForbiddenException
```

---

## Hardening: 409 + 400

**409 Conflict** — unique constraint `[teacherId, classId, subject, academicYear]`:
```typescript
catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
    throw new ConflictException('Kombinasi guru–kelas–mapel–tahun ajaran ini sudah ada');
}
```

**400 BadRequest** — FK validation sebelum create:
```typescript
const [teacher, kelas] = await Promise.all([
  prisma.teacher.findUnique({ where: { id: teacherId } }),
  prisma.class.findUnique({ where: { id: classId } }),
]);
if (!teacher) throw new BadRequestException(`teacherId '${teacherId}' tidak ditemukan`);
if (!kelas) throw new BadRequestException(`classId '${classId}' tidak ditemukan`);
```

---

## Bukti Runtime

```
npx tsc --noEmit          →  0 errors
npx eslint src --ext .ts  →  0 errors

npx jest --coverage
  Test Suites: 14 passed, 14 total
  Tests:       182 passed, 182 total

  Coverage:
  Statements : 79.06% (442/559) ≥70% ✓
  Functions  : 84.04% (79/94)   ≥70% ✓
  Lines      : 79.74% (382/479) ≥70% ✓
```

### Skenario Kunci (verified via tests)

| Skenario | Expected | ✓ |
|---|---|---|
| tanpa token | 401 (KeycloakGuard) | ✅ |
| role SISWA | 403 (RolesGuard) | ✅ |
| POST duplikat (P2002) | 409 ConflictException | ✅ |
| POST teacherId tidak ada | 400 BadRequestException | ✅ |
| POST classId tidak ada | 400 BadRequestException | ✅ |
| GURU findAll → auto-filter ke ID sendiri | only own assignments | ✅ |
| GURU query teacherId orang lain → dioverride | own teacherId | ✅ |
| GURU findById assignment orang lain | 403 ForbiddenException | ✅ |
| GURU tanpa profil teacher | 403 ForbiddenException | ✅ |
| DELETE → hard delete | { id, deleted: true } | ✅ |

---

## Catatan Desain

- **Hard delete** (bukan soft delete): TeachingAssignment adalah record konfigurasi, bukan data historis. Jika perlu audit trail, query Grade yang masih referencing assignment yang sudah dihapus akan terputus (Grade.assignmentId masih ada tapi assignment sudah hilang). Pertimbangkan di SMA-37 apakah perlu restrict DELETE jika ada Grade.
- **PATCH tidak allow teacherId/classId**: mengubah teacher/class = semantis baru → delete + recreate. Ini mencegah konflik implicit pada unique constraint.
- **TODO SMA-37/38**: update ownership filter di StudentService untuk Grade & Attendance (sekarang masih "any GURU dapat akses semua" — lihat TODO comment di student.service.ts).
