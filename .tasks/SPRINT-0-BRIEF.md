# SPRINT-0 TAHAP 1 — Brief Siap-Eksekusi untuk Claude Code

> **Untuk:** Claude Code (Sonnet 4.5+ / Haiku 4.5 sesuai tiap task)
> **Dari:** System Analyst (rekonsiliasi 2026-05-29)
> **Sumber kebenaran status:** `.tasks/queue.md` (canonical ledger)
> **Aturan mutlak:** JANGAN centang ✅ tanpa bukti runtime (CLAUDE.md §9, temuan O-02).
>
> Sprint-0 = menuntaskan 4 carryover Tahap 0 sebelum desain Tahap 1 dibuka penuh.
> Kerjakan **berurutan T1 → T4**. T1, T2, T3 boleh paralel; T4 sebaiknya terakhir
> (butuh konteks dari T1–T3). Setiap task = 1 branch + 1 PR + 1 laporan `done/`.

---

## Cara pakai brief ini (baca dulu)

1. Mulai task dengan membaca: brief task ini → `CLAUDE.md` (§3 tech stack, §5 conventions, §9 runtime verification) → file nyata yang disebut.
2. Branch: `feat/SMA-XX-deskripsi-singkat`. Commit: conventional commits.
3. Sebelum klaim selesai, jalankan **blok Runtime Verification** dan tempel output-nya ke laporan.
4. Laporan akhir: `.tasks/done/SMA-XX-<slug>-DONE.md` + update baris status di `.tasks/queue.md`.
5. Jika asumsimu berbeda dari brief, sebut eksplisit dulu — jangan diam-diam menyimpang.

---

# ┌─ T1 · W2-04 — n8n Workflow (SMA-12) ─────────────────────────────┐

**Model:** Haiku 4.5 · **Estimasi:** 1 jam · **Severity carryover:** ⛔ Belum
**Branch:** `feat/SMA-12-n8n-workflows`

### Tujuan
Service `n8n` sudah ada di `infrastructure/docker/docker-compose.yml`, TAPI belum ada
satupun workflow. Buat 2 workflow JSON yang bisa di-import ke n8n.

### File yang DIBUAT (baru)
```
infrastructure/n8n/workflows/health-check.json
infrastructure/n8n/workflows/backup-daily.json
infrastructure/n8n/README.md         (cara import + env var yang dibutuhkan)
```

### Spesifikasi workflow

**1) health-check.json**
- Trigger: Schedule / Cron — setiap 5 menit.
- Node HTTP Request → `GET http://api:3001/health` (nama service Docker, bukan localhost).
  - Catatan: `/health` di-exclude dari prefix `api/v1` (lihat `apps/api/src/main.ts`), jadi
    URL benar = `http://api:3001/health`, bukan `/api/v1/health`.
- Node IF: cek `statusCode !== 200` ATAU response tidak memuat `"status":"ok"`.
- Jika DOWN → node notifikasi (gunakan placeholder webhook/WA Fonnte; JANGAN hardcode token,
  pakai n8n credential / env `{{$env.FONNTE_TOKEN}}`).
- Beri nama node yang jelas (mis. "Cek API /health", "Notif jika DOWN").

**2) backup-daily.json**
- Trigger: Cron — `0 19 * * *` (= 02:00 WIB / UTC+7). Sertakan komentar timezone.
- Catatan penting: backup pg_dump SUDAH berjalan via service `pg-backup`
  (`infrastructure/docker/scripts/backup.sh`, cron container). Workflow ini berperan sebagai
  **monitor/konfirmasi**, BUKAN duplikasi pg_dump. Isi:
  - Node Execute/HTTP untuk cek bahwa file backup hari ini ADA di MinIO bucket `diis-backup`
    (mis. via MinIO API / mc, atau HTTP HEAD ke object). Pakai env untuk endpoint & kredensial.
  - Node IF: jika file hari ini TIDAK ada → notif WA "Backup GAGAL".
  - Jika ada → notif ringkas "Backup OK <ukuran>".

