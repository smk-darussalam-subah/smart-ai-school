# LAPORAN AUDIT KOMPARATIF EKSTERNAL
## Proyek DIIS — Digital Integrated Information System / Smart AI Vocational School Ecosystem 5.0
### SMK Darussalam Subah

| | |
|---|---|
| **Jenis Dokumen** | Audit & Analisis Eksternal (Independen) |
| **Auditor** | Senior System Analyst & Software Architect (peran eksternal) |
| **Tanggal Audit** | 8 Juni 2026 |
| **Basis Komparasi** | 5 dokumen perencanaan vs. kondisi repositori `smart-ai-school` per 7–8 Juni 2026 |
| **Klasifikasi** | Internal — Terbatas |
| **Status Proyek Saat Audit** | Tahap 1 *DITUTUP* (backend + auth + fondasi); transisi ke Tahap 2 |

---

## RINGKASAN EKSEKUTIF

Proyek DIIS adalah salah satu inisiatif transformasi digital sekolah yang **jauh di atas rata-rata** dari sisi disiplin rekayasa. Berbeda dengan mayoritas proyek serupa yang gagal karena "langsung coding tanpa fondasi" (justru risiko yang diperingatkan sendiri di dokumen Tahap 0), DIIS menunjukkan fondasi yang nyata: monorepo Turborepo berjalan, 9 migrasi Prisma berurutan, 14 service Docker, 472 unit test, CI/CD GitHub Actions dengan database ephemeral, dan — yang paling membedakan — **disiplin tata kelola** berupa CLAUDE.md sebagai governance, `queue.md` sebagai *single source of truth* status, decision-log, dan rekonsiliasi audit berkala.

Penilaian agregat auditor: **kesesuaian implementasi terhadap rencana = 82% (tertimbang per tahap)**. Tahap 0 dan Tahap 1 tereksekusi dengan baik dan jujur didokumentasikan, termasuk kegagalan-kegagalannya. Deviasi yang ada mayoritas adalah **penyederhanaan pragmatis yang dapat dibenarkan** untuk konteks satu sekolah, bukan kesalahan arsitektur.

Tiga catatan terpenting bagi pimpinan:

1. **Fondasi solid, layak lanjut ke Tahap 2.** Tidak ditemukan utang teknis yang mengharuskan rewrite. Gerbang Go/No-Go Tahap 0 secara substansial terpenuhi.
2. **Tiga risiko terbuka harus ditutup sebelum sistem menyimpan data siswa sungguhan:** kepatuhan UU PDP pada jalur AI premium (R-03), isolasi lingkungan staging vs. produksi (N-20), dan pengerasan Keycloak ke mode produksi (N-23b). Ketiganya sudah teridentifikasi oleh tim sendiri — auditor mengonfirmasi dan menaikkan prioritasnya.
3. **Kesenjangan rencana-vs-realita terbesar bukan kualitas, melainkan cakupan & formalitas:** model RBAC disederhanakan dari *permission-based* ke *role-based*; event bus memakai EventEmitter in-process, bukan Redis/BullMQ; aplikasi mobile (Flutter) dan beberapa tabel referensi belum ada. Ini wajar untuk fase fondasi, tetapi harus dicatat resmi sebagai keputusan arsitektur agar tidak menjadi "deviasi diam-diam".

---

## 1. METODOLOGI & RUANG LINGKUP AUDIT

Audit ini membandingkan **niat** (yang tertulis di lima dokumen perencanaan) dengan **realita** (yang ada di dalam kode). Sumber yang diperiksa:

**Dokumen perencanaan (knowledge proyek):**
- Master Blueprint v2.0 — Smart AI VSE 5.0 (20 modul, roadmap 5 tahun, 13-layer stack)
- Tahap 0 — Foundation & Preparation
- Tahap 1 — System Design & Technical Specification
- Tahap 2 — Development Environment
- Tahap 3 — Core Foundation Development

