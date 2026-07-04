# PLAN U7: Staging QA Verification + Fix

> **Dibuat:** 2026-07-04
> **Versi:** 1.0
> **Prioritas:** P4-LOW (butuh U1-U6 selesai + staging deploy)
> **Estimasi:** 2 jam + variable fixes
> **Prasyarat:** U1-U6 deployed to staging; U2 (optional but recommended)
> **Ref:** PLAN-CONSOLIDATED-2026.md §5 U7, PANDUAN-TESTING-A-Z-v2.md

---

## 1. KONTEKS

### 1.1 Tujuan
Menjalankan full QA test suite (121 test cases) di staging untuk memvalidasi semua perubahan U1-U6 (dan U2 jika sudah selesai) sebelum produksi diisi data nyata sekolah.

### 1.2 Environment
- **Staging URL:** `https://staging.smkdarussalamsubah.sch.id`
- **Production URL:** `https://smkdarussalamsubah.sch.id`
- **Database:** `smk_staging_db` (seeded with demo data)
- **Code:** staging = main (identical Docker images after PR #300)

### 1.3 Test Accounts
| Role | Email | Password |
|---|---|---|
| SUPER_ADMIN | admin@diis.test | Test123! |
| KEPALA_SEKOLAH | ks@diis.test | Test123! |
| GURU | guru@diis.test | Test123! |
| SISWA | siswa@diis.test | Test123! |
| ORANG_TUA | ortu@diis.test | Test123! |

---

## 2. QA TESTING PHASES

### Phase 1: Smoke Test (15 menit)
Quick validation that staging is running and login works for all roles.

- [ ] **S-LOGIN-01:** Login as siswa → redirect to `/dashboard/akademik` (mobile bottom-nav)
- [ ] **O-LOGIN-01:** Login as ortu → redirect to `/dashboard/akademik` (mobile 5-tab)
- [ ] **G-LOGIN-01:** Login as guru → redirect to dashboard guru (sidebar desktop)
- [ ] **K-LOGIN-01:** Login as ks → redirect to KS dashboard (sidebar 240px)
- [ ] **A-LOGIN-01:** Login as admin → redirect to admin dashboard
- [ ] **LOGOUT-01:** Logout from each role → redirect to `/login`

**Stop condition:** If any login fails, abort QA. Fix login before proceeding.

---

### Phase 2: Siswa Test Suite (20 menit) — 21 test cases

| ID | Module | Steps | Expected Result | U1-U6 Focus |
|---|---|---|---|---|
| S-01 | Login | Login siswa@diis.test | Redirect `/dashboard/akademik` | |
| S-02 | Beranda | View beranda | Greeting, stat grid, tugas, badges | |
| S-03 | Beranda | Verify badges real vs empty | Real badges or **honest empty state** (NOT SIM) | U6 ✓ |
| S-04 | Jadwal | Tap "Jadwal" | Today JP slots + weekly calendar | |
| S-05 | Jadwal | Verify personal calendar | Real calendar data from API or empty state | **U5 ✓** |
| S-06 | Jadwal | Tap cell | Modal detail (mapel/guru/ruang/JP) | |
| S-07 | Jadwal | Check Sunday | "Libur" | |
| S-08 | Modul | Tap "Modul" | LMS modules list | |
| S-09 | Nilai | Tap "Nilai" | Grades per mapel + NA + status | |
| S-10 | Tugas | Tap "Tugas" | Active tasks list | |
| S-11 | Hadir | Tap "Hadir" | Stats + monthly calendar | |
| S-12 | Capaian | Tap "Capaian" | XP bar, badges, CP | |
| S-13 | Daily Quest | View quest ring | Real quest data or **empty state** (NOT SIM) | **U6 ✓** |
| S-14 | Rapor | Open rapor modal | Section A real; B-G real or honest placeholder | U1 ✓ |
| S-15 | Theme | Toggle theme | Dark↔light, persists | |
| S-16 | Bell | Tap bell | Pengumuman modal | |
| S-17 | Account | Tap user icon | Account sheet, push toggle | |
| S-18 | Push | Toggle push notification | Permission prompt (if VAPID set) | |
| S-19 | Logout | Tap "Keluar" | Redirect `/login` | |
| S-20 | Responsive | Width 375px | No horizontal overflow | |
| S-21 | Navigation | Bottom-nav 7 tabs | All tabs accessible | |

---

### Phase 3: Ortu Test Suite (15 menit) — 14 test cases

| ID | Module | Steps | Expected Result | U1-U6 Focus |
|---|---|---|---|---|
| O-01 | Login | Login ortu@diis.test | Redirect `/dashboard/akademik` | |
| O-02 | Beranda | View beranda | Child info, pengumuman, ringkasan | |
| O-03 | Beranda | Check child data | Real child from DB (NOT SIM) | |
| O-04 | Beranda | Check SPP | Real unpaid total + due date | |
| O-05 | Beranda | Check schedule | Real timeline of child's mapel | |
| O-06 | Beranda | **Check wali kelas contact** | Name, subject, phone, email from API or empty | **U4 ✓** |
| O-07 | Kehadiran | Tap "Kehadiran" | Calendar + monthly stats | |
| O-08 | Nilai | Tap "Nilai" | Child grades list | |
| O-09 | Bayar | Tap "Bayar" | SPP list + status | |
| O-10 | Capaian | Tap "Capaian" | Badges, **timeline empty state** (NOT SIM) | **U6 ✓** |
| O-11 | Rapor | Open rapor modal | Real sections A-G or honest placeholder | U1 ✓ |
| O-12 | Child Selector | Tap child dropdown | Switch between children | |
| O-13 | Theme | Toggle theme | Persists | |
| O-14 | Logout | Tap "Keluar" | Redirect `/login` | |

---

### Phase 4: Guru Test Suite (20 menit) — 25 test cases

| ID | Module | Steps | Expected Result | U1-U6 Focus |
|---|---|---|---|---|
| G-01 | Login | Login guru@diis.test | Redirect dashboard guru | |
| G-02 | Ringkasan | View beranda | Today schedule, classes, RPP turnaround | |
| G-03 | Modul Ajar | Click "Modul Ajar" | RPP list (draft/submitted/approved/revision) | |
| G-04 | Modul Ajar | "Buat Baru" wizard | 11-step form | |
| G-05 | Modul Ajar | Submit RPP | Status "submitted" | |
| G-06 | AI Generate | Step 3 (ATP) Generate | Real AI from `/ai/generate-atp` | |
| G-07 | AI Generate | Other steps Generate | "SIMULASI" badge visible | |
| G-08 | Penilaian | Click "Penilaian" | Gradebook per kelas/mapel | |
| G-09 | Penilaian | Input nilai | Modal input (uh/prak/sikap/uts/uas) | |
| G-10 | Penilaian | Submit nilai | Saved, triggers events | |
| G-11 | Absen | Click "Absen" | Bulk modal per siswa | |
| G-12 | Absen | Submit | Saved, WA event triggered | |
| G-13 | Jurnal | Open jurnal | Kegiatan kelas modal | |
| G-14 | LMS | Click "LMS" | Modul LMS list | |
| G-15 | LMS | Create module (3-tab) | Materi/Asesmen/Badge tabs | |
| G-16 | LMS | Tab Badge | Real badge catalog from `/badges` | |
| G-17 | LMS | Publish module | Status published | |
| G-18 | Question Bank | Open editor | CRUD PG/essay/true_false | |
| G-19 | Session | Create sesi asesmen | Modal buat sesi | |
| G-20 | **Rapor Kelas** | Click "Rapor Kelas" tab | Wali kelas screen appears | **U1 ✓** |
| G-21 | **Rapor Kelas** | Click "Kompilasi Rapor" | Generate rapor for class | **U1 ✓** |
| G-22 | **Rapor Kelas** | Edit catatan wali kelas | Notes editor modal | **U1 ✓** |
| G-23 | **Rapor Kelas** | Submit to KS | Status changes to "Diperiksa" | **U1 ✓** |
| G-24 | Responsive | 375px bottom-nav; 1280px sidebar | Layout switch | |
| G-25 | CP Progress | View progres ketercapaian | Honest empty state | |

---

### Phase 5: KS Test Suite (20 menit) — 21 test cases

| ID | Module | Steps | Expected Result | U1-U6 Focus |
|---|---|---|---|---|
| K-01 | Login | Login ks@diis.test | Redirect KS dashboard | |
| K-02 | Beranda | View KPI cards | Real kehadiran/kelas/RPP/sumatif counts | |
| K-03 | Beranda | **Health score** | **Honest empty state** "Skor belum tersedia" | **U6 ✓** |
| K-04 | Beranda | **Tren kehadiran** | Real data from heatmap or **empty state** | **U6 ✓** |
| K-05 | Beranda | **RPP turnaround** | Shows "0 guru" (real computed, not SIM) | **U6 ✓** |
| K-06 | Modul Ajar | RPP list | All guru RPP submissions | |
| K-07 | Modul Ajar | Approve RPP | Status approved → LMS draft auto-created | |
| K-08 | Sumatif | Tap "Sumatif" | Queue sumatif | |
| K-09 | Monitoring | Matrix guru×kelas | Real monitoring from `/analytics/monitoring-kbm` | |
| K-10 | Rekap | Tabel rincian | Real rekap from `/analytics/rekap-audit` | |
| K-11 | **KKTP** | Tap "KKTP" | Real configs from backend | **U3 ✓** |
| K-12 | **KKTP** | Adjust slider + Simpan | Real save via `saveKktpConfig()` | **U3 ✓** |
| K-13 | **KKTP** | Verify no "SIMULASI" banner | Banner removed | **U3 ✓** |
| K-14 | Jadwal | View jadwal | Real `/schedules` | |
| K-15 | **Rapor** | Tap "Rapor" tab | Rapor pipeline screen appears | **U1 ✓** |
| K-16 | **Rapor** | View per-class summary | Cards show draft/checked/published/distributed counts | **U1 ✓** |
| K-17 | **Rapor** | Filter by class/status | Table filters correctly | **U1 ✓** |
| K-18 | **Rapor** | Click "Periksa" on draft | Status changes to "Diperiksa" | **U1 ✓** |
| K-19 | **Rapor** | Click "Terbitkan" on checked | Status changes to "Diterbitkan" | **U1 ✓** |
| K-20 | **Rapor** | Click "Bagikan" on published | Status changes to "Dibagikan" | **U1 ✓** |
| K-21 | **Rapor** | Open detail modal | Grades snapshot, attendance, catatan | **U1 ✓** |

---

### Phase 6: Cross-Role Integration Tests (15 menit) — 8 tests

| ID | Trigger | Verify | U1-U6 Focus |
|---|---|---|---|
| X-01 | Guru input nilai | Siswa nilai tab updates within 1 min | |
| X-02 | Guru input nilai | Ortu nilai anak updates | |
| X-03 | Guru input absen alpha | WA log entry created | |
| X-04 | Guru submit RPP → KS approve | LMS draft auto-created | |
| X-05 | Guru input nilai → trigger | Badge auto-award if criteria met | |
| X-06 | Guru input nilai → trigger | XP +30 idempotent | |
| X-07 | TU catat SPP paid | Ortu pembayaran status updates | |
| X-08 | SA buat pengumuman | All dashboards show pengumuman | |
| **X-09** | **Guru kompilasi rapor → submit → KS publish → distribute** | **Siswa lihat rapor real** | **U1 ✓** |
| **X-10** | **KS set KKTP custom → guru gradebook reflects new threshold** | **KKTP saved correctly** | **U3 ✓** |

---

### Phase 7: Edge Cases (10 menit) — 10 tests

| ID | Scenario | Expected | U1-U6 Focus |
|---|---|---|---|
| EC-01 | Data kosong (prod-like) | All wired features show **empty state** (NOT SIM) | **U6 ✓** |
| EC-02 | Hari Minggu | Jadwal "Libur" | |
| EC-03 | Siswa tanpa ortu | Tidak crash | |
| EC-04 | Guru tanpa kelas | Beranda "Belum ada kelas" | |
| EC-05 | API down | dataWarning banner non-blocking | |
| EC-06 | Token expired (401) | Redirect `/login?reason=session` | |
| EC-07 | Theme toggle rapid | Visual stabil | |
| EC-08 | Keyboard nav (Tab/Enter) | All interactive accessible | |
| EC-09 | Modal focus trap | Focus trapped, restore on close | |
| EC-10 | Ortu tanpa relasi parent-child | **Empty state** (NOT fake SIM child) | |

---

## 3. REGRESSION CHECKLIST

| ID | Item | How to Verify | Target |
|---|---|---|---|
| R-01 | KKTP not hardcoded | grep `\b75\b` outside academic.ts | Only `KKTP_DEFAULT=75` |
| R-02 | NA_WEIGHTS not hardcoded | grep `0\.20\|0\.25\|0\.15` | Only in academic.ts |
| R-03 | JP_SLOTS not hardcoded | grep `07:30\|08:10` | Only in bell-times.ts |
| R-04 | Minggu = Libur | Verify in JadwalSiswa | |
| R-05 | No double tooltip (kiosk) | Manual kiosk check | |
| R-06 | **No SIM runtime in siswa** | grep `SIM_DAILY_QUEST\|SIM_KALENDER` in runtime | **0** | **U6 ✓** |
| R-07 | **No SIM runtime in ortu** | grep `SIM_TIMELINE` in runtime | **0** | **U6 ✓** |
| R-08 | **No SIM in KS health/tren** | grep `SIM_HEALTH\|SIM_TREN\|SIM_RPP_SLOW` | **0** | **U6 ✓** |
| R-09 | tsc --noEmit | `npx tsc --noEmit` | 0 errors |
| R-10 | eslint | `npm run lint` | 0 errors |
| R-11 | jest | `npm test` | 841+ pass |
| R-12 | next build | `npm run build` | 29/29 pages |

---

## 4. U1-U6 SPECIFIC QA MATRIX

> Focus areas for the changes made in this session.

### U1 (Rapor Pipeline)
- [ ] **KS:** "Rapor" tab appears in KS nav (8th tab)
- [ ] **KS:** Per-class summary cards show correct counts
- [ ] **KS:** Table filters (class, status, search) work correctly
- [ ] **KS:** Action buttons (Periksa/Terbitkan/Bagikan) appear per correct status
- [ ] **KS:** Detail modal shows grades snapshot + attendance + catatan
- [ ] **Guru:** "Rapor Kelas" tab appears in guru nav (9th tab)
- [ ] **Guru:** "Kompilasi Rapor" generates rapor drafts for class
- [ ] **Guru:** Catatan editor saves and displays correctly
- [ ] **Guru:** "Kirim ke KS" transitions status to checked
- [ ] **Siswa/Ortu:** Rapor modal shows real data after distribution

### U3 (KKTP Wiring)
- [ ] **KS:** KKTP tab shows real configs from backend
- [ ] **KS:** Slider values match saved configs
- [ ] **KS:** "Simpan" saves via real API (no SIMULASI toast)
- [ ] **KS:** No "SIMULASI" amber banner

### U4 (Ortu Wali Kelas)
- [ ] **Ortu:** "Wali Kelas" section appears in Beranda
- [ ] **Ortu:** Teacher name, subject, phone, email display correctly
- [ ] **Ortu:** Phone link opens dialer (mobile)
- [ ] **Ortu:** Empty state shows "Wali kelas akan tersedia menyusul" if no data

### U5 (Siswa Calendar)
- [ ] **Siswa:** Jadwal tab shows real calendar data (or empty state)
- [ ] **Siswa:** No SIM calendar data visible

### U6 (SIM-to-EmptyState)
- [ ] **KS Beranda:** Health score shows "Skor belum tersedia" (NOT 82/100)
- [ ] **KS Beranda:** Tren kehadiran shows "Belum ada data tren" when no heatmap (NOT fake chart)
- [ ] **KS Beranda:** RPP turnaround shows "0 guru" (NOT "3 guru")
- [ ] **Siswa Beranda:** Daily Quest shows empty (NOT fake quest data)
- [ ] **Ortu Capaian:** Timeline shows "Timeline pembelajaran akan tersedia menyusul" (NOT fake timeline)
- [ ] **Ortu Capaian:** No "Contoh" badge visible

---

## 5. BUG TRIAGE & FIX PROTOCOL

### 5.1 Severity Classification

| Severity | Definition | Action |
|---|---|---|
| **S1 Blocker** | Login broken, crash, data loss | Fix immediately, blocks all further QA |
| **S2 Critical** | Core feature broken (nilai, absen, rapor) | Fix same session |
| **S3 Major** | Feature partially broken, workaround exists | Fix in same PR or follow-up |
| **S4 Minor** | Visual glitch, typo, cosmetic | Log for future fix |

### 5.2 Fix Workflow
1. Identify bug → log in QA report with ID, severity, steps to reproduce
2. For S1/S2: fix immediately on `fix/qa-u7-<bug-id>` branch
3. Validate fix: tsc 0, eslint 0, build OK
4. PR to staging → CI → merge
5. Re-run failed test case → mark as Pass

### 5.3 QA Report Template
```markdown
## QA Session Report — U7
**Date:** 2026-MM-DD | **Tester:** Claude Code | **Environment:** staging

### Summary
| Category | Total | Pass | Fail | Blocked |
|---|---|---|---|---|
| Smoke | 6 | | | |
| Siswa | 21 | | | |
| Ortu | 14 | | | |
| Guru | 25 | | | |
| KS | 21 | | | |
| Cross-role | 10 | | | |
| Edge cases | 10 | | | |
| Regression | 12 | | | |
| **Total** | **119** | | | |

### Failed Test Cases
| ID | Severity | Description | Root Cause | Fix Status |
|---|---|---|---|---|
| | | | | |

### Bugs Found
| Bug ID | Severity | Component | Description | Fix Branch |
|---|---|---|---|---|
| | | | | |
```

---

## 6. EXECUTION SCHEDULE

| Phase | Duration | Dependency |
|---|---|---|
| Phase 1: Smoke Test | 15 min | Staging deployed |
| Phase 2: Siswa (21 tests) | 20 min | Phase 1 pass |
| Phase 3: Ortu (14 tests) | 15 min | Phase 1 pass |
| Phase 4: Guru (25 tests) | 20 min | Phase 1 pass |
| Phase 5: KS (21 tests) | 20 min | Phase 1 pass |
| Phase 6: Cross-role (10 tests) | 15 min | Phase 2-5 pass |
| Phase 7: Edge cases (10 tests) | 10 min | Phase 1 pass |
| Regression (12 checks) | 10 min | All phases done |
| Bug fixes | Variable | Based on findings |
| **Total** | **~2.5 hours + fixes** | |

---

## 7. POST-QA ACTIONS

### 7.1 If All Tests Pass
- [ ] Update PLAN-CONSOLIDATED-2026.md: U7 = ✅ DONE
- [ ] Create done-entry: `.tasks/done/U7-qa-verification-DONE.md`
- [ ] Notify Director: "Staging QA passed 119/119. Platform ready for real school data."
- [ ] Consider recording demo video for backup

### 7.2 If Bugs Found
- [ ] Fix S1/S2 bugs immediately
- [ ] Log S3/S4 bugs for future fix
- [ ] Re-run failed tests after fix
- [ ] Only mark U7 done when S1/S2 = 0

### 7.3 Sign-off Checklist
- [ ] All 119 test cases run and documented
- [ ] S1/S2 bugs: 0 remaining
- [ ] Regression: R-06, R-07, R-08 = 0 SIM runtime
- [ ] U1-U6 specific matrix: all items pass
- [ ] QA report committed to `.tasks/done/`
- [ ] PLAN-CONSOLIDATED-2026.md updated

---

## 8. DEFINITION OF DONE

U7 dianggap selesai ketika SEMUA bernilai true:
- [ ] 119 test cases dijalankan (121 dari PANDUAN + 2 new cross-role X-09/X-10)
- [ ] Semua S1/S2 bugs: 0 remaining
- [ ] U1-U6 specific matrix: all pass
- [ ] Regression R-06/R-07/R-08: 0 SIM runtime
- [ ] QA report documented
- [ ] PLAN-CONSOLIDATED-2026.md: U7 = ✅ DONE
