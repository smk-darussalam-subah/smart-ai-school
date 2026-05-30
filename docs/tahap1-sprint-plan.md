# Sprint Plan Tahap 1 — DIIS Smart AI School

> **Status:** Design Gate Document — Sprint-0 selesai → Tahap 1 resmi dibuka
> **Dibuat:** 2026-05-30 | **Model:** Claude Sonnet 4.6
> **Sumber referensi:** Laporan System Analyst v2.0 (2026-05-29), `CLAUDE.md`, `schema.prisma`
> **Constraint immutable:** Tech stack §3, 7 role §6 — tidak berubah.

---

## 1. Ringkasan & Tujuan Tahap 1

### Visi Tahap 1

Tahap 1 membangun **core operasional sekolah** — modul yang digunakan setiap hari oleh semua aktor. Tahap 0 meletakkan infrastruktur (Docker, auth, CI/CD). Tahap 1 mengisi sistem dengan fitur nyata yang menggantikan kerja manual.

### Modul yang Dibangun

| Modul | Prioritas | Justifikasi |
|---|---|---|
| Student Management | P0 — wajib | Basis data semua modul lain |
| Academic (kelas, jadwal, nilai, absensi) | P0 — wajib | Inti operasional harian guru |
| PPDB Pipeline | P0 — wajib | Revenue sekolah bergantung pada ini |
| Finance basic (SPP/BOS) | P1 — penting | Keuangan = reporting rutin TU |
| AI Chatbot MVP (RAG) | P1 — penting | Differentiator "Smart AI School" |
| Notification adapter | P1 — penting | Dependensi semua modul untuk alert |
| Dashboard eksekutif KS | P2 — nice | Agregasi dari modul lain |

### Definition of Done Tahap 1

- Semua endpoint API P0 terimplementasi, test coverage ≥ 70%, lulus CI
- RBAC ditegakkan di setiap endpoint (tidak ada endpoint tanpa guard)
- Data siswa nyata dari TU bisa diinput dan ditampilkan di portal siswa
- Guru bisa input nilai dan absensi dari web
- PPDB lead masuk via form → diproses TU → status terupdate
- Chatbot menjawab FAQ sekolah (RAG dari dokumen lokal, Ollama)
- Semua keputusan desain ini (N-1, N-2, T-12, T-09) terimplementasi dalam kode

---

## 2. ERD Final + Keputusan Model Data

### 2.1 Keputusan N-2 — Konsolidasi KnowledgeDocument + AiDocument

**Masalah:** Dua model RAG yang tidak konsisten:
- `KnowledgeDocument` (schema `ai_knowledge`): punya `title`, `content`, `source`, `category`, `isActive` — tapi **tidak ada embedding**
- `AiDocument` (schema `ai_knowledge`): punya `content`, `embedding vector(1536)`, `source`, `metadata` — tapi **tidak ada title, category, isActive**

**Keputusan: Ganti keduanya dengan satu model `RagChunk`**

*Alasan: satu model → satu tabel → RAG pipeline tidak perlu JOIN; field embedding dan metadata terpisah tidak ada gunanya tanpa konteks (title, category).*

**⚠️ Keputusan Embedding Model & Dimensi (wajib ditetapkan sebelum SMA-44):**

`AiDocument` memakai `vector(1536)` — dimensi OpenAI `text-embedding-ada-002`. Tapi decision tree §6 menetapkan Ollama untuk data PII (lokal). Model embedding Ollama yang umum dipakai **bukan** 1536 dimensi:

| Model Ollama | Dimensi | Kecepatan | Akurasi Bahasa Indonesia |
|---|---|---|---|
| `nomic-embed-text` | **768** | Cepat | Cukup (multibahasa) |
| `mxbai-embed-large` | **1024** | Sedang | Lebih baik |
| `llama3.1:8b` (embedding) | 4096 | Lambat | Baik |

**Pilihan Tahap 1: `nomic-embed-text` → `vector(768)`.**
*Alasan: ringan (Q4 quantized ≈ 270MB), sudah dioptimasi untuk retrieval, bisa jalan di VPS tanpa GPU. Jika akurasi kurang di Tahap 2, migrasi dimensi via migration baru (perlu re-embed semua chunk).*