**Artefak realita (folder kerja `DIIS/`):**
- Repositori `smart-ai-school/` (apps/api, apps/web, packages, infrastructure)
- `packages/database/prisma/schema.prisma` + 9 migrasi
- `infrastructure/docker/docker-compose.yml`
- `CLAUDE.md`, `.tasks/queue.md` (ledger kanonik), `.tasks/AUDIT-FINDINGS.md`, `docs/decision-log.md`
- Riwayat sprint & keputusan Director yang tercatat

**Metode penilaian.** Setiap tahap diberi skor kepatuhan berdasarkan tiga dimensi: *deliverable hadir*, *deliverable sesuai spesifikasi*, dan *bukti verifikasi (test/CI/runtime)*. Klaim faktual dalam laporan ini diverifikasi langsung terhadap kode (grep/inspeksi file), bukan mengandalkan klaim status tim.

**Keterbatasan audit.** Auditor tidak mengakses VPS produksi secara langsung; status runtime produksi (mis. realm Keycloak, login hidup) diambil dari ledger tim yang menyebut verifikasi langsung. Riwayat `git log` lokal tidak tersedia di salinan kerja ini (repo tampil sebagai staged), sehingga kronologi commit diverifikasi via ledger, bukan via git.

---

## 2. PENILAIAN PER TAHAP

### 2.1 Master Blueprint v2.0 — Visi & Arsitektur

| Aspek | Rencana | Realita | Status |
|---|---|---|---|
| Filosofi (8 prinsip, AI-as-assistant, open-source first) | Ditetapkan | Tercermin di stack & CLAUDE.md | ✅ Selaras |
| 13-layer hybrid open-source stack | Final, "tidak berubah" | Diterapkan hampir penuh | ✅ Selaras (lihat §3.1) |
| 20 modul ekosistem | Target jangka panjang (5 tahun) | ~7 domain backend hidup | 🟡 Sesuai fase (Tahun 0–1) |
| Roadmap 5 tahun | Tahun 0→5 bertahap | Berada di akhir Tahun 1 (Core System) | ✅ On-track |
| Biaya infrastruktur Rp 300–700rb/bln | Target | 1 VPS Hetzner, semua self-hosted | ✅ Konsisten dengan desain |

**Penilaian:** Blueprint berfungsi sebagaimana mestinya — sebagai *bintang utara*, bukan checklist jangka pendek. Implementasi tidak menyimpang dari filosofi inti. Tidak ada tanda *scope creep* maupun *vendor lock-in* yang dilarang blueprint.

### 2.2 Tahap 0 — Foundation & Preparation

Dokumen Tahap 0 menetapkan gerbang Go/No-Go 14 item teknis + 6 item organisasi. Ledger menyatakan "Tahap 0 SELESAI 2026-05-28, 23/23 deliverable, Go/No-Go LULUS". Verifikasi auditor terhadap kode:

| Item Go/No-Go (teknis) | Bukti di repo | Status |
|---|---|---|
| Monorepo sesuai struktur | Turborepo + pnpm, apps/ + packages/ | ✅ |
| Docker Compose semua service | 14 service (postgres, redis, keycloak, n8n, ollama, metabase, grafana, prometheus, exporters, uptime-kuma, minio, backup, api, web) | ✅ |
| PostgreSQL schemas + Prisma migration | 9 migrasi; 8 schema (auth, academic, student, teacher, ppdb, finance, notification, ai_knowledge) | ✅ |
| Keycloak SSO + role terdefinisi | Realm `diis`, guard JWT, 7 role | ✅ (deviasi 6→7 role, lihat §4.1) |
| CI/CD push → staging | `.github/workflows/ci.yml` + `deploy.yml` | ✅ |
| Monitoring (Grafana+Prometheus+Uptime Kuma) | Ketiganya ada di compose + exporters | ✅ |
| Security baseline + backup | pg-backup ke MinIO/R2, Fail2Ban, UFW, Helmet→Fastify | ✅ (diverifikasi ulang SMA-16: 12 item) |
| Coding standards & dokumentasi | CLAUDE.md, WAYS-OF-WORKING.md, docs/ | ✅ |

