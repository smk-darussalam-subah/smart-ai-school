# API Reference — DIIS Smart AI School

**Base URL:** `https://api.smkdarussalamsubah.sch.id`
**Global prefix:** `/api/v1` (kecuali `GET /health` dan `GET /metrics`)
**Auth:** Bearer JWT dari Keycloak (semua endpoint kecuali yang ditandai `PUBLIC`)
**Global rate limit:** 100 req/menit per IP (throttle dikurangi untuk endpoint sensitif)

---

## Konvensi Tabel

| Kolom | Keterangan |
|---|---|
| **Roles** | Role yang diizinkan. `ALL_AUTH` = semua role yang sudah login (termasuk SISWA, OT, INDUSTRI). |
| **Auth** | `JWT` = butuh Bearer token \| `PUBLIC` = tanpa token |
| **DTO / Query** | Field wajib **ditebalkan**; opsional tidak ditebalkan. Semua menggunakan Zod `.strict()` — field tidak dikenal → 400. |
| **Catatan** | Behavior RBAC, rate limit khusus, error codes penting (409/404/403/422). |

---

## 1. Auth

> Controller: `apps/api/src/auth/auth.controller.ts`
> **Rate limit khusus:** 15 req/menit per IP (override global — endpoint auth sensitif)

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| GET | `/api/v1/auth/me` | ALL\_AUTH | JWT | — | `{ id, keycloakId, email, name, role, phone?, avatarUrl?, createdAt }` | Data dari DB, bukan JWT — role selalu sinkron |
| PATCH | `/api/v1/auth/me` | ALL\_AUTH | JWT | `phone?: string(max 20)` · `avatarUrl?: url\|null(max 500)` | User updated | Hanya phone/avatarUrl. Field lain (role, email) → 400 strict rejection |

**Total: 2 endpoint**

---

## 2. Students

> Controller: `apps/api/src/student/student.controller.ts`
> ⚠️ R-05: Gunakan data dummy sampai consent aktif (SMA-55)

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| GET | `/api/v1/students` | SA, KS, TU, GURU | JWT | Query: `classId?:uuid` · `status?:enum` · `search?:str(max100)` · `page?:int(def 1)` · `limit?:int(max100, def 20)` | `{ data: Student[], total, page, limit }` | GURU: baca semua kelas (filter classId opsional). `status` enum: `active\|inactive\|graduated\|dropped` |
| GET | `/api/v1/students/:id` | SA, KS, TU, GURU, SISWA, OT | JWT | — | `Student` object | **Ownership:** SISWA hanya diri sendiri; OT hanya anak (parentId match). Lain → 403 |
| POST | `/api/v1/students` | SA, TU | JWT | **`userId:uuid`** · **`nis:str(5-20)`** · **`joinedAt:date`** · `classId?:uuid` · `parentId?:uuid` · `status?:enum(def active)` | `Student` created (201) | userId = keycloakId dari tabel users |
| PATCH | `/api/v1/students/:id` | SA, TU | JWT | `nis?:str(5-20)` · `classId?:uuid\|null` · `parentId?:uuid\|null` · `status?:enum` · `joinedAt?:date` | `Student` updated | Partial update. classId/parentId bisa di-null-kan |
| DELETE | `/api/v1/students/:id` | SA | JWT | — | `{ message }` | **SOFT DELETE** — set `deletedAt`, record tetap di DB. Bukan hard delete |
| GET | `/api/v1/students/:id/grades` | SA, KS, TU, GURU, SISWA, OT | JWT | — | `Grade[]` | **Ownership:** SISWA=self, OT=anak. GURU: read semua (filter kelas sendiri — TODO SMA-36) |
| GET | `/api/v1/students/:id/attendance` | SA, KS, TU, GURU, SISWA, OT | JWT | — | `Attendance[]` | **Ownership:** sama dengan `/grades` |

**Total: 7 endpoint**

---

## 3. PPDB (Penerimaan Peserta Didik Baru)