> **Aturan keras:** dimensi `vector(N)` di tabel PostgreSQL HARUS sama persis dengan output dimensi model embedding yang dipakai. Mismatch → pgvector error saat INSERT. Catat dimensi yang dipilih di `.env` sebagai `OLLAMA_EMBED_MODEL=nomic-embed-text` dan `OLLAMA_EMBED_DIMENSIONS=768`, gunakan keduanya sebagai single source of truth di `AIGateway.embed()`.

```prisma
// AKAN DIBUAT di Tahap 1 — menggantikan KnowledgeDocument + AiDocument
// Embedding model: nomic-embed-text via Ollama → 768 dimensi
model RagChunk {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title       String   @db.VarChar(500)
  content     String   @db.Text                        // teks asli untuk display
  embedding   Unsupported("vector(768)")?              // nomic-embed-text = 768d
  source      String   @db.VarChar(255)                // nama file / URL asal
  category    String   @db.VarChar(100)                // faq, peraturan, jadwal, dll
  metadata    Json?                                    // page number, section, dll
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([category])
  @@index([isActive])
  @@map("rag_chunks")
  @@schema("ai_knowledge")
}
```

**Migration plan:** Buat migration baru yang DROP `documents` + `ai_documents`, CREATE `rag_chunks`. Data lama dimigrasikan via script seed (jumlah sedikit, masih dev data).

### 2.2 Keputusan T-12 — Boundary academic vs teacher

**Masalah:** `Class` (schema `academic`) punya `teacherId` yang merujuk ke `Teacher` (schema `teacher`). Boundary kabur: data mengajar ada di satu tempat, identitas guru di tempat lain, tidak ada model untuk jadwal/mata pelajaran.

**Keputusan: Pisah concern dengan aturan boundary ketat:**

| Schema | Tanggung Jawab | Model |
|---|---|---|
| `teacher` | Identitas SDM guru (siapa, NIP, HR) | `Teacher` (sudah ada) |
| `academic` | Operasional akademik (mengajar apa, kapan, nilai siapa) | `Class`, `TeachingAssignment`*, `Grade`*, `Attendance`* |

*Model baru di Tahap 1.

`teacherId` di `Class` tetap ada (wali kelas = identitas SDM yang relevan ke kelas). Jadwal mengajar (`TeachingAssignment`) ada di schema `academic` karena itu operasional, bukan HR.

**Model baru yang akan dibuat di Tahap 1:**

```prisma
// schema: academic
model TeachingAssignment {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  teacherId   String   @map("teacher_id") @db.Uuid      // ref ke teacher.teachers
  classId     String   @map("class_id") @db.Uuid
  subject     String   @db.VarChar(100)                 // Matematika, B.Indonesia, dll
  hoursPerWeek Int     @default(2) @map("hours_per_week")
  academicYear String  @map("academic_year") @db.VarChar(9)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@unique([teacherId, classId, subject, academicYear])
  @@map("teaching_assignments")
  @@schema("academic")
}

model Grade {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId    String   @map("student_id") @db.Uuid
  assignmentId String   @map("assignment_id") @db.Uuid  // ref TeachingAssignment
  semester     Int                                      // 1 atau 2
  academicYear String   @map("academic_year") @db.VarChar(9)
  score        Decimal  @db.Decimal(5, 2)
  type         GradeType
  notes        String?  @db.Text
  submittedBy  String   @map("submitted_by") @db.Uuid   // teacherId
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@index([studentId, academicYear, semester])
  @@map("grades")
  @@schema("academic")
}

enum GradeType { uts uh uas praktik sikap @@schema("academic") }

model Attendance {
  id          String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId   String           @map("student_id") @db.Uuid
  classId     String           @map("class_id") @db.Uuid
  date        DateTime         @db.Date
  status      AttendanceStatus
  notes       String?          @db.Text
  recordedBy  String           @map("recorded_by") @db.Uuid  // teacherId
  createdAt   DateTime         @default(now()) @map("created_at")

  @@unique([studentId, classId, date])
  @@index([classId, date])
  @@map("attendance")
  @@schema("academic")
}

enum AttendanceStatus { hadir izin sakit alpha @@schema("academic") }
```

