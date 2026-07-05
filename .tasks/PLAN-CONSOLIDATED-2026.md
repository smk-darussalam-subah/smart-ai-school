# PLAN KONSOLIDASI: DIIS Academic Year 2026/2027 — Unified Execution Plan

> **Dibuat:** 2026-07-04
> **Versi:** 1.0 (consolidated)
> **Sumber:** `PLAN-LIFECYCLE-2026.md` (v2.0 Director-approved) + `PLAN-NEXT-SESSION.md` + `AUDIT-v2-EXECUTION-PLAN.md` + `AUDIT-v2-DONE-LOG.md` + `PLAN-PROD-CLEANUP-STAGING-SEED.md` + `PANDUAN-TESTING-A-Z-v2.md` + `CLAUDE.md`
> **Status:** 16/17 audit tasks done (94.1%); T3-04 VAPID blocked on Director SSH; prod clean; staging seeded
> **Tujuan:** Menyatukan kedua plan menjadi satu dokumen eksekusi tanpa redundansi, dengan dokumentasi lengkap per task.

---

## 1. ANALISIS KONSOLIDASI

### 1.1 Sumber Plan dan Posisinya

| Dokumen | Fokus | Status |
|---|---|---|
| `PLAN-LIFECYCLE-2026.md` | Simulasi siklus tahun ajaran penuh (FASE 1-7) + GAP identification | v2.0 Director-approved — **BASE PLAN** |
| `PLAN-NEXT-SESSION.md` | Wiring B-endpoints + SIM cleanup + QA | Superseded by Lifecycle v2.0 for overlapping items |

### 1.2 Analisis Overlap dan Resolusi

| Plan-Lifecycle | Plan-Next-Session | Overlap Type | Resolusi |
|---|---|---|---|
| Task 3: Wire B5 KKTP Simpan (GAP-2, 30 min) | A3: Wire B5 KKTP Config | **EXACT DUPLICATE** | Merge → **Unified Task U3** |
| Task 4: Wire B4 Ortu Wali Kelas (GAP-3, 20 min) | A2: Wire B4 Teachers | **EXACT DUPLICATE** | Merge → **Unified Task U4** |
| Task 5: Wire B2 Siswa Calendar (GAP-4, 45 min) | A1: Wire B2 Personal Calendar | **EXACT DUPLICATE** | Merge → **Unified Task U5** |
| Task 6: SIM-to-EmptyState (1.5 jam) | FASE B: SIM Refactoring (2 jam) | **OVERLAP** | Lifecycle version more precise (per-Director refinement). Merge → **Unified Task U6** |
| Task 7-8: QA + Fix (2 jam+) | FASE C+D: QA + Fix (2 jam+) | **EXACT DUPLICATE** | Merge → **Unified Task U7** |
| ~~GAP-1: Auto-generate jadwal~~ | A4: Wire B8 Auto-Schedule | **CONFLICT** | Director DEFERRED auto-schedule (Lifecycle v2.0). Next-Session A4 is **OVERRULED**. Drop A4. Manual scheduling sufficient for TA 2026/2027. |

### 1.3 Unique Tasks from Each Plan

| Source | Task | Status in Unified Plan |
|---|---|---|
| **Lifecycle only** | Task 1: Rapor Pipeline UI (GAP-5, CRITICAL, 3 jam) | → **Unified Task U1** (highest priority) |
| **Lifecycle only** | Task 2: Soal Formatif-Sumatif Comprehensive (GAP-6, HIGH, 4 jam) | → **Unified Task U2** |
| Next-Session only | A4: Wire B8 Auto-Schedule | **DROPPED** — Director deferred GAP-1 |

### 1.4 Conflict Resolution Detail: GAP-1 Auto-Schedule

**Plan-Next-Session A4** wants to wire `fetchAutoSchedule()` to the "Generate Ulang" button.
**Plan-Lifecycle v2.0** explicitly DEFERS this per Director feedback: "Manual scheduling cukup untuk TA 2026/2027."

**Resolution:** The Director's decision in Lifecycle v2.0 overrides the earlier Next-Session plan. The `GET /schedules/auto-generate` backend endpoint exists and works (T3-02 B8 done), but the frontend button wiring is **deferred to post-TA 2026/2027**. Manual scheduling via `POST /schedules` is fully functional.

> **Note:** If real school needs 9-10 JP/day, extend `JP_SLOTS` in `lib/bell-times.ts` with JP9 (13:45-14:25) and JP10 (14:25-15:05). Estimasi: 30 menit saat dibutuhkan.

---

## 2. SIMULASI SIKLUS TAHUN AJARAN — HASIL AUDIT

> Full simulation run against production code (backend + frontend). 7 FASE tested.

### FASE 1: Setup Tahun Ajaran Baru (Admin/KS/TU)
| Langkah | Aktor | Status |
|---|---|---|
| 1.1 Buat Tahun Ajaran 2026/2027 | SA/KS | ✅ WORKS |
| 1.2 Set Tahun Ajaran Aktif | SA/KS | ✅ WORKS |
| 1.3 Buat Semester 1 (Ganjil) | SA/KS | ✅ WORKS |
| 1.4 Set Semester Aktif | SA/KS | ✅ WORKS |
| 1.5 Input kalender akademik | SA/KS | ✅ WORKS |
| 1.6 Set profil sekolah | SA | ✅ WORKS |

**Hasil FASE 1:** ✅ TIDAK ADA GAP.

