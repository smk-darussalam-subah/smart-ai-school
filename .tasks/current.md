# TASK AKTIF — W4-01 Dokumentasi Arsitektur (SMA-18)

**Update oleh:** Cowork AI
**Tanggal:** 2026-05-28

---

## W3-03 Selesai ✅

| Item | Status |
|---|---|
| 12/12 security hardening items diverifikasi | ✅ |
| 62/62 tests PASS (8 test suites) | ✅ |
| env.validation.ts fail-fast di startup | ✅ |
| Bug fix: Helmet Express → Fastify onSend hook | ✅ |
| CLAUDE.md Section 10 + 2 keputusan arsitektur baru | ✅ |
| Done report: `.tasks/done/SMA-16-W3-03-DONE.md` | ✅ |

---

## TASK AKTIF — W4-01 Dokumentasi Arsitektur (SMA-18)

**Linear:** SMA-18
**Estimasi:** 1.5 jam
**Model rekomendasi:** Claude Haiku 4.5

### Scope — 3 dokumen:

#### 1. `docs/architecture/system-overview.md`
Dokumen teknis arsitektur sistem DIIS. Isi:
- Diagram teks (ASCII/mermaid) infrastruktur Docker (14 services)
- Penjelasan setiap layer: Frontend → API → Auth → DB → Cache → AI → Monitoring → Backup
- Network topology (smk-network internal, nginx sebagai satu-satunya public-facing)
- Role-based access matrix ringkasan (7 roles)
- Tech stack table lengkap (dari CLAUDE.md Section 3)
- Data flow diagram: user request → nginx → api → keycloak verify → postgres

#### 2. `docs/deployment/env-variables.md`
Dokumentasi lengkap semua environment variable. Isi:
- **apps/api/.env** — semua var dari `env.validation.ts` + optional vars
- **apps/web/.env.local** — NEXTAUTH_URL, NEXTAUTH_SECRET, KEYCLOAK_*, API_URL
- **infrastructure/docker/docker-compose.yml** — semua `${VAR}` yang digunakan services
- Format tabel: Variable | Required | Default | Deskripsi | Contoh Nilai
- Security note: file mana yang TIDAK boleh di-commit ke git

#### 3. `docs/deployment/setup-server.md`
Panduan setup VPS baru dari scratch. Isi:
- Prasyarat: Ubuntu 22.04, Docker Compose v2, minimum spec (2 CPU, 4GB RAM)
- Step-by-step: clone repo → copy .env → docker compose up
- Keycloak first-time setup (import realm, buat admin user)
- DNS + Cloudflare config ringkasan
- Verifikasi deployment (checklist `docker compose ps` semua healthy)
- Referensi ke docs lain (development-setup.md, restore-database.md)

### Constraints
- Tidak ada kode baru — dokumentasi saja
- Semua path file harus akurat (cek dari codebase nyata)
- Tidak ada info sensitif (password, IP VPS, API key) — pakai placeholder `<nilai>`
- `npx tsc --noEmit` tidak perlu dijalankan (tidak ada kode TypeScript)

### Definition of Done
- [ ] `docs/architecture/system-overview.md` dibuat
- [ ] `docs/deployment/env-variables.md` dibuat
- [ ] `docs/deployment/setup-server.md` dibuat
- [ ] Semua path file di dokumen akurat (tidak ada referensi file fiktif)
- [ ] Laporan di `.tasks/done/SMA-18-W4-01-DONE.md`

---

## Paralel (bisa dikerjakan Claude Code bersamaan):

| Task | Linear | Estimasi | Model |
|---|---|---|---|
| W4-02 Developer Onboarding Guide | SMA-19 | 45 menit | Haiku |
| W2-04 n8n workflow health-check | SMA-12 | 1 jam | Haiku |