> Controller: `apps/api/src/ppdb/ppdb.controller.ts`
> ⚠️ GURU hanya akses `/stats` — BUKAN `/leads` (data individual mengandung PII: nama + nomor HP)

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| POST | `/api/v1/ppdb/leads` | — | **PUBLIC** | **`fullName:str(2-255)`** · **`phone:str`** · `schoolOrigin?:str(max255)` · `interestMajor?:enum(AKL\|TKJ\|TKRO\|TBSM)` · `source?:enum(def other)` · `notes?:str(max1000)` · `_hp?:str(max0)` · `captchaToken?:str` | `{ id, status }` | **Throttle KETAT: 10/5 menit per IP**. Honeypot `_hp` — jika terisi → 400. Phone dinormalisasi otomatis (0812→62812, +62→62). Response hanya `{id,status}` — TIDAK ada PII |
| GET | `/api/v1/ppdb/leads` | SA, KS, TU | JWT | Query: `status?:enum` · `source?:enum` · `dateFrom?:datetime` · `dateTo?:datetime` · `page?:int` · `limit?:int(max100)` | `{ data: Lead[], total, page, limit }` | Data penuh termasuk PII. Status enum: `new\|contacted\|interested\|registered\|paid\|accepted\|rejected\|cold` |
| GET | `/api/v1/ppdb/stats` | SA, KS, TU, **GURU** | JWT | — | `{ perStatus: {status, count}[], conversionRate: number }` | **Agregat saja — TANPA PII.** GURU boleh akses ini. Harus terdaftar sebelum `/:id` agar tidak di-capture sebagai param |
| GET | `/api/v1/ppdb/leads/:id` | SA, TU | JWT | — | `Lead` (full detail) | Full PII visible. KS tidak bisa akses detail individual |
| PATCH | `/api/v1/ppdb/leads/:id/status` | SA, TU | JWT | **`status:enum`** · `notes?:str(max1000)` · `followUpAt?:date` | `Lead` updated | Transisi status pipeline CRM |
| PATCH | `/api/v1/ppdb/leads/:id/assign` | SA, TU | JWT | **`assignedTo:uuid\|null`** | `Lead` updated | Assign ke staff TU. `null` = un-assign |

**Total: 6 endpoint**

---

## 4. Teaching Assignments

> Controller: `apps/api/src/teaching-assignment/teaching-assignment.controller.ts`

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| GET | `/api/v1/teaching-assignments` | SA, KS, TU, GURU | JWT | Query: `classId?:uuid` · `teacherId?:uuid` · `academicYear?:str` · `page?:int` · `limit?:int(max100)` | `{ data: Assignment[], total, page, limit }` | **GURU:** filter otomatis ke assignment sendiri (service layer). SA/KS/TU: lihat semua |
| GET | `/api/v1/teaching-assignments/:id` | SA, KS, TU, GURU | JWT | — | `Assignment` object | **GURU:** 403 jika assignment bukan miliknya (ownership di service) |
| POST | `/api/v1/teaching-assignments` | SA, TU | JWT | **`teacherId:uuid`** · **`classId:uuid`** · **`subject:str(2-100)`** · **`academicYear:str(YYYY/YYYY)`** · `hoursPerWeek?:int(1-40, def 2)` | `Assignment` created (201) | **409** jika kombinasi (teacherId+classId+subject+academicYear) sudah ada. **400** jika teacherId/classId tidak ada di DB |
| PATCH | `/api/v1/teaching-assignments/:id` | SA, TU | JWT | `subject?:str(2-100)` · `hoursPerWeek?:int(1-40)` · `academicYear?:str(YYYY/YYYY)` | `Assignment` updated | teacherId/classId **tidak bisa diubah** via PATCH (delete + recreate untuk pindah guru/kelas) |
| DELETE | `/api/v1/teaching-assignments/:id` | SA | JWT | — | `{ message }` | **Hard delete** — record konfigurasi, bukan data akademik |

**Total: 5 endpoint**

---

## 5. Grades (Nilai)

> Controller: `apps/api/src/grade/grade.controller.ts`

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| POST | `/api/v1/grades` | GURU | JWT | **`studentId:uuid`** · **`assignmentId:uuid`** · **`semester:int(1-2)`** · **`score:num(0-100)`** · **`type:enum`** · `notes?:str(max1000)` | `Grade` created (201) | `type` enum: `uts\|uh\|uas\|praktik\|sikap`. **Dobel guard UTS/UAS:** 409 jika sudah ada nilai type UTS/UAS untuk siswa+semester+assignment yang sama. `submittedBy` dari JWT, bukan body |
| GET | `/api/v1/grades` | SA, KS, TU, GURU, SISWA, OT | JWT | Query: `studentId?:uuid` · `assignmentId?:uuid` · `classId?:uuid` · `semester?:int(1-2)` · `academicYear?:str(YYYY/YYYY)` · `type?:enum` · `page?:int` · `limit?:int(max100)` | `{ data: Grade[], total, page, limit }` | **Ownership:** GURU=kelas sendiri, SISWA=diri, OT=anak |
| PATCH | `/api/v1/grades/:id` | SA, GURU | JWT | `score?:num(0-100)` · `notes?:str(max1000)` | `Grade` updated | **GURU:** hanya nilai yang dia input + **dalam 7 hari kalender** sejak input. SA: tanpa batasan. Setidaknya satu field wajib diisi |