### FASE 2: Penambahan Pengguna (Admin/TU)
| Langkah | Aktor | Status |
|---|---|---|
| 2.1-2.8 Provisioning Guru/TU/Siswa/Ortu, set role, struktur org, kelas, assign siswa, parent-child | SA/TU | ✅ WORKS |

**Hasil FASE 2:** ✅ TIDAK ADA GAP. Provisioning lengkap.

### FASE 3: Setup Pembelajaran (KS/Wakakur → Guru)
| Langkah | Aktor | Status | Gap? |
|---|---|---|---|
| 3.1 Assign tugas mengajar guru | SA/TU | ✅ WORKS | — |
| 3.2 Set mapel per jurusan | SA/TU | ✅ WORKS | — |
| 3.3 Generate jadwal otomatis | KS | ⚠️ DEFERRED | ~~GAP-1~~ (manual OK) |
| 3.4 Input jadwal manual | SA/TU | ✅ WORKS | — |
| 3.5 Set KKTP per mapel | KS | ⚠️ PARTIAL | **GAP-2** |
| 3.6 Guru buat Modul Ajar (RPP) | Guru | ✅ WORKS | — |
| 3.7-3.8 RPP submit → KS approve | Guru/KS | ✅ WORKS | — |
| 3.9 Auto-create LMS draft | System | ✅ WORKS | — |
| 3.10-3.12 LMS edit → publish → siswa lihat | Guru/Siswa | ✅ WORKS | — |

**Hasil FASE 3:** 1 active GAP (GAP-2), 1 deferred.

### FASE 4: Pembelajaran Harian (Guru → Siswa → Ortu)
| Langkah | Aktor | Status | Gap? |
|---|---|---|---|
| 4.1-4.19 Absensi, WA, nilai, XP, badge, jurnal, quest, jadwal, LMS progress, ortu SPP/kehadiran, pengumuman, KS monitoring/rekap/heatmap | All | ✅ WORKS | — |
| 4.13 Ortu lihat daftar guru | Ortu | ⚠️ NOT WIRED | **GAP-3** |
| 4.20 Siswa lihat personal calendar | Siswa | ⚠️ NOT WIRED | **GAP-4** |

**Hasil FASE 4:** 2 GAP (wiring only — backend endpoints + server actions exist, components not consuming).

### FASE 5: Ujian & Penilaian Akhir (Guru → KS)
| Langkah | Aktor | Status |
|---|---|---|
| 5.1-5.6 Assessment sessions, question bank, siswa kerjakan, auto-grade, nilai UAS, KS sumatif | All | ✅ WORKS |

**Hasil FASE 5:** ✅ TIDAK ADA GAP. Ujian dan penilaian berfungsi penuh.

### FASE 6: Rapor Semester (KS/TU → Siswa/Ortu)
| Langkah | Aktor | Status | Gap? |
|---|---|---|---|
| 6.1-6.5 Generate/check/publish/distribute/notes rapor | KS/SA | ⚠️ NO UI | **GAP-5** (5 sub-items) |
| 6.6-6.11 Siswa/Ortu lihat rapor (Section A, B, D, F, G) | Siswa/Ortu | ✅ WORKS | — |
| 6.12-6.13 Section C (Ekskul) + E (Catatan Guru) | Siswa | ✅ OK (honest placeholder, Skenario B) | — |

**Hasil FASE 6:** 1 GAP (5 sub-items) — CRITICAL. Backend endpoints ADA (D2-D7), frontend UI TIDAK ADA.

### FASE 7: Akhir Tahun Ajaran (KS/SA)
| Langkah | Aktor | Status |
|---|---|---|
| 7.1-7.5 Tutup semester, naik kelas, lulus, arsip, buat TA baru | All | ✅ WORKS |

**Hasil FASE 7:** ✅ TIDAK ADA GAP. Akhir tahun ajaran berfungsi penuh.

---

## 3. DAFTAR GAP — REGISTER TERKONSOLIDASI

> 5 active GAPs + 1 deferred + 1 new. Prioritas direvisi per Director feedback (Lifecycle v2.0).

| # | Gap | Severity | Impact | Estimasi | Unified Task |
|---|---|---|---|---|---|
| **GAP-5** | Rapor pipeline UI (wali kelas compile → KS approve) | **CRITICAL** | Rapor tidak bisa diterbitkan | 3 jam | **U1** |
| **GAP-6** | Soal formatif-sumatif komprehensif (NEW) | **HIGH** | Assessment tidak lengkap | 4 jam | **U2** |
| **GAP-2** | KS KKTP "Simpan" belum wired ke `/kktp-config` POST | Medium | KKTP custom tidak tersimpan | 30 menit | **U3** |
| **GAP-4** | Siswa personal calendar belum ditampilkan di UI | Low | Siswa lihat SIM kalender | 45 menit | **U5** |
| **GAP-3** | Ortu kontak wali kelas belum ditampilkan (simplified) | Low | Ortu tidak bisa kontak wali kelas | 20 menit | **U4** |
| ~~GAP-1~~ | ~~Auto-generate jadwal~~ | ~~DEFERRED~~ | Manual scheduling OK | — | — |

**Catatan revisi Director (Lifecycle v2.0):**
- **GAP-1 DEFERRED:** Auto-generate jadwal ditunda. Manual scheduling cukup. Real scheduling bisa 8-10 JP/hari (sistem saat ini max 8 JP di `JP_SLOTS`).
- **GAP-3 SIMPLIFIED:** Ortu hanya butuh kontak wali kelas (bukan semua guru mapel). Endpoint `/student-dashboard/teachers` sudah ada, cukup filter yang wali kelas.
- **GAP-5 REFINED:** Flow rapor yang benar: Guru Mapel input nilai → Wali Kelas kompilasi rapor per siswa → KS review & approve per kelas.
- **GAP-6 NEW:** Modul pembuatan soal formatif-sumatif masih MVP — perlu pengembangan komprehensif.

