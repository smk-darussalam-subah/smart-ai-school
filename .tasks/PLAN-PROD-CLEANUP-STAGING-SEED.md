# PLAN: Production Cleanup + Staging Seed Complete

> **Dibuat:** 2026-07-02 | **Revisi:** 2026-07-02 (v2 — tambah FASE 2.5)
> **Status:** APPROVED — eksekusi dimulai
> **Tujuan:** (1) Bersihkan produksi dari data dummy agar siap diisi data nyata sekolah. (2) Lengkapi staging dengan seed komprehensif untuk demo VIP. (3) Refactor frontend SIM constants menjadi honest empty states untuk fitur yang sudah wired.

---

## KEPUTUSAN ARSITEKTUR (QA dari Director)

### Q1: Apakah data SIM/Fase 2 juga terhapus?
**Jawab:** Dua jenis data SIM berbeda:
- **Database seed data** (grades, attendance, SPP di `smk_db`) → **TERHAPUS** oleh purge script.
- **Frontend SIM constants** (`SIM_HEALTH`, `SIM_DAILY_QUEST` di `.tsx` files) → **TIDAK terhapus** oleh purge. Ini kode, bukan data.

### Q2: Apa yang terjadi dengan SIM di prod setelah purge?
**Jawab:** Tanpa perubahan kode, prod akan menampilkan SIM constants sebagai fallback ketika API return empty. **Ini SALAH** — user melihat data palsu.

**Solusi (FASE 2.5):** Untuk fitur yang SUDAH wired ke backend, ubah pattern dari:
```javascript
// BEFORE (menampilkan data palsu di prod)
const data = realData.length > 0 ? realData : SIM_CONSTANT;
```
menjadi:
```javascript
// AFTER (honest empty state di prod, real data di staging)
const data = realData.length > 0 ? realData : EMPTY_STATE;
```

**Tiga tingkat treatment:**
| Status Fitur | Staging | Production | Pattern |
|---|---|---|---|
| **Fully wired** | Real seed data | **Empty state** | `realData ?? EMPTY` (no SIM) |
| **Genuinely Fase 2** | SIM with label | SIM with label | `SIM_CONSTANT` (keep — real future feature) |

### Q3: Apakah kode prod = kode staging?
**Jawab:** **YA, 100% identik.** Satu Git repo, satu Dockerfile, satu CI pipeline. Yang berbeda HANYA:
- Database: `smk_db` (prod, clean) vs `smk_staging_db` (staging, seeded)
- URL: `smkdarussalamsubah.sch.id` vs `staging.smkdarussalamsubah.sch.id`
- Docker Compose: `docker-compose.yml` vs `docker-compose.staging.yml`

**Code, build, dan API identik.** QA di staging = valid untuk prod.

---

## Konteks

### Yang terjadi saat ini:
- **`smk_db` (production):** Berisi data dummy dari `seed.ts` (40 users, 10 kelas, grades, attendance, SPP, RPP). Data ini **bukan data sekolah nyata** — hanya seed untuk testing awal sebelum staging ada.
- **`smk_staging_db` (staging):** Database terpisah ADA (dibuat via `docker-compose.staging.yml` → `db-init-staging`). `seed-demo-staging.ts` ADA (264 lines) dengan data demo lengkap: attendance 14 hari, grades, SPP, RPP, PPDB leads, jadwal. Namun staging mungkin belum di-redeploy dengan kode terbaru.
- **Frontend:** Banyak komponen masih menampilkan SIM constants sebagai fallback. Backend endpoints untuk sebagian besar sudah ada dan wired (T1-T3 audit selesai).

### Yang seharusnya terjadi:
- **Production (`main`):** **KOSONG dari seed data.** Siap diisi data nyata dari sekolah. Semua dashboard menampilkan empty state yang jujur ketika belum ada data. **Tidak ada data dummy palsu.**
- **Staging (`staging`):** **Penuh dengan data demo komprehensif** untuk QA testing dan demo VIP. Data mencakup semua kriteria di PANDUAN-TESTING-A-Z-v2 §1.4.

---

## FASE 1: Cleanup Produksi — Hapus Data Dummy dari `smk_db`

### 1.1 Buat script `purge-seed-data.ts`
Script idempotent yang menghapus SEMUA data transaksional dari `smk_db` tetapi MEMPERTAHANKAN:
- Schema (tabel, indexes, constraints)
- Users di Keycloak (admin, ks, guru, siswa, ortu — akun test untuk login)
- `auth.users` rows (sinkron dengan Keycloak)
- `school.school_profile` (nama sekolah, address, dll)
- `academic.subjects` (mapel referensi)
- `academic.classes` (struktur kelas — kosongkan students)
- `school.academic_years` + `school.semesters` (TA aktif)
- `auth.permissions` + `auth.role_permissions` (RBAC)