### Constraints
- Tidak ada secret hardcoded — semua kredensial via n8n credentials atau `{{$env.*}}`.
- JSON harus valid (bisa di-`JSON.parse`) dan importable n8n (struktur `nodes` + `connections`).
- Jangan ubah `docker-compose.yml` kecuali menambah env var yang benar-benar dibutuhkan
  (kalau menambah, update juga `.env.example`).

### Runtime Verification (wajib, tempel output)
```bash
# 1) JSON valid
for f in infrastructure/n8n/workflows/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('OK $f')"; done
# 2) (jika n8n jalan) import & trigger manual health-check → lihat eksekusi sukses di UI n8n,
#    screenshot 1 eksekusi "success". Jika n8n belum jalan di lingkunganmu, cukup buktikan
#    JSON valid + jelaskan langkah import di README.
```

### Definition of Done
- [ ] 2 file workflow + README dibuat, JSON valid (output di laporan).
- [ ] Tidak ada secret hardcoded (`grep -riE "token|password|secret" infrastructure/n8n/workflows` → hanya `{{$env...}}`/placeholder).
- [ ] `.tasks/done/SMA-12-n8n-DONE.md` + update status W2-04 di `queue.md`.

# └──────────────────────────────────────────────────────────────────┘

---

# ┌─ T2 · W3-02 — Monitoring: Grafana + /metrics (SMA-15) ────────────┐

**Model:** Haiku 4.5 (kode /metrics: boleh Sonnet) · **Estimasi:** 1.5 jam · **Status:** 🟡 Parsial
**Branch:** `feat/SMA-15-monitoring-grafana`

### Tujuan
Saat ini hanya ada `infrastructure/docker/monitoring/prometheus.yml`. Lengkapi monitoring:
(a) expose `/metrics` Prometheus di NestJS, (b) pastikan prometheus scrape API, (c) 3 dashboard Grafana.

### Bagian A — Endpoint /metrics di NestJS (apps/api)
- Tambah dependency `@willsoto/nestjs-prometheus` + `prom-client` (atau setara untuk Fastify).
- Daftarkan modul metrics; expose route `GET /metrics` dan tandai `@Public()` (lihat
  `apps/api/src/auth/decorators/public.decorator.ts`) agar tidak kena KeycloakGuard.
- `/metrics` juga harus di-exclude dari rate-limit berat bila perlu, tapi minimal harus
  bisa diakses tanpa token.
- Default metrics (process, heap, event loop lag) + minimal 1 custom counter http request.

### Bagian B — Prometheus scrape
- Edit `infrastructure/docker/monitoring/prometheus.yml`: tambah job `smk-api`
  target `api:3001`, path `/metrics`, interval 15s.

### Bagian C — Grafana dashboards (file baru)
```
infrastructure/docker/monitoring/dashboards/nodejs.json
infrastructure/docker/monitoring/dashboards/postgresql.json
infrastructure/docker/monitoring/dashboards/redis.json
infrastructure/docker/monitoring/dashboards/provisioning.yml   (auto-load dashboards)
```
- Boleh pakai dashboard ID komunitas yang sudah dikenal sebagai basis (Node.js, PostgreSQL,
  Redis), tapi simpan sebagai JSON lokal (jangan andalkan import online saat runtime).
- `provisioning.yml` + datasource Prometheus agar Grafana auto-load.

### Constraints
- `/metrics` JANGAN bocorkan data sensitif (tidak ada label berisi data siswa).
- Perubahan `apps/api` wajib lulus `npx tsc --noEmit` dan test lama tetap hijau.