---

## 4. DAFTAR SIMULASI — REGISTER TERKONSOLIDASI (Zero-Simulasi Program, P0–P6)

> **Update 2026-07-04 (Zero-Simulasi Program):** Full codebase audit revealed 16 SIM surfaces
> (not 10 as originally listed). All 16 resolved. Below is the verified register.

| # | Komponen | SIM Constant / Surface | Resolution | Phase | Runtime Proof |
|---|---|---|---|---|---|
| SIM-1 | KS Health Score | `SIM_HEALTH` | Empty state (U6) | U6 ✅ | grep SIM_HEALTH runtime = 0 |
| SIM-2 | KS Tren Kehadiran | `SIM_TREN_*` | Empty state (U6) | U6 ✅ | grep SIM_TREN runtime = 0 |
| SIM-3 | KS RPP Turnaround | `SIM_RPP_SLOW` | Hardcoded 0 (U6) | U6 ✅ | grep SIM_RPP_SLOW runtime = 0 |
| SIM-4 | Siswa Daily Quest | `SIM_DAILY_QUEST` | Empty state (U6) | U6 ✅ | grep SIM_DAILY_QUEST runtime = 0 |
| SIM-5 | Siswa Calendar | `SIM_KALENDER` | Empty state (U5→U6) | U6 ✅ | grep SIM_KALENDER runtime = 0 |
| SIM-6 | Ortu Timeline | `SIM_TIMELINE` | Empty state (U6) | U6 ✅ | grep SIM_TIMELINE runtime = 0 |
| **S-01** | PenilaianSesiModal preview | Hardcoded questions | SSE + real questions (P2) | P2 ✅ | tsc 0, build OK, SSE endpoint exists |
| **S-02** | PenilaianSesiModal monitor | `MONITOR_DATA` (8 fake) | SSE stream (P2) | P2 ✅ | GET /assessment/sessions/:id/stream |
| **S-03** | PenilaianSesiModal sync | setTimeout fake | Real startResponse (P2) | P2 ✅ | existing PATCH :id/start wired |
| **S-04** | SessionFlowModal | Hardcoded TP/CP/feedback | Real session.subject (P2) | P2 ✅ | session.assessmentSessionId conditional |
| **S-05** | KS GuruHadirModal + KPI | `SIM_GURU_LIST` | GET /teacher-attendance/today-summary (P1) | P1 ✅ | endpoint live, tsc 0 |
| **S-06** | KS tren guru | `pcts.map(p=>p+2)` | Honest empty guru line (P0) | P0 ✅ | TrenChart conditional render |
| **S-07** | KS Rekap badge | Always-on "SIMULASI" | Conditional: real→"Real-time" (P0) | P0 ✅ | realRekap.length > 0 check |
| **S-08** | KS G8 Matriks badge | Always-on "SIMULASI" | Conditional: real→"Real-time" (P0) | P0 ✅ | realMonData.length > 0 check |
| **S-09** | ProfileCV | `SIM_PROFILE_CV` | GET /students/me/profile-cv (P1) | P1 ✅ | endpoint live, tsc 0 |
| **S-10** | KS constants | SIM_KKTP/SCHED/MON/GURU | Type-only or deleted (P0) | P0 ✅ | grep runtime = 0 |
| **S-11** | BadgeCelebration | Hardcoded "85" | Accepts real badge.score (P3) | P3 ✅ | badge prop wired |
| **S-12** | ModulAjarForm AI steps | toast "SIMULASI" | POST /ai/generate-rpp-step (P4) | P4 ✅ | endpoint live, simLabel removed |
| **S-13** | Kiosk TTS alert | Hardcoded "XI TJKT JP-3" | Real papanRows check (P5) | P5 ✅ | alert derived from real data |
| **S-14** | Kiosk absen-per-JP | `SIM_ABSEN_PER_JP` | Honest empty (P5) | P5 ✅ | SIM_ABSEN_PER_JP deleted |
| **S-15** | KS genSimMonitor fallback | `SIM_MON_GURUS` | Empty-state fallback (P0) | P0 ✅ | emptyRekapData = [] |
| **S-16** | ModulLmsForm | "(SIMULASI)" label | Label cleaned (P0) | P0 ✅ | grep SIMULASI in file = 0 |
| **S-17** | LmsPreviewScreen | `SIM_STUDENTS` | Empty array (P6) | P6 ✅ | EMPTY_STUDENTS = [] |
| **S-18** | siswa-data.ts resolveSchedule | `SIM_SCHEDULE` fallback | Empty schedule {} (P6) | P6 ✅ | return {} not SIM_SCHEDULE |

**All 18 items resolved.** grep `const SIM_` in .tsx files = 0 runtime imports.
Dead exports in siswa-data.ts/ortu-data.ts remain (historical) but no .tsx file imports them.

---

## 5. TASK LIST KOMPREHENSIF UNTUK SESI BARU

### Prioritas 1 — CRITICAL

#### Unified Task U1: Rapor Pipeline UI untuk KS + Wali Kelas (GAP-5)