### 2.3 Keputusan N-1 — Finance & Notification schema kosong

**Masalah:** `datasource.schemas` mendaftarkan `finance` dan `notification` tapi tidak ada satu pun model di dalamnya. Ini memunculkan schema kosong di database tanpa tujuan.

**Keputusan: Buat model minimal di Tahap 1, JANGAN hapus deklarasi schema.**

*Alasan: Migration sudah berjalan dengan deklarasi schema ini. Menghapus dari list `schemas` akan membuat Prisma mencoba DROP schema di database production — berbahaya. Lebih aman: isi dengan model minimal.*

**Finance — model minimal Tahap 1:**

```prisma
// schema: finance
model SppPayment {
  id          String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId   String        @map("student_id") @db.Uuid
  month       Int                                    // 1-12
  year        Int
  amount      Decimal       @db.Decimal(12, 2)
  status      PaymentStatus @default(unpaid)
  paidAt      DateTime?     @map("paid_at")
  receiptNo   String?       @unique @map("receipt_no") @db.VarChar(50)
  recordedBy  String?       @map("recorded_by") @db.Uuid
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  @@unique([studentId, month, year])
  @@index([status, year, month])
  @@map("spp_payments")
  @@schema("finance")
}

enum PaymentStatus { unpaid paid late waived @@schema("finance") }
```

**Notification — model minimal Tahap 1:**

```prisma
// schema: notification
model NotificationLog {
  id        String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipient String             @db.VarChar(100)    // nomor WA atau email
  channel   NotifChannel
  subject   String?            @db.VarChar(255)
  body      String             @db.Text
  status    NotifStatus        @default(pending)
  sentAt    DateTime?          @map("sent_at")
  error     String?            @db.Text
  refType   String?            @map("ref_type")    // "grade", "payment", "ppdb"
  refId     String?            @map("ref_id") @db.Uuid
  createdAt DateTime           @default(now()) @map("created_at")

  @@index([recipient, createdAt])
  @@index([status])
  @@map("notification_logs")
  @@schema("notification")
}

enum NotifChannel { whatsapp email push @@schema("notification") }
enum NotifStatus  { pending sent failed @@schema("notification") }
```

### 2.4 ERD Ringkas (entitas yang sudah ada + baru)

```
auth.users ─────────────────────────────────────────────────────────
  │ 1                                                               │
  ├──1 student.students ──────────────────────────────────────────  │
  │     │                                                           │
  │     ├── academic.classes (via classId)                          │
  │     ├── academic.grades (via studentId)                         │
  │     ├── academic.attendance (via studentId)                     │
  │     └── finance.spp_payments (via studentId)                    │
  │                                                                 │
  └──1 teacher.teachers ─────────────────────────────────────────   │
        │                                                           │
        ├── academic.classes (via teacherId = wali kelas)           │
        └── academic.teaching_assignments (via teacherId)           │
                                                                    │
ppdb.leads ──── assigned_to ────────────────────────────────────────┘

ai_knowledge.rag_chunks (standalone — tidak berelasi ke entitas bisnis)
notification.notification_logs (log saja — bukan foreign key ke entitas lain)
```

---

## 3. API Contract Prioritas

Format: `METHOD /api/v1/path → [roles] → response`

Semua endpoint di bawah `api/v1/` kecuali `health` dan `metrics` (sudah ada).

### 3.1 Auth / User

| Method | Path | Roles | Response |
|---|---|---|---|
| GET | `/auth/me` | semua | `{id, email, fullName, role, keycloakId}` |
| PATCH | `/auth/me` | semua | update phone/avatar diri sendiri |

### 3.2 Student

| Method | Path | Roles yang boleh | Catatan |
|---|---|---|---|
| GET | `/students` | SA, KS(r), TU, Guru(r) | query: classId, status, search |
| GET | `/students/:id` | SA, TU, Guru(r), Siswa(self), OrangTua(anak) | |
| POST | `/students` | SA, TU | body: CreateStudentDto (Zod) |
| PATCH | `/students/:id` | SA, TU | partial update |
| DELETE | `/students/:id` | SA | soft delete (set deletedAt) |
| GET | `/students/:id/grades` | SA, TU(r), Guru(r), Siswa(self), OrangTua(anak) | |
| GET | `/students/:id/attendance` | SA, TU(r), Guru, Siswa(self), OrangTua(anak) | |

