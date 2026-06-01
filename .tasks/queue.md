# TASK QUEUE — DIIS Tahap 0 → Sprint-0 Tahap 1

> ⭐ **FILE INI = SATU-SATUNYA SUMBER KEBENARAN STATUS (canonical ledger).**
> Dokumen lain (`current.md`, `CLAUDE.md` §7, gate docs) hanya MENAUTKAN ke sini,
> tidak menduplikasi status. Jika ada konflik, file INI yang menang.
> Dikelola oleh Cowork AI. Claude Code hanya membaca file ini.
> Update terakhir: 2026-06-01 — SMA-39 + SMA-39a (F-1) keduanya MERGED ke main, CI ✅. Sprint 2 SELESAI TOTAL. Sprint 3 (Finance+AI+Notif) = antrian aktif.
>
> ⚠️ **Linear ditinggalkan mulai 2026-05-31.** Status task kini canonical di file ini.
> `SMA-XX` = kode internal saja (tidak ada Linear issue). Claude Code: baca queue.md sebagai sumber tunggal.

---

## 📊 STATUS RINGKAS (per 2026-05-29)

| | |
|---|---|
| **Fase** | Tahap 0 core SELESAI & terverifikasi → membuka Sprint-0 Tahap 1 |
| **Go/No-Go** | ✅ **CONDITIONAL GO** (28 Mei) — Tahap 1 boleh mulai, TAPI 4 carryover Tahap 0 wajib tuntas sebagai Sprint-0 |
| **Audit teknis** | 10/12 temuan CLOSED & diverifikasi runtime (T-07, T-08, T-09, T-12 = medium, masuk desain Tahap 1) |
| **Test terverifikasi** | packages/auth 50/50 (coverage 100%) · apps/api 62/62 — diuji ulang 29 Mei |
| **Carryover Tahap 0 (Sprint-0)** | W2-04 n8n · W3-02 Grafana+/metrics · W4-02 onboarding · W4-04 sprint-plan Tahap 1 |

> Catatan koreksi: deklarasi "Tahap 0 SELESAI 23/23" sebelumnya terlalu optimistis.
> Status akurat = **core selesai + 4 carryover non-blocking dipindah ke Sprint-0**.

---

## 🚑 HARDENING MENDESAK — Insiden 30 Mei 2026 (situs sempat down 521)

> Brief siap-eksekusi: `.tasks/HARDENING-N7-N8-BRIEF.md`.

| ID | Masalah | Status | Aksi |
|---|---|---|---|
| **N-8** | nginx reverse proxy TIDAK ada di docker-compose → hilang tiap reboot (akar 521). Kini nginx ADA di docker-compose dengan `restart=unless-stopped` | ✅ CLOSED (31 Mei) — verified VPS | nginx di compose, `restart=unless-stopped`, situs 307. Commit `0c01f84`, laporan `.tasks/done/N8-nginx-compose-DONE.md`. Reboot-safe. |
| **N-7** | Origin tanpa TLS 443; Cloudflare Flexible (trafik CF↔origin tak terenkripsi) | ✅ CLOSED (30 Mei) | nginx `listen 443 ssl` + Cloudflare Origin Cert (15-thn, di VPS `infrastructure/nginx/certs/`, gitignored). Cloudflare **Full (Strict)** + Always Use HTTPS. Verifikasi: `https://localhost/login`=200, web 307, api 200, Edge SSL Active. Enkripsi end-to-end. |