**Skor kepatuhan Tahap 0: 95%.** Satu-satunya catatan: dokumen menyebut Ollama `llama3.1:8b` ter-download dan onboarding tim multi-orang — pada praktiknya tim adalah model "arsitek tunggal + AI engineering" (vibes coding), sehingga butir "seluruh anggota tim bisa clone & run" praktis tidak relevan. Ini bukan kegagalan, melainkan konteks tim yang berbeda dari asumsi dokumen.

### 2.3 Tahap 1 — System Design & Core Build

Ini adalah tahap dengan aktivitas terbanyak dan baru saja **ditutup resmi** (ledger 2026-06-07). Spesifikasi Tahap 1 menuntut 16 output desain (ERD, API contract, RBAC matrix, event flow, dll.) lalu Sprint 1–4 membangun modul inti.

**Modul backend yang benar-benar hidup** (diverifikasi di `apps/api/src/`):
`auth`, `student`, `teacher`, `teaching-assignment`, `attendance`, `grade`, `schedule`, `finance` (SPP), `ppdb`, `notification`, `ai` (chatbot + knowledge), `rag`, `events`, `metrics`, `health`.

| Deliverable Tahap 1 | Rencana | Realita | Status |
|---|---|---|---|
| ERD core + 3NF + UUID + soft delete | Detail di dokumen | Schema Prisma 14 model, UUID PK, `createdAt/updatedAt/deletedAt`, `@@schema` per domain | ✅ Sangat selaras |
| API contract `/api/v1/...` | Spesifikasi penuh | Endpoint terimplementasi; `docs/api/api-reference.md` (SMA-53) | ✅ (lihat catatan §4.4) |
| RBAC matrix per permission | *Permission-based* | *Role-based* via `@Roles()` + enum | 🟠 Deviasi (lihat §4.1) |
| Event-driven architecture | Redis Event Bus + BullMQ | `@nestjs/event-emitter` (in-process) | 🟠 Deviasi (lihat §4.2) |
| Notifikasi WA ortu (Fonnte) | n8n + Fonnte | Adapter `fonnte`/`smtp`/`log` di NestJS + listener idempoten | ✅ (jalur berbeda, hasil sama) |
| AI hybrid (Ollama default, Claude premium) | Hybrid + PII guard | `OllamaAdapter` default, `ClaudeAdapter` flag-OFF + strip PII ganda | ✅ (dengan risiko R-03 terbuka) |
| RAG + pgvector | Knowledge base | `rag.module`, `RagChunk` di `ai_knowledge`, embed-faq | ✅ |
| Testing strategy | Smoke + unit + E2E | 472 unit test, 27 spec, E2E SMA-50 28/28 di CI | ✅ Kuat |
| Frontend 7 halaman modul | Direncanakan | Hanya login/dashboard/health/landing | 🟡 Ditunda ke Tahap 2 (keputusan Director eksplisit) |

**Skor kepatuhan Tahap 1: 84%.** Kualitas eksekusi tinggi dan **kejujuran pelaporan luar biasa** — ledger mencatat insiden kritis (login produksi tak pernah hidup hingga 6 Juni, realm Keycloak hilang, rantai 7 blocker CSP/Keycloak) secara transparan, lengkap dengan akar masalah. Ini ciri tim engineering matang.

### 2.4 Tahap 2 — Development Environment

Dokumen Tahap 2 berisi 12 output: setup VPS, subdomain/Cloudflare, Nginx reverse proxy, Turborepo+pnpm, dockerisasi produksi, inisialisasi DB/Redis/Keycloak, shared packages (types/logger/Sentry), ESLint+Prettier+Husky, observability, inisialisasi AI service, dan n8n.

