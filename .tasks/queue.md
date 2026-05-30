# TASK QUEUE — DIIS Tahap 0 → Sprint-0 Tahap 1

> ⭐ **FILE INI = SATU-SATUNYA SUMBER KEBENARAN STATUS (canonical ledger).**
> Dokumen lain (`current.md`, `CLAUDE.md` §7, gate docs) hanya MENAUTKAN ke sini,
> tidak menduplikasi status. Jika ada konflik, file INI yang menang.
> Dikelola oleh Cowork AI. Claude Code hanya membaca file ini.
> Update terakhir: 2026-05-29 — Rekonsiliasi status (Laporan System Analyst v2.0).

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

### [QUEUE-1] W3-02 Monitoring Config — 🟡 PARSIAL (2 gap terbuka)
**Linear:** SMA-15 | **Status:** 🟡 Merged ke main, dua gap belum selesai
**Branch merged:** `feat/SMA-15-monitoring-grafana` → main (PR #9, 2026-05-30)

**Yang sudah di main:**
- `/metrics` endpoint NestJS (prom-client default + `smk_http_requests_total`), @Public(), TSC OK, 62/62 hijau
- `prometheus.yml`: fix port api:3000→3001, scrape_interval 15s semua job
- Grafana: dashboards nodejs/postgresql/redis + provisioning + datasource config

**Gap 1 — Runtime /metrics (wajib sebelum ✅):**
Verifikasi di VPS setelah deploy:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.smkdarussalamsubah.sch.id/metrics
# harus 200 → baru update status ke ✅
```

**Gap 2 — Exporter code belum di main (dashboard PG + Redis kosong tanpa ini):**
Commit `267aefd` (postgres-exporter + redis-exporter ke docker-compose.yml) dibuat
SETELAH PR #9 di-merge → orphan di closed branch, tidak masuk main.
Status: akan diselesaikan di sesi T3 (SMA-19 Onboarding), bundled task.
Lihat [QUEUE-1b] di bawah.

**Laporan:** `.tasks/done/SMA-15-monitoring-DONE.md`

---

### [QUEUE-1b] SMA-15 Addendum — Exporter services (follow-up, bundled dengan T3)
**Status:** ⏳ Belum di main | **Estimasi:** 15 menit | **Prioritas:** Bundel dengan T3

**Scope:**
- Tambah `postgres-exporter` (prometheuscommunity/postgres-exporter, port 9187 internal)
  ke `docker-compose.yml`: `DATA_SOURCE_NAME=${DATABASE_URL}`, `depends_on: postgres`
- Tambah `redis-exporter` (oliver006/redis_exporter, port 9121 internal)
  ke `docker-compose.yml`: `REDIS_ADDR=${REDIS_URL}`, `depends_on: redis`
- Sudah ada di commit `267aefd` di `origin/feat/SMA-15-monitoring-grafana` — tinggal cherry-pick
  atau tulis ulang di branch T3

**Tanpa ini:** dashboard Grafana PostgreSQL & Redis tampil "No data" karena Prometheus
tidak punya target untuk scrape metrics postgres/redis.

---

### [QUEUE-2] W4-01 Dokumentasi Arsitektur
**Linear:** SMA-18 | **Estimasi:** 1.5 jam

**Scope:**
- `docs/architecture/system-overview.md`
- `docs/deployment/env-variables.md`
- `docs/deployment/setup-server.md`

---

### [QUEUE-3] W4-02 Developer Onboarding Guide
**Linear:** SMA-19 | **Estimasi:** 45 menit
**Depends on:** Semua task teknis selesai

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