**Status W3-02 (SMA-15):** ✅ `/metrics` terverifikasi runtime 200 (https://api.smkdarussalamsubah.sch.id/metrics, 30 Mei).
Dashboard Node.js jalan. ⚠️ Dashboard PostgreSQL/Redis butuh `postgres-exporter`+`redis-exporter` (addendum, belum dikerjakan).

---

## 🔄 SEDANG DIKERJAKAN

→ Lihat `.tasks/current.md` (hanya pointer; status resmi tetap di file ini)

---

## ✅ BLOCKING — Audit Fix dari Laporan System Analyst (26 Mei 2026) — SEMUA CLOSED

> **STATUS 2026-05-29: SELURUH item BLOCKING di bawah sudah CLOSED & diverifikasi runtime.**
> FIX-T01..T06, T10, T11, DOC-O02 — semua selesai. W4-03 Go/No-Go tidak lagi BLOCKED.
> Detail per item tetap diarsipkan di bawah untuk jejak audit. Referensi laporan:
> `docs/Laporan_System_Analyst_DIIS_2026-05-26.docx` & `Laporan_..._2026-05-29.docx`.

---

### [BLOCKING-1] FIX-T01 — ZodValidationPipe global tanpa schema
**Linear:** SMA-22 | **Severity:** 🔴 CRITICAL | **Sprint:** Minggu-3
**Estimasi:** 2 jam | **Model:** Sonnet 4.5+
**Depends on:** —

**Scope:**
- Refactor `apps/api/src/common/pipes/zod-validation.pipe.ts` — fail-secure jika tidak ada schema
- Buat decorator `@ValidateBody(schema)` yang simpan schema ke reflector metadata
- Update `apps/api/src/main.ts` — global pipe tetap aktif tapi sekarang fail-secure
- Tulis 2 integration test: body invalid → 400, body valid → 200
- Update `queue.md` item W3-03 dari ✅ ke ⚠️

**Bukti runtime yang wajib:** `curl -X POST /api/v1/... -d '{invalid}' → 400 + error array`

---

### [BLOCKING-2] FIX-T02 — KeycloakGuard belum APP_GUARD global
**Linear:** SMA-23 | **Severity:** 🔴 CRITICAL | **Sprint:** Minggu-3
**Estimasi:** 1.5 jam | **Model:** Sonnet 4.5+
**Depends on:** FIX-T01 (parallel OK)

**Scope:**
- Update `apps/api/src/app.module.ts`: `{ provide: APP_GUARD, useClass: KeycloakGuard }`
- Pastikan `@Public()` ada di: HealthController, auth callbacks
- Tulis 2 integration test: tanpa token → 401, @Public() tanpa token → 200
- Update CLAUDE.md Section 10: tambah baris APP_GUARD decision

**Bukti runtime yang wajib:** `curl http://localhost:3001/api/v1/students` tanpa token → 401

---

### [BLOCKING-3] FIX-T03 — Port mismatch docker/nginx/main.ts
**Linear:** SMA-24 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 45 menit | **Model:** Haiku 4.5
**Depends on:** FIX-T01, FIX-T02 selesai dulu

**Scope:**
- `infrastructure/docker/docker-compose.yml`: PORT=3000 → PORT=3001
- `infrastructure/nginx/nginx.conf`: upstream api:3000 → api:3001
- Healthcheck: port 3000 → port 3001

**Bukti runtime yang wajib:** `docker compose ps` → api Healthy + `curl localhost:3001/api/health` → 200

---

### [BLOCKING-4] FIX-T04 — PostgreSQL port 5432 exposed di docker-compose
**Linear:** SMA-25 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 1 jam | **Model:** Haiku 4.5
**Depends on:** FIX-T03 (parallel OK)

**Scope:**
- Hapus `ports: ["5432:5432"]` dari service postgres di `docker-compose.yml`
- Buat `infrastructure/docker/docker-compose.dev.yml` untuk dev override
- Dokumentasi SSH tunnel untuk koneksi dev lokal

**Bukti runtime yang wajib:** `nc -zv 204.168.242.123 5432` → Connection refused

---

### [BLOCKING-5] FIX-T06 — Backup PostgreSQL belum aktif
**Linear:** SMA-27 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 2 jam | **Model:** Haiku 4.5
**Depends on:** FIX-T04 (setelah postgres secure)

**Scope:**
- Tambah service `pg-backup` di docker-compose: pg_dump + upload MinIO, cron 02:00 WIB
- Buat `infrastructure/n8n/backup-daily.json` (selesaikan SMA-12)
- Buat `docs/runbooks/restore-database.md`

**Bukti runtime yang wajib:** `mc ls minio/diis-backup/` → ada file dump hari ini

---

### [BLOCKING-6] DOC-O02 — Definition of Done wajib runtime verification
**Linear:** SMA-30 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 45 menit | **Model:** Haiku 4.5
**Depends on:** — (bisa dikerjakan parallel, idealnya pertama)

**Scope:**
- Update CLAUDE.md Section 9: tambah blok "Runtime Verification WAJIB"
- Update template `.tasks/current.md` dan `.tasks/queue.md`: tambah field `Runtime Verification:`

---

### [BLOCKING-7] DOC-T11 — README versi salah & Flutter fiktif
**Linear:** SMA-29 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 30 menit | **Model:** Haiku 4.5
**Depends on:** — (parallel OK)

**Scope:**
- Update README: Next.js 15, NestJS 11, React 19, Flutter → Deferred Tahap 3
- Tandai folder-folder yang belum ada di Tahap 0

---

### [BLOCKING-8] FIX-T05 — CSP unsafe-eval + unsafe-inline
**Linear:** SMA-26 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-4
**Estimasi:** 3 jam | **Model:** Sonnet 4.5+
**Depends on:** BLOCKING-3 (port mismatch) selesai

**Scope:**
- Hapus unsafe-eval dari CSP di `infrastructure/nginx/nginx.conf`
- Implementasi nonce-based CSP di Next.js middleware
- Test dengan CSP Evaluator

---

### [BLOCKING-9] FIX-T10 — Zero unit test security-critical paths
**Linear:** SMA-28 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-4
**Estimasi:** 3 jam | **Model:** Sonnet 4.5+
**Depends on:** FIX-T02 (APP_GUARD selesai dulu)

**Scope:**
- Unit test `verifyToken()`, `hasRole()` di `packages/auth`
- Unit test `KeycloakGuard.canActivate()` di `apps/api`
- Target: ≥70% coverage `packages/auth`
- CI pipeline jalankan test ini

---

## 📋 ANTRIAN REGULER (setelah semua BLOCKING selesai)

### [QUEUE-1] W3-02 Monitoring Config ✅ SELESAI
**Linear:** SMA-15 | **Status:** ✅ DONE 2026-05-30 (runtime + exporter keduanya selesai)

- `/metrics` 200 terverifikasi di VPS (curl 2026-05-30)
- Dashboard Node.js jalan. PostgreSQL + Redis butuh deploy exporter (PR SMA-19 branch)
- `postgres-exporter` + `redis-exporter` → PR `feat/SMA-19-onboarding-exporter`
**Laporan:** `.tasks/done/SMA-15-monitoring-DONE.md`

---

### [QUEUE-2] W4-01 Dokumentasi Arsitektur
**Linear:** SMA-18 | **Estimasi:** 1.5 jam

**Scope:**
- `docs/architecture/system-overview.md`
- `docs/deployment/env-variables.md`
- `docs/deployment/setup-server.md`

---

### [QUEUE-3] W4-02 Developer Onboarding Guide ✅ SELESAI
**Linear:** SMA-19 | **Status:** ✅ DONE 2026-05-30
**Branch:** `feat/SMA-19-onboarding-exporter` | **Commit:** `b40a299`
Semua path + script terverifikasi nyata. Laporan: `.tasks/done/SMA-19-onboarding-DONE.md`

---

### [QUEUE-4] W4-03 Checklist Final Go/No-Go ✅ SELESAI
**Linear:** SMA-20 | **Status:** ✅ CONDITIONAL GO (2026-05-28)
**Hasil:** `docs/gates/go-no-go-tahap0.md` — semua FIX-T01..T05 sudah closed & diverifikasi.
4 carryover non-blocking dipindah ke Sprint-0 Tahap 1 (lihat STATUS RINGKAS di atas).

---

### [QUEUE-5] W2-04 n8n Workflow Health-Check ✅ SELESAI
**Linear:** SMA-12 | **Status:** ✅ DONE 2026-05-30
**Branch:** `feat/SMA-12-n8n-workflows`

**Hasil:**
- `infrastructure/n8n/workflows/health-check.json` — monitor /health setiap 5 menit, notif WA jika DOWN
- `infrastructure/n8n/workflows/backup-daily.json` — konfirmasi backup MinIO setiap 02:00 WIB, notif OK/GAGAL
- `infrastructure/n8n/README.md` — panduan import + konfigurasi credential
- `infrastructure/docker/docker-compose.yml` — tambah FONNTE_API_KEY + ADMIN_PHONE_NUMBER ke env n8n

**Bukti:** JSON valid (node -e JSON.parse → OK). Tidak ada secret hardcoded (grep bersih).
**Laporan:** `.tasks/done/SMA-12-n8n-DONE.md`

---

### [QUEUE-6] W3-03 Security Hardening Verification (REVISED)
**Linear:** SMA-16 | **Estimasi:** 1 jam

> ⚠️ DIAUDIT — beberapa item yang diklaim ✅ ternyata bermasalah.
> Item 4 (Zod global pipe) = ⚠️ ada di FIX-T01 (SMA-22)
> Item KeycloakGuard = ⚠️ ada di FIX-T02 (SMA-23)
> Task ini dijalankan SETELAH semua BLOCKING-1..5 selesai.

**Scope — verifikasi 12 item checklist (ulang dari awal dengan runtime proof):**
1. ThrottlerGuard 100 req/menit → verifikasi runtime
2. Helmet.js → verifikasi header di curl output
3. CORS policy → verifikasi allowed origins
4. ~~Zod validation global pipe~~ → diselesaikan di FIX-T01
5. Winston audit logger → verifikasi log output
6. HTTP Exception filter → verifikasi error format
7. JWT verification JWKS → verifikasi dengan expired token
8. Rate limit per-route (auth endpoints) → perlu implementasi
9. SQL injection protection → Prisma, verifikasi
10. XSS headers → Helmet config audit
11. CSRF protection → next-auth config
12. Environment variable validation → startup schema

---

## 🏁 SPRINT 3 — Finance + AI + Notification (berjalan)

> ⚙️ **KEBIJAKAN (2026-06-01): EKSEKUSI SERIAL — satu task per waktu.** Paralel SMA-41+42 memicu collision (schema.prisma, migration, docs, pull main, queue.md ketimpa) + Prisma client tak ter-regenerate (Finance error approvedBy/approvedAt → perlu `prisma generate`). Urutkan by dependency; tunggu merge+CI hijau sebelum task berikutnya. Setelah merge schema → `prisma generate` dulu.

### SMA-42 — NotificationAdapter — ✅ MERGED ke main (CI hijau, 2026-06-01)
**Model:** Sonnet 4.6 | Interface `NotificationAdapter` @smk/types + 3 adapter (Log default/Fonnte/SMTP stub) + factory env + durability (pending-first, idempotensi N-9, fail-soft, startup retry). Review ✅ APPROVE.
**Backlog LOW:** N-9b (idempotensi hanya cek `sent`) · SMTP stub (Nodemailer Sprint 4). **Laporan:** `.tasks/done/SMA-42-notification-adapter-DONE.md`

### SMA-41 — Finance SPP CRUD + Approval — ✅ MERGED ke main (CI hijau, 2026-06-01)
**Model:** Sonnet 4.6 | **Commit:** `ff08ecb` | digabung satu merge dengan SMA-42.
Migration additive `20260601000002_sprint3_spp_approval` (approvedBy/approvedAt) · 5 endpoint (record/list/summary/history/approve) · RBAC SA/TU input + SA/KS approve (separation of duties) + SISWA/OT ownership · 36 test, coverage finance 99%.
**⚠️ Pasca-merge:** `prisma generate` wajib (Finance error sebelumnya karena client lama). **Laporan:** `.tasks/done/SMA-41-finance-spp-DONE.md`
**Backlog:** paidAt historis (saat ini now()) → enhancement.

### SMA-44 — RAG: RagChunk model + seeder FAQ — ✅ MERGED ke main (PR #30, `837a939`, Deploy #65 hijau)
**Branch:** `feat/SMA-44-rag-chunk` | **Laporan:** `.tasks/done/SMA-44-rag-chunk-DONE.md` | **Model:** Sonnet 4.6
**N-11 ✅ CLOSED:** model `RagChunk` cocok tabel existing, accessor `prisma.ragChunk`, 10 FAQ chunk dummy (embedding NULL → diisi SMA-45), RagService skeleton.
**Verifikasi analis:** Deploy hijau = migrate deploy sukses (tak ada DROP/ALTER destruktif rag_chunks). Verifikasi schema-sync penuh (grep model di working tree) tertunda sampai mount lokal sinkron dengan main — pola sama SMA-31/39.

### SMA-43 — Event Wiring (producer→NotificationService) — ✅ SELESAI (PR dalam review)
**Branch:** `feat/SMA-43-event-wiring` | **Commit:** `a39ec99` | **Model:** Sonnet 4.6
5 event ter-wire: student.enrolled · student.statusChanged · grade.submitted · attendance.recorded (alpha/sakit) · payment.received (paid/late). NotificationListener @OnEvent() → notify() dengan refType+refId idempotensi. N-10: BOS = TODO Tahap 2. @nestjs/event-emitter@^3.1.0 dikonfirmasi oleh Director.
tsc 0 · eslint 0 · 346 tests hijau · coverage 85.58%.
**Laporan:** `.tasks/done/SMA-43-event-wiring-DONE.md`
**⏳ Menunggu:** gerbang review Cowork (event arch + idempotensi) sebelum merge.

### Antrian Sprint 3 (SERIAL — satu per waktu)
1. ~~SMA-43~~ ✅ selesai, tunggu merge
2. **SMA-45** AIGateway+OllamaAdapter (Sonnet) — deps SMA-44 ✅.
3. **SMA-46** Chatbot /ai/chat (Sonnet) — deps SMA-45.

---

## 🏁 SPRINT 1 & 2 — Tahap 1 — ✅ SPRINT 2 SELESAI

> Sprint 1 (Foundation/Student/PPDB/Auth) + Sprint 2 (Academic Core) semua modul P0 = SELESAI.
> **Sprint 2 DITUTUP 2026-06-01.** Sprint 3 (Finance+AI+Notif) menjadi antrian aktif.

### SMA-39 — Schedule View (semua role) — ✅ SELESAI & MERGED ke main (2026-06-01)
**Sprint:** 2 (penutup) | **Selesai:** 2026-06-01 | **Model:** Sonnet 4.6
**Deliverable:** schema Schedule additive + migration SQL + GET/POST /schedules + RBAC ownership + 409 konflik (kelas/guru/ruang) + seed dummy + 28 unit test (coverage ~95%) + forward-compat KBM didokumentasikan
**Laporan:** `.tasks/done/SMA-39-schedule-DONE.md`
**Gerbang review Cowork (2026-06-01):** ✅ APPROVE. PR sudah di-merge ke main oleh Director sebelum F-1 difix → F-1 turun jadi **fast-follow** (non-blocking, bukan security).
  - **F-1 MEDIUM → SMA-39a ✅ CLOSED & MERGED (2026-06-01):** `academicYear` cross-check vs `assignment.academicYear` — mismatch → 400 BadRequestException, gagal cepat. +1 unit test. 272 tests. PR #27 MERGED ke main, CI ✅. Laporan: `.tasks/done/SMA-39a-academicyear-DONE.md`.
  - **F-2 LOW (backlog):** konflik guru/ruang app-level non-transaksional → celah TOCTOU double-book (kelas aman via unique DB). Mitigasi nanti.
  - **F-3 INFO → ✅ VERIFIED (2026-06-01):** VPS `curl https://api.smkdarussalamsubah.sch.id/health` → 200 pasca-reboot. `migrate deploy` jalan sebelum NestJS start → tabel `academic.schedules` ada di DB production. (Bonus: reboot-safety N-8 terbukti ulang.)

### SMA-31 — Foundation Schema (N-1, N-2, T-12)
**Status:** ✅ DONE & MERGED (PR #17, `f505d88`) — migration **APPLIED & verified di production**
**Branch:** `feat/SMA-31-foundation-schema` (merged main)
**Deliverable:** schema.prisma ✅ · migration `20260531000001_sprint1_foundation` ✅ · generate ✅ · validate ✅ · tsc ✅
**Bukti runtime DB nyata:** deploy.yml jalankan `prisma migrate deploy` SEBELUM NestJS start → api tidak akan healthy jika migrasi gagal. Deploy `f505d88` hijau + `curl api/health` → 200 = tabel Grade/Attendance/RagChunk SUDAH ada di DB production (bukan mock).
**Laporan:** `.tasks/done/SMA-31-foundation-schema-DONE.md`

> **Unlocked:** SMA-37/38 (Grade + Attendance) — keduanya sudah merged.

### Portal Nilai & Absensi (frontend)
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/portal-nilai` (commit `1e8c342`)
**Laporan:** `.tasks/done/portal-nilai-DONE.md`
**Note:** `/dashboard/nilai` untuk SISWA + ORANG_TUA. Server component fetch, child selector client-side. tsc ✅ · next build ✅ (7/7 pages).

### SMA-38 — Attendance Module
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/SMA-38-attendance` (commit `9615a11`)
**Laporan:** `.tasks/done/SMA-38-attendance-DONE.md`
**Note:** Bulk insert atomik (prisma.$transaction), ownership GURU via TeachingAssignment.

### SMA-37 — Grade Module
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/SMA-37-grade-module` (commit `4a80b94`, branch dari SMA-36)
**Laporan:** `.tasks/done/SMA-37-grade-DONE.md`
**Note:** Branch ini include PrismaExceptionFilter global + cleanup TeachingAssignmentService.

### SMA-36 — TeachingAssignment Module
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/SMA-36-teaching-assignment` (commit `d2258af`)
**Laporan:** `.tasks/done/SMA-36-teaching-assignment-DONE.md`

### SMA-34 — PPDB Lead Pipeline
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/SMA-34-ppdb-pipeline` (commit `985d1d9`)
**Laporan:** `.tasks/done/SMA-34-ppdb-DONE.md`

### SMA-32 — Student Module CRUD
**Status:** ✅ DONE 2026-05-31 — merged main + CI hijau
**Branch:** `feat/SMA-32-student-module` (merged)
**Laporan:** `.tasks/done/SMA-32-student-DONE.md`
**Note:** ⚠️ R-05 gate aktif — jangan input data siswa nyata sampai SMA-55 (consent) selesai

### SMA-35 — Auth /me + RolesGuard
**Status:** ✅ DONE 2026-05-31 — merged main + deployed (#47)
**Branch:** `feat/SMA-35-auth-me-rolesguard` (merged)
**Laporan:** `.tasks/done/SMA-35-auth-me-DONE.md`

---

## 🏁 SPRINT-0 SELESAI — 2026-05-30

> Semua 4 carryover Tahap 0 tuntas. Sprint-0 ditutup.
> **Tahap 1 resmi dibuka.** Design gate: `docs/tahap1-sprint-plan.md` (PR #14).
> Langkah berikutnya: buat Linear issues SMA-31..SMA-52, mulai Sprint 1 coding.

| Task | Status | PR |
|---|---|---|
| W2-04 n8n workflows (SMA-12) | ✅ | #10 |
| W3-02 /metrics + exporter (SMA-15) | ✅ | #9, #13 |
| W4-02 Developer Onboarding (SMA-19) | ✅ | #13 |
| W4-04 Sprint Plan Tahap 1 | ✅ | #14 |
| N-8 nginx compose | ✅ | #11, #12 |

---

## ✅ SUDAH SELESAI (Terverifikasi Runtime)

- W1-01 VPS Setup Script ✅
- W1-03 Monorepo Turborepo init ✅
- W1-04 Docker Compose (14 services) ✅
- W2-01 Keycloak Configuration (SMA-9) ✅ 2026-05-25
- W2-02 Prisma Schema (multi-domain) ✅
- W2-03 pgvector Migration (SMA-10) ✅ 2026-05-25
- W2-02 Prisma Seed Data (SMA-8) ✅ 2026-05-25 — 40 users, 10 kelas, 4 jurusan
- W3-01 GitHub Actions CI ✅
- W3-04 Next.js Web Scaffold ✅
- SMA-6 Cloudflare DNS ✅ 2026-05-27 — 9 records aktif. NS `celeste` + `corey` sudah diset di Hostinger (registrar). Propagasi berjalan.
- W4-01 Dokumentasi Arsitektur (SMA-18) ✅ 2026-05-29 — 3 dokumen selesai:
  `docs/architecture/system-overview.md`, `docs/deployment/env-variables.md`,
  `docs/deployment/setup-server.md`. Sekalian fix 2 production issues:
  REDIS_URL URL-encoding (Zod reject karena `@`/`#` di password) → python3
  encode di deploy.yml; healthcheck curl missing di node:20-alpine → apk add
  curl di runner stage. Deploy production berhasil commit fb71fc3.
- FIX-WEB-BUILD-31 ✅ 2026-05-29 — React error #31 saat `next build` diperbaiki.
  Root cause: duplikasi React 18 (root node_modules) vs React 19 (apps/web node_modules).
  Fix: tambah `overrides` di root package.json, regenerasi package-lock.json.
  Arsitektur: SessionProvider dipindah ke DashboardProviders.tsx (hanya /dashboard/*).
  Bukti: `✓ Generating static pages (7/7)` + `npx tsc --noEmit → 0 errors`.
  Done report: `.tasks/done/FIX-react19-duplicate-DONE.md`
  Lesson learned: monorepo npm workspaces bisa install versi React berbeda di
  tiap workspace jika tidak di-pin dengan overrides → selalu cek duplikasi
  dengan `npm ls react` saat ada React version error.

## ⚠️ DIKLAIM SELESAI — BELUM DIVERIFIKASI RUNTIME

- W2-05 NestJS API Scaffold — ⚠️ ada temuan T-01 & T-02, lihat SMA-22 & SMA-23
- W3-03 Security Hardening — ⚠️ ada temuan T-01 (Zod global) & T-02 (APP_GUARD), lihat SMA-22 & SMA-23

---

*Cowork AI akan update file ini setiap task selesai.*
*Claude Code: jika sebuah task sudah selesai, beri tahu Cowork via laporan akhir di current.md*
*Aturan baru: JANGAN centang ✅ tanpa bukti runtime. Lihat CLAUDE.md Section 9.*
