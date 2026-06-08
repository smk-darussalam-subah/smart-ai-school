# Penutupan Tahap 1 — DIIS SMK Darussalam Subah

> Disusun: Cowork System Analyst, 2026-06-07. Status produksi: **VPS = repo (formalisasi tuntas)**,
> login + auth + dashboard inti live di `smkdarussalamsubah.sch.id`.
> Tahap 1 = **fondasi backend + auth + infrastruktur**. Frontend operasional per-modul = **Tahap 2**.

---

## 1. Ringkasan jujur

**Tahap 1 SELESAI** untuk lingkup yang direncanakan: backend semua modul P0, autentikasi end-to-end,
infrastruktur produksi, observability, landing page, dan beberapa dashboard kunci. **Frontend masih
parsial** (5 dari 12 halaman) — UI per-modul tidak pernah masuk scope Sprint 1–4 dan **dipindah ke Tahap 2**.

Selama penutupan, ditemukan bahwa **seluruh sisi terautentikasi tak pernah berfungsi di produksi**
(login + dashboard) — dibongkar & dipulihkan berlapis (N-21…N-26). Itu kini **hidup pertama kalinya**.

---

## 2. SELESAI & live di produksi

**Infrastruktur & ops**
- Docker Compose (VPS Hetzner), CI/CD GitHub Actions (gitflow feat→develop→staging→main).
- nginx reverse proxy + Cloudflare Full (Strict) TLS end-to-end.
- Observability: Prometheus + Grafana + postgres/redis exporter; Sentry (OBS-1) + scrub PII (OBS-1a).
- Metabase (analytics), MinIO, n8n, backup harian PostgreSQL.
- start.sh fail-hard + smoke-test skema (N-15/N-15a) — guardrail anti-insiden N-14.

**Autentikasi (pulih penuh)**
- Keycloak SSO realm `diis` (client `diis-web` confidential, `diis-api` bearer-only), 7 role.
- next-auth + RolesGuard; rantai login N-21 (CSP nonce) · N-21a (CSP statis) · N-22 (env server) ·
  N-23 (issuer https/proxy) · N-24 (next.config build-bake) · N-25 (nginx buffer) · N-26 (realm/client prod URL).

**Backend — 44 endpoint (lihat `docs/api/api-reference.md`)**
- Auth/me, Student (CRUD), PPDB (pipeline lead), TeachingAssignment, Grade, Attendance, Schedule,
  Finance SPP (+approval separation-of-duties), Notification (events + adapter, internal), AI
  (RAG chat, Knowledge Base CRUD draft→publish, chat history).

**Frontend (parsial, live)**
- Landing page sekolah (TAYANG), Dashboard, Dashboard Eksekutif (Metabase embed + KPI), Basis
  Pengetahuan (UI KB), Portal Nilai, System Health.

**Kualitas**
- E2E suite jalur P0 (SMA-50, 28 skenario, DB test terisolasi).
- Audit RBAC (SMA-51, 26 area clean + F-1/F-2 fixed).
- Index performa additif (SMA-52, 5 index beralasan).
- Referensi API lengkap (SMA-53, 44 endpoint).

---

## 3. CARRY-OVER ke Tahap 2 (eksplisit, tidak hilang)

**Frontend operasional (utama Tahap 2)**
- 7 halaman modul: Data Siswa, Akademik, PPDB, Keuangan, AI Asisten, Manajemen User, System Health (rute).
- Gate sidebar sementara agar tak ada link 404 (quick win bila diinginkan sebelum Tahap 2).

**Bug / penyempurnaan tertunda**
- **Data knowledge/KPI Eksekutif gagal render** — terkait React #418 (hydration) akibat Cloudflare
  Email Obfuscation/Rocket Loader menyuntik HTML. Cloudflare **dibiarkan** (dibutuhkan landing).
  Solusi Tahap 2: scope obfuscation hanya ke landing (page rule), atau perbaikan hydration.
- OBS-1b: scrub Sentry untuk nama/NIS tak berlabel. N-9b: idempotensi notifikasi.

**Keamanan & hardening (Fase 4 — backlog)**
- **N-23b:** Keycloak `start-dev` → production `start` (`KC_HOSTNAME`, optimized); **tutup port 8080** publik (admin via SSH tunnel).
- **N-20:** staging & produksi berbagi server + DB `smk_db` → isolasi (DB/stack/server staging terpisah).
- Rotasi secret lama (mis. `.env.local` dev yang sempat memuat secret); audit tak ada secret di repo.

**Regulasi (gerbang tetap aktif)**
- **R-03:** ClaudeAdapter tetap flag-OFF sampai deteksi PII diperkuat + `ANTHROPIC_API_KEY` + audit egress.
- **R-05:** semua data dummy sampai consent terkumpul (belum ada data siswa nyata).

---

## 4. Catatan arsitektur produksi (untuk Tahap 2)

- DB `smk_db` dibagi DIIS + Keycloak + n8n + Metabase (N-16 — isolasi `diis_db` ditunda).
- Deploy: branch `staging`/`main` push → Action SSH ke VPS (user `appuser`) → git pull + build. Git VPS
  **harus** sebagai `appuser` (punya deploy key); root tak punya key (N-28).
- VPS=repo per 2026-06-07; perubahan produksi WAJIB lewat gitflow + review (tidak ada tambal langsung).

---

## 5. Status gerbang regulasi
| Gerbang | Status |
|---|---|
| R-03 strip-PII sebelum egress Claude | OPEN — ClaudeAdapter flag-OFF |
| R-05 consent sebelum data siswa nyata | AKTIF — semua dummy |
| UU PDP (data minor) | scrub Sentry aktif; hardening lanjut Tahap 2 |

---

*Tahap 1 ditutup atas keputusan Director 2026-06-06/07. Tahap 2 dimulai dari: frontend modul + hardening
keamanan (N-23b/N-20) + perbaikan data knowledge. Ledger kanonik: `.tasks/queue.md`.*
