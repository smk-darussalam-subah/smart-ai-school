# AUDIT v2 — DONE LOG (Tugas yang Telah Dikerjakan)

> **Dibuat:** 2026-06-26
> **Turunan dari:** `AUDIT-v2-EXECUTION-PLAN.md` (16 task)
> **Tujuan:** Catatan jejak eksekusi tiap task. Di-update SAAT task dimulai & selesai.
> **Aturan:** 1 done-entry per task. BUKAN tempat untuk rencana (itu di EXECUTION-PLAN). BUKAN tempat untuk temuan baru (itu update audit).
> **Sumber kebenaran status:** file INI. `EXECUTION-PLAN.md` membaca dari sini.

---

## 📈 STATUS DASHBOARD (update real-time)

| Task | Judul | Tier | Status | Branch | PR | Selesai |
|------|-------|------|--------|--------|-----|---------|
| T1-01 | PembayaranOrtu wire spp real | 1 | ✅ DONE | feat/audit2-tier1-ortu-wiring | — | 2026-06-26 |
| T1-02 | BerandaOrtu wire children/sched/spp/wa + selector | 1 | ✅ DONE | feat/audit2-tier1-ortu-wiring | — | 2026-06-26 |
| T1-03a | CapaianOrtu wire badges/xp/cp | 1 | ✅ DONE | feat/audit2-tier1-ortu-wiring | — | 2026-06-26 |
| T1-03b | KehadiranOrtu wire attendance/wa | 1 | ✅ DONE | feat/audit2-tier1-ortu-wiring | — | 2026-06-26 |
| T1-04 | Siswa SIM fallback → empty state | 1 | ✅ DONE | feat/audit2-tier1-ortu-wiring | — | 2026-06-26 |
| T1-05 | KS sumatif → empty state | 1 | ✅ DONE | feat/audit2-tier1-ortu-wiring | — | 2026-06-26 |
| T2-01 | Rapor B-G wire endpoint ada | 2 | 🔲 TODO | — | — | — |
| T2-02 | KS health & tren wire analytics | 2 | 🔲 TODO | — | — | — |
| T2-03 | Guru badge catalog wire /badges | 2 | 🔲 TODO | — | — | — |
| T2-04 | Label SIM eksplisit (Skenario C) | 2 | ✅ DONE | feat/audit2-t2-04-sim-labels | — | 2026-07-01 |
| T2-05 | apiFetch 401 → redirect login | 2 | 🔲 TODO | — | — | — |
| T3-01 | Konsolidasi naOf (hapus naSimple) | 3 | 🔲 TODO | — | — | — |
| T3-02 | Backend Skenario B (quest/timeline/dll) | 3 | 🔲 TODO | — | — | — |
| T3-03 | Push subscription UI | 3 | 🔲 TODO | — | — | — |
| T3-04 | VAPID runtime verify | 3 | 🔲 TODO | — | — | — |
| T3-05 | Siswa celebration label | 3 | 🔲 TODO | — | — | — |
| T3-06 | Orphan endpoint minor | 3 | 🔲 TODO | — | — | — |

**Ringkasan:** 7/16 selesai (43.8%). **TIER 1: 6/6 (100% — BETA BLOCKER TERBUKA).** TIER 2: 1/5 (T2-04 DONE). TIER 3: 0/6.

---

## 📐 CARA PAKAI FILE INI

### Saat mulai task
1. Update baris di **Status Dashboard** di atas: `Status` → 🔄 IN_PROGRESS, isi `Branch`
2. Scroll ke section task terkait di bawah, isi blok "Mulai"

### Saat selesai task
3. Isi blok "Selesai" + tempel output validation command di "Bukti Runtime"
4. Update Dashboard: `Status` → ✅ DONE, isi `PR` & tanggal `Selesai`
5. Commit pesan: `fix(audit2): <task-id> <slug> [closes ...]`

### Template done-entry (copy per task)
```
### T<id> — <judul>
**Ref audit:** <finding IDs> | **Tier:** <1/2/3> | **Estimasi:** <X jam>

**Mulai:** 2026-MM-DD HH:MM | **Branch:** `feat/audit2-T<id>-<slug>`
**Selesai:** 2026-MM-DD HH:MM | **Durasi aktual:** <X jam> | **PR:** #<n>

**Files changed:**
- `path/file.ts` — <ringkasan perubahan>
- ...

**Bukti Runtime:**
<tempel output validation command: grep count, tsc, lint, test, build, screenshot/curl>

**Catatan / deviasi:**
- <apa yang berbeda dari rencana, atau lesson learned>

**Status:** ✅ DONE (merged to main, deployed YYYY-MM-DD) | ⛔ BLOCKED: <alasan>
```