| Output Tahap 2 | Realita | Status |
|---|---|---|
| VPS + Nginx + Cloudflare | VPS Hetzner `103.253.215.19`, domain `smkdarussalamsubah.sch.id`, nginx.conf (proxy buffer fix N-25) | ✅ |
| Dockerisasi produksi | `docker-compose.yml` produksi (multi-service) + `.dev.yml` | ✅ |
| Shared packages | `@smk/auth`, `@smk/database`, `@smk/logger`, `@smk/types`, `@smk/config` | ✅ |
| Sentry error tracking | `instrument.ts`, `sentry.utils.ts`, scrub PII (OBS-1a) | ✅ |
| ESLint/Prettier/Husky | `.eslintrc.js`, `.prettierrc` ada | ✅ (Husky pre-commit perlu konfirmasi) |
| Observability awal | Prometheus + Grafana + exporters + `/metrics` | ✅ (lihat F-3, §5) |
| n8n automation | Service hidup; `infrastructure/n8n/workflows` | 🟡 Workflow nyata minim — automasi banyak dipindah ke kode NestJS |

**Skor kepatuhan Tahap 2: 80%.** Catatan penting: banyak kapabilitas yang dokumen rencanakan untuk n8n (notifikasi, event) justru **diimplementasikan di dalam NestJS** (listener + adapter). Ini keputusan arsitektur yang sah dan bahkan lebih *testable*, tetapi berarti peran n8n menyusut dari rencana. Perlu diformalkan: apakah n8n tetap menjadi *automation engine* utama, atau hanya pelengkap?

### 2.5 Tahap 3 — Core Foundation Development

Dokumen Tahap 3 menuntut 14 output fondasi aplikasi: Auth, RBAC permission-registry, User Management, **School Profile & Config**, **Audit Logging**, **Activity Tracking**, Event Bus, Notification Engine, **File Storage Service**, dan Shared UI.

| Output Tahap 3 | Realita | Status |
|---|---|---|
| Auth foundation (NestJS + Next.js) | Lengkap, login produksi hidup | ✅ |
| RBAC system | Role-based (bukan permission registry) | 🟠 Disederhanakan |
| User Management (single user table) | Model `User` tunggal + relasi profil | ✅ |
| Notification Engine (multi-channel + retry) | Adapter WA/email/log + idempotensi | ✅ |
| Event Bus foundation | EventEmitter in-process | 🟠 Bukan Redis pub/sub |
| **Audit Logging (tabel + interceptor)** | Tidak ada model `AuditLog`; hanya `auditLog()` Winston (ke log, bukan DB) | 🔴 Gap |
| **Activity Tracking** | Tidak ada | 🔴 Gap |
| **School Profile & Config** | Tidak ada model | 🔴 Gap |
| **File Storage Service** | MinIO service hidup, tetapi tak ada modul upload/`FileObject` di API | 🔴 Gap |
| Tabel referensi (Parent, Subject, Major/Jurusan) | Tidak ada sebagai tabel ternormalisasi | 🟡 Gap (lihat §4.3) |

**Skor kepatuhan Tahap 3: 60%.** Tahap 3 **belum digarap penuh** — wajar karena tim baru menutup Tahap 1 dan beberapa fondasi Tahap 3 (Auth, Notification, Event) sudah terlanjur dibangun mendahului urutan dokumen. Namun empat sistem fondasi (Audit Log persisten, Activity Tracking, School Profile/Config, File Storage API) adalah **prasyarat penting** sebelum sistem menyimpan data produksi nyata, terutama audit log demi kepatuhan UU PDP.

---

## 3. ANALISIS KESESUAIAN ARSITEKTUR & TECH STACK

### 3.1 Tech Stack: Rencana vs. Realita