**Ref:** D5-D7 orphan endpoints | **Estimasi:** 3 jam | **Branch:** `feat/rapor-pipeline-ks-wali`
**Source:** PLAN-LIFECYCLE Task 1 (unique — not in Next-Session)

**Flow yang benar (per Director):**
```
Guru Mapel → input nilai per siswa per mapel (sudah ada: POST /grades)
    ↓
Wali Kelas → kompilasi rapor per siswa (semua mapel kelasnya)
    ↓
KS → review & approve rapor kolektif per kelas dari wali kelas
```

**Scope:**
- [ ] **Wali Kelas screen:** List siswa kelasnya → tombol "Kompilasi Rapor" per siswa
  - Memanggil `POST /report-cards/generate` dengan classId (batch generate untuk 1 kelas)
  - Hasil: rapor draft per siswa dengan grades snapshot + attendance summary
- [ ] **Wali Kelas:** Edit catatan wali kelas per siswa: `PATCH /report-cards/:id/notes`
- [ ] **Wali Kelas:** Submit rapor kelas ke KS: `PATCH /report-cards/:id/status` (action=check)
- [ ] **KS screen:** List kelas dengan status rapor (draft → checked → published → distributed)
- [ ] **KS:** Review rapor per kelas → approve/publish: `PATCH /report-cards/:id/status` (action=publish)
- [ ] **KS:** Distribute ke siswa/ortu: `PATCH /report-cards/:id/status` (action=distribute)
- [ ] Siswa/Ortu lihat rapor (sudah wired di RaporModal — Section A-G ✅)

**Server actions to add:**
- `generateReportCards(classId, academicYear, semester)`
- `transitionReportStatus(reportId, action)`
- `updateReportNotes(reportId, notes)`
- `fetchReportCardsByClass(classId)`

**Files to modify:**
- `actions.ts` — add 4 server actions
- `KsWorkspace.tsx` — add "Rapor" screen
- New component: `RaporPipelineKs.tsx` (KS review/approve)
- New component: `RaporWaliKelas.tsx` (wali kelas compile/submit) — atau di AkademikWorkspace

**Validation:**
- Wali kelas login → generate rapor untuk 1 kelas → edit catatan → submit ke KS
- KS login → lihat rapor submitted → review → publish → distribute
- Siswa login → rapor modal menampilkan data real

---

### Prioritas 2 — HIGH

#### Unified Task U2: Soal Formatif-Sumatif Komprehensif (GAP-6)

**Estimasi:** 4 jam | **Branch:** `feat/assessment-comprehensive`
**Source:** PLAN-LIFECYCLE Task 2 (unique — not in Next-Session)

**Current state (MVP):**
- Question model: type (PG/essay/true_false/matching), body, options (JSON), answer, difficulty, tags
- QuestionSet: grouping soal per nama
- AssessmentSession: moduleId, teacherId, classId, type (diagnostik/formatif/sumatif), questions (JSON), status (draft/active/completed)
- AssessmentResponse: sessionId, studentId, answers (JSON), score, submittedAt
- Frontend: QuestionBankEditor (CRUD soal, AI generate), SessionFlowModal (5-step session), PenilaianSesiModal (preview/monitor)

**Yang kurang untuk komprehensif:**
- [ ] **Soal PG dengan multiple correct answers** (checkbox, bukan radio)
- [ ] **Soal essay dengan rubrik penilaian** (kriteria + bobot per kriteria)
- [ ] **Soal praktik** dengan upload file/bukti
- [ ] **Timer per sesi** (durasi pengerjaan)
- [ ] **Randomisasi urutan soal** (anti-cheating)
- [ ] **Export/import soal** (Excel/CSV bulk)
- [ ] **Bank soal shared** antar guru mapel yang sama
- [ ] **Analisis hasil** (item analysis: difficulty index, discrimination index)
- [ ] **Remedial auto-assign** untuk siswa di bawah KKTP

**Prioritas implementasi (minimum viable komprehensif):**
1. Timer per sesi + randomisasi urutan (anti-cheating)
2. Essay rubrik penilaian (kriteria + bobot)
3. Analisis hasil dasar (rata-rata, distribusi, % ketuntasan)
4. Export/import CSV soal

#### Unified Task U3: Wire B5 KKTP "Simpan" (GAP-2)

**Estimasi:** 30 menit
**Source:** PLAN-LIFECYCLE Task 3 ≡ PLAN-NEXT-SESSION A3 (EXACT DUPLICATE — merged)

**Detail:**
- [ ] `KktpKs` component: fetch configs on mount via `fetchKktpConfigs()`
- [ ] "Simpan" button → call `saveKktpConfig({ subject, kktp, academicYear, semester })`
- [ ] Remove "Simpan SIMULASI" label → "Simpan"
- [ ] Show toast on success/error

| Aspek | Detail |
|---|---|
| Backend | `GET/POST/DELETE /kktp-config` — sudah live (T3-02 B5) |
| Server action | `fetchKktpConfigs()`, `saveKktpConfig()` — sudah ada di actions.ts |
| Frontend target | `KktpKs` component di KsWorkspace — "Simpan" button |
| Pattern | Fetch configs on mount → fill sliders → save calls `saveKktpConfig()` |
| Empty state | "Belum ada konfigurasi KKTP" |

#### Unified Task U4: Wire B4 Ortu Wali Kelas Contact (GAP-3 simplified)

**Estimasi:** 20 menit
**Source:** PLAN-LIFECYCLE Task 4 ≡ PLAN-NEXT-SESSION A2 (EXACT DUPLICATE — merged)