### Runtime Verification (wajib)
```bash
# build + type-check
cd apps/api && npx tsc --noEmit && echo "TSC OK"
# (jika API jalan) endpoint metrics
curl -sf http://localhost:3001/metrics | head -20    # harus muncul metrik prom (mis. process_cpu...)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/metrics   # 200 tanpa token
# JSON dashboards valid
for f in infrastructure/docker/monitoring/dashboards/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'));console.log('OK $f')"; done
```

### Definition of Done
- [ ] `/metrics` 200 tanpa token (bukti curl). Test apps/api tetap 62/62.
- [ ] prometheus.yml punya job `smk-api`. 3 dashboard JSON valid + provisioning.
- [ ] `.tasks/done/SMA-15-monitoring-DONE.md` + update status W3-02 di `queue.md`.

# └──────────────────────────────────────────────────────────────────┘

---

# ┌─ T3 · W4-02 — Developer Onboarding Guide (SMA-19) ───────────────┐

**Model:** Haiku 4.5 · **Estimasi:** 45 menit · **Status:** ⛔ Belum
**Branch:** `feat/SMA-19-onboarding-guide`

### Tujuan
Buat 1 dokumen agar developer baru bisa jalan dari nol tanpa bantuan tambahan.

### File yang DIBUAT
```
docs/onboarding/developer-guide.md
```

### Isi wajib (semua path & command HARUS diverifikasi nyata, dilarang fiktif)
- **Prasyarat:** Node.js 20, Docker Compose v2, npm, Git.
- **Clone & setup:** clone → copy `.env` dari `.env.example` → `npm install`.
- **Dev lokal:**
  - `docker compose -f infrastructure/docker/docker-compose.dev.yml up -d`
    (hanya postgres, redis, keycloak — bukan 14 service).
  - `npm run dev` dari root (Turborepo).
  - API → `localhost:3001`, Web → `localhost:3000`.
  - Migrate + seed: rujuk perintah nyata di `packages/database` (`db:migrate`, `db:seed` via turbo).
- **Struktur monorepo:** ringkas `apps/`, `packages/`, `infrastructure/`, `docs/`.
- **Workflow:** branch `feat/SMA-XX-...`, conventional commits, PR ke `main`, CI hijau dulu.
- **Tech stack:** link ke `CLAUDE.md` §3.
- **Akses service via SSH tunnel:** link ke `docs/development-setup.md`.
- **Troubleshooting:** REDIS_URL/DATABASE_URL wajib URL-encode password (`@`/`#` dll);
  `npm ci` gagal → cek Node 20, hapus node_modules; Keycloak belum ready → tunggu ~90s,
  cek `docker compose logs keycloak`; React error #31 → lihat `overrides` di root package.json.

### Constraints
- Tidak ada kode baru. Tidak ada info sensitif (pakai placeholder `<nilai>`).
- Setiap command yang ditulis harus benar-benar ada di repo (cek `package.json` scripts dulu).

### Runtime Verification (wajib)
```bash
# Semua path yang dirujuk benar-benar ada
for p in infrastructure/docker/docker-compose.dev.yml docs/development-setup.md .env.example; do test -e "$p" && echo "ADA $p" || echo "MISSING $p"; done
# Semua script yang dirujuk ada di package.json
node -e "const s=require('./package.json').scripts; ['dev','db:migrate','db:seed'].forEach(k=>console.log(k, k in s?'OK':'MISSING'))"
```

### Definition of Done
- [ ] `docs/onboarding/developer-guide.md` dibuat; semua path/command terverifikasi (output di laporan).
- [ ] `.tasks/done/SMA-19-onboarding-DONE.md` + update status W4-02 di `queue.md`.

# └──────────────────────────────────────────────────────────────────┘

---

# ┌─ T4 · W4-04 — Sprint Plan Tahap 1 (gerbang ke Tahap 1) ──────────┐

**Model:** Sonnet 4.5+ (keputusan desain berdampak panjang) · **Estimasi:** 2 jam · **Status:** ⛔ Belum
**Branch:** `feat/W4-04-tahap1-sprint-plan`