| Layer | Rencana (13-layer) | Realita | Catatan |
|---|---|---|---|
| Frontend | Next.js 14 + shadcn/ui | Next.js 15 + React 19 | ⬆️ Lebih baru dari rencana |
| Backend | NestJS 10+ + Express implisit | **NestJS 11 + Fastify** | ⬆️ Fastify = pilihan performa, melampaui dok |
| Database | PostgreSQL 15 + pgvector | PostgreSQL 16 + pgvector | ✅ |
| ORM | Prisma 5 | Prisma 5 | ✅ |
| Validation | (implisit) | **Zod** (bukan class-validator) | ✅ Eksplisit & konsisten |
| Cache/Queue | Redis + **BullMQ** | Redis ada; **BullMQ tidak dipakai** | 🟠 Queue async belum ada |
| Auth | Keycloak 23 | Keycloak (realm `diis`) | ✅ |
| AI lokal/premium | Ollama + Claude/OpenAI | Ollama + Claude (flag-OFF) | ✅ |
| Automation | n8n | n8n (peran menyusut) | 🟡 |
| Storage | MinIO + R2 | MinIO + R2 (backup) | ✅ infra; API upload belum |
| Analytics | Metabase | Metabase (embed dashboard KS) | ✅ |
| Monitoring | Grafana+Prometheus+Uptime Kuma | Ketiganya + Sentry | ✅ ⬆️ |
| Deployment | Docker + GH Actions | Docker + GH Actions + gitflow | ✅ |
| Mobile | **Flutter + FCM** | **Tidak ada** | 🔴 Belum dimulai (Tahun 1–2) |

**Kesimpulan:** Stack inti **dipatuhi dan beberapa di-upgrade** (Next 15, NestJS 11/Fastify, PG16). Tiga penyimpangan substantif: BullMQ tidak dipakai, peran n8n menyusut, dan Flutter belum ada. Ketiganya konsisten dengan fase proyek, tetapi pernyataan dokumen "stack final, tidak berubah" menjadi tidak sepenuhnya akurat dan sebaiknya direvisi resmi di Blueprint v2.1.

### 3.2 Prinsip Arsitektur

Prinsip *Single Source of Truth* (1 PostgreSQL, schema per domain) **dipatuhi penuh** — delapan schema terpisah sesuai desain. Prinsip *Domain-Driven* (1 domain = 1 module) **dipatuhi**. Prinsip *No Direct Coupling* (komunikasi antar domain via event) **dipatuhi secara semantik** lewat EventEmitter, meski bukan message queue Redis. Prinsip *Privacy by Design* **dipatuhi parsial** — strip PII ada, tetapi audit log persisten dan jalur consent UU PDP belum lengkap.

---

## 4. TEMUAN UTAMA — DEVIASI RENCANA vs. IMPLEMENTASI

### 4.1 [DEV-01] RBAC: permission-based → role-based

Dokumen Tahap 1 §F dan Tahap 3 §C **secara eksplisit melarang** *hardcode role check* dan mewajibkan arsitektur *permission-based* (`hasPermission("view_student")` dengan tabel `permissions` + `role_permissions` yang dapat diubah dari database tanpa deploy). Realita: tidak ada tabel permission; otorisasi memakai enum `UserRole` + decorator `@Roles()` + `RolesGuard` (role di-cek langsung).

**Dampak:** Mengubah hak akses kini butuh perubahan kode + deploy, bukan konfigurasi DB. Untuk satu sekolah dengan 7 role stabil, ini **trade-off yang wajar** (lebih sederhana, lebih cepat, sudah diaudit di SMA-51). Namun ini bertentangan dengan aturan yang ditulis tim sendiri. **Rekomendasi:** formalkan sebagai keputusan arsitektur di decision-log ("role-based dipilih untuk Tahap 1–2; permission-registry ditunda ke Tahap 3+ bila kebutuhan role kustom muncul"), agar bukan deviasi diam-diam.

### 4.2 [DEV-02] Event bus: Redis pub/sub + BullMQ → EventEmitter in-process

Blueprint & Tahap 1 menetapkan Redis Event Bus + BullMQ untuk komunikasi antar-modul dan job async. Realita: `@nestjs/event-emitter` (EventEmitter2) in-process dengan listener idempoten.

