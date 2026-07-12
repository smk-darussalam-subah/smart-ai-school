# Siklus Hidup Akademik DIIS — Spesifikasi Komprehensif

> **Sekolah:** SMK Darussalam Subah
> **Domain:** smkdarussalamsubah.sch.id
> **Versi Dokumen:** 2.0 | 2026-07-12
> **Status:** Tervalidasi terhadap codebase (schema.prisma, 38 controller, 4 event listener)
> **Sumber:** Iterative critical analysis — 4 ronde verifikasi terhadap kode sumber

---

## Daftar Isi

1. [Identitas Sistem](#1-identitas-sistem)
2. [Arsitektur Event-Driven](#2-arsitektur-event-driven)
3. [Skema Database](#3-skema-database-11-skema--48-model)
4. [Role & RBAC](#4-role--rbac)
5. [Fase 0 — Pra-Launch & Setup Sistem](#5-fase-0--pra-launch--setup-sistem-juni-2026)
6. [Fase 1 — Populasi Data & PPDB](#6-fase-1--populasi-data--ppdb-juli-awal)
7. [Fase 2 — Persiapan Akademik](#7-fase-2--persiapan-akademik-juli-tengahakhir)
8. [Fase 3 — Awal Semester Ganjil: KBM](#8-fase-3--awal-semester-ganjil--kbm-agustus)
9. [Fase 4 — Operasi Berkelanjutan](#9-fase-4--operasi-berkelanjutan-septembernovember)
10. [Fase 5 — Pipeline Rapor](#10-fase-5--pipeline-rapor-desember)
11. [Fase 6 — Penutupan Semester](#11-fase-6--penutupan-semester-ganjil-desember-akhir)
12. [Pemetaan Integrasi Lintas-Modul](#12-pemetaan-integrasi-lintas-modul)
13. [Matriks Role × Aksi](#13-matriks-role--aksi)
14. [Pola Arsitektur Kunci](#14-pola-arsitektur-kunci)
15. [Status Implementasi](#15-status-implementasi--catatan-jujur)

---

## 1. Identitas Sistem

| Aspek | Detail |
|---|---|
| **Platform** | DIIS Smart AI School |
| **Sekolah** | SMK Darussalam Subah |
| **Backend** | NestJS 11 + Fastify + Prisma (multi-schema) |
| **Database** | PostgreSQL 16 + pgvector (768d) |
| **Frontend** | Next.js 15 (App Router, standalone mode) + React 19 |
| **Auth** | Keycloak IAM 24 + NextAuth.js + RBAC permission-based |
| **AI — Chat/Generation** | GPT-4.1-mini (cloud, via OpenAI API) |
| **AI — Embedding** | Ollama nomic-embed-text (lokal VPS, 768 dimensi) |
| **Notifikasi** | WhatsApp (Fonnte API) + PWA Push (Web Push API) + In-app (NotificationLog) |
| **Database Schema** | 11 Prisma schemas, 48 model |
| **API Controllers** | 38 modul, prefix `/api/v1/` |
| **Frontend Dashboard** | 25 halaman (per role) |
| **Event Types** | 11 jenis event (EventEmitter2) |
| **Event Listeners** | 4 listener module (Notification, Gamification, Badges, LMS) |

---

## 2. Arsitektur Event-Driven

Sistem menggunakan pola **EventEmitter2** (NestJS). Producer memancarkan event via `emit()`; konsumer bereaksi dengan decorator `@OnEvent()`. Seluruh listener bersifat **asinkron dan fail-soft** — kegagalan satu listener tidak pernah membatalkan operasi inti.

### 2.1 Registri Event (11 jenis)

> **Sumber kode:** `apps/api/src/events/events.types.ts`

| Konstanta | Nama Event | Producer | Trigger |
|---|---|---|---|
| `STUDENT_ENROLLED` | `student.enrolled` | `StudentService.create()` | Siswa baru terdaftar |
| `STUDENT_STATUS_CHANGED` | `student.statusChanged` | `StudentService.update()` | Status siswa berubah (active→graduated/dropped/inactive) |
| `GRADE_SUBMITTED` | `grade.submitted` | `GradeService` / `AssessmentService.gradeAll()` | Nilai baru dicatat (formatif/sumatif saja) |
| `ATTENDANCE_RECORDED` | `attendance.recorded` | `AttendanceService.create()` | Kehadiran alpha/sakit dicatat (hadir/izin tidak emit) |
| `PAYMENT_RECEIVED` | `payment.received` | `FinanceService.approve()` | Pembayaran SPP disetujui SA/KS |
| `RPP_REVIEWED` | `rpp.reviewed` | `RppService.review()` | WAKA/KS me-review RPP (approved atau revision) |
| `ASSESSMENT_COMPLETED` | `assessment.completed` | `AssessmentService.gradeAll()` | Sesi asesmen selesai dinilai massal |
| `ANNOUNCEMENT_PUBLISHED` | `announcement.published` | `AnnouncementService` | Pengumuman diterbitkan (WA hanya untuk darurat/urgent) |
| `REPORT_DISTRIBUTED` | `report.distributed` | `ReportCardsService.distribute()` | Rapor dibagikan ke siswa |
| `BADGE_AWARDED` | `badge.awarded` | `BadgesService` | Badge diberikan (auto via criteria atau manual) |
| `XP_AWARDED` | `xp.awarded` | `GamificationService.addXp()` | XP ditambahkan ke siswa |

### 2.2 Rantai Listener per Event

> **Sumber kode:** `notification.listener.ts`, `gamification.listener.ts`, `badges.listener.ts`, `lms.event-listener.ts`

```
grade.submitted ──┬──→ GamificationListener  → addXp (source: 'grade_submitted')
                   │                           → emit xp.awarded
                   ├──→ BadgesListener         → cek kriteria grade_threshold → StudentBadge
                   │                           → emit badge.awarded
                   └──→ NotificationListener   → WA ke orang tua (nilai update)

rpp.reviewed ─────┬──→ LmsEventListener       → jika approved: auto-create draft LmsModule (idempoten)
                   └──→ NotificationListener   → WA ke guru (approved/revision + reviewNote)

attendance.recorded ──→ NotificationListener   → WA ke orang tua (HANYA alpha & sakit)

payment.received ──→ NotificationListener      → WA ke siswa + orang tua (kwitansi SPP)

student.enrolled ──→ NotificationListener      → WA welcome ke orang tua
                     [PLANNED: auto-create SppPayment + StudentXp]

student.statusChanged ──→ NotificationListener → WA ke siswa + orang tua

announcement.published ──→ NotificationListener → WA (hanya category=darurat atau priority=urgent)
                          └→ Push PWA

report.distributed ──→ NotificationListener    → WA ke orang tua (rapor terbit)

badge.awarded ──→ [PLANNED: WA/Push ke siswa — belum ada listener]
xp.awarded ──→ [PLANNED: in-app notification — belum ada listener]
```

### 2.3 Pola Fail-Soft

Setiap listener dibungkus `try/catch` dengan logging via NestJS Logger. Jika Fonnte API down, **WA gagal dikirim tetapi nilai tetap tersimpan**. Prinsip ini bersifat **non-negotiable**: operasi inti (database write) tidak boleh terblokir oleh kegagalan notifikasi (WA/Push/In-app).

```
┌──────────────┐     emit()      ┌───────────────────┐
│  Producer    │ ──────────────► │  EventEmitter2    │
│  (Service)   │                 │  (in-memory bus)  │
└──────────────┘                 └───────┬───────────┘
                                         │ fan-out (parallel)
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
          ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
          │ GamificationL.   │ │ BadgesListener   │ │ NotificationL.   │
          │ try { addXp() }  │ │ try { check() }  │ │ try { sendWA() } │
          │ catch { log() }  │ │ catch { log() }  │ │ catch { log() }  │
          └──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 3. Skema Database (11 Skema — 48 Model)

> **Sumber kode:** `packages/database/prisma/schema.prisma` (1.457 baris)

| # | Skema | Model | Cakupan |
|---|---|---|---|
| 1 | `auth` | User, Permission, RolePermission, UserPermissionOverride, SseToken | Identitas, RBAC granular, token SSE |
| 2 | `academic` | Class, Grade, Attendance, Schedule, Rpp, LmsModule, LmsModuleProgress, AssessmentSession, AssessmentResponse, ReportCard, ClassActivity, Subject, KktpConfig, Question, QuestionSet, Badge, StudentBadge | Operasional akademik inti |
| 3 | `student` | Student | Profil & status siswa |
| 4 | `teacher` | Teacher, TeacherAttendance | Identitas mengajar + presensi guru |
| 5 | `ppdb` | PpdbLead | Pipeline PPDB |
| 6 | `finance` | SppPayment | Pembayaran SPP |
| 7 | `notification` | NotificationLog, Announcement, WaLog, PushSubscription | Multi-channel notification |
| 8 | `ai_knowledge` | RagChunk, ChatSession, ChatMessage, AiGeneration | RAG, chatbot, audit AI |
| 9 | `audit` | AuditLog | Audit trail PII-minimal |
| 10 | `school` | SchoolProfile, Major, AcademicYear, Semester, AcademicCalendar, Staff, Position, PositionPermission, StaffPosition | Konfigurasi sekolah & kepegawaian |
| 11 | `gamification` | StudentXp, XpTransaction | XP, level, streak siswa |

### Konvensi Skema

- **UUID Primary Key** di semua tabel (`gen_random_uuid()`)
- **Timestamps** (`created_at`, `updated_at`) wajib di semua tabel
- **Soft delete** (`deleted_at`) pada: User, Student, Teacher, Staff
- **Cross-schema reference** tanpa FK fisik (pola denormalized audit: `actorId`, `submittedBy`, `recordedBy`)
- **pgvector extension** untuk embedding 768d di `ai_knowledge.rag_chunks`

---

## 4. Role & RBAC

### 4.1 7 Base Role (Keycloak realm roles)

> **Sumber kode:** `enum UserRole` (schema.prisma L59-83)

| Role | Cakupan |
|---|---|
| `SUPER_ADMIN` | Full system access, provisioning, konfigurasi |
| `KEPALA_SEKOLAH` | Oversight, approval, analytics |
| `TATA_USAHA` | Admin: finance (record), PPDB, data siswa |
| `GURU` | Teaching, assessment, grading |
| `SISWA` | Learning, assignments, assessments |
| `ORANG_TUA` | Monitoring progres anak, payments |
| `INDUSTRI` | Mitra industri (PKL/BKK, lowongan kerja) |

### 4.2 11 Position Code (synced sebagai Keycloak realm roles via R-23)

| Code | Kategori | Cakupan |
|---|---|---|
| `WAKA_KURIKULUM` | STRUKTURAL | Wakil kurikulum — reviewer RPP |
| `WAKA_KESISWAAN` | STRUKTURAL | Wakil kesiswaan |
| `WAKA_HUMAS` | STRUKTURAL | Wakil humas |
| `WAKA_SARPRAS` | STRUKTURAL | Wakil sarana & prasarana |
| `KEPALA_TU` | STRUKTURAL | Kepala tata usaha |
| `KAPROG` | FUNGSIONAL | Kepala program (per major: TKRO/TBSM/TJKT/AKL) |
| `KOOR_BKK` | FUNGSIONAL | Koordinator BKK (job center) |
| `KOOR_HUBIN` | FUNGSIONAL | Koordinator hubungan industri |
| `GURU_BK` | FUNGSIONAL | Guru bimbingan konseling |
| `BENDAHARA` | TENDIK | Bendahara |
| `STAF_KEPEGAWAIAN` / `OPERATOR_DAPODIK` | TENDIK | Staf kepegawaian / operator Dapodik |

### 4.3 Permission-Based RBAC

Sistem menggunakan **dual-layer authorization**:

1. **Role-level** (`@Roles()` decorator): 7 base role — coarse-grained
2. **Permission-level** (`@RequirePermission()` decorator): granular aksi (`student.create`, `finance.approve`, dll)

**Position auto-grant:** Saat StaffPosition aktif, PositionPermission → UserPermissionOverride (grant=true). Saat berakhir, override dicabut. Ini memungkinkan rotasi jabatan tanpa deploy.

---

## 5. Fase 0 — Pra-Launch & Setup Sistem (Juni 2026)

**Aktor utama:** SUPER_ADMIN

### 5.1 Tabel Aksi

| # | Aksi | Model | Catatan Teknis |
|---|---|---|---|
| 0.1 | Buat SchoolProfile | `school.school_profile` | NPSN, nama, alamat, geofence coords (lat/lng/radius default 300m) |
| 0.2 | Buat AcademicYear | `school.academic_years` | code="2026/2027", startDate, endDate, isActive=true |
| 0.3 | Buat Semester 1 | `school.semesters` | number=1, tanggal mulai/selesai, isActive=true |
| 0.4 | Buat AcademicCalendar | `school.academic_calendar` | type: `holiday` / `exam` / `event` / `break` |
| 0.5 | Buat Major (4 jurusan) | `school.majors` | TKRO, TBSM, TJKT, AKL |
| 0.6 | Buat Subject katalog | `academic.subjects` | code (MTK, BIN, BIG, dll) + name |
| 0.7 | Provisioning User via Keycloak | `auth.users` | keycloakId = Keycloak sub (UUID) |
| 0.8 | Buat Staff records | `school.staff` | NIY, employmentStatus (GTY/GTT/PTY/PTT) |
| 0.9 | Buat Position katalog | `school.positions` | code, name, category, scopeType (NONE/MAJOR), parentId (hierarki) |
| 0.10 | Set PositionPermission | `school.position_permissions` | Mapping positionId → permissionId |
| 0.11 | Assign StaffPosition | `school.staff_positions` | staffId + positionId + academicYearId (+ majorId jika scope=MAJOR) |
| 0.12 | Sync posisi → Keycloak roles | Keycloak realm | R-23: position codes menjadi realm roles |
| 0.13 | Konfigurasi KktpConfig | `academic.kktp_configs` | Per-subject, per-year, per-semester; default 75 |
| 0.14 | Set consent timestamp | `auth.users.consentAt` | R-05: persetujuan data (UU PDP) |

### 5.2 Event Sistem

- `AuditLog` entries untuk semua aksi provisioning (actorId, action, resourceType, outcome)

### 5.3 Compliance PDP (R-05)

Setiap operator wajib mengisi `User.consentAt` — timestamp saat persetujuan pengolahan data dikonfirmasi. Tanpa ini, pemrosesan data PII tidak sesuai UU PDP. Field ini di-audit dan tidak boleh null untuk user yang datanya akan diolah.

---

## 6. Fase 1 — Populasi Data & PPDB (Juli Awal)

**Aktor:** TATA_USAHA, SUPER_ADMIN, PUBLIK

### 6.1 Populasi Siswa & Kelas

| # | Aksi | Model | Constraint |
|---|---|---|---|
| 1.1 | TU: Bulk import/buat Student | `student.students` | nis (unique), classId, parentId, status=active, joinedAt (Date) |
| 1.2 | TU: Buat Classes | `academic.classes` | unique composite: [name, academicYear] |
| 1.3 | TU: Buat TeachingAssignment | `academic.teaching_assignments` | unique: [teacherId, classId, subject, academicYear] |
| 1.4 | TU: Setup SppPayment schedule | `finance.spp_payments` | unique: [studentId, month, year]; status=unpaid |

### 6.2 Pipeline PPDB

> **Sumber kode:** `enum LeadStatus` (schema.prisma L325-336)

```
new → contacted → interested → registered → paid → accepted
                 ↓                                         ↑
                 └─ cold ──────────────────────────────────┘
                                                          ↓
                    rejected ←────────────────────────── (terminal)
```

| Status | Arti | Aksi TU |
|---|---|---|
| `new` | Lead baru masuk dari form publik | Review |
| `contacted` | Sudah dihubungi | Follow-up |
| `interested` | Tertarik, lanjut registrasi | Proses pendaftaran |
| `registered` | Sudah isi form lengkap | Verifikasi berkas |
| `paid` | Sudah bayar pendaftaran | Konfirmasi |
| `accepted` | Diterima → enroll sebagai Student | Buat Student record |
| `rejected` | Tidak memenuhi syarat | Terminal |
| `cold` | Tidak responsif | Re-engagement nanti |

**Lead source tracking:** `chatbot_wa`, `website`, `referral`, `instagram`, `tiktok`, `event`, `walk_in`, `other`

### 6.3 Event saat Enrollment

```
StudentService.create()
  ├─→ DB: student.students INSERT
  ├─→ emit student.enrolled
  │     ├─→ NotificationListener: WA welcome ke orang tua
  │     ├─→ [PLANNED: SppPayment auto-create — saat ini manual]
  │     └─→ [PLANNED: StudentXp inisialisasi — saat ini lazy saat XP pertama]
  └─→ AuditLog: student.create
```

> **Catatan jujur:** Auto-provisioning SppPayment dan StudentXp saat enrollment adalah enhancement yang direncanakan tetapi belum diimplementasi. SppPayment dibuat manual per transaksi; StudentXp diinisialisasi saat `grade.submitted` pertama kali memicu GamificationListener.

---

## 7. Fase 2 — Persiapan Akademik (Juli Tengah–Akhir)

**Aktor:** GURU, WAKA_KURIKULUM, KEPALA_SEKOLAH

### 7.1 Pembuatan RPP (Modul Ajar) — Wizard 10 Langkah

> **Sumber kode:** `rpp.controller.ts`, `Rpp` model (schema.prisma L489-517)

| Langkah | Isi | Bantuan AI |
|---|---|---|
| 1 | CP (Capaian Pembelajaran) | GPT-4.1-mini generate |
| 2 | TP (Tujuan Pembelajaran) | AI generate dari CP |
| 3 | ATP (Alur Tujuan Pembelajaran) | AI sequence |
| 4 | Profil Pelajar Pancasila | Manual |
| 5 | Sarana & Prasarana | Manual |
| 6 | Kegiatan Pembelajaran | Manual / AI |
| 7 | Asesmen (diagnostik/formatif/sumatif) | AI generate soal |
| 8 | Lampiran (materi) | AI generate materi |
| 9 | Review & preview | — |
| 10 | Submit for approval | Status: `draft` → `submitted` |

**Struktur penyimpanan:** RPP `body` disimpan sebagai JSONB — Modul Ajar terstruktur Kurikulum Merdeka (CP/TP/ATP/profil/sarana/kegiatan/asesmen/lampiran).

**Audit AI:** Setiap output AI dicatat di `ai_knowledge.ai_generations` (prompt, output, model, tokensUsed, teacherId).

### 7.2 State Machine RPP

> **Sumber kode:** `enum RppStatus` (schema.prisma L519-526)

```
                         ┌── approved ──→ [terminal: trigger LMS hook]
                         │
draft ──→ submitted ──→ reviewed
                         │
                         └── revision ──→ edit ──→ submitted ──→ (loop)
```

**Reviewer:** WAKA_KURIKULUM (review awal) → KEPALA_SEKOLAH (final approval).

**Saat review (`RppService.review()`):**
- Emit `rpp.reviewed` dengan payload: `{ rppId, teacherId, title, decision: 'approved' | 'revision', note, reviewedAtIso }`
- Jika `approved` → **LmsEventListener** auto-create draft LmsModule (idempoten — cek existing `rppId`)
- Jika `revision` → WA ke guru dengan `reviewNote`
- Field yang di-update: `reviewerId`, `reviewerName`, `reviewNote`, `reviewedAt`, `submittedAt`

### 7.3 RPP → LMS Auto-Create Hook

> **Sumber kode:** `lms.event-listener.ts`

Saat `rpp.reviewed` dengan `decision='approved'`:

1. **Idempotency check:** cari existing `LmsModule` dengan `rppId` → skip jika sudah ada
2. **Read RPP metadata:** teacherId, classId, subject, title, body (JSONB)
3. **Extract dari body:** jpAllocation, kktp (default 75), tp (ambil array[0])
4. **Create draft LmsModule:** status=`draft`, content = `JSON.stringify(rpp.body)`
5. **Fail-soft:** jika gagal, log error — **tidak membatalkan** review pipeline

### 7.4 Bank Soal (Question Bank)

> **Sumber kode:** `Question`, `QuestionSet` model (schema.prisma L1256-1292)

| Aspek | Detail |
|---|---|
| Tipe soal | `multiple_choice`, `essay`, `true_false`, `matching` |
| Difficulty | `easy`, `medium`, `hard` |
| Essay rubric | JSONB: `Array<{ id, name, weight, maxScore, description }>` |
| Tags | `String[]` untuk filtering |
| Reusabilitas | Question → QuestionSet (many-to-many) → AssessmentSession |

**AI-assisted generation:** Generate dari RPP body → `AiGeneration` audit trail.

### 7.5 Konfigurasi Jadwal (Schedule)

> **Sumber kode:** `Schedule` model (schema.prisma L457-482)

| Aspek | Detail |
|---|---|
| Unit waktu | **JP (Jam Pelajaran)**, bukan jam dinding — pemetaan JP→jam = konfigurasi bel sekolah |
| Struktur | `dayOfWeek` (1=Senin .. 6=Sabtu), `jpStart`, `jpEnd` (inklusif) |
| Room | Nullable — sekolah kecil mungkin belum pakai |
| Unique constraint | `[classId, dayOfWeek, jpStart, academicYear, semester]` |
| **Exclusion constraint** | DB-level `EXCLUDE` (raw SQL migration) menolak **overlap rentang JP** di kelas yang sama — Prisma tidak bisa mengekspresikan ini |
| Forward-compat Tahap 2 | `TimetableEntry` akan di-generate dari Schedule; `ClassSession` harian dari `TimetableEntry`; `Attendance.sessionId?` (nullable, additive) |

### 7.6 Presensi Guru (TeacherAttendance)

> **Sumber kode:** `TeacherAttendance` model (schema.prisma L272-295)

| Field | Detail |
|---|---|
| `checkInAt` / `checkOutAt` | Timestamp check-in/out |
| `latIn`, `lngIn`, `latOut`, `lngOut` | Koordinat GPS (Decimal(9,6)) |
| `distanceInM` | Jarak ke sekolah dalam meter |
| `outsideGeofence` | `true` jika jarak > radius **ATAU** koordinat tidak dikirim (tidak dapat diverifikasi) |
| `photoUrl` | Foto selfie (nullable — File Storage just-in-time) |
| Geofence source | `SchoolProfile.latitude`, `longitude`, `geofenceRadiusM` (default 300) |
| Unique | `[teacherId, date]` — 1x check-in per hari |

---

## 8. Fase 3 — Awal Semester Ganjil: KBM (Agustus)

**Aktor:** GURU, SISWA, ORANG_TUA

### 8.1 Alur LMS (Learning Management System)

> **Sumber kode:** `LmsModule`, `LmsModuleProgress` model; `lms.controller.ts`

#### State Machine LmsModule

```
draft ──→ published ──→ archived
```

#### Alur Penggunaan

```
GURU: Publish LmsModule (draft → published)
  └─ Siswa lihat: kisi-kisi, TP, KKTP (konten terkunci/preview)

GURU: Aktifkan modul saat sesi kelas
  └─ Siswa lihat: full materi, tugas terbuka (unlocked)

SISWA: Akses modul → baca materi → kerjakan tugas
  └─ LmsModuleProgress: status locked → active → completed
     progress: 0% → 100%
     startedAt, completedAt
```

#### Forward-Compat: LmsModuleProgress XP

> **[PLANNED]** Saat `LmsModuleProgress.status = completed`, sistem akan emit event untuk XP award (source: `lms_progress`). Saat ini XP hanya dari `grade.submitted`.

### 8.2 Alur Asesmen (Critical Path)

> **Sumber kode:** `assessment.controller.ts`, `assessment.service.ts`, `submission.controller.ts`

#### 8.2.1 Pembuatan Sesi Asesmen

```
GURU: "Tugaskan & Sinkronkan" → Create AssessmentSession
  ├─ moduleId: ref ke LmsModule
  ├─ type: diagnostik | formatif | sumatif
  ├─ questions: JSONB (dari QuestionSet atau inline)
  ├─ durationMinutes: timer (opsional, nullable)
  ├─ randomizeOrder: boolean (default false)
  ├─ status: draft → active
  └─ academicYear + semester: dari modul terkait
```

#### 8.2.2 Pengerjaan oleh Siswa

```
SISWA: Akses AssessmentSession (status=active)
  ├─ AssessmentResponse: answers (JSONB), score (nullable)
  ├─ Timer: startedAt, timeSpentSec
  ├─ Unique: [sessionId, studentId] — 1x per siswa per sesi
  └─ submittedAt: timestamp submit
```

#### 8.2.3 Kebijakan Penilaian (KRITIS)

> **Sumber kode:** `assessment.service.ts` L408-500

```
┌──────────────────────────────────────────────────────────────────┐
│                    KEBIJAKAN PENILAIAN ASESMEN                    │
│                                                                   │
│  ┌─────────────┬───────────────────┬───────────────────────────┐ │
│  │ Type        │ Grade Record?      │ Pemetaan                  │ │
│  ├─────────────┼───────────────────┼───────────────────────────┤ │
│  │ diagnostik  │ TIDAK              │ Skor hanya di             │ │
│  │             │                    │ AssessmentResponse.score  │ │
│  │             │                    │ TIDAK memengaruhi rapor   │ │
│  │             │                    │ Tujuan: pemetaan awal     │ │
│  ├─────────────┼───────────────────┼───────────────────────────┤ │
│  │ formatif    │ YA — type: 'uh'    │ Nilai Harian              │ │
│  │             │                    │ Masuk rapor               │ │
│  ├─────────────┼───────────────────┼───────────────────────────┤ │
│  │ sumatif     │ YA — type: 'uts'   │ UTS atau UAS              │ │
│  │             │ atau 'uas'         │ Masuk rapor               │ │
│  └─────────────┴───────────────────┴───────────────────────────┘ │
│                                                                   │
│  ESSAY: TIDAK ter-auto-grade → masuk skippedCount                │
│  Guru input manual via GradeService.create()                     │
│  Rubrik (JSONB) tersedia di Question.rubric untuk panduan        │
└──────────────────────────────────────────────────────────────────┘
```

#### 8.2.4 Auto-Grade Pipeline

> **Sumber kode:** `assessment.service.ts` gradeAll() L380-500

```
gradeAll(sessionId):
  for each AssessmentResponse in session:
    ├─ Hitung skor dari answers vs questions.answer
    │
    ├─ Update AssessmentResponse.score
    │
    ├─ Jika type = diagnostik:
    │    └─ SKIP Grade creation (skor di Response saja)
    │
    ├─ Jika type = formatif/sumatif:
    │    ├─ Cari/buat TeachingAssignment (teacher+class+subject)
    │    ├─ Idempotency: cek existing Grade
    │    │    ├─ Jika ada → UPDATE score
    │    │    └─ Jika tidak → CREATE Grade
    │    │         (studentId, assignmentId, semester, score, type, submittedBy)
    │    │
    │    └─ Emit grade.submitted → 3 listener reaksi:
    │         ├─ GamificationListener → +XP (source: 'grade_submitted')
    │         ├─ BadgesListener → cek grade_threshold → StudentBadge
    │         └─ NotificationListener → WA ke orang tua
    │
    └─ Jika essay → skippedCount++

  Emit assessment.completed → audit/analytics hook:
    { sessionId, title, type, gradedCount, skippedCount }
```

#### 8.2.5 KKTP Threshold

> **Sumber kode:** `KktpConfig` model (schema.prisma L759-772)

| Aturan | Detail |
|---|---|
| Sumber | `academic.kktp_configs` — per-subject, per-academicYear, per-semester |
| Default | 75 (jika tidak ada entry) |
| Logika | Skor siswa ≥ KKTP = **TUNTAS**; Skor < KKTP = **REMEDIAL** |
| Pengatur | KS / WAKA_KURIKULUM |
| Audit | `createdBy` (userId) |

### 8.3 Monitoring Realtime (SSE)

> **Sumber kode:** `SseToken` model (schema.prisma L142-159)

```
GURU → SSE (Server-Sent Events) connection
  ├─ Auth: short-lived SseToken (bukan JWT)
  │    ├─ Generated on-demand, one-time-use
  │    ├─ expiresAt enforced
  │    ├─ consumed = true setelah dipakai
  │    └─ Roles + identity ter-cache di token
  │
  ├─ Menggantikan JWT di query param (R-11)
  │    └─ Mencegah token exposure di browser history, server logs, referrer headers
  │
  └─ Live view: progres siswa real-time, skor instan
```

### 8.4 Kehadiran Harian Siswa

> **Sumber kode:** `Attendance` model (schema.prisma L412-430); `attendance.service.ts`

```
GURU: catat Attendance siswa
  ├─ status: hadir | izin | sakit | alpha
  ├─ Unique: [studentId, classId, date] — tidak bisa dobel per hari
  ├─ recordedBy: userId guru (audit, no FK)
  └─ notes: text (opsional)

Event:
  attendance.recorded → HANYA untuk status 'alpha' | 'sakit'
    ├─ NotificationListener: WA ke orang tua (alert ketidakhadiran)
    └─ Status 'hadir' & 'izin' TIDAK memicu WA (anti-spam)
```

### 8.5 Jurnal Kelas (ClassActivity)

> **Sumber kode:** `ClassActivity` model (schema.prisma L710-729)

| Field | Detail |
|---|---|
| `category` | `pembelajaran` / `ulangan` / `praktikum` / `kegiatan` / `lainnya` |
| `title` | Judul kegiatan |
| `description` | Deskripsi (text) |
| `photoUrl` | Dokumentasi foto (nullable) |
| `date` | Tanggal kegiatan |
| Index | `[classId, date]` untuk query cepat |

### 8.6 Monitoring Orang Tua

```
ORANG_TUA: dashboard (polling 60s)
  ├─ Nilai anak (grade.submitted → refresh)
  ├─ Kehadiran anak (attendance.recorded → refresh)
  └─ Badges & XP anak [PLANNED: badge.awarded/xp.awarded listener]
```

---

## 9. Fase 4 — Operasi Berkelanjutan (September–November)

**Aktor:** SEMUA ROLE

### 9.1 Siklus Mengajar (GURU)

Ulangi pola Fase 3 secara berkelanjutan:

1. Aktifkan modul LMS berikutnya
2. Buat asesmen (formatif untuk latihan, sumatif untuk UTS/UAS)
3. Auto-grade → Grade → `grade.submitted` event chain
4. Monitor via SSE selama sesi
5. Remedial untuk siswa dengan skor < KKTP

### 9.2 Rutinitas Harian Siswa

```
SISWA:
  ├─ Dashboard: nilai, tugas, jadwal, badge collection
  ├─ Kerjakan modul LMS (LmsModuleProgress: 0→100%)
  ├─ Kerjakan asesmen (AssessmentResponse)
  └─ Lihat progres XP, level, streak (StudentXp)
```

### 9.3 Monitoring Mingguan Orang Tua

```
ORANG_TUA:
  ├─ Dashboard: nilai, kehadiran, badges, XP anak
  ├─ WA: notifikasi nilai, alert kehadiran (alpha/sakit)
  └─ Pengumuman sekolah
```

### 9.4 Operasi Bulanan — SPP Pipeline

> **Sumber kode:** `finance.controller.ts`, `SppPayment` model

#### Separation of Duties (Pemisahan Tanggung Jawab)

```
TU (TATA_USAHA):
  ├─ Catat pembayaran baru (status=unpaid)
  │    @Roles('SUPER_ADMIN', 'TATA_USAHA')
  │    @RequirePermission('finance.create')
  │
  └─ TU TIDAK BISA menyetujui pembayaran sendiri
     (tidak punya role 'finance.approve')

SA/KS (SUPER_ADMIN / KEPALA_SEKOLAH):
  ├─ Approve pembayaran (status → paid)
  │    @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  │    @RequirePermission('finance.approve')
  │
  ├─ Emit payment.received → WA kwitansi ke siswa + orang tua
  └─ approvedBy, approvedAt dicatat
```

#### Status SppPayment

> **Sumber kode:** `enum PaymentStatus`

| Status | Arti |
|---|---|
| `unpaid` | Belum dibayar (default) |
| `paid` | Lunas (setelah approval SA/KS) |
| `late` | Terlambat |
| `waived` | Dibebaskan (kasus khusus) |

### 9.5 Oversight KS & WAKA

```
KEPALA_SEKOLAH:
  ├─ BerandaKiosk: KPI dashboard (kehadiran real-time, status RPP)
  │    └─ Akses via kioskToken (SchoolProfile, rotatable)
  ├─ Executive dashboard: analytics, heatmap performa siswa
  ├─ Review RPP submissions (final approval)
  ├─ Audit log review (/dashboard/audit)
  ├─ WA Log monitoring (/dashboard/wa-log)
  └─ Approve SPP payments (separation of duties)

WAKA_KURIKULUM:
  ├─ Review RPP (approved → LMS hook; revision → catatan)
  └─ Learning achievement analytics (KKTP compliance per mapel)
```

### 9.6 Peran Pendukung

| Role | Fungsi | Dashboard |
|---|---|---|
| GURU_BK | Bimbingan konseling — akses pola kehadiran & nilai siswa | Dashboard siswa/nilai |
| BENDAHARA | Laporan keuangan, co-approve SPP | Dashboard keuangan |
| INDUSTRI | Lowongan PKL/Prakerin, profil siswa untuk rekrutmen | `/dashboard/lowongan` |

### 9.7 Chatbot AI (Cross-Cutting)

> **Sumber kode:** `RagChunk`, `ChatSession`, `ChatMessage`, `AiGeneration` models; `ai.controller.ts`

```
Siswa/Guru: ajukan pertanyaan via chatbot
  ├─ ChatSession dibuat (per user)
  ├─ ChatMessage (role: user) disimpan
  │
  ├─ RAG Retrieval:
  │    ├─ Query text → Ollama nomic-embed-text → 768d vector
  │    ├─ pgvector cosine similarity search di RagChunk (isActive=true)
  │    └─ Top-K chunks diambil sebagai context
  │
  ├─ Generation:
  │    ├─ Context + user question → GPT-4.1-mini
  │    ├─ Response → ChatMessage (role: assistant) disimpan
  │    └─ AiGeneration audit: prompt, output, model, tokensUsed
  │
  └─ Fail-soft: jika AI down → pesan error graceful (UI tidak crash)
```

### 9.8 Pengumuman (Announcement)

> **Sumber kode:** `Announcement` model; `notification.listener.ts` L369-420

```
SA/KS/TU: buat pengumuman
  ├─ category: umum | akademik | keuangan | kegiatan | darurat
  ├─ priority: biasa | penting | urgent
  ├─ audience: ["ALL"] atau daftar role spesifik
  ├─ status: draft → published → archived
  └─ isPinned: boolean

Saat published:
  ├─ Emit announcement.published
  ├─ NotificationListener:
  │    └─ WA HANYA jika category=darurat ATAU priority=urgent
  │       (anti-spam: pengumuman biasa tidak kirim WA)
  └─ Push PWA notification
```

---

## 10. Fase 5 — Pipeline Rapor (Desember)

**Aktor:** GURU (Wali Kelas), WAKA_KURIKULUM, KEPALA_SEKOLAH, TATA_USAHA

### 10.1 State Machine Rapor

> **Sumber kode:** `enum ReportStatus` (schema.prisma L700-707); `report-cards.service.ts`

```
draft ──(Wali Kelas generate)──→ checked ──(WAKA review)──→ published ──(KS approve)──→ distributed ──(TU distribusi)
  ↑                                  │
  └────────── return (revisi) ───────┘
```

### 10.2 Pipeline Detail

| Tahap | Aktor | Aksi | Field/Status Update |
|---|---|---|---|
| **Generate** | GURU (Wali Kelas) | Kompilasi snapshot Grade + Attendance summary + catatan | `status=draft`, `grades` (JSON), `attendance` (JSON), `notes`, `generatedAt` |
| **Review** | WAKA_KURIKULUM | Periksa akurasi nilai, kehadiran, catatan | `status=checked`, `checkedAt` — atau return → `status=draft` |
| **Approve & Publish** | KEPALA_SEKOLAH | Final approval | `status=published`, `publishedAt` |
| **Distribute** | TATA_USAHA | Bagikan ke siswa & orang tua | `status=distributed`, `distributedAt` |

### 10.3 Snapshot Immutability

Saat `status=published`, field `grades` dan `attendance` adalah **JSON snapshot yang immutable**. Struktur JSON:

```json
// grades (SubjectSnapshot[])
[
  {
    "subject": "Matematika",
    "count": 8,
    "average": 82.5,
    "byType": {
      "uh": [80, 85, 78, 90],
      "uts": [85],
      "uas": [88]
    }
  }
]

// attendance
{
  "hadir": 95,
  "izin": 3,
  "sakit": 2,
  "alpha": 0
}
```

Perubahan nilai setelah publikasi **tidak mengubah rapor yang sudah terbit**. Rapor mencerminkan snapshot pada saat `publishedAt`.

### 10.4 Unique Constraint

```
@@unique([studentId, academicYear, semester])
```

Satu siswa hanya bisa punya satu rapor per tahun ajaran per semester.

### 10.5 Event Distribusi

```
ReportCardsService.distribute()
  ├─ Update status → distributed
  ├─ Emit report.distributed
  │    └─ NotificationListener: WA ke orang tua ("Rapor telah terbit")
  └─ Push notification ke siswa & orang tua
```

### 10.6 Akses Rapor

| Role | Akses |
|---|---|
| SISWA | Lihat rapor sendiri (`/dashboard/rapor`) |
| ORANG_TUA | Lihat rapor anak (RaporModal) |
| GURU (Wali) | Generate, edit catatan |
| WAKA_KURIKULUM | Review semua rapor |
| KS | Approve & publish |
| TU | Distribusi |

---

## 11. Fase 6 — Penutupan Semester Ganjil (Desember Akhir)

**Aktor:** KS, WAKA_KURIKULUM, GURU

| # | Aksi | Detail |
|---|---|---|
| 6.1 | KS: Audit & analitik akhir semester | Executive dashboard: rekap kehadiran, nilai, completion RPP |
| 6.2 | WAKA: Laporan capaian belajar | Per-mapel: KKTP compliance, heatmap performa, progress CP |
| 6.3 | GURU: Arsip LmsModule | `status: published → archived` |
| 6.4 | GURU: Arsip AssessmentSession | `status: active → completed` |
| 6.5 | Sistem: Transisi semester | Close Semester 1 (`isActive → false`), persiapan Semester 2 |

---

## 12. Pemetaan Integrasi Lintas-Modul

### 12.1 PPDB → Student → Academic

```
PpdbLead (8-status pipeline)
  → accepted → StudentService.create()
  → student.enrolled → WA welcome ortu
  → [PLANNED: SppPayment auto-create]
  → Class.assignment → TeachingAssignment → Schedule
```

### 12.2 RPP → LMS → Assessment → Grade

```
RPP (draft → submitted → approved)
  → rpp.reviewed(approved) → LmsEventListener
  → Auto-create draft LmsModule (idempoten)
  → GURU publish LmsModule (draft → published)
  → GURU activate → Siswa akses materi
  → AssessmentSession (draft → active)
  → AssessmentResponse (per siswa)
  → gradeAll() → [diagnostik: skip] [formatif/sumatif: Grade]
  → grade.submitted → XP + Badge + WA
```

### 12.3 Grade → Gamifikasi → Notifikasi

```
Grade (uts/uh/uas/praktik/sikap)
  → grade.submitted
  ├─→ GamificationListener → addXp → XpTransaction
  │    → emit xp.awarded [PLANNED: notification]
  ├─→ BadgesListener → check criteria → StudentBadge
  │    → emit badge.awarded [PLANNED: notification]
  └─→ NotificationListener → WA ke orang tua
```

### 12.4 Keuangan → Notifikasi

```
SppPayment
  ├─ TU: create (unpaid) → recordedBy
  ├─ SA/KS: approve (paid) → approvedBy, approvedAt
  └─ payment.received → WA ke siswa + orang tua (kwitansi)
```

### 12.5 RBAC & Kepegawaian

```
Position → PositionPermission → UserPermissionOverride → granular access
StaffPosition (terikat AcademicYear, rotatable)
  → Staff (NIY, employmentStatus)
  → User (identitas)
  → Teacher (jika mengajar)
```

### 12.6 AI Integration

```
RPP body → AI generate soal → Question/QuestionSet → AssessmentSession
Knowledge docs → RagChunk embedding (768d pgvector) → Chatbot RAG retrieval
Semua AI output → AiGeneration audit trail
```

### 12.7 Audit Trail

```
AuditLog: SEMUA operasi tulis
  ├─ actorId (Keycloak sub), actorUsername, actorRoles (denormalized forensik)
  ├─ action, resourceType, resourceId
  ├─ method, path, statusCode, outcome (success/failure)
  ├─ ip, userAgent
  └─ metadata (PII-minimal: field names + non-sensitive values)
```

---

## 13. Matriks Role × Aksi

> ✅ = dapat melakukan · 👁 = read-only · (Role) = butuh position code · — = tidak ada akses

| Aksi | SA | KS | TU | GURU | SISWA | ORTU | INDUSTRI |
|---|---|---|---|---|---|---|---|
| Provisioning user | ✅ | 👁 | — | — | — | — | — |
| Kelola struktur org | ✅ | 👁 | — | — | — | — | — |
| Buat RPP | — | — | — | ✅ | — | — | — |
| Review RPP | — | ✅ | — | (WAKA) | — | — | — |
| Buat/buka asesmen | — | — | — | ✅ | — | — | — |
| Kerjakan asesmen | — | — | — | — | ✅ | — | — |
| Catat kehadiran | — | — | — | ✅ | — | — | — |
| Input nilai | — | — | — | ✅ | — | — | — |
| Catat SPP | ✅ | — | ✅ | — | — | — | — |
| Approve SPP | ✅ | ✅ | — | — | — | — | — |
| Generate rapor | — | — | — | (Wali) | — | — | — |
| Approve rapor | — | ✅ | — | — | — | — | — |
| Distribusi rapor | ✅ | — | ✅ | — | — | — | — |
| Lihat dashboard ortu | — | — | — | — | — | ✅ | — |
| Lowongan PKL | — | — | — | — | — | — | ✅ |
| Audit log | ✅ | ✅ | — | — | — | — | — |

---

## 14. Pola Arsitektur Kunci

### 14.1 Event-Driven, Fail-Soft

Operasi inti (database write) tidak pernah terblokir kegagalan notifikasi/badge/XP. Semua listener dibungkus `try/catch` dengan logging.

### 14.2 Idempotent Operations

- RPP → LMS hook: cek existing `rppId` sebelum create
- Assessment grading: cek existing Grade → update instead of duplicate
- WA notification: `refType + refId` idempotency key di NotificationLog

### 14.3 Separation of Duties

TU mencatat pembayaran (`finance.create`), SA/KS menyetujui (`finance.approve`). TU tidak bisa self-approve. Mencegah fraud single-actor.

### 14.4 Soft Delete

User, Student, Teacher, Staff memiliki `deletedAt`. Penghapusan tidak permanen — audit trail tetap utuh. Query default exclude `deletedAt != null`.

### 14.5 PDP Compliance (R-05)

`User.consentAt` melacak persetujuan data. AuditLog bersifat **PII-minimal**: actorId, username, roles (denormalisasi forensik) — tidak menyimpan kredensial, body sensitif, atau PII mentah.

### 14.6 Honest Empty States

Dashboard menampilkan data real. Fallback SIM (simulasi) hanya saat API gagal — tidak ada data palsu di production. Empty state jujur lebih baik daripada data fiktif.

### 14.7 Forward-Compatibility

- Schedule menggunakan JP (bukan jam dinding) — siap untuk TimetableEntry Tahap 2
- Attendance siap menerima `sessionId?` (nullable, additive migration)
- Tidak ada hardcode nilai spesifik sekolah (nama, domain, realm, kode jurusan) — pakai config

### 14.8 Snapshot Immutability

Rapor published = `grades` dan `attendance` JSON terkunci. Perubahan nilai setelah publikasi tidak mengubah rapor yang sudah terbit.

---

## 15. Status Implementasi — Catatan Jujur

Area yang **belum sepenuhnya siap produksi**, ditandai secara jujur:

| # | Area | Status | Catatan |
|---|---|---|---|
| 1 | Enrollment auto-create SppPayment | **PLANNED** | Saat ini SppPayment dibuat manual per transaksi, bukan otomatis saat enrollment |
| 2 | Enrollment auto-init StudentXp | **PLANNED** | StudentXp diinisialisasi saat `grade.submitted` pertama (lazy-init via GamificationListener) |
| 3 | Badge notification (WA/Push ke siswa) | **PLANNED** | Event `badge.awarded` didefinisikan, tapi belum ada listener yang kirim notifikasi |
| 4 | XP notification (in-app) | **PLANNED** | Event `xp.awarded` didefinisikan, tapi belum ada listener yang kirim notifikasi |
| 5 | LmsModuleProgress XP award | **PLANNED** | XP saat ini hanya dari `grade.submitted`; completion modul belum memicu XP |
| 6 | KBM Tahap 2 (TimetableEntry, ClassSession) | **DESIGNED** | Lihat `docs/tahap2-kbm-design.md` — desain, bukan implementasi |
| 7 | Attendance streak badge (daily cron) | **PLANNED** | Butuh scheduled job/cron untuk cek streak harian |
| 8 | Essay auto-grading | **MANUAL** | Rubrik tersedia di `Question.rubric` (JSONB), tapi grading butuh input manual guru |

---

> **Catatan akhir:** Dokumen ini telah melalui 4 ronde iterasi analisis kritis. Setiap klaim teknis divalidasi terhadap kode sumber: `schema.prisma` (1.457 baris), 38 API controller, 4 event listener, dan `events.types.ts`. Area yang belum diimplementasi ditandai **[PLANNED]** secara eksplisit — tidak ada klaim fiktif.
>
> **Maintenance:** Dokumen ini hidup. Saat fitur baru diimplementasi, update bagian terkait dan ubah status dari **[PLANNED]** menjadi aktif. Saat model baru ditambahkan, update §3 Skema Database.

---

*Diperbarui: 2026-07-12 · Validasi codebase: `schema.prisma@1457L`, 38 controllers, 4 listeners, `events.types.ts`*