**Total: 3 endpoint**

---

## 6. Attendance (Absensi)

> Controller: `apps/api/src/attendance/attendance.controller.ts`

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| POST | `/api/v1/attendance` | GURU | JWT | **`classId:uuid`** · **`date:str(YYYY-MM-DD)`** · **`records:AttendanceItem[](min1,max200)`** | `Attendance[]` created (201) | **Bulk insert** satu kelas per request. `records[].status` enum: `hadir\|izin\|sakit\|alpha`. **Atomik:** sebagian gagal → rollback semua. **409** jika siswa+kelas+tanggal sudah ada |
| GET | `/api/v1/attendance` | SA, KS, TU, GURU, SISWA, OT | JWT | Query: `classId?:uuid` · `studentId?:uuid` · `dateFrom?:str(YYYY-MM-DD)` · `dateTo?:str(YYYY-MM-DD)` · `page?:int` · `limit?:int(max100)` | `{ data: Attendance[], total, page, limit }` | **Ownership:** GURU=kelas sendiri, SISWA=diri, OT=anak |

**Total: 2 endpoint**

---

## 7. Schedules (Jadwal Pelajaran)

> Controller: `apps/api/src/schedule/schedule.controller.ts`

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| GET | `/api/v1/schedules` | SA, KS, TU, GURU, SISWA, OT | JWT | Query: `classId?:uuid` · `teacherId?:uuid` · `dayOfWeek?:int(1-6)` · `academicYear?:str` · `semester?:int(1-2)` · `page?:int` · `limit?:int(max100)` | `{ data: Schedule[], total, page, limit }` | **Ownership:** GURU=kelas sendiri, SISWA=kelas sendiri, OT=kelas anak. `dayOfWeek`: 1=Senin..6=Sabtu |
| POST | `/api/v1/schedules` | SA, TU | JWT | **`classId:uuid`** · **`teachingAssignmentId:uuid`** · **`dayOfWeek:int(1-6)`** · **`jpStart:int(≥1)`** · **`jpEnd:int(≥jpStart)`** · **`academicYear:str(YYYY/YYYY)`** · **`semester:int(1-2)`** · `room?:str(max50)\|null` | `Schedule` created (201) | `jp` = jam pelajaran (bukan jam dinding). **409** jika konflik kelas (P2002) atau konflik guru/ruang (app-level ConflictException) |

**Total: 2 endpoint**

---

## 8. Finance — SPP

> Controller: `apps/api/src/finance/finance.controller.ts`
> ⚠️ **Separation of duties:** TU catat pembayaran → SA/KS approve. TU TIDAK bisa approve sendiri.

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| POST | `/api/v1/finance/spp` | SA, TU | JWT | **`studentId:uuid`** · **`month:int(1-12)`** · **`year:int(2020-2100)`** · **`amount:num(>0)`** · `status?:enum(def paid)` · `receiptNo?:str(max50)` | `SppPayment` created (201) | `status` enum: `unpaid\|paid\|late\|waived`. `recordedBy` dari JWT, bukan body. KS tidak boleh input pembayaran |
| GET | `/api/v1/finance/spp` | SA, KS, TU, SISWA, OT | JWT | Query: `studentId?:uuid` · `year?:int` · `status?:enum` · `page?:int` · `limit?:int(max100)` | `{ data: SppPayment[], total, page, limit }` | **Ownership:** SISWA=diri, OT=anak, SA/KS/TU=semua |
| GET | `/api/v1/finance/spp/summary` | SA, KS, TU | JWT | Query: `year?:int` · `month?:int(1-12)` | `{ year, month, totalPaid, totalUnpaid, totalLate, totalWaived }` | Agregat per bulan/tahun per status. Terdaftar sebelum `/:studentId/history` agar tidak salah capture |
| GET | `/api/v1/finance/spp/:studentId/history` | SA, KS, TU, SISWA, OT | JWT | — | `SppPayment[]` (histori lengkap siswa) | **Ownership:** SISWA=self, OT=anak. KS included (konsisten dengan GET list + approve) |
| POST | `/api/v1/finance/spp/:id/approve` | SA, **KS** | JWT | — | `SppPayment` approved (200) | **TU dilarang approve** (separation of duties). KS bisa approve. `approvedBy` dari JWT |