**Dampak:** Bekerja baik untuk monolit modular saat ini. **Keterbatasan:** event tidak persisten (hilang bila proses mati saat memproses), tidak ada retry queue tahan-restart, dan tidak siap untuk pemisahan microservice yang dijanjikan blueprint. Untuk notifikasi WA "harus terkirim", ketiadaan queue persisten adalah risiko keandalan. **Rekomendasi:** pertahankan untuk sekarang; jadwalkan migrasi ke BullMQ saat volume notifikasi/ekspor massal meningkat (Tahap 2–3).

### 4.3 [DEV-03] Tabel referensi belum ternormalisasi

Tahap 1 §C menekankan 3NF dan tabel referensi: `parents`, `subjects`, `majors/jurusan`, `classes`. Realita: `Class` ada; tetapi `Parent`, `Subject`, `Major` belum menjadi tabel — relasi orang tua & mata pelajaran kemungkinan disimpan sebagai field/relasi user atau string pada `TeachingAssignment`.

**Dampak:** Risiko anomali data yang justru diperingatkan dokumen (mis. nama mapel sebagai teks bebas). **Rekomendasi:** tambahkan tabel `Subject`, `Major/Jurusan`, dan formalkan `Parent` sebelum modul akademik & PPDB frontend dibangun di Tahap 2.

### 4.4 [DEV-04] Dokumentasi API: Markdown, bukan Swagger/OpenAPI

Realita: `docs/api/api-reference.md` (SMA-53) berupa Markdown; tidak ditemukan `SwaggerModule`/`@nestjs/swagger`. Dokumen tidak mewajibkan Swagger secara eksplisit, jadi ini **bukan pelanggaran**, tetapi OpenAPI auto-generated akan lebih akurat & sinkron dengan kode. **Rekomendasi:** adopsi `@nestjs/swagger` (low-effort, high-value) di Tahap 2.

### 4.5 [DEV-05] Modul mengikuti urutan dependensi, bukan urutan dokumen

Tim membangun Auth → Student → Academic → Finance → AI, melompati sebagian fondasi Tahap 3 (audit log, activity tracking, school config). Ini sebenarnya **mengikuti "Module Priority Matrix" Tahap 1** (Auth dulu, lalu domain ber-dependensi) — jadi konsisten dengan satu dokumen sambil mendahului dokumen lain. Bukan kesalahan, tetapi menimbulkan gap Tahap 3 yang harus ditutup balik (§2.5).

---

## 5. REGISTER RISIKO (diverifikasi & diprioritaskan auditor)

| ID | Risiko | Tingkat | Status tim | Penilaian auditor |
|---|---|---|---|---|
| **R-03** | Jalur `ClaudeAdapter`: PII siswa tanpa label bisa bocor ke Anthropic saat diaktifkan (UU PDP No. 27/2022) | 🔴 Kritis | OPEN, flag-OFF | **Setuju kritis.** Jangan set `AI_PROVIDER=claude` di prod sampai detektor nama (NER) atau pembatasan FAQ-intent + DPA/consent terpasang. |
| **N-20** | Staging & produksi berbagi 1 server, 1 `.env`, 1 DB `smk_db` | 🔴 Tinggi | OPEN | **Naikkan prioritas.** Gerbang staging saat ini ilusi untuk migrasi destruktif. Wajib DB `smk_staging_db` terpisah sebelum migrasi destruktif berikutnya. |
| **N-23b** | Keycloak `start-dev` + port 8080 ter-expose publik | 🟠 Tinggi | backlog | Pindah ke `start` (production-mode), tutup 8080, admin via SSH tunnel. Sebelum data siswa nyata masuk. |
| **F-3** | `/metrics` Prometheus publik | 🟡 Sedang | backlog | Batasi ke jaringan internal/auth. |
| **—** | Audit log tidak persisten (hanya Winston) | 🟠 Tinggi | tidak tercatat sbg risiko | **Temuan auditor baru.** UU PDP & akreditasi menuntut jejak akses data pribadi yang dapat di-query. Tambah tabel `AuditLog` + interceptor (Tahap 3 §F). |
| **—** | Notifikasi WA tanpa queue persisten | 🟡 Sedang | implisit | Risiko kehilangan notifikasi saat restart; mitigasi via BullMQ. |
| **OBS-1b** | Scrub PII Sentry: nama/NIS tanpa label & HP >13 digit lolos | 🟡 Rendah | backlog | Perketat regex/NER. |
| **—** | "Fix langsung di VPS belum diformalkan ke repo" (N-24/25/26) | 🟠 Tinggi | sedang ditangani | **Bahaya nyata:** deploy berikutnya bisa me-revert perbaikan login. Pastikan 6 item formalisasi masuk `main` sebelum `git pull` di VPS. |

