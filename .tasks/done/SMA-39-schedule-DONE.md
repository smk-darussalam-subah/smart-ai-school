# SMA-39 — Schedule View — DONE REPORT

**Tanggal:** 2026-06-01
**Branch:** `feat/SMA-39-schedule`
**Model:** Claude Sonnet 4.6

---

## Ringkasan

Model `Schedule` (TEMPLATE jadwal mingguan rekuren) ditambahkan ke schema Prisma secara
**additive/non-destruktif**. Endpoint `GET /schedules` + `POST /schedules` diimplementasikan
dengan RBAC ownership identik pola Attendance. Migration SQL ditulis manual karena DB
production ada di VPS (tidak bisa dijangkau lokal); akan di-apply via `prisma migrate deploy`
saat deploy berikutnya.

---

## A. Schema & Migration

**Model `Schedule`** ditambah ke `@@schema("academic")`:

| Field | Type | Keterangan |
|---|---|---|
| `id` | UUID PK | gen_random_uuid() |
| `classId` | UUID FK Class | |
| `teachingAssignmentId` | UUID FK TeachingAssignment | sekaligus bawa teacherId + subject |
| `dayOfWeek` | Int (1–6) | raw value — libur diatur konsumen |
| `jpStart` | Int | jam pelajaran ke-N mulai (BUKAN jam dinding) |
| `jpEnd` | Int | jam pelajaran ke-N selesai (inklusif) |
| `room` | String? VarChar(50) | nullable — sekolah kecil mungkin belum pakai |
| `academicYear` | VarChar(9) | format 2025/2026 |
| `semester` | Int (1–2) | |
| `createdAt`, `updatedAt` | DateTime | |

**Unique constraint:** `(classId, dayOfWeek, jpStart, academicYear, semester)` — satu kelas tidak bisa dobel di slot JP yang sama.

**Back-relations additive:** `Class.schedules Schedule[]` dan `TeachingAssignment.schedules Schedule[]` ditambah tanpa mengubah field existing.

**Migration file:** `packages/database/prisma/migrations/20260601000001_sprint2_schedule/migration.sql`

**prisma generate:** ✅ Prisma Client ter-generate ulang (v5.22.0, include `schedule` CRUD).

**prisma validate:** ✅ `The schema at ... is valid 🚀`

> ⚠️ `prisma migrate dev` tidak dapat dijalankan lokal (Docker tidak aktif di dev machine). Migration SQL ditulis manual dengan pola identik migration sebelumnya. Akan di-apply di production via `prisma migrate deploy` saat PR di-merge ke main + deploy pipeline jalan.

---

## B. Endpoints

### GET /api/v1/schedules

Ownership per role (identik pola Attendance):

| Role | Ownership |
|---|---|
| SA / KS / TU | Semua jadwal; filter opsional: `classId`, `teacherId`, `dayOfWeek`, `academicYear`, `semester` |
| GURU | Hanya jadwal `teachingAssignment.teacherId = me` (resolve: keycloakId → user → teacher → assignments) |
| SISWA | Hanya jadwal `classId = student.classId` (satu kelas) |
| ORANG_TUA | Jadwal `classId IN [kelas semua anak]` (via `student.parentId`) |

### POST /api/v1/schedules — @Roles('SUPER_ADMIN', 'TATA_USAHA')

Tiga lapis konflik check:
1. **Kelas:** `@@unique([classId, dayOfWeek, jpStart, academicYear, semester])` → P2002 → `PrismaExceptionFilter` → 409
2. **Guru:** cek overlap JP app-level → `ConflictException` 409
3. **Ruang:** cek overlap JP app-level (skip jika `room` null) → `ConflictException` 409

Overlap JP: `newJpStart < existingJpEnd AND existingJpStart < newJpEnd`

---

## C. Seed Data

