# SMA-19 — Developer Onboarding Guide (W4-02) + SMA-15 Exporter Addendum DONE

**Branch:** `feat/SMA-19-onboarding-exporter`
**Commit:** `b40a299`
**Selesai:** 2026-05-30

---

## File Dibuat / Diubah

| File | Perubahan |
|---|---|
| `docs/onboarding/developer-guide.md` | Panduan lengkap developer baru (T3 SMA-19) |
| `infrastructure/docker/docker-compose.yml` | Tambah postgres-exporter + redis-exporter (SMA-15 addendum) |

---

## T3 SMA-19 — Isi Onboarding Guide

- **Prasyarat:** Node.js 20, Docker Compose v2, npm, Git
- **Clone & setup:** clone → copy `.env.example` → `npm install`
- **Dev Docker:** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis keycloak`
- **Dev app:** `npm run db:migrate` → `npm run db:seed` → `npm run dev`
- **Port:** Web :3000, API :3001, Keycloak :8080
- **Monorepo structure:** apps/, packages/, infrastructure/, docs/
- **Git workflow:** branch `feat/SMA-XX-...`, conventional commits, PR ke main, CI hijau
- **Troubleshooting:** URL-encode password, npm ci, Keycloak wait, React error #31

## SMA-15 Exporter Addendum

- `postgres-exporter` (prometheuscommunity/postgres-exporter): port 9187 internal only
  - `DATA_SOURCE_NAME=${DATABASE_URL}`, `depends_on: postgres healthy`
- `redis-exporter` (oliver006/redis_exporter): port 9121 internal only
  - `REDIS_ADDR=${REDIS_URL}`, `depends_on: redis`
- prometheus.yml sudah punya scrape job `postgres` + `redis` → tidak perlu diubah

---

## Bukti Runtime (O-02)

```
=== 1) Path verification T3 ===
ADA: infrastructure/docker/docker-compose.dev.yml
ADA: docs/development-setup.md
ADA: .env.example
ADA: docs/onboarding/developer-guide.md

=== 2) Script verification T3 ===
dev   OK
db:migrate  OK
db:seed  OK

=== 3) docker compose config exporter ===
exit=0  (hanya warnings env var tidak di-set lokal — expected)
postgres-exporter: image=prometheuscommunity/postgres-exporter, network=smk-network, restart=unless-stopped ✓
redis-exporter:    image=oliver006/redis_exporter, network=smk-network, restart=unless-stopped ✓
```