---

## 6. PENILAIAN AKHIR

| Dimensi | Skor | Komentar |
|---|---|---|
| Kepatuhan Tahap 0 (Foundation) | 95% | Fondasi sangat kuat & terverifikasi |
| Kepatuhan Tahap 1 (Core Build) | 84% | Eksekusi tinggi, pelaporan jujur, deviasi terkelola |
| Kepatuhan Tahap 2 (Dev Env) | 80% | Infra produksi jalan; peran n8n perlu ditegaskan |
| Kepatuhan Tahap 3 (Core Foundation) | 60% | 4 sistem fondasi belum ada (audit, activity, config, file) |
| Kualitas rekayasa (test/CI/observability) | 90% | 472 test, E2E, Sentry, monitoring lengkap |
| Tata kelola & dokumentasi | 92% | CLAUDE.md + ledger kanonik + decision-log = teladan |
| Manajemen risiko & keamanan | 72% | Risiko teridentifikasi baik, tetapi 3 kritis masih terbuka |
| **AGREGAT (tertimbang)** | **82%** | **Sehat. Layak lanjut Tahap 2 dengan syarat penutupan risiko kritis.** |

**Vonis auditor:** Proyek DIIS berada dalam kondisi **SEHAT dan dikelola secara profesional**. Tingkat disiplin engineering dan kejujuran pelaporannya melampaui ekspektasi untuk proyek sekolah. Rekomendasi utama: **jangan menambah cakupan modul baru sebelum (a) tiga risiko kritis ditutup dan (b) empat sistem fondasi Tahap 3 dilengkapi**, karena keduanya adalah prasyarat sistem yang aman menyimpan data siswa nyata.

---

## 7. REKOMENDASI & ROADMAP

### 7.1 Tindakan Segera (0–2 minggu) — "Stabilkan Fondasi"

1. **Formalkan perbaikan VPS ke repo (P0).** Pastikan 6 item N-24/25/26 (next.config, docker-compose env, nginx buffer, realm-diis.json, .dockerignore, .env.example) ter-merge ke `main` sebelum deploy berikutnya. *Tanpa ini, login produksi berisiko rusak lagi.* — model: Claude Sonnet (review diff) + Claude Code (eksekusi).
2. **Isolasi staging vs produksi (N-20, P0).** Minimal DB `smk_staging_db` + compose/port terpisah. Keputusan arsitektur Director diperlukan. — model: Claude Opus (desain), Claude Code (implementasi).
3. **Pengerasan Keycloak (N-23b).** `start` production-mode, tutup port 8080 publik.
4. **Catat deviasi resmi di decision-log:** RBAC role-based, EventEmitter vs Redis, peran n8n, BullMQ ditunda. Hentikan "deviasi diam-diam".

### 7.2 Jangka Pendek (2–6 minggu) — "Lengkapi Fondasi Tahap 3"

5. **Tabel `AuditLog` persisten + interceptor** (Tahap 3 §F) — prasyarat UU PDP & akreditasi.
6. **Tabel referensi:** `Subject`, `Major/Jurusan`, formalkan `Parent` (tutup DEV-03) sebelum frontend akademik/PPDB.
7. **File Storage Service API** (modul upload + `FileObject`) di atas MinIO yang sudah hidup.
8. **School Profile & Config module** (data SMK Darussalam Subah, jurusan, tahun ajaran, semester aktif).
9. **OpenAPI/Swagger** auto-generated (DEV-04).