Yang DIHAPUS:
- `academic.grades` — semua nilai dummy
- `academic.attendance` — semua absensi dummy
- `academic.teaching_assignments` — semua assignment dummy (kecuali yang real)
- `academic.schedules` — semua jadwal dummy
- `academic.rpp` — semua RPP dummy
- `academic.lms_modules` + `academic.lms_module_progress` — semua modul dummy
- `academic.class_activities` — semua jurnal dummy
- `academic.report_cards` — semua rapor dummy
- `academic.assessment_sessions` + `academic.assessment_responses`
- `finance.spp_payments` — semua SPP dummy
- `ppdb.ppdb_leads` — semua leads dummy
- `gamification.*` — semua XP/badges/quests dummy
- `teacher.teacher_attendance` — semua presensi guru dummy
- `notification.notification_logs` — semua log WA dummy
- `auth.push_subscriptions` — semua push subs

### 1.2 Guard script
```typescript
// ABORT jika DATABASE_URL bukan production smk_db
if (!url.includes('smk_db') || url.includes('staging')) {
  console.error('❌ ABORT: Script ini hanya untuk smk_db (production).');
  process.exit(1);
}
// Konfirmasi manual
const confirm = await readLine('Ketik PURGE untuk menghapus semua data transaksional: ');
if (confirm !== 'PURGE') process.exit(1);
```

### 1.3 Eksekusi (Director via SSH)
```bash
docker exec smk-api sh -c 'cd /app/packages/database && \
  /app/node_modules/.bin/ts-node --transpile-only prisma/purge-seed-data.ts'
```

---

## FASE 2: Staging Seed Complete — Perpanjang `seed-demo-staging.ts`

### 2.1 Data yang sudah ada di `seed-demo-staging.ts`:
- ✅ Attendance siswa 14 hari (deterministik, alpha kronis)
- ✅ TeacherAttendance hari ini (~85%)
- ✅ Grades per kelas × mapel (4 grade types per siswa)
- ✅ SppPayment 4 bulan (paid/unpaid/late mix)
- ✅ Rpp per guru (approved/submitted/revision/draft)
- ✅ PpdbLead funnel (63 leads, 8 status)
- ✅ Schedule mingguan (auto-placement, no conflicts)

### 2.2 Data yang perlu DITAMBAH ke `seed-demo-staging.ts`:

| Item | Kebutuhan | Estimasi |
|------|-----------|----------|
| **LMS Modules** | 5 modul published per guru (dengan materi, TP, KKTP) | 30 menit |
| **LMS Module Progress** | Progress 0-100% per siswa (sebagian completed) | 20 menit |
| **Assessment Sessions** | 2 sesi (1 diagnostik, 1 formatif) dengan questions JSON | 30 menit |
| **Badge Catalog** | 8 badge definitions (BRONZE/SILVER/GOLD/PLATINUM × 2) | 15 menit |
| **Student Badges** | 3 badge per siswa (random awarded) | 15 menit |
| **Student XP** | XP per siswa (100-2000 range) + 3-5 transactions | 20 menit |
| **Class Activities (Jurnal)** | 5 kegiatan per guru (pembelajaran category) | 15 menit |
| **Academic Calendar Events** | 5 events (holiday/exam/event/break) | 15 menit |
| **Announcements** | 5 pengumuman published (visible all roles) | 10 menit |
| **Notification Logs (WA)** | 5 entri WA log per siswa (absence notifications) | 15 menit |
| **Report Cards** | Generate 1 batch rapor per kelas (via API endpoint) | 20 menit |
| **KktpConfig** | 3-5 custom KKTP per mapel (via POST /kktp-config) | 10 menit |
| **Parent-Child Relations** | Pastikan ortu@diis.test punya child valid | 10 menit |
| **Inspector Account** | Guru testable dengan teaching assignment | ✅ sudah ada |

### 2.3 Kriteria seed staging (dari PANDUAN-TESTING-A-Z-v2 §1.4):
> 18 mapel · 10 kelas · 10 guru · 4 jurusan · 1 tahun ajaran · 1 semester aktif · 5 RPP (3 approved/1 submitted/1 draft) · jadwal Sen-Sab JP1-8 · SPP 3 bulan mix · 5 announcement published · 2 assessment session · badge katalog + 3 badge siswa · WA log 5 entri.

### 2.4 Eksekusi staging seed (Director via SSH):
```bash
# 1. Pastikan staging stack running
cd /opt/diis-staging && docker compose -f docker-compose.staging.yml up -d

# 2. Run migrations on staging DB
docker exec smk-staging-api sh -c 'cd /app/packages/database && npx prisma migrate deploy'

# 3. Run base seed (users, classes, subjects)
docker exec smk-staging-api sh -c 'cd /app/packages/database && \
  /app/node_modules/.bin/ts-node --transpile-only prisma/seed.ts'

# 4. Run permissions seed
docker exec smk-staging-api sh -c 'cd /app/packages/database && \
  /app/node_modules/.bin/ts-node --transpile-only prisma/seed-permissions.ts'

# 5. Run demo staging seed (extended)
docker exec smk-staging-api sh -c 'cd /app/packages/database && \
  /app/node_modules/.bin/ts-node --transpile-only prisma/seed-demo-staging.ts'

# 6. Run attendance demo seed
docker exec smk-staging-api sh -c 'cd /app && \
  /app/node_modules/.bin/ts-node --transpile-only scripts/seed-attendance-demo.ts'
```