**Total: 5 endpoint**

---

## 9. AI — Chat & Knowledge Base

> Controller: `apps/api/src/ai/ai.controller.ts`
> **R-03 (UU PDP):** PII detection → jika terdeteksi → paksa Ollama (lokal). Non-PII + `AI_PROVIDER=claude` + `ANTHROPIC_API_KEY` set → ClaudeAdapter dengan PII-strip (belt-and-suspenders). **Default aman = Ollama.**

### 9a. Chat

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| POST | `/api/v1/ai/chat` | ALL\_AUTH | JWT | **`message:str(1-2000)`** · `sessionId?:uuid` | `{ answer, sessionId, sources? }` | **Throttle: 20/menit per IP** (override global — setiap request → embed + chat LLM). Tanpa `sessionId` → session baru dibuat. `sessionId` selalu dikembalikan. Riwayat disimpan ke `ChatSession/ChatMessage` (SMA-49) |
| GET | `/api/v1/ai/chat/:sessionId/history` | ALL\_AUTH | JWT | — | `{ session, messages: ChatMessage[] }` | **Ownership (service-level):** pemilik session ATAU SUPER\_ADMIN. Non-pemilik → 403. Session tak ada → 404 |

### 9b. Knowledge Base (Admin)

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| GET | `/api/v1/ai/knowledge` | SA, KS, TU | JWT | — | `RagChunk[]` (draft + published) | List semua chunk untuk manajemen konten. Chatbot tidak memanggil ini — ia pakai `searchSimilar` internal |
| POST | `/api/v1/ai/knowledge` | SA, KS, TU | JWT | **`title:str(1-500)`** · **`content:str(≥1)`** · **`category:str(1-100)`** · `source?:str(max255)` | `RagChunk` created (201) sebagai **DRAFT** (`isActive=false`) | SA/KS/TU bisa create, tapi **publish butuh SA/KS** (separation of duties: TU tidak bisa self-publish) |
| POST | `/api/v1/ai/knowledge/backfill` | SA | JWT | — | `{ total, success, failed, results }` | Embed semua chunk dengan embedding NULL. **Harus terdaftar sebelum `/:id`** agar `'backfill'` tidak di-parse sebagai UUID param |
| GET | `/api/v1/ai/knowledge/:id` | SA, KS, TU | JWT | — | `RagChunk` (detail + audit trail) | — |
| PATCH | `/api/v1/ai/knowledge/:id` | SA, KS, TU | JWT | `title?:str(1-500)` · `content?:str(≥1)` · `category?:str(1-100)` | `RagChunk` updated | Jika `content` berubah → re-embed (fail-soft) + kembali ke **DRAFT**. Jika hanya title/category → status tidak berubah |
| POST | `/api/v1/ai/knowledge/:id/publish` | SA, KS | JWT | — | `RagChunk` (`isActive=true`) | **422** jika embedding masih NULL (belum di-embed). TU tidak boleh publish |
| POST | `/api/v1/ai/knowledge/:id/unpublish` | SA, KS | JWT | — | `RagChunk` (`isActive=false`) | — |
| DELETE | `/api/v1/ai/knowledge/:id` | SA | JWT | — | `{ message }` (200) | **Hard delete** — tidak ada `deletedAt` di `RagChunk` |

**Total: 10 endpoint**

---

## 10. Health

> Controller: `apps/api/src/health/health.controller.ts`
> **Tanpa prefix** — `GET /health` (dikecualikan dari `api/v1`)

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| GET | `/health` | — | **PUBLIC** | — | `{ status: 'ok'\|'error', info: {...}, error: {...} }` | Dipakai: Uptime Kuma, GitHub Actions deploy check, load balancer. Cek: PostgreSQL (Prisma ping) + memory heap (≤500MB) + memory RSS (≤1GB) |

**Total: 1 endpoint**

---

## 11. Metrics

> Controller: `apps/api/src/metrics/metrics.controller.ts`
> **Tanpa prefix** — `GET /metrics` (dikecualikan dari `api/v1`)