### Tujuan
Ini **gerbang resmi** ke Tahap 1 yang selama ini hilang. Hasilkan rencana desain — bukan kode.

### File yang DIBUAT
```
docs/tahap1-sprint-plan.md
```

### Isi wajib (ini fase DESAIN, dokumen, bukan implementasi)
1. **Ringkasan & tujuan Tahap 1** + Definition of Done fase.
2. **ERD final + perbaikan model data** (rujuk temuan laporan):
   - Konsolidasi 2 model RAG `KnowledgeDocument` vs `AiDocument` → satu model (temuan N-2).
   - Perjelas boundary domain `academic` vs `teacher` (temuan T-12).
   - Hapus/justifikasi skema `finance` & `notification` yang masih kosong di `schema.prisma`
     (temuan N-1) — buat keputusan: dibuat modelnya sekarang atau dihapus dulu.
3. **API contract prioritas** (auth, student, ppdb, academic, finance): daftar endpoint + method
   + ringkas request/response. Format OpenAPI-ish atau tabel.
4. **RBAC matrix granular** per resource × 7 role (rujuk `CLAUDE.md` §6 sebagai dasar, perdalam
   ke level aksi: create/read/update/delete/approve).
5. **Event architecture** antar modul (diagram ASCII boleh) — event apa, producer, consumer.
6. **AI orchestration decision tree:** kapan Ollama (lokal) vs Claude API vs ML custom; sebut
   rencana abstraksi `AIGateway` + `NotificationAdapter` (temuan T-09).
7. **Breakdown task per sprint** (2 minggu/sprint) untuk Tahap 1.
8. **Prasyarat regulasi yang berjalan paralel:** DPIA/UU PDP (R-01), anonimisasi embedding (R-03),
   DPA mitra industri (R-04) — cukup tandai sebagai trek paralel + owner.

### Constraints
- Dokumen desain saja, TIDAK mengubah kode/schema (perubahan schema dieksekusi di task Tahap 1 berikutnya).
- Konsisten dengan tech stack immutable (`CLAUDE.md` §3) dan 7 role immutable (§6).
- Setiap keputusan desain beri 1 kalimat alasan (trade-off).

### Runtime Verification (wajib — untuk dokumen = cek konsistensi, bukan curl)
```bash
# Pastikan dokumen merujuk entitas yang benar-benar ada di schema saat ini
grep -nE "model (User|Class|Student|Teacher|PpdbLead|KnowledgeDocument|AiDocument)" packages/database/prisma/schema.prisma
# Pastikan tidak menyebut role di luar 7 role resmi
grep -oE "SUPER_ADMIN|KEPALA_SEKOLAH|TATA_USAHA|GURU|SISWA|ORANG_TUA|INDUSTRI" docs/tahap1-sprint-plan.md | sort -u
```

### Definition of Done
- [ ] `docs/tahap1-sprint-plan.md` lengkap mencakup 8 bagian di atas.
- [ ] Keputusan N-1, N-2, T-12, T-09 dijawab eksplisit (apa yang akan dilakukan di Tahap 1).
- [ ] `.tasks/done/W4-04-sprint-plan-DONE.md` + update status W4-04 di `queue.md`.
- [ ] Setelah T4 selesai → Sprint-0 SELESAI → buka Gelombang 2 (Desain Tahap 1) di laporan analyst.

# └──────────────────────────────────────────────────────────────────┘

---

## Setelah Sprint-0 selesai
Lanjut ke **Gelombang 2 & 3** di `Laporan_System_Analyst_DIIS_2026-05-29.docx` §8:
desain ERD final + abstraksi AIGateway/Notification (Sonnet), lalu trek regulasi UU PDP (Sonnet).
Adakan **design-gate review** sebelum coding modul Tahap 2 dimulai.

*Disusun oleh System Analyst — 2026-05-29. Patuh O-02: bukti runtime sebelum ✅.*