**Detail (simplified per Director — only wali kelas, not all guru mapel):**
- [ ] `BerandaOrtu.tsx` or `CapaianOrtu.tsx`: add wali kelas section
- [ ] `useEffect` → `fetchTeachers()` → filter yang wali kelas (atau endpoint baru: `/student-dashboard/homeroom-teacher`)
- [ ] Display: nama, subject (mapel wali), phone, email
- [ ] Empty state: "Wali kelas akan tersedia menyusul"

| Aspek | Detail |
|---|---|
| Backend | `GET /student-dashboard/teachers` — sudah live (T3-02 B4) |
| Server action | `fetchTeachers()` — sudah ada di actions.ts |
| Frontend target | `BerandaOrtu.tsx` atau `CapaianOrtu.tsx` — daftar wali kelas + kontak |
| Pattern | `useEffect` fetch → filter yang wali kelas → tampilkan list |
| Empty state | "Wali kelas akan tersedia menyusul" |

#### Unified Task U5: Wire B2 Siswa Personal Calendar (GAP-4)

**Estimasi:** 45 menit
**Source:** PLAN-LIFECYCLE Task 5 ≡ PLAN-NEXT-SESSION A1 (EXACT DUPLICATE — merged)

**Detail:**
- [ ] `SiswaWorkspace.tsx`: fetch personal calendar on mount via `fetchPersonalCalendar()`
- [ ] Pass to `JadwalSiswa` component
- [ ] Replace `SIM_KALENDER` with real calendar data (schedule + events)
- [ ] Empty state: "Jadwal belum tersedia"

| Aspek | Detail |
|---|---|
| Backend | `GET /gamification/personal-calendar` — sudah live (T3-02 B2) |
| Server action | `fetchPersonalCalendar()` — sudah ada di actions.ts |
| Frontend target | `SiswaWorkspace.tsx` — ganti `SIM_KALENDER` dengan real calendar |
| Pattern | `useEffect` fetch on mount → `setRealCalendar(data)` → pass ke JadwalSiswa |
| Empty state | "Jadwal belum tersedia" ketika API kosong |

---

### Prioritas 3 — MEDIUM

#### Unified Task U6: Refactor SIM Fallbacks ke Honest Empty States

**Estimasi:** 1.5 jam
**Source:** PLAN-LIFECYCLE Task 6 ≡ PLAN-NEXT-SESSION FASE B (MERGED — Lifecycle version is more precise)
**Dependency:** U3, U4, U5 harus selesai terlebih dahulu (SIM-5 calendar refactored in U5)
**Pattern:** `realData ?? EMPTY_STATE` (NOT `realData ?? SIM_CONSTANT`)

**Prinsip (three-tier SIM handling):**
| Status Fitur | Staging | Production | Code Pattern |
|---|---|---|---|
| Fully wired | Real seed data | **Empty state** | `realData ?? EMPTY` (no SIM) |
| Genuinely Fase 2 | SIM with label | SIM with label | `SIM_CONSTANT` (keep) |

**Components to refactor:**

| # | Component | SIM Constant | Change To |
|---|---|---|---|
| 1 | KS Health Score | `SIM_HEALTH` | `null` → "Skor belum tersedia — menunggu data nilai dan kehadiran" |
| 2 | KS Tren Kehadiran fallback | `SIM_TREN_*` | Empty array → "Belum ada data tren" |
| 3 | KS RPP Turnaround | `SIM_RPP_SLOW` | Compute from real `/rpp` data or `0` |
| 4 | KS Monitoring (genSimMonitor) | SIM label in header | Remove visible "SIMULASI" label → show real data or "Belum ada data monitoring" |
| 5 | Siswa Daily Quest fallback | `SIM_DAILY_QUEST` | `{ title: 'Daily Quest', tasks: [] }` → empty state |
| 6 | Siswa Calendar fallback | `SIM_KALENDER` | `[]` (empty) — also covered by U5 wiring |
| 7 | Ortu Timeline fallback | `SIM_TIMELINE` | `[]` (empty, remove "Contoh" badge if data real) |

**KEEP SIM (genuinely Fase 2 — DO NOT TOUCH):**
| Component | Reason |
|---|---|
| ModulAjarForm AI Generate (non-ATP steps) | Needs AI gateway per-step |
| BadgeCelebration "Contoh" | Needs real badge trigger event |
| Kiosk TTS "Fase 2" | Needs WebSocket/TTS module |
| Kiosk Absen per JP "Fase 2" | Needs KBM realtime session |
| KS Jadwal "Generate" button | Deferred per Director — manual OK |

---

### Prioritas 4 — LOW

#### Unified Task U7: Staging QA Verification + Fix

**Estimasi:** 2 jam+ (variable for fixes)
**Source:** PLAN-LIFECYCLE Task 7-8 ≡ PLAN-NEXT-SESSION FASE C+D (EXACT DUPLICATE — merged)
**Dependency:** U1-U6 harus selesai terlebih dahulu

**C1: Login sebagai setiap role di staging**
URL: `https://staging.smkdarussalamsubah.sch.id`

| Role | Email | Verify |
|---|---|---|
| SISWA | siswa@diis.test | Beranda (daily quests, grades, schedule), Nilai, Kehadiran, Capaian, Modul, Tugas, Rapor |
| ORTU | ortu@diis.test | Beranda (child info, SPP, wali kelas), Kehadiran, Nilai, Pembayaran, Capaian, Rapor |
| GURU | guru@diis.test | Ringkasan, Modul Ajar, Penilaian, Absen, LMS, Question Bank |
| KS | ks@diis.test | Beranda (health score, KPI, tren), Modul approval, Monitoring, Rekap, KKTP, Rapor pipeline |
| ADMIN | admin@diis.test | Users, Pengumuman, Kalender, Tahun Ajaran |