| Method | Path | Roles | Auth | Request | Response | Catatan |
|---|---|---|---|---|---|---|
| GET | `/metrics` | — | **PUBLIC** | — | Prometheus text format (`text/plain; version=0.0.4`) | Dipakai: Prometheus scraper. Hanya metrik teknis (CPU, heap, request count) — TIDAK ada data siswa |

**Total: 1 endpoint**

---

## Ringkasan per Modul

| Modul | Endpoint | Controller |
|---|---|---|
| Auth | 2 | `auth/auth.controller.ts` |
| Students | 7 | `student/student.controller.ts` |
| PPDB | 6 | `ppdb/ppdb.controller.ts` |
| Teaching Assignments | 5 | `teaching-assignment/teaching-assignment.controller.ts` |
| Grades | 3 | `grade/grade.controller.ts` |
| Attendance | 2 | `attendance/attendance.controller.ts` |
| Schedules | 2 | `schedule/schedule.controller.ts` |
| Finance (SPP) | 5 | `finance/finance.controller.ts` |
| AI (Chat + KB) | 10 | `ai/ai.controller.ts` |
| Health | 1 | `health/health.controller.ts` |
| Metrics | 1 | `metrics/metrics.controller.ts` |
| **Total** | **44** | — |

> Notification tidak memiliki HTTP endpoint — fired internally via `NotificationService.notify()`.

---

## Gerbang Khusus & Catatan Lintas Modul

### SPP — Separation of Duties
TU mencatat pembayaran (`POST /finance/spp`), SA/KS yang approve (`POST /finance/spp/:id/approve`). TU **tidak dapat** approve transaksi yang dia buat sendiri.

### PPDB — GURU Hanya Statistik Agregat
GURU boleh akses `GET /ppdb/stats` (total leads per status, conversion rate — tanpa PII). GURU **tidak boleh** akses `GET /ppdb/leads` atau `GET /ppdb/leads/:id` karena mengandung nama dan nomor HP calon siswa (PII).

### AI — R-03 Decision Tree (UU PDP)
```
message diterima
  ↓
hasPii() pada message + context?
  ├─ YES → paksa OllamaAdapter (lokal, data tidak keluar)
  └─ NO  → AI_PROVIDER=claude DAN ANTHROPIC_API_KEY tersedia?
             ├─ YES → strip PII → ClaudeAdapter (claude-haiku-4-5-20251001)
             └─ NO  → OllamaAdapter (default aman)
```
Embedding **selalu Ollama** (ClaudeAdapter tidak mendukung `embed()`).

### AI — Knowledge Publish Gate
Chunk baru selalu dibuat sebagai DRAFT (`isActive=false`). Publish memerlukan embedding tidak NULL (jalankan backfill jika perlu) + role SA/KS. Alur: TU create draft → SA/KS review → publish → chatbot menggunakan chunk.

### Grade — Dobel Guard UTS/UAS
409 jika Guru mencoba input nilai type `uts` atau `uas` untuk kombinasi studentId+assignmentId+semester yang sudah ada. Mencegah duplikasi nilai ujian.

### Grade — Window Edit 7 Hari (GURU)
GURU hanya bisa edit nilai yang dia input sendiri, dan hanya dalam 7 hari kalender sejak input. SA tidak memiliki batasan ini.

### Ownership Chain — ORANG\_TUA
ORANG\_TUA mengakses data anak via `parentId` di tabel `students`. Endpoint `/students/:id`, `/grades`, `/attendance`, `/finance/spp`, dan `/schedules` semua mengikuti chain `parentId → studentId`.

### Rate Limit Ringkasan

| Endpoint | Limit |
|---|---|
| Default global | 100 req/menit per IP |
| `POST /api/v1/auth/me`, `GET /api/v1/auth/me` | 15 req/menit per IP |
| `POST /api/v1/ppdb/leads` | 10 per 5 menit per IP |
| `POST /api/v1/ai/chat` | 20 req/menit per IP |

---

## Tahap 2 — Swagger Interaktif

`@nestjs/swagger` dengan decorator `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` — **di-defer ke Tahap 2** untuk menghindari churn decorator saat penutupan Tahap 1. Endpoint ini sudah mencakup semua informasi yang dibutuhkan untuk integrasi frontend dan konsumsi API.

---

*Dihasilkan: 2026-06-07 · Diverifikasi terhadap controller + DTO aktual (44 endpoint) · SMA-53*
