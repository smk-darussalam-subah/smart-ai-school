# SMA-38 — Attendance Module DONE

**Status:** ✅ SELESAI 2026-05-31
**Branch:** `feat/SMA-38-attendance` (commit `9615a11`)
**Depends on:** SMA-37 (PrismaExceptionFilter global), SMA-36 (TeachingAssignment)

---

## Ringkasan Deliverable

### Files dibuat

| File | Keterangan |
|---|---|
| `apps/api/src/attendance/dto/create-attendance.dto.ts` | Zod schema bulk POST |
| `apps/api/src/attendance/dto/list-attendance.dto.ts` | Zod schema GET query |
| `apps/api/src/attendance/attendance.service.ts` | Ownership + bulk + filter |
| `apps/api/src/attendance/attendance.controller.ts` | Controller @Roles |
| `apps/api/src/attendance/attendance.module.ts` | NestJS module |
| `apps/api/src/__tests__/attendance.spec.ts` | 27 unit tests |

### Files diupdate

- `apps/api/src/app.module.ts` — tambah `AttendanceModule`

---

## Endpoints

| Method | Path | Roles | Catatan |
|---|---|---|---|
| POST | `/api/v1/attendance` | GURU | Bulk insert untuk satu classId+date |
| GET | `/api/v1/attendance` | SA, KS, TU, GURU, SISWA, ORANG_TUA | Ownership difilter di service |

---

## Arsitektur Kunci

### POST — Bulk Atomik

Body: `{ classId, date: "YYYY-MM-DD", records: [{studentId, status, notes?}] }`

```
1. Resolve userId (untuk recordedBy) dan teacherId
2. Cek TeachingAssignment.findFirst({ teacherId, classId })
   → tidak ada → ForbiddenException 403 (Guru kelas lain)
3. Cek Class.findUnique({ id: classId })
   → tidak ada → NotFoundException 404
4. Parse date string → UTC Date via parseDateStr()
5. prisma.$transaction([...records.map(r => attendance.create(...))])
   → P2002 unique[studentId,classId,date] → rollback seluruh tx
   → error propagate ke PrismaExceptionFilter → 409
   → error lain → propagate (500)
```

**Mengapa tidak try/catch P2002 manual:** PrismaExceptionFilter global sudah menangani. Konsisten dengan keputusan arsitektur SMA-37.

**recordedBy = `auth.users.id`** — bukan teacherId. Audit field policy (feedback.md).

### GET — Ownership Per Role

| Role | Filter |
|---|---|
| SA/KS/TU | Tidak ada filter ownership; query params opsional |
| GURU | `classId IN (TeachingAssignment.classId where teacherId=me)`. classId asing → 403. Tidak ada kelas → return `[]` tanpa DB query. |
| SISWA | `studentId = self` (query.studentId diabaikan) |
| ORANG_TUA | `studentId IN [childIds]` via `student.findMany({ parentId: userId })` |

### Date Parsing

UTC-safe: `parseDateStr('2025-01-15')` → `new Date(Date.UTC(2025, 0, 15))` — menghindari ambiguitas timezone saat parsing string date.

### Schema DB

```prisma
model Attendance {
  @@unique([studentId, classId, date])  ← DB enforced, P2002 → 409 via filter
}
```

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
Test Suites: 17 passed, 17 total
Tests:       243 passed, 243 total

Statements   : 84.13%  (679/807)   ← target ≥70% ✅
Branches     : 87.09%  (162/186)
Functions    : 88.05%  (118/134)
Lines        : 85.35%  (583/683)
```

### Skenario terverifikasi di test

| Skenario | Test | Status |
|---|---|---|
| POST bulk insert atomik | `attendance.spec.ts` | ✅ |
| POST recordedBy = userId (bukan teacherId) | `attendance.spec.ts` | ✅ |
| POST GURU kelas lain → 403 | `attendance.spec.ts` | ✅ |
| POST GURU tanpa profil teacher → 403 | `attendance.spec.ts` | ✅ |
| POST classId tidak ada → 404 | `attendance.spec.ts` | ✅ |
| POST P2002 duplikat → propagate ke filter → 409 | `attendance.spec.ts` | ✅ |
| POST transaksi gagal sebagian → error propagate | `attendance.spec.ts` | ✅ |
| POST date di-parse UTC | `attendance.spec.ts` | ✅ |
| GET SA semua tanpa ownership filter | `attendance.spec.ts` | ✅ |
| GET GURU hanya kelas sendiri | `attendance.spec.ts` | ✅ |
| GET GURU classId asing → 403 | `attendance.spec.ts` | ✅ |
| GET GURU tanpa kelas → return kosong | `attendance.spec.ts` | ✅ |
| GET SISWA hanya diri sendiri | `attendance.spec.ts` | ✅ |
| GET ORANG_TUA hanya anak | `attendance.spec.ts` | ✅ |
| GET ORANG_TUA tanpa anak → 403 | `attendance.spec.ts` | ✅ |
| GET dateFrom/dateTo filter | `attendance.spec.ts` | ✅ |
| GET pagination | `attendance.spec.ts` | ✅ |
| 401 tanpa token | `auth-guard.spec.ts` | ✅ (existing) |
| 403 role salah | `roles.spec.ts` | ✅ (existing) |