### 7.3 Tahap 2 Proper (6–12 minggu) — "Aktifkan Pengguna"

10. **7 halaman frontend modul** (Siswa/Akademik/PPDB/Keuangan/AI/Users/Health) — sudah jadi keputusan Director; API sudah siap.
11. **Migrasi event kritis ke BullMQ** (notifikasi WA, ekspor massal) demi keandalan.
12. **Aktifkan jalur AI premium dengan aman** — tutup R-03 lebih dulu (NER nama atau pembatasan FAQ-intent + DPA).
13. **Dashboard Eksekutif KS** diperluas (Metabase embed sudah ada; tambah KPI operasional dari Blueprint §9.3).
14. **n8n: putuskan perannya** — bila tetap automation engine, mulai workflow nyata (tracer study, reminder SPP H-7/H-3/H-1); bila pelengkap, dokumentasikan.

### 7.4 Sejajarkan dengan Roadmap 5 Tahun

Posisi proyek = **transisi Tahun 1 → Tahun 2 (Integration)**. Sebelum mengejar modul Tahun 2 (AI Content Factory, unit produksi, tracer study AI), pastikan "Core System" Tahun 1 benar-benar *live & dipakai pengguna nyata* — saat ini backend matang tetapi adopsi pengguna (guru input nilai/absensi via UI) belum terjadi karena frontend modul belum ada. **Prioritaskan adopsi sebelum ekspansi.**

### 7.5 Rekomendasi Tata Kelola

15. **Revisi Blueprint ke v2.1** untuk mencerminkan stack nyata (Next 15, NestJS 11/Fastify, PG16, RBAC role-based, EventEmitter, n8n-sebagai-pelengkap) — agar dokumen tetap menjadi *source of truth* yang akurat, bukan aspirasi usang.
16. **Pertahankan praktik unggul yang sudah ada:** ledger kanonik `queue.md`, rekonsiliasi audit berkala, decision-log, eksekusi task serial (anti-collision). Ini aset proyek yang langka.

---

## LAMPIRAN A — Inventaris Realita (ringkas)

- **Schema Prisma (14 model, 8 domain-schema):** User, Class, Student, Teacher, PpdbLead, TeachingAssignment, Grade, Attendance, Schedule, SppPayment, NotificationLog, RagChunk, ChatSession, ChatMessage.
- **9 migrasi:** pgvector → tata_usaha role → sprint1 foundation → sprint2 schedule → sprint3 spp_approval → sprint3 notification → sprint4 kb_audit → sprint4 chat_history → sma52 perf_indexes.
- **7 role:** SUPER_ADMIN, KEPALA_SEKOLAH, TATA_USAHA, GURU, SISWA, ORANG_TUA, INDUSTRI.
- **14 Docker service** + jaringan `smk-network` internal.
- **472 unit test / 27 spec file** + E2E SMA-50 (28 skenario) di CI dengan DB ephemeral `smk_test`.
- **Adapter:** AI (ollama, claude+pii-strip), Notifikasi (fonnte, smtp, log).

## LAMPIRAN B — Sumber

Dokumen perencanaan (knowledge "DIIS"): Blueprint v2.0, Tahap 0–3. Artefak repo: `smart-ai-school/` — `packages/database/prisma/schema.prisma`, `infrastructure/docker/docker-compose.yml`, `apps/api/src/*`, `apps/web/src/app/*`, `CLAUDE.md`, `.tasks/queue.md`, `.tasks/AUDIT-FINDINGS.md`, `docs/decision-log.md`, `.github/workflows/ci.yml`.

---

*Disusun sebagai audit eksternal independen, 8 Juni 2026. Penilaian bersifat snapshot pada tanggal audit; status risiko terbuka dapat berubah seiring penutupan oleh tim.*