### 3.3 Academic

| Method | Path | Roles | Catatan |
|---|---|---|---|
| GET | `/classes` | SA, KS(r), TU, Guru(own) | |
| POST | `/classes` | SA, TU | |
| GET | `/classes/:id/students` | SA, TU, Guru(assigned) | |
| GET | `/teaching-assignments` | SA, Guru(own) | |
| POST | `/teaching-assignments` | SA, TU | assign guru ke mapel+kelas |
| POST | `/grades` | Guru | body: {studentId, assignmentId, score, type, semester} |
| GET | `/grades` | SA, TU(r), Guru(own class), Siswa(self), OrangTua(anak) | query: classId, studentId, semester |
| PATCH | `/grades/:id` | SA, Guru(own, dalam 7 hari sejak submit) | jendela edit = 7 hari kalender |
| POST | `/grades/:id/approve` | SA | lock nilai agar tidak bisa diedit lagi |
| POST | `/attendance` | Guru | bulk: array [{studentId, status}] per date+classId |
| GET | `/attendance` | SA, TU(r), Guru(own), Siswa(self), OrangTua(anak) | query: classId, date range |
| GET | `/schedules` | semua authenticated | filter by classId/teacherId |

### 3.4 PPDB

| Method | Path | Roles | Catatan |
|---|---|---|---|
| POST | `/ppdb/leads` | `@Public()` | public form calon siswa — lihat proteksi di bawah |
| GET | `/ppdb/leads` | SA, KS(r), TU | query: status, source, date |
| GET | `/ppdb/leads/:id` | SA, TU | detail + history |
| PATCH | `/ppdb/leads/:id/status` | SA, TU | transisi status LeadStatus |
| PATCH | `/ppdb/leads/:id/assign` | SA, TU | assign ke staff |
| GET | `/ppdb/stats` | SA, KS, TU | count per status, conversion rate |
| POST | `/ppdb/leads/:id/approve` | SA, TU | approve lead → status accepted |

**⚠️ `POST /ppdb/leads` adalah endpoint public-write — wajib tiga lapis proteksi (SMA-34):**

1. **Rate-limit ketat per-IP:** `@Throttle({ ppdb: { ttl: 300_000, limit: 10 } })` — maksimal 10 submit per 5 menit per IP. Berbeda dari global throttle (100 req/menit) karena endpoint ini menulis ke DB tanpa auth.

2. **Validasi Zod strict:** semua field wajib divalidasi — panjang string, format nomor HP (regex Indonesia `^62\d{9,12}$`), enum `interestMajor`. Body yang tidak sesuai schema → 400 langsung, tidak masuk DB.

3. **Honeypot field anti-bot:** Tambahkan field tersembunyi `_hp` di schema form (hidden via CSS, bukan `display:none`). Jika `_hp` terisi → bot → tolak dengan 200 palsu (jangan 400, agar bot tidak tahu). Field ini tidak disimpan ke DB.

Captcha (reCAPTCHA/hCaptcha) dipertimbangkan jika abuse terdeteksi di production — tidak wajib Sprint 1 tapi arsitektur harus memungkinkan penambahan tanpa refactor besar.

### 3.5 Finance

| Method | Path | Roles | Catatan |
|---|---|---|---|
| GET | `/finance/spp` | SA, KS(r), TU, Siswa(self), OrangTua(anak) | query: studentId, year, status |
| POST | `/finance/spp` | SA, TU | record pembayaran |
| GET | `/finance/spp/summary` | SA, KS, TU | total per bulan/tahun |
| GET | `/finance/spp/:studentId/history` | SA, TU, Siswa(self), OrangTua(anak) | |
| POST | `/finance/spp/:id/approve` | SA, KS | konfirmasi pembayaran yang diinput TU |

### 3.6 AI Chatbot