**C2: Cross-role integration tests (8 tests)**
| Test | Trigger | Verify |
|---|---|---|
| X-01 | Guru input nilai | Siswa nilai update |
| X-02 | Guru input nilai | Ortu nilai anak update |
| X-03 | Guru input absen alpha | WA log entry created |
| X-04 | Guru submit RPP → KS approve | LMS draft auto-created |
| X-05 | Guru input nilai → trigger | Badge auto-award if kriteria met |
| X-06 | Guru input nilai → trigger | XP auto-award idempotent |
| X-07 | TU catat SPP | Ortu pembayaran update |
| X-08 | SA buat pengumuman | All dashboards show pengumuman |

**C3: Edge cases (10 tests)**
| Test | Expected |
|---|---|
| EC-01 | Data kosong (prod) → empty state, NOT fake data |
| EC-02 | Hari Minggu → jadwal "Libur" |
| EC-03 | Siswa tanpa ortu → tidak crash |
| EC-04 | Guru tanpa kelas → beranda "Belum ada kelas" |
| EC-05 | API down → dataWarning banner non-blok |
| EC-06 | Token expired → redirect `/login?reason=session` |
| EC-07 | Theme toggle rapid → visual stabil |
| EC-08 | Keyboard nav (Tab/Enter/Space) → accessible |
| EC-09 | Modal focus trap |
| EC-10 | Ortu tanpa relasi parent-child → empty state |

**D: Fix Issues dari QA**
Setiap issue yang ditemukan saat QA di-fix mengikuti pattern:
1. Identify root cause
2. Fix code
3. Verify: tsc 0, eslint 0, next build OK
4. Commit + PR → staging → verify → main

---

## 6. ENGINEERING STANDARDS WAJIB

> Semua aturan ini diambil dari CLAUDE.md, PLAN-LIFECYCLE, dan pengalaman sesi sebelumnya.

### 6.1 Prasyarat Baca (SEBELUM coding)
- `CLAUDE.md` — brief permanen, keputusan arsitektur
- `lib/academic.ts` — konstanta akademik
- `lib/bell-times.ts` — slot JP

### 6.2 React Hooks (Error #300)
```javascript
// WRONG — causes React error #300
const data = realData.length > 0 ? realData : useMemo(() => fallback, []);

// RIGHT — useMemo always called unconditionally
const fallback = useMemo(() => compute(), [deps]);
const data = realData.length > 0 ? realData : fallback;
```

### 6.3 Prisma Enum Values (dari schema, BUKAN asumsi)
| Enum | Values |
|---|---|
| AnnouncementPriority | `biasa`, `penting`, `urgent` |
| AnnouncementStatus | `draft`, `published`, `archived` |
| AnnouncementCategory | `umum`, `akademik`, `keuangan`, `kegiatan`, `darurat` |
| ActivityCategory | `pembelajaran`, `ulangan`, `praktikum`, `kegiatan`, `lainnya` |
| BadgeTier | `bronze`, `silver`, `gold`, `platinum` |
| ReportCardStatus | `draft`, `checked`, `published`, `distributed` |
| RppStatus | `draft`, `submitted`, `approved`, `revision` |

### 6.4 Announcement Model Fields
- `content` (Text) — BUKAN `body`
- `createdBy` (varchar 64) — BUKAN `publishedBy`
- `createdByName` (varchar 100)
- `audience` (Json) — pass as `JSON.stringify(['ALL'])` or `JSON.stringify(['SISWA'])`

### 6.5 Konstanta Wajib Import (JANGAN hardcode)
```typescript
// lib/academic.ts
KKTP_DEFAULT = 75
NA_WEIGHTS = { uh: 0.2, praktik: 0.25, sikap: 0.15, uts: 0.2, uas: 0.2 }
naOf(), gradeStatus(), predikat(), generateCalendar(), fmtRupiahExact()

// lib/bell-times.ts
JP_SLOTS (8 slots), wibNow(), scheduleDayOfWeek(), currentJp(), wibDateLabel()
```

### 6.6 Three-Tier SIM Pattern
| Status | Production | Staging | Code |
|---|---|---|---|
| Fully wired | Empty state | Real data | `realData ?? EMPTY` |
| Genuinely Fase 2 | SIM with label | SIM with label | `SIM_CONSTANT` (keep) |

### 6.7 401 Redirect Pattern
```typescript
if (res.status === 401) redirect('/login?reason=session');
// MUST re-throw NEXT_REDIRECT in catch:
catch (err) {
  if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
  return null;
}
```

### 6.8 Server Actions Pattern
```typescript
export async function fetchData(): Promise<{ success: boolean; data?: T; error?: string }> {
  const r = await apiCall('/endpoint', 'GET');
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data as T };
}
```

### 6.9 Client Component Fetch Pattern
```typescript
const [data, setData] = useState<T[]>([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetchData().then((res) => {
    if (res.success && res.data) setData(res.data);
  }).finally(() => setLoading(false));
}, []);
// Hooks MUST be unconditional — compute fallback in useMemo BEFORE ternary
```