---

## FASE 3: Frontend SIM-to-EmptyState Refactoring

### 3.1 Principle
Untuk setiap fitur yang SUDAH wired ke backend, hapus SIM fallback dan ganti dengan honest empty state.
SIM constants DIPERTAHANKAN hanya untuk fitur yang genuinely Fase 2 (Kiosk TTS, realtime KBM WebSocket).

### 3.2 Daftar komponen yang perlu refactored:

**Priority 1 — KS Beranda (most visible to VIP):**
| Komponen | SIM Constant | Backend Wired | Refactor To |
|---|---|---|---|
| Health Score | `SIM_HEALTH` | `/analytics/grades` + `/attendance/heatmap` | Empty state: "Skor belum tersedia" |
| Tren Kehadiran | `SIM_TREN_*` | `/attendance/heatmap` (T2-02) | Empty chart with "Belum ada data tren" |
| Filter badge | "Filter SIMULASI" | Client-side filtering | Remove badge entirely |
| Guru Hadir KPI | "SIMULASI" sub | `/analytics/teacher-compliance` | Wire or empty: "—" |
| RPP Turnaround | `SIM_RPP_SLOW` | Derivable from `/rpp` | Compute from real RPP data |

**Priority 2 — KS Screens:**
| Komponen | SIM Constant | Backend Wired | Refactor To |
|---|---|---|---|
| KKTP "Simpan" | Button SIM | `/kktp-config` POST (B5) | Wire to `saveKktpConfig()` |
| Jadwal "Generate" | Auto-sched SIM | `/schedules/auto-generate` (B8) | Wire to `fetchAutoSchedule()` |

**Priority 3 — Siswa:**
| Komponen | SIM Constant | Backend Wired | Refactor To |
|---|---|---|---|
| Daily Quest | `SIM_DAILY_QUEST` | `/gamification/daily-quests` (B1) | Empty state: "Quest belum tersedia" |
| Personal Calendar | `SIM_KALENDER` | `/gamification/personal-calendar` (B2) | Empty state: "Jadwal belum tersedia" |

**KEEP (genuinely Fase 2 — no backend):**
| Komponen | Reason |
|---|---|
| Kiosk "Fase 2" TTS | Needs WebSocket/TTS module |
| Kiosk "Fase 2" Absen per JP | Needs KBM realtime session |
| ModulAjarForm AI Generate (non-ATP) | Needs AI gateway per-step |
| BadgeCelebration "Contoh" | Needs real trigger event |

---

## FASE 4: Deployment & Verification

### 4.1 Deploy ke staging:
```bash
# Push staging branch → auto-deploy via deploy.yml
git checkout staging && git merge feat/cleanup-plan && git push origin staging
```

### 4.2 Verify staging:
- Login dengan 5 akun test (siswa, ortu, guru, ks, admin)
- Jalankan PANDUAN-TESTING-A-Z-v2 test suite (121 test cases)
- Pastikan semua data demo tampil dengan benar
- Rekam video demo backup

### 4.3 Deploy ke production:
```bash
# Push main branch → auto-deploy
git checkout main && git merge staging && git push origin main
```

### 4.4 Verify production:
- Login dengan akun admin
- Pastikan SEMUA dashboard menampilkan empty state (tidak ada data dummy)
- Pastikan tidak ada error/exception
- Siap untuk diisi data nyata sekolah

---

## RINGKASAN EKSEKUSI

| Fase | Task | Estimasi | Dependency |
|------|------|----------|------------|
| 1 | Buat `purge-seed-data.ts` | 45 menit | — |
| 2 | Perpanjang `seed-demo-staging.ts` | 2 jam | — |
| 2.5 | Frontend SIM-to-EmptyState refactoring | 2 jam | — |
| 3 | Verify + commit + PR (all 3 fase sekaligus) | 30 menit | Fase 1+2+2.5 |
| 4 | Deploy staging → QA → deploy prod | 1 jam | Director SSH |
| **Total** | | **~6 jam** | |

---

## NEXT SESSION PROMPT (siap tempel)

```
Lanjutkan eksekusi PLAN: Production Cleanup + Staging Seed Complete (.tasks/PLAN-PROD-CLEANUP-STAGING-SEED.md).

Urutan eksekusi:
1. Buat script purge-seed-data.ts (FASE 1) — hapus data dummy dari smk_db
2. Perpanjang seed-demo-staging.ts (FASE 2) — tambah LMS modules, badges, XP, jurnal, assessment sessions, announcements, WA logs, kktp-config, report cards, calendar events
3. Frontend SIMULASI cleanup (FASE 3) — wire KS health score, filter badge, guru hadir, KKTP simpan, Jadwal generate, Siswa personal calendar
4. Deploy staging → verify 121 test cases → deploy prod → verify empty states

Validasi setiap fase: tsc 0, eslint 0, next build OK.
Commit + PR setelah setiap fase selesai.
```