| Method | Path | Roles | Catatan |
|---|---|---|---|
| POST | `/ai/chat` | semua authenticated | body: {message, sessionId?} |
| GET | `/ai/chat/:sessionId/history` | user sendiri + SA | riwayat percakapan |
| POST | `/ai/knowledge` | SA | upload dokumen ke RAG |
| GET | `/ai/knowledge` | SA | list dokumen RAG |

---

## 4. RBAC Matrix Granular

Simbol: ✅ full access · 👁 read only · 🔒 hanya milik sendiri · ➕ create · ✏️ update · ❌ delete · - tidak ada akses

| Resource | SA | KS | TU | Guru | Siswa | OrangTua | Industri |
|---|---|---|---|---|---|---|---|
| **users** | ✅ | 👁 | 👁 | 👁 | 🔒 | - | - |
| **students** — baca | ✅ | ✅ | ✅ | ✅ | 🔒 | 🔒(anak) | - |
| **students** — tulis | ✅ | - | ✅ | - | - | - | - |
| **students** — hapus | ✅ | - | - | - | - | - | - |
| **classes** | ✅ | 👁 | ✅ | 👁(assigned) | 👁 | - | - |
| **teaching-assignments** | ✅ | 👁 | ✅ | 👁(own) | - | - | - |
| **grades** — baca | ✅ | ✅ | 👁 | ✅(own class) | 🔒 | 🔒(anak) | - |
| **grades** — tulis | ✅ | - | - | ✅(own, ≤7 hari) | - | - | - |
| **grades** — approve (lock) | ✅ | - | - | - | - | - | - |
| **attendance** — baca | ✅ | ✅ | 👁 | ✅(own class) | 🔒 | 🔒(anak) | - |
| **attendance** — tulis | ✅ | - | - | ✅ | - | - | - |
| **ppdb/leads** — baca | ✅ | ✅ | ✅ | - | - | - | - |
| **ppdb/leads** — tulis | ✅ | - | ✅ | - | - | - | - |
| **ppdb/leads** — hapus | ✅ | - | - | - | - | - | - |
| **finance/spp** — baca | ✅ | ✅ | ✅ | - | 🔒 | 🔒(anak) | - |
| **finance/spp** — tulis | ✅ | - | ✅ | - | - | - | - |
| **finance/spp** — approve | ✅ | ✅ | - | - | - | - | - |
| **ai/chat** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| **ai/knowledge** — upload | ✅ | - | - | - | - | - | - |
| **ai/knowledge** — baca | ✅ | ✅ | - | - | - | - | - |
| **notif logs** | ✅ | - | - | - | - | - | - |
| **metrics/monitoring** | ✅ | - | - | - | - | - | - |

**Catatan implementasi RBAC:**
- Guard urutan: `ThrottlerGuard` → `KeycloakGuard` → `RolesGuard`
- Resource ownership check (`🔒`) diimplementasikan di service layer, bukan di guard
- Guru "own class" = cek via `TeachingAssignment.teacherId === currentUser.teacherId`
- **INDUSTRI = tidak ada akses di Tahap 1.** Ini disengaja — modul PKL/Prakerin dan BKK/Rekrutmen (satu-satunya modul yang relevan untuk role INDUSTRI) baru dibangun di Tahap 2. User dengan role INDUSTRI yang login akan mendapat 403 di semua endpoint Tahap 1 kecuali `/auth/me`.

---

## 5. Event Architecture

Tahap 1 menggunakan **NestJS EventEmitter2** (in-process, synchronous → async via `async: true` option) untuk event internal. Message broker (Redis Pub/Sub atau BullMQ) masuk di Tahap 2 jika skala butuhkan.

### Event Map

```
PRODUCER                    EVENT                        CONSUMER(s)
─────────────────────────────────────────────────────────────────────
StudentService          student.enrolled             FinanceService
                                                     (create SPP record bulan ini)
                                                     NotificationService
                                                     (WA selamat datang ke orang tua)

StudentService          student.statusChanged        NotificationService
                        (active→graduated/dropped)   (WA notif ke siswa + orang tua)

PpdbService             ppdb.lead.statusChanged      NotificationService
                                                     (WA follow-up otomatis via n8n)
                                                     AiService
                                                     (log untuk analisis konversi)

GradeService            grade.submitted              NotificationService
                                                     (WA ringkasan nilai ke orang tua,
                                                      batched per akhir semester)
                                                     AcademicService
                                                     (update ranking kelas)

AttendanceService       attendance.recorded          NotificationService
                        (status: alpha/sakit)        (WA notif hari itu ke orang tua)

FinanceService          payment.received             NotificationService
                                                     (WA kwitansi digital ke siswa/OT)
                                                     FinanceService
                                                     (update saldo BOS jika sumber BOS)
```