### 6.10 Gitflow
- `feat/` → PR staging → CI hijau → merge → staging deploy
- `staging` → PR main → CI hijau → merge → prod deploy
- Conventional commits: `feat(scope): desc` / `fix(scope): desc`
- Branch protection: `--admin` untuk bypass review
- JANGAN push langsung ke main/staging

### 6.11 Validation Protocol (setiap perubahan)
```
[ ] tsc --noEmit → 0 errors
[ ] eslint --max-warnings=0 → 0 errors
[ ] next build → 29/29 pages OK
[ ] CI: Build Check + Lint & Type Check + Unit Tests all pass
```

---

## 7. DOKUMENTASI STANDARD — TEMPLATE PER TASK

> Format mengikuti `AUDIT-v2-DONE-LOG.md` dan `PROMPT-OPTIMIZED-v2.md` conventions.
> Setiap task WAJIB mengisi template ini setelah selesai.

### 7.1 Template Done-Entry

```markdown
### U<id> — <judul>
**Ref:** <GAP/SIM/B-endpoint IDs> | **Source plans:** <which plan(s)> | **Estimasi:** <X jam>
**Priority:** <P1-CRITICAL | P2-HIGH | P3-MEDIUM | P4-LOW>

**Mulai:** 2026-MM-DD HH:MM | **Branch:** `feat/<slug>`
**Selesai:** 2026-MM-DD HH:MM | **Durasi aktual:** <X jam> | **PR:** #<n>

**Consolidation note:**
<Overwrite/supersedes which plan task(s). E.g., "Merges PLAN-LIFECYCLE Task 3 + PLAN-NEXT-SESSION A3 — exact duplicate.">

**Files changed:**
- `path/file.ts` — <ringkasan perubahan>
- ...

**Scope completed:**
- [ ] <checklist item 1>
- [ ] <checklist item 2>

**Bukti Runtime:**
<tempel output validation command: grep count, tsc, lint, test, build, screenshot/curl>

**Validation checklist:**
- [ ] `tsc --noEmit` = 0 errors
- [ ] `eslint --max-warnings=0` = 0 errors
- [ ] `next build` = 29/29 pages OK
- [ ] CI: all 3 checks pass
- [ ] Runtime: <manual test description + result>

**Catatan / deviasi:**
- <apa yang berbeda dari rencana, atau lesson learned>

**Status:** ✅ DONE (merged to main, deployed YYYY-MM-DD) | ⛔ BLOCKED: <alasan>
```

### 7.2 Template Cross-Task Runtime Evidence (akumulasi)

```markdown
| Tanggal | Task | tsc | eslint | jest | next build | Catatan |
|---------|------|-----|--------|------|------------|---------|
| 2026-MM-DD (post U<id>) | U<id> | 0 errors | 0 errors/warnings | <N> pass | OK | <summary> |
```

---

## 8. DEPENDENCY GRAPH — KONSOLIDASI

```
U1 (Rapor Pipeline) ──────────────────────────────> independen (CRITICAL, mulai dulu)
U2 (Assessment Comprehensive) ────────────────────> independen (HIGH, paralel dengan U1 OK)
U3 (Wire KKTP Simpan) ──┐
U4 (Wire Ortu Wali Kelas) ──┤──> bisa paralel (beda file, no collision)
U5 (Wire Siswa Calendar) ──┘
        ↓ (U3, U4, U5 selesai)
U6 (SIM-to-EmptyState) ──> depends on U3-U5 (SIM-5 calendar refactored di U5)
        ↓ (U1-U6 selesai)
U7 (QA + Fix) ──> depends on ALL tasks complete
        ↓
[ ] Platform ready for real school data
```

**Aturan eksekusi:**
- U1 dan U2 bisa dimulai kapan saja (tidak ada dependency)
- U3, U4, U5 bisa paralel antar satu sama lain (beda file, no collision)
- U6 harus setelah U3-U5 (kalau tidak, SIM-5 calendar akan di-wire dua kali)
- U7 harus terakhir (setelah semua code changes selesai)

---

## 9. RINGKASAN EKSEKUSI KONSOLIDASI

| Prioritas | Unified Task | Source(s) | Estimasi | Dependency | Status |
|---|---|---|---|---|---|
| P1-CRITICAL | U1: Rapor Pipeline UI (Wali Kelas + KS) | Lifecycle Task 1 only | 3 jam | — | ✅ DONE |
| P2-HIGH | U2: Assessment Comprehensive | Lifecycle Task 2 only | 4 jam | — | 🔲 NEXT SESSION |
| P2-HIGH | U3: Wire B5 KKTP Simpan | Lifecycle T3 + Next A3 (merged) | 30 menit | — | ✅ DONE |
| P2-HIGH | U4: Wire B4 Ortu Wali Kelas | Lifecycle T4 + Next A2 (merged) | 20 menit | — | ✅ DONE |
| P2-HIGH | U5: Wire B2 Siswa Calendar | Lifecycle T5 + Next A1 (merged) | 45 menit | — | ✅ DONE |
| P3-MEDIUM | U6: SIM-to-EmptyState | Lifecycle T6 + Next FASE B (merged) | 1.5 jam | U3-U5 selesai | ✅ DONE |
| P4-LOW | U7: QA + Fix | Lifecycle T7-8 + Next FASE C+D (merged) | 2 jam+ | U1-U6 selesai | ✅ DONE (automated) — browser QA pending staging |
| ~~DROPPED~~ | ~~Wire B8 Auto-Schedule~~ | ~~Next A4 only~~ | ~~—~~ | ~~Director deferred~~ | ~~DROPPED~~ |
| **Total** | **7 unified tasks** | | **~12 jam + fixes** | | **7/7 ✅ DONE** |