---

## ✅ DONE ENTRIES

> *Section ini diisi saat task selesai. Urut dari T1-01 ke bawah. Entry terbaru di atas tiap tier.*

### TIER 1

#### T1-01 — PembayaranOrtu: wire props `spp` real, hapus SIM_PEMBAYARAN
**Mulai:** 2026-06-26 | **Branch:** `feat/audit2-tier1-ortu-wiring` | **Selesai:** 2026-06-26 | **Durasi:** ~25 menit
**Files changed:**
- `ortu/PembayaranOrtu.tsx` — signature terima `spp?: SppApiItem[]`; hapus import `SIM_PEMBAYARAN`; pakai `mapSppToPembayaran(spp ?? [])`
- `ortu/ortu-mappers.ts` (NEW) — `mapSppToPembayaran`, `mapWaLog`, `computeAttStats`, `mapTodaySchedule`, `attCalendarFromApi` + tipe API
- `ortu/OrtuWorkspace.tsx` — thread `spp={realSpp}` ke PembayaranOrtu
**Bukti Runtime:** `Select-String SIM_PEMBAYARAN PembayaranOrtu.tsx` = 0 match · tsc 0 · eslint 0 · next build OK
**Status:** ✅ DONE

#### T1-02 — BerandaOrtu: wire children/schedule/spp/waLog + child selector real (C1)
**Mulai:** 2026-06-26 | **Selesai:** 2026-06-26 | **Durasi:** ~1 jam 20 menit
**Files changed:**
- `ortu/BerandaOrtu.tsx` — signature expand (children, activeChildIndex, schedule, spp, waLog, attendance); hapus 5 import SIM_*; semua sumber data real via ortu-mappers; ranking → "—" (leaderboard belum di-fetch ortu); empty-state nilai; hapus 3 badge "Simulasi"
- `ortu/OrtuWorkspace.tsx` — tambah `activeChildIndex` + `childSelectorOpen` state; child selector dropdown real (ganti toast); thread 6 props ke BerandaOrtu
**Bukti Runtime:** `Select-String SIM_CHILDREN|SIM_SCHEDULE|SIM_PEMBAYARAN|SIM_WA_HISTORY|SIM_LEADERBOARD BerandaOrtu.tsx` = 1 (hanya komentar) · tsc 0 · eslint 0 · build OK
**Status:** ✅ DONE

#### T1-03a — CapaianOrtu: wire badges real; XP/CP/leaderboard honest empty
**Mulai/Selesai:** 2026-06-26 | **Durasi:** ~45 menit
**Files changed:**
- `ortu/CapaianOrtu.tsx` — signature terima `badges?: BadgeApiItem[]`; `mapBadges()` API→OrtuBadge; hapus SIM_XP/SIM_LEADERBOARD/SIM_BADGES/SIM_CPDATA + AVATAR_COLORS + import initials; XP/ranking/CP → empty state jujur; **SIM_TIMELINE dipertahankan DENGAN label "Contoh"** (Skenario B — backend timeline belum ada)
- `ortu/OrtuWorkspace.tsx` — thread `badges={realBadges ?? []}` ke CapaianOrtu
**Bukti Runtime:** `Select-String SIM_XP|SIM_LEADERBOARD|SIM_BADGES|SIM_CPDATA CapaianOrtu.tsx` = 0 · SIM_TIMELINE=2 (intentional) · tsc 0 · eslint 0 · build OK
**Catatan:** XP/CP/leaderboard ortu tidak di-fetch di page.tsx (hanya badges). Wire penuh butuh expand page.tsx ortu branch — dicatat sebagai follow-up (lihat §Catatan).
**Status:** ✅ DONE

#### T1-03b — KehadiranOrtu: wire attendance + waLog real
**Mulai/Selesai:** 2026-06-26 | **Durasi:** ~40 menit
**Files changed:**
- `ortu/KehadiranOrtu.tsx` — signature terima `attendance: AttendanceItem[]`, `waLog: WaLogApiItem[]`; `attCalendarFromApi(attendance, today)` ganti simAttCalendar; `computeAttStats(attendance)` ganti SIM_KEH_STATS; `mapWaLog(waLog)` ganti SIM_WA_HISTORY; section tren 3-bulan → info state (backend belum sediakan agregasi bulanan); banner "Data Simulasi" → info "Belum ada data"
- `ortu/ortu-mappers.ts` — tambah `attCalendarFromApi`
- `ortu/OrtuWorkspace.tsx` — thread `attendance` + `waLog` ke KehadiranOrtu (unprefix `_attendance`/`_realWaLog`)
**Bukti Runtime:** `Select-String SIM_KEH_STATS|SIM_ATT_TREND|SIM_WA_HISTORY KehadiranOrtu.tsx` = 1 (komentar) · tsc 0 · eslint 0 · build OK
**Status:** ✅ DONE