### ASCII Diagram

```
[StudentService]──student.enrolled──→[FinanceService] → create SppPayment baru
                                  └─→[NotificationService] → WA via NotifAdapter

[GradeService]──grade.submitted──→[NotifService] → queue notif batch end-of-semester
                                └─→[AcademicService] → recalc ranking

[AttendanceService]──attendance.recorded──→[NotifService]
        (alpha/sakit saja)                   → WA immediate ke OrangTua

[EventEmitter2]  ← semua event di-emit via @OnEvent() listener
```

**Guardrail:** NotificationService tidak langsung kirim WA — selalu melalui `NotificationAdapter` yang bisa di-mock saat test.

**⚠️ Durability caveat — EventEmitter2 in-process:**

EventEmitter2 adalah in-memory, synchronous (atau async dalam satu proses). Jika proses Node.js crash **setelah** event di-emit tapi **sebelum** consumer selesai, event hilang tanpa trace. Untuk notifikasi kritis (pembayaran, enrollment), ini risiko nyata.

**Mitigasi Tahap 1 (tanpa broker):**
- Semua event yang trigger notifikasi juga menulis ke tabel `notification.notification_logs` dengan `status: pending` **sebelum** event di-emit.
- `NotificationService` update status ke `sent` atau `failed` setelah kirim.
- Startup hook (`onModuleInit`): scan `notification_logs` dengan `status: pending` yang berumur > 5 menit → retry. Ini recovery sederhana dari crash.

**Tahap 2:** Migrasi event kritis ke BullMQ (Redis-backed queue) dengan retry otomatis dan dead-letter queue. EventEmitter2 tetap untuk event non-kritis (ranking update, log analitik).

---

## 6. AI Orchestration Decision Tree (T-09)

### Keputusan T-09: AIGateway + NotificationAdapter

**Masalah saat ini:** Tidak ada abstraksi — jika ingin pakai Ollama atau Claude, harus hardcode di masing-masing service. Tidak testable, tidak swappable.

**Solusi: Dua adapter interface**

#### AIGateway Interface

```typescript
// packages/types/src/ai-gateway.interface.ts
export interface AIGateway {
  chat(prompt: string, context?: RagChunk[]): Promise<string>;
  embed(text: string): Promise<number[]>;
}

// Implementasi:
// OllamaAdapter  → http://ollama:11434 (lokal, data sensitif)
// ClaudeAdapter  → Anthropic API (eksternal, data HARUS dianonimisasi)
```

#### NotificationAdapter Interface

```typescript
export interface NotificationAdapter {
  send(channel: 'whatsapp' | 'email', to: string, body: string): Promise<void>;
}

// Implementasi:
// FonnteAdapter  → https://api.fonnte.com/send
// SmtpAdapter    → SMTP (Nodemailer)
// LogAdapter     → console.log saja (untuk test/dev)
```

#### Decision Tree: Kapan Pakai Yang Mana

```
User mengirim query ke AI
        │
        ▼
Apakah query/konteks mengandung data PII?
(nama siswa, NIS, nilai, data keuangan, data pribadi)
        │
     YES │                          NO
        ▼                           ▼
   Ollama (lokal)            Apakah butuh reasoning kompleks?
   Model: qwen2.5:7b              │
   atau llama3.1:8b            YES │                 NO
   Data tidak keluar               ▼                  ▼
   server                    Claude API          Ollama
                             (Anthropic)         (lebih cepat,
                             Wajib: strip PII    gratis)
                             sebelum kirim
                                   │
                             Claude 3.5 Haiku
                             (cost-efficient
                              untuk chatbot)
```

**Aturan anonimisasi sebelum Claude API:**
- Strip nama siswa → `[SISWA]`
- Strip NIS → `[NIS]`
- Strip nilai spesifik → `[DATA_AKADEMIK]`
- Hanya kirim konteks umum (kebijakan sekolah, FAQ, info jurusan)