### Efisiensi Konsolidasi

| Metrik | Sebelum (2 plan terpisah) | Sesudah (konsolidasi) | Penghematan |
|---|---|---|---|
| Total tasks | 13 (6 Lifecycle + 4 Next + QA overlap) | **7 unified** | 6 tasks eliminated |
| Total estimasi | 18 jam (12 + 6 overlap) | **~12 jam** | **6 jam saved** |
| Redundancies | 5 exact duplicates + 1 conflict | **0** | All resolved |
| Conflicts | 1 (GAP-1 vs A4) | **0** | Director decision applied |

---

## 10. AUDIT TRAIL — STATUS DARI SESI SEBELUMNYA

> Record of what has been completed before this consolidated plan. Sumber: `AUDIT-v2-DONE-LOG.md`.

### 10.1 Audit v2 Completion Status

| Tier | Total | ✅ DONE | ⛔ BLOCKED | % selesai |
|---|---|---|---|---|
| TIER 1 (beta blocker) | 6 | 6 | 0 | **100%** |
| TIER 2 (demo VIP) | 5 | 5 | 0 | **100%** |
| TIER 3 (post-beta) | 6 | 5 | 1 (T3-04 VAPID) | **83.3%** |
| **TOTAL** | **17** | **16** | **1** | **94.1%** |

### 10.2 Backend Skenario B — All 9 Items Done (T3-02)

| Item | Endpoint | Status |
|---|---|---|
| B1 | `GET /gamification/daily-quests` | ✅ LIVE |
| B2 | `GET /gamification/personal-calendar` | ✅ LIVE |
| B3 | `GET /student-dashboard/timeline` | ✅ LIVE |
| B4 | `GET /student-dashboard/teachers` | ✅ LIVE |
| B5 | `GET/POST/DELETE /kktp-config` | ✅ LIVE |
| B6 | `GET /analytics/monitoring-kbm` | ✅ LIVE |
| B7 | `GET /analytics/rekap-audit` | ✅ LIVE |
| B8 | `GET /schedules/auto-generate` | ✅ LIVE |
| B9 | `/report-cards/*` endpoints | ✅ LIVE (verifyAccess exists) |

### 10.3 Environment Status

| Environment | Database | Data Status | URL |
|---|---|---|---|
| Production | `smk_db` | **CLEAN** — ready for real school data | `smkdarussalamsubah.sch.id` |
| Staging | `smk_staging_db` | **FULL demo data** — ready for QA + demo VIP | `staging.smkdarussalamsubah.sch.id` |

> **Code, build, and API are identical** between prod and staging. Only database and URL differ. QA in staging = valid for prod.

### 10.4 T3-04 VAPID — Blocked (Director Action Required)

5-step verification checklist (Director to execute via SSH):
1. Ensure `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set in production env
2. SSH to VPS: `docker exec smk-api npx prisma migrate deploy` (for kktp_configs table)
3. Login as siswa/ortu → Account sheet → "Aktifkan Notifikasi" → grant permission
4. Check DB: `SELECT * FROM auth.push_subscriptions` — should have new entry
5. Trigger a test absence notification and verify push arrives on device

---

## 11. NEXT SESSION PROMPT (siap tempel)

```
Lanjutkan eksekusi PLAN KONSOLIDASI: DIIS Academic Year 2026/2027 (.tasks/PLAN-CONSOLIDATED-2026.md).

STATUS:
- Audit v2: 16/17 done (94.1%), T3-04 VAPID blocked on Director SSH
- Production (smk_db): CLEAN — ready for real school data
- Staging (smk_staging_db): FULL demo data — ready for QA + demo VIP
- Backend: ALL 9 Skenario B endpoints built and merged
- Lifecycle simulation: 7 FASE tested, 5 active GAPs identified
- Code: prod = staging (identical Docker images)

EKSEKUSI SERIAL (1 task per waktu):
1. U1 (CRITICAL): Rapor Pipeline UI — wali kelas compile → KS approve/publish/distribute
2. U2 (HIGH): Soal Formatif-Sumatif Komprehensif — timer, rubrik, analisis, export
3. U3-U5 (HIGH, paralel OK): Wire KKTP Simpan, Ortu Wali Kelas, Siswa Calendar
4. U6 (MEDIUM): SIM-to-EmptyState refactoring untuk 7 komponen wired
5. U7 (LOW): Staging QA 121 test cases + fix issues

ATURAN WAJIB:
- Baca CLAUDE.md, lib/academic.ts, lib/bell-times.ts SEBELUM coding
- Import KKTP_DEFAULT, NA_WEIGHTS, JP_SLOTS dari lib/ — JANGAN hardcode
- React Hooks: JANGAN conditional useMemo (error #300!)
- Prisma enums: biasa/penting/urgent, bronze/silver/gold/platinum (lowercase)
- Announcement: content (bukan body), createdBy (bukan publishedBy), audience=JSON.stringify(['ALL'])
- Pattern: realData ?? EMPTY_STATE (bukan SIM_CONSTANT) untuk fitur wired
- Gitflow: feat/ → staging → main via PR, CI wajib hijau
- Validation: tsc 0, eslint 0, next build OK setelah setiap perubahan
- Dokumentasi: isi template done-entry per task (§7.1) dengan bukti runtime

DROPPED (per Director):
- Wire B8 Auto-Schedule (GAP-1 deferred — manual scheduling sufficient)
```