4 jadwal dummy X TKJ 1 / XI TKJ 1, TA 2025/2026 Sem 1 ditambah ke `packages/database/prisma/seed.ts`.
Mengacu TeachingAssignment dummy yang juga ditambah ke seed (3 assignment TKJ).
Data murni dummy (R-05: bukan data siswa nyata).

---

## D. Forward-Compatibility KBM Tahap 2

Didokumentasikan via komentar di schema.prisma (lihat blok Schedule):

- `dayOfWeek` raw (1–6) → konsumen atur libur/kalender akademik
- `jpStart`/`jpEnd` dalam JP unit (bukan jam dinding) → pemetaan JP→jam ada di config sekolah → SaaS-ready
- `room` nullable → sekolah kecil tanpa sistem ruang tetap bisa pakai
- Schedule = TEMPLATE; Tahap 2 akan tambah `TimetableEntry` (hari+JP+ruang konkret) + generate `ClassSession` per pertemuan dari schedule ini
- Attendance siswa sudah siap diberi `sessionId?` nullable (additive migration Tahap 2)
- Nama tabel yang dicadangkan: `sessions`, `rooms`, `timetable_entries`, `substitutions`, `session_event_logs` — tidak dipakai di SMA-39

---

## Bukti Runtime

### prisma validate
```
✅ The schema at packages/database/prisma/schema.prisma is valid 🚀
```

### npx tsc --noEmit (dari smart-ai-school/apps/api)
```
✅ 0 errors (tidak ada output = sukses)
```

### npx eslint "src/**/*.ts" --max-warnings=0
```
✅ 0 warnings, 0 errors
```

### npx jest --coverage (dari apps/api)
```
Test Suites: 18 passed, 18 total
Tests:       271 passed, 271 total (sebelumnya 243 — +28 test SMA-39)

Schedule module coverage:
  schedule.controller.ts   : 100% Stmts | 100% Branch | 100% Funcs | 100% Lines
  schedule.module.ts       : 100% Stmts | 100% Branch | 100% Funcs | 100% Lines
  schedule.service.ts      : 95.45% Stmts | 89.18% Branch | 100% Funcs | 100% Lines
  list-schedule.dto.ts     : 100%
  create-schedule.dto.ts   : 66.66% (Zod schema object — logika di safeParse runtime)
  
Overall module coverage: ~95% — jauh di atas threshold 70%
```

### curl / API runtime
API tidak dapat dijalankan lokal karena Keycloak environment tidak tersedia (identik dengan Portal Nilai — constraint yang sama). Bukti diberikan via:
- ✅ 28 unit test yang cover semua skenario: 401 (guard global), 403 (GURU POST), 409 kelas, 409 guru, 409 ruang, ownership 4 role
- ✅ `tsc --noEmit` 0 error → kode valid TypeScript strict
- ✅ Sama seperti pendekatan SMA-37/38/Portal Nilai sebelumnya

---

## File yang Diubah / Dibuat

```
packages/database/prisma/schema.prisma          -- tambah model Schedule + back-relations (additive)
packages/database/prisma/migrations/
  20260601000001_sprint2_schedule/migration.sql  -- SQL additive: CREATE TABLE schedules + FK + index
packages/database/prisma/seed.ts                 -- tambah 3 TeachingAssignment + 4 Schedule dummy

apps/api/src/schedule/
  schedule.controller.ts                          -- GET + POST /schedules
  schedule.service.ts                             -- ownership + konflik logic
  schedule.module.ts                              -- NestJS module
  dto/create-schedule.dto.ts                      -- Zod schema CreateSchedule
  dto/list-schedule.dto.ts                        -- Zod schema ListScheduleQuery

apps/api/src/__tests__/schedule.spec.ts           -- 28 unit tests (service + controller + module)
apps/api/src/app.module.ts                        -- import ScheduleModule
```

---

*Done report dibuat oleh Claude Code (SMA-39, 2026-06-01)*
*Tunggu review gerbang skema/security dari Cowork sebelum merge ke main.*