**Kapan Custom ML (Tahap 3):**
- Prediksi risiko dropout
- Rekomendasi bimbingan belajar
- Analisis pola absensi
- Tidak masuk Tahap 1

#### AIGateway di AppModule

```typescript
// AIGateway di-provide sebagai global provider, implementasi dipilih via env
{
  provide: 'AI_GATEWAY',
  useFactory: (config: ConfigService) =>
    config.get('AI_PROVIDER') === 'claude'
      ? new ClaudeAdapter(config.get('ANTHROPIC_API_KEY'))
      : new OllamaAdapter(config.get('OLLAMA_URL')),
  inject: [ConfigService],
}
```

---

## 7. Breakdown Task per Sprint

**Tahap 1 = 4 Sprint × 2 minggu = 8 minggu total**
Mulai: setelah dokumen ini di-approve oleh Kang Sholah.

> **Catatan estimasi:** Jam yang tercantum adalah waktu coding bersih. Tambahkan buffer ~30% per sprint untuk: review PR, bugfix integrasi, iterasi setelah feedback Kang Sholah, dan ops (deploy, rollback, VPS issue). Sprint 2-jam coding efektif ≈ 3 jam kalender nyata. Sprint dengan banyak integrasi (Sprint 3) cenderung lebih panjang dari estimasi.

### Sprint 1 (Minggu 1–2): Foundation + Student + PPDB

| Task | SMA-# | Estimasi | Depends |
|---|---|---|---|
| Migration schema baru (N-1, N-2, T-12) | SMA-31 | 3 jam | — |
| Student module CRUD (NestJS + Zod) | SMA-32 | 4 jam | SMA-31 |
| Student self-service (portal siswa) | SMA-33 | 2 jam | SMA-32 |
| PPDB lead form public + pipeline TU | SMA-34 | 5 jam | SMA-31 |
| Auth `/me` endpoint + role propagation | SMA-35 | 2 jam | — |

**DoD Sprint 1:** Guru bisa cari siswa berdasarkan kelas. TU bisa input lead PPDB.

### Sprint 2 (Minggu 3–4): Academic Core

| Task | SMA-# | Estimasi | Depends |
|---|---|---|---|
| TeachingAssignment CRUD | SMA-36 | 3 jam | SMA-31 |
| Grade input + validasi (Guru) | SMA-37 | 4 jam | SMA-36 |
| Attendance bulk input (Guru) | SMA-38 | 3 jam | SMA-36 |
| Schedule view (semua role) | SMA-39 | 2 jam | SMA-36 |
| Portal nilai siswa + orang tua | SMA-40 | 2 jam | SMA-37 |

**DoD Sprint 2:** Guru bisa input nilai dan absensi. Siswa bisa lihat nilai sendiri.

### Sprint 3 (Minggu 5–6): Finance + AI MVP + Notification

| Task | SMA-# | Estimasi | Depends |
|---|---|---|---|
| Finance SPP CRUD (TU) | SMA-41 | 3 jam | SMA-31 |
| NotificationAdapter (Fonnte + SMTP) | SMA-42 | 3 jam | — |
| EventEmitter wiring (student→notif, grade→notif, payment→notif) | SMA-43 | 2 jam | SMA-42 |
| RAG migration → RagChunk + seeder dokumen FAQ | SMA-44 | 3 jam | SMA-31 |
| AIGateway interface + OllamaAdapter | SMA-45 | 3 jam | SMA-44 |
| Chatbot endpoint `/ai/chat` (Ollama RAG) | SMA-46 | 3 jam | SMA-45 |

**DoD Sprint 3:** TU bisa catat pembayaran SPP. Chatbot menjawab FAQ sekolah via Ollama.

### Sprint 4 (Minggu 7–8): Dashboard + Integrasi + Hardening