#### T1-04 — Siswa SIM fallback → empty state (CapaianSiswa + NilaiSiswa)
**Mulai/Selesai:** 2026-06-26 | **Durasi:** ~25 menit
**Files changed:**
- `siswa/CapaianSiswa.tsx` — hapus import SIM_*; `displayBadges/Leaderboard/XP/CP` langsung dari props (SiswaWorkspace menjamin default); guard `xpPct` divisi-par-zero
- `siswa/NilaiSiswa.tsx` — hapus import SIM_NILAI; `displayGrades = grades` (langsung); guard `avgNilai` divisi; hapus `isSimData`; banner "Data Simulasi" → empty-state "Belum ada nilai"
**Bukti Runtime:** `Select-String SIM_BADGES|SIM_LEADERBOARD|SIM_CPDATA|SIM_XP CapaianSiswa.tsx` = 0 · `SIM_NILAI NilaiSiswa.tsx` = 1 (komentar) · tsc 0 · eslint 0 · build OK
**Catatan:** `ProfileCV.tsx` masih pakai SIM_BADGES+SIM_PROFILE_CV (di-luar scope T1-04; Skenario A — dicatat follow-up T3-06).
**Status:** ✅ DONE

#### T1-04b — Sweep residual Skenario A (luput dari audit awal)
**Selesai:** 2026-06-26 | **Durasi:** ~20 menit
Final grep-sweep menemukan 3 komponen LAIN dengan pola SIM-fallback yang sama (tidak tercantum di audit v2 §3.1, tapi jelas beta-blocker yang sama). Diperbaiki demi konsistensi prinsip T1:
- `ortu/NilaiOrtu.tsx` — hapus `: SIM_NILAI` fallback + `childRank(SIM_LEADERBOARD)`; ranking → "—" (belum di-fetch); banner "Data Simulasi" → empty-state
- `siswa/PengumumanModal.tsx` — hapus `: SIM_PENGUMUMAN` fallback (sudah punya empty-state)
- `siswa/TugasSiswa.tsx` — hapus `: SIM_TUGAS` fallback
**Bukti Runtime:** tsc 0 · eslint 0 · next build OK (`/dashboard/akademik` 100 kB) · grep SIM_ runtime di 3 file = 0
**Lesson untuk audit v3:** grep awal hanya cek file di audit A-list. Sweep runtime-SIM lintas **seluruh folder ortu/+siswa/** menemukan 3 tambahan. Audit berikutnya wajim lakukan sweep menyeluruh, bukan hanya file ter-list.
**Status:** ✅ DONE

#### T1-05 — KS sumatif: fallback → empty state
**Mulai/Selesai:** 2026-06-26 | **Durasi:** ~15 menit
**Files changed:**
- `KsWorkspace.tsx:124-125` — `sumatifData = (realSumatif ...) ?? []` (sebelumnya fallback ke SIM_SUMATIF); `AuditSumatifKs` tambah empty-state "Belum ada sesi sumatif"; badge usang "backend belum tersedia" → conditional info badge (backend `/assessment/sessions` ADA)
**Bukti Runtime:** `Select-String ": SIM_SUMATIF" KsWorkspace.tsx` = 0 (SIM_SUMATIF kini hanya type anchor `typeof SIM_SUMATIF`, bukan runtime) · tsc 0 · eslint 0 · build OK
**Status:** ✅ DONE

### TIER 2

#### T2-04 — Label SIM eksplisit Skenario C (C2: ModulAjarForm, C3: BadgeCelebration)
**Mulai:** 2026-07-01 | **Branch:** `feat/audit2-t2-04-sim-labels` | **Selesai:** 2026-07-01 | **Durasi:** ~20 menit
**Files changed:**
- `ModulAjarForm.tsx` — tambah `simLabel` prop ke SectionCard helper; 8 step (2,4-10) kini tampilkan badge amber "SIMULASI" di samping tombol Generate. Step 3 (ATP) tidak ada badge karena pakai real API.
- `siswa/BadgeCelebration.tsx` — tambah comment dokumentasi C3 + badge amber "Contoh" di pojok kanan atas modal celebrasi. Skor hardcoded "85" kini jelas bertanda sebagai data contoh.
**Bukti Runtime:** `tsc --noEmit` = 0 errors · `eslint` = 0 errors/warnings
**Catatan:** C1 (Ortu Child Selector) sudah selesai di T1-02. T3-05 (celebration label) di-done-log sebagai TODO tapi sebenarnya sudah ter-cover oleh T2-04 C3 fix.
**Status:** ✅ DONE

### TIER 3

*(belum ada)*

---

## 🔄 IN_PROGRESS (task yang sedang jalan)

*(tidak ada — serial eksekusi, maks 1 task IN_PROGRESS pada satu waktu)*

---

## ⛔ BLOCKED / DITUNDA

| Task | Alasan | Tanggal | Keputusan |
|------|--------|---------|-----------|
| — | — | — | — |

*(Contoh entry jika terjadi: T2-05 ditunda — butuh review arsitektur karena apiFetch sentral. Keputusan Director: lanjut setelah T1 selesai.)*

---

## 📊 BUKTI RUNTIME AKUMULASI (cross-task)

Tempat menyimpan output validation yang berlaku lintas task (mis. hasil `npm test` terbaru, `tsc`, `next build`). Update setelah batch task selesai.

| Tanggal | tsc | eslint | jest | next build | Catatan |
|---------|-----|--------|------|------------|---------|
| 2026-06-26 (baseline awal, pre-eksekusi) | — | — | 841 pass | OK | Snapshot sebelum T1 dimulai |
| 2026-06-26 (post TIER 1, branch feat/audit2-tier1-ortu-wiring) | 0 errors | 0 errors/warnings | (api tak diubah — 841) | OK | Semua 6 task T1 selesai; SIM_ runtime dihapus dari 7 file (hanya komentar tersisa) |

---

## 🎯 DEFINITION OF DONE — TIER LEVEL

**TIER 1 dianggap selesai ketika SEMUA bernilai true:**
- [x] T1-01..T1-05 status ✅ DONE & berada di branch `feat/audit2-tier1-ortu-wiring` (siap PR ke develop)
- [x] Login ortu@diis.test → Beranda/Pembayaran/Capaian/Kehadiran kini memakai data ASLI dari DB (atau empty state), BUKAN SIM. Validasi via tsc/lint/build + grep SIM_ = 0 runtime
- [x] Login siswa tanpa data → capaian/nilai tampil empty state (CapaianSiswa/NilaiSiswa)
- [x] `Select-String SIM_` di sub-komponen ortu/siswa → 0 runtime match (sisanya komentar dokumentasi + SIM_TIMELINE di CapaianOrtu yang sengaja berlabel "Contoh" — Skenario B)
- [x] Edge case EC-01 (data kosong) — komponen kini handle empty (empty-state/guard divisi), bukan crash/SIM
- [x] `npm run build` (apps/web) hijau; tsc 0; eslint 0

**⚙️ TIER 1 = LULUS BETA BLOCKER.** Metrik 2 (beta-ready) `AUDIT-INTEGRASI-v2-REPORT.md` naik dari 70% → ~85%.

**Catatan follow-up (non-blok untuk beta):**
- ProfileCV.tsx masih pakai SIM (Skenario A — badges backend ada) → calon T3-06
- CapaianOrtu XP/CP/leaderboard: page.tsx ortu branch belum fetch 3 endpoint itu → tambah follow-up (T1-03b-extend) bila ingin capaian ortu 100% real
- Runtime verification (login ortu real, cross-role X-07 SPP ortu) butuh akun ortu+child valid di staging — validasi kode sudah lulus, validasi runtime menunggu deploy staging

**TIER 2 dianggap selesai** ketika Rapor A-G real + KS health/tren real + badge catalog real + label SIM konsisten + apiFetch 401 redirect. → platform SIAP DEMO VIP.

---

## 🔗 CROSS-REFERENCES

- **Rencana (stabil):** `AUDIT-v2-EXECUTION-PLAN.md`
- **Temuan (stabil):** `AUDIT-INTEGRASI-v2-REPORT.md`
- **Test cases:** `PANDUAN-TESTING-A-Z-v2.md`
- **Governance:** `CLAUDE.md` (§0 Keputusan Tahap 2 menang atas teks lama)
- **Gitflow:** `docs/WAYS-OF-WORKING.md`

---

*File ini tumbuh ke bawah. Jangan hapus entry DONE (jejak audit). Update Dashboard tiap perubahan status.*