| Task | SMA-# | Estimasi | Depends |
|---|---|---|---|
| Dashboard KS (agregat: siswa aktif, SPP, absensi, leads) | SMA-47 | 4 jam | SMA-32..SMA-41 |
| ClaudeAdapter + decision tree (FAQ umum → Claude) | SMA-48 | 2 jam | SMA-45 |
| Integration test suite E2E | SMA-49 | 4 jam | semua P0 |
| Security audit (RBAC coverage check) | SMA-50 | 2 jam | semua P0 |
| Performance: query optimization + index review | SMA-51 | 2 jam | semua P0 |
| Dokumentasi API (Swagger / tabel) | SMA-52 | 2 jam | semua P0 |

**DoD Sprint 4 = DoD Tahap 1:** Semua modul P0 live, test hijau, KS punya dashboard.

---

## 8. Prasyarat Regulasi (Trek Paralel)

Trek ini berjalan **paralel** dengan sprint coding — kecuali R-05 yang merupakan **prasyarat keras** (bukan sekedar paralel) untuk input data siswa nyata.

| Regulasi | ID | Owner | Target | Status |
|---|---|---|---|---|
| DPIA (Data Protection Impact Assessment) — inventarisasi data pribadi siswa yang diproses | R-01 | Kang Sholah + Tata Usaha | Sprint 2 | ⏳ Belum |
| Anonimisasi data sebelum embedding/kirim ke Claude API — implementasi strip PII | R-03 | Claude Code (SMA-48) | Sprint 3 | ⏳ akan dikerjakan |
| DPA (Data Processing Agreement) dengan mitra industri yang akses data PKL/BKK | R-04 | Kang Sholah + Legal | Sprint 4 | ⏳ Belum |
| **UU PDP pasal 20: consent eksplisit orang tua untuk data siswa** | **R-05** | **Kang Sholah + TU** | **Sprint 1, Minggu 1 — SEBELUM input data produksi** | ⏳ Belum |

**⚠️ R-05 adalah BLOCKER untuk input data siswa nyata:**

Secara hukum (UU PDP Pasal 20), consent harus diperoleh **sebelum** data pribadi siswa dikumpulkan — bukan paralel, bukan retroaktif. Urutan yang benar:

1. **Sprint 1, Minggu 1:** Kang Sholah + TU menyiapkan form consent (bisa PDF/fisik) dan mendapat tanda tangan/persetujuan orang tua.
2. **Sprint 1, Minggu 1–2:** Coding modul Student (SMA-31, SMA-32) menggunakan **data dummy** (bukan data siswa nyata).
3. **Setelah consent terkumpul:** Baru TU boleh input data siswa produksi ke sistem.

> **Larangan keras:** Jangan input NIS, nama siswa nyata, nilai, atau data keuangan ke environment production sebelum R-05 selesai. Gunakan seed data dummy (`npm run db:seed`) untuk development dan testing.

**Catatan R-03 (teknis):** Strip PII diimplementasikan sebagai middleware di `ClaudeAdapter` sebelum setiap request ke Anthropic API. Fungsi ini di-test unit dengan data dummy yang mengandung nama dan NIS.

---

## Jawaban Eksplisit atas Temuan Laporan Analyst

| Temuan | Keputusan | Lokasi |
|---|---|---|
| **N-1** — finance & notification schema kosong | Buat model minimal di Sprint 1 (SMA-31). Tidak hapus deklarasi schema karena berbahaya untuk migration. | §2.3 |
| **N-2** — duplikasi KnowledgeDocument + AiDocument | Konsolidasi ke `RagChunk`. Model embedding ditetapkan: `nomic-embed-text` → `vector(768)`. Migration SMA-31 + SMA-44. | §2.1 |
| **T-12** — boundary academic vs teacher kabur | Aturan ketat: `teacher` schema = identitas SDM, `academic` schema = operasional mengajar. Tambah `TeachingAssignment`, `Grade`, `Attendance` di `academic`. | §2.2 |
| **T-09** — tidak ada AIGateway / NotificationAdapter | Interface `AIGateway` + `NotificationAdapter` di `packages/types`. Implementasi Ollama + Claude + Fonnte di Sprint 3 (SMA-42..SMA-46). | §6 |

---

*Dokumen ini adalah design gate — harus di-review dan di-approve Kang Sholah sebelum Sprint 1 coding dimulai.*
*Setelah approve: buat Linear issues SMA-31..SMA-52, assign ke sprint, mulai coding.*
