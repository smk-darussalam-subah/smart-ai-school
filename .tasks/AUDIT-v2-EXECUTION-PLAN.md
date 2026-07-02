# AUDIT v2 — EXECUTION PLAN (Rencana Penyelesaian Terkurasi)

> **Dibuat:** 2026-06-26
> **Turunan dari:** `AUDIT-INTEGRASI-v2-REPORT.md` (46 temuan: A:18, B:13, C:3, D:12)
> **Tujuan:** Menutup SEMUA temuan Skenario A (hapus SIM yang backend-nya sudah live), Skenario C (tambah label), dan Skenario D orphannya yang quick-win. Skenario B (backend belum ada) ditangguhkan.
> **Status living:** file ini stabil (rencana). Eksekusi tercatat di `AUDIT-v2-DONE-LOG.md`.
> **Disiplin:** 1 task per waktu (SERIAL) — anti-collision (pelajaran Sprint 3). Branch `feat/audit2-<task-id>`.

---

## LEGENDA

| Simbol | Arti |
|--------|------|
| 🔲 TODO | Belum dimulai |
| 🔄 IN_PROGRESS | Sedang dikerjakan |
| ✅ DONE | Selesai & terverifikasi (validation command lulus) |
| ⛔ BLOCKED | Terhalang dependensi/eksternal |
| 🟡 | Perlu keputusan Director |

**Prioritas:** TIER 1 (beta blocker) → TIER 2 (sebelum demo VIP) → TIER 3 (post-beta)

---

## 📊 TRACEABILITY MATRIX (temuan → task → status)

| Audit ref | Temuan singkat | Task ID | Tier | Status |
|-----------|----------------|---------|------|--------|
| A6 | PembayaranOrtu pure SIM, abaikan props spp | T1-01 | 1 | 🔲 |
| A1-A5 | BerandaOrtu hardcode SIM anak/jadwal/SPP/WA/rank | T1-02 | 1 | 🔲 |
| A7 | CapaianOrtu pure SIM (XP/badge/CP/timeline/rank) | T1-03a | 1 | 🔲 |
| A8 | KehadiranOrtu pure SIM (stats/tren/WA) | T1-03b | 1 | 🔲 |
| A9-A13 | Siswa SIM fallback tampil saat data kosong | T1-04 | 1 | 🔲 |
| A14 | KS sumatif fallback SIM saat kosong | T1-05 | 1 | 🔲 |
| C1 | Ortu child selector hanya toast (tidak switch) | T1-02 (merge) | 1 | 🔲 |
| D2-D7, B9 | Rapor B-G SIM padahal endpoint ada (7 orphan) | T2-01 | 2 | 🔲 |
| A15-A16 | KS health & tren SIM, backend orphan ada | T2-02 | 2 | 🔲 |
| A18, D8 | Guru LMS badge catalog SIM, `/badges` ada | T2-03 | 2 | 🔲 |
| C2 | RPP AI generate (step non-ATP) tak berlabel SIM | T2-04 | 2 | 🔲 |
| 4.2#5 | apiFetch 401 silent → empty state (misleading) | T2-05 | 2 | 🔲 |
| 4.1#2 | Dua formula NA (naOf vs naSimple) — inkonsistensi | T3-01 | 3 | 🔲 |
| B1-B8 | Backend Skenario B (quest/timeline/kktp/monitoring/sched) | T3-02 | 3 | 🔲 |
| D11 | Push subscription UI (PWA) | T3-03 | 3 | 🔲 |
| 4.4#6 | VAPID runtime unverifiable | T3-04 | 3 | 🔲 |
| C3 | Siswa badge celebration trigger tak berlabel | T3-05 | 3 | 🔲 |
| D10, D12 | Endpoint orphan minor (lms progress, wa-log admin) | T3-06 | 3 | 🔲 |

**Total: 16 task** (TIER 1: 5, TIER 2: 5, TIER 3: 6). Eksekusi TIER 1 wajib sebelum beta.

---

## 🗺️ DEPENDENCY GRAPH

```
T1-01 (Pembayaran) ─┐
T1-02 (Beranda) ────┼──> semua T1 ortu bisa paralel (beda file)
T1-03a (Capaian) ───┤
T1-03b (Kehadiran) ─┘
T1-04 (Siswa fallback) ──> independen
T1-05 (KS sumatif) ──────> independen
        ↓ (semua T1 selesai = beta unblock)
T2-01 (Rapor B-G) ──> independen (backend sudah ada)
T2-02 (KS health/tren) ──> independen
T2-03 (Badge catalog) ──> independen
T2-04 (Label SIM) ──> bisa mulai setelah T1-02 (child selector)
T2-05 (apiFetch 401) ──> independen, HATI-HATI (sentral)
        ↓
T3-* (post-beta)
```

**Aturan:** T1 boleh paralel antar-ortu (beda file, no collision). T1-04 & T1-05 independen. Jangan paralel 2 task yang sentuh file sama.

---

## 🔴 TIER 1 — BETA BLOCKERS (wajib sebelum beta)

### T1-01 — PembayaranOrtu: wire props `spp` real, hapus SIM_PEMBAYARAN
| Field | Nilai |
|---|---|
| Ref audit | A6 (Skenario A) + D6 |
| Bukti masalah | `PembayaranOrtu.tsx:8,19-22` — `import { SIM_PEMBAYARAN }`; signature `{ setModal }` TIDAK terima data; pure `SIM_PEMBAYARAN.filter` |
| Bukti data real ada | `page.tsx:226,248` fetch `/student-dashboard/spp` + pass `spp={sppRes?.data ?? []}` ke OrtuWorkspace |
| Estimasi | 30 menit |
| Depends | — |
| Branch | `feat/audit2-T1-01-pembayaran-ortu` (diisi saat mulai) |
| Status | 🔲 TODO |

**Scope:**
- [ ] Ubah signature `PembayaranOrtu` terima prop `spp: SppItem[]` (type: `{ id; month; amount; status; dueDate }[]`)
- [ ] Konversi format API `spp` → view-model `Pembayaran` (`lib/academic.ts:80`) di OrtuWorkspace ATAU di komponen
- [ ] Hapus import & semua referensi `SIM_PEMBAYARAN` dari `PembayaranOrtu.tsx`
- [ ] Thread `spp={realSpp}` dari `OrtuWorkspace.tsx:55` → `<PembayaranOrtu spp={...} />`
- [ ] Saat `spp` kosong → tampilkan empty state (bukan SIM)

**Definition of Done:**
- [ ] `SIM_PEMBAYARAN` tak lagi direferensi di `PembayaranOrtu.tsx`
- [ ] Data SPP real (unpaid/paid) tampil dari DB
- [ ] Empty state saat siswa belum punya tagihan

**Validation (jalankan saat selesai):**
```powershell
# 1. Harus 0 match:
Select-String -Path "apps\web\src\app\dashboard\akademik\_components\ortu\PembayaranOrtu.tsx" -Pattern "SIM_PEMBAYARAN"
# 2. Type check & lint:
npx tsc --noEmit ; npm run lint
# 3. Build web:
npm run build --workspace apps/web
# 4. Runtime: login ortu@diis.test → tab Bayar → harus tampilkan SPP dari DB (atau empty)
```

**Risk:** Type shape API (`{id,month,amount,status,dueDate}`) vs view-model `Pembayaran` (`{id,jenis,amount,due,status,paidDate?,desc?}`) beda — perlu mapping. Mitigasi: fungsi mapping di OrtuWorkspace.

---

### T1-02 — BerandaOrtu: wire children/schedule/spp/waLog/leaderboard + child selector real
| Field | Nilai |
|---|---|
| Ref audit | A1, A2, A3, A4, A5 + C1 |
| Bukti masalah | `BerandaOrtu.tsx:18-24` signature hanya `{ showToast, go, setModal, grades?, announcements? }`; `:41` `SIM_CHILDREN[0]!`, `:49` `SIM_SCHEDULE`, `:53` `SIM_PEMBAYARAN`, `:61` `SIM_WA_HISTORY`, `:47` `SIM_LEADERBOARD`; child selector hanya toast (C1) |
| Bukti data real | `OrtuWorkspace.tsx:55` terima `children: realChildren`, `waLog: _realWaLog` (unused!). page.tsx fetch semua |
| Estimasi | 1.5 jam |
| Depends | — (file beda dengan T1-01, bisa paralel) |
| Branch | `feat/audit2-T1-02-beranda-ortu` |
| Status | 🔲 TODO |

**Scope:**
- [ ] Expand signature `BerandaOrtu` terima: `children: OrtuChild[]`, `schedule: ScheduleItem[]`, `spp: SppItem[]`, `waLog: WaLogItem[]`, `leaderboard?: ...[]`, `activeChildIndex: number`, `onSelectChild: (i:number)=>void`
- [ ] Ganti `SIM_CHILDREN[0]` → `children[activeChildIndex]` (empty state jika kosong)
- [ ] Ganti `SIM_SCHEDULE[dow]` → filter `schedule` by `dayOfWeek === dow`
- [ ] Ganti `SIM_PEMBAYARAN.filter(unpaid)` → `spp.filter(s => s.status === 'unpaid')`
- [ ] Ganti `SIM_WA_HISTORY[0]` → `waLog[0]`
- [ ] Ganti `childRank(SIM_LEADERBOARD)` → empty/hide jika leaderboard tak tersedia (atau terima prop)
- [ ] Child selector: ganti `onClick={showToast}` → `onSelectChild(i)` (C1)
- [ ] Hapus semua import SIM_* yang tak terpakai

**Definition of Done:**
- [ ] Nama anak, kelas, jadwal, SPP, WA terbaru — SEMUA dari data real
- [ ] Child selector benar-benar switch anak (multi-child)
- [ ] Empty state saat anak belum punya data

**Validation:**
```powershell
Select-String -Path "...\BerandaOrtu.tsx" -Pattern "SIM_CHILDREN|SIM_SCHEDULE|SIM_PEMBAYARAN|SIM_WA_HISTORY|SIM_LEADERBOARD"
# Harus 0 match
npx tsc --noEmit ; npm run lint ; npm run build --workspace apps/web
# Runtime: ortu login → beranda tampilkan nama anak ASLI dari DB
# Runtime: jika 2 anak → child selector switch menampilkan data beda
```

**Risk:** Multi-child state perlu di-lift ke OrtuWorkspace (single source `activeChildIndex`). Koordinasi dengan T1-03a/b yang juga butuh anak aktif.

---

### T1-03a — CapaianOrtu: wire badges/xp/cp/leaderboard real
| Field | Nilai |
|---|---|
| Ref audit | A7 |
| Bukti masalah | `CapaianOrtu.tsx:6` import `SIM_XP, SIM_LEADERBOARD, SIM_BADGES, SIM_CPDATA, SIM_TIMELINE`; `:10` signature `{ showToast }` tak terima data; `:19,22,67,128,151,193` pakai SIM |
| Bukti data real | `OrtuWorkspace.tsx:55` terima `badges: _realBadges` (unused!); page.tsx:228 fetch `/badges/student/:id` |
| Estimasi | 1 jam |
| Depends | — |
| Branch | `feat/audit2-T1-03a-capaian-ortu` |
| Status | 🔲 TODO |

**Scope:**
- [ ] Signature terima: `badges: BadgeAward[]`, `xp?`, `leaderboard?`, `cp?`
- [ ] Transform `badges` API → view-model; ganti `SIM_BADGES`
- [ ] Timeline (SIM_TIMELINE) — backend belum ada (B3) → pertahankan DENGAN label "SIMULASI" jelas (jangan hapus)
- [ ] CP data (SIM_CPDATA) — backend `/student-dashboard/cp` ada → wire; bila kosong → empty
- [ ] Thread dari OrtuWorkspace (unprefix `_realBadges`)

**DoD:** badges & XP real; timeline tetap SIM berlabel; CP real atau empty.

**Validation:**
```powershell
Select-String -Path "...\CapaianOrtu.tsx" -Pattern "SIM_BADGES|SIM_XP|SIM_LEADERBOARD|SIM_CPDATA"
# Harus 0 (kecuali SIM_TIMELINE yang sengaja dipertahankan + diberi label)
```

---

### T1-03b — KehadiranOrtu: wire attendance/stats/waHistory real
| Field | Nilai |
|---|---|
| Ref audit | A8 |
| Bukti masalah | `KehadiranOrtu.tsx:7` import `SIM_KEH_STATS, SIM_ATT_TREND, SIM_WA_HISTORY`; `:11` signature `{ setModal }` tak terima data; `:64-67,91,98,126,202,225,230` pakai SIM |
| Bukti data real | `OrtuWorkspace.tsx:55` `attendance: _attendance` (unused), `waLog: _realWaLog` (unused); page.tsx:224 fetch `/attendance?studentId=` |
| Estimasi | 1 jam |
| Depends | — |
| Branch | `feat/audit2-T1-03b-kehadiran-ortu` |
| Status | 🔲 TODO |

**Scope:**
- [ ] Signature terima `attendance: AttendanceItem[]`, `waLog: WaLogItem[]`
- [ ] Hitung stats (hadir/izin/sakit/alpha) dari `attendance` via `aggregateStudentGrades`-style; ganti `SIM_KEH_STATS`
- [ ] WA history dari `waLog`; ganti `SIM_WA_HISTORY`
- [ ] Tren kehadiran (SIM_ATT_TREND) — backend `/analytics/attendance/stats` ada (aggregate) → wire atau label SIM bila perlu deret harian
- [ ] Thread props dari OrtuWorkspace

**DoD:** kalender kehadiran + stats + WA history real.

**Validation:**
```powershell
Select-String -Path "...\KehadiranOrtu.tsx" -Pattern "SIM_KEH_STATS|SIM_WA_HISTORY"
# Harus 0
```

---

### T1-04 — Siswa: hapus SIM fallback → empty state
| Field | Nilai |
|---|---|
| Ref audit | A9, A10, A11, A12, A13 (Skenario A) — kontra-klaim P27 |
| Bukti masalah | `CapaianSiswa.tsx:46-49` `badges.length>0 ? badges : SIM_BADGES` (+ leaderboard/xp/cp); `NilaiSiswa.tsx:20` `grades.length>0 ? grades : SIM_NILAI` |
| Bukit data real | `page.tsx:61-68,110-120` fetch + pass realBadges/realXp/realLeaderboard/realCp/grades |
| Estimasi | 30 menit |
| Depends | — |
| Branch | `feat/audit2-T1-04-siswa-empty-state` |
| Status | 🔲 TODO |

**Scope:**
- [ ] `CapaianSiswa.tsx:46-49`: ganti `badges.length>0 ? badges : SIM_BADGES` → `badges` (langsung); empty state bila `[]`
- [ ] Sama untuk `displayLeaderboard`, `displayXP`, `displayCP`
- [ ] `NilaiSiswa.tsx:20`: ganti fallback → `grades` langsung + empty state
- [ ] Hapus import SIM_* yang tak terpakai dari `siswa-data.ts` (atau biarkan, tapi tak digunakan di runtime)

**DoD:** siswa baru (0 badge/0 nilai) lihat empty state — BUKAN data SIM palsu.

**Validation:**
```powershell
Select-String -Path "...\siswa\CapaianSiswa.tsx","...\siswa\NilaiSiswa.tsx" -Pattern "SIM_BADGES|SIM_LEADERBOARD|SIM_XP|SIM_CPDATA|SIM_NILAI"
# Harus 0 match
# Runtime: login siswa tanpa data → capaian/nilai tampilkan empty state
```

**Risk:** Rendah. Empty state UI mungkin perlu pola (cek komponen ada `<Empty>`/`.empty`). Pastikan ada fallback UI bagus.

---

### T1-05 — KS: sumatif fallback → empty state
| Field | Nilai |
|---|---|
| Ref audit | A14 |
| Bukti masalah | `KsWorkspace.tsx:125` `(realSumatif as ...)?.length ? ... : SIM_SUMATIF` |
| Bukti data real | `page.tsx:185,201` fetch `/assessment/sessions` + pass `realSumatif` |
| Estimasi | 15 menit |
| Depends | — |
| Branch | `feat/audit2-T1-05-ks-sumatif-empty` |
| Status | 🔲 TODO |

**Scope:**
- [ ] `KsWorkspace.tsx:125`: ganti fallback → `realSumatif ?? []`; empty state saat kosong
- [ ] Hapus `SIM_SUMATIF` const (line 63) bila tak dipakai lain

**DoD:** KS lihat queue sumatif real; empty state saat belum ada sesi.

**Validation:**
```powershell
Select-String -Path "...\KsWorkspace.tsx" -Pattern "SIM_SUMATIF"
# Harus 0 match (kecuali SIM lain di KsWorkspace yang Skenario B — jangan sentuh)
```

---

## 🟡 TIER 2 — SHOULD FIX (sebelum demo VIP)

### T2-01 — Rapor B-G: wire ke endpoint yang sudah ada (7 orphan)
| Field | Nilai |
|---|---|
| Ref audit | D2-D7, B9 + koreksi klaim v1 "backend dihapus" |
| Bukti masalah | `RaporModal.tsx:132-134` "SIMULASI — Bagian B-G menggunakan data demo" |
| Bukti endpoint ADA | `report-cards.controller.ts:30` `/:studentId/muatan-lokal`, `:42` `/attendance-summary`, `:54` `/development-description`, `:66` `/approval`, `:89` `POST /generate`, `:103` `/status`, `:120` `/notes` |
| Estimasi | 1.5 jam |
| Depends | — |
| Branch | `feat/audit2-T2-01-rapor-bg` |
| Status | 🔲 TODO |

**Scope:**
- [ ] `RaporModal.tsx`: hapus banner SIMULASI B-G; fetch 3 GET endpoint (muatan-lokal, attendance-summary, development-description) per siswa
- [ ] Tambah tombol "Generate Rapor" di KS dashboard → `POST /report-cards/generate` (D6)
- [ ] Tambah UI approval/status di KS → `PATCH /status` & `/notes` (D7)
- [ ] Cek `report-cards.service.ts` — apakah `verifyAccess()` perlu direstore? (v1 klaim dihapus)

**DoD:** Rapor section A-G semua dari API; KS bisa generate/approve rapor.

**Validation:**
```powershell
Select-String -Path "...\RaporModal.tsx" -Pattern "SIMULASI"
# Harus 0 (atau hanya label yang legitim)
# Runtime: generate rapor via KS → siswa/ortu lihat rapor lengkap A-G
```

**Risk:** Service layer mungkin butuh restore method yang dihapus. Cek `report-cards.service.ts` dulu.

---

### T2-02 — KS health & tren: wire dari analytics orphan
| Field | Nilai |
|---|---|
| Ref audit | A15, A16 |
| Bukti masalah | `KsWorkspace.tsx:70` `SIM_HEALTH`, `:76-83,366` `SIM_TREN_*` |
| Bukti backend orphan | `analytics.controller.ts:41` `/grades`, `:62` `/teacher-compliance`, `attendance.controller.ts:54` `/heatmap`; `executive/actions.ts:99-114` sudah punya logika derivasi health (reusable!) |
| Estimasi | 1.5 jam |
| Depends | — |
| Branch | `feat/audit2-T2-02-ks-health-tren` |
| Status | 🔲 TODO |

**Scope:**
- [ ] Ekstrak logika derivasi health dari `executive/actions.ts:99-114` → fungsi shared di `lib/academic.ts` atau `lib/health.ts`
- [ ] KsWorkspace: fetch `/analytics/grades` + `/analytics/teacher-compliance` + `/attendance/heatmap` (reuse executive fetch)
- [ ] Hitung health score & tren dari data real; ganti `SIM_HEALTH`/`SIM_TREN_*`
- [ ] Hapus SIM const terkait

**DoD:** Health gauge & tren chart KS = real (sinkron executive dashboard).

**Validation:**
```powershell
Select-String -Path "...\KsWorkspace.tsx" -Pattern "SIM_HEALTH|SIM_TREN"
# Harus 0
```

**Risk:** Sedang — formula health belum tentu identik executive. Samakan agar KS & executive tak menampilkan angka beda.

---

### T2-03 — Guru LMS badge catalog: wire ke `/badges`
| Field | Nilai |
|---|---|
| Ref audit | A18, D8 |
| Bukti masalah | `ModulLmsForm.tsx:39,290-296` `SIM_BADGE_CATALOG` + label SIM |
| Bukti backend | `badges.controller.ts:61` `@Get()` list semua badge |
| Estimasi | 30 menit |
| Depends | — |
| Branch | `feat/audit2-T2-03-badge-catalog` |
| Status | 🔲 TODO |

**Scope:**
- [ ] Fetch `/badges` (catalog) di page.tsx guru atau di komponen
- [ ] Ganti `SIM_BADGE_CATALOG` → data real; mapping ke view-model
- [ ] Hapus label SIM di tab Badge

**DoD:** Guru pilih badge dari catalog real saat konfigurasi LMS.

**Validation:**
```powershell
Select-String -Path "...\ModulLmsForm.tsx" -Pattern "SIM_BADGE_CATALOG"
# Harus 0
```

---

### T2-04 — Label SIM eksplisit di Skenario C
| Field | Nilai |
|---|---|
| Ref audit | C1 (child selector — di-merge ke T1-02), C2 (RPP AI step), C3 (celebration) |
| Bukti | `ModulAjarForm.tsx:101-125` step non-ATP `showToast(...SIMULASI)` label tak konsisten |
| Estimasi | 30 menit |
| Depends | T1-02 (C1) |
| Branch | `feat/audit2-T2-04-label-sim` |
| Status | 🔲 TODO |

**Scope:**
- [ ] `ModulAjarForm.tsx`: setiap step non-ATP → tampilkan badge "AI Simulasi" visual (bukan hanya toast)
- [ ] `SiswaWorkspace.tsx` celebration: label indirekt "demo" bila data SIM
- [ ] Audit visual: semua handler stub → label jelas

**DoD:** Tidak ada aksi UI yang misleading (tampak nyata padahal stub).

---

### T2-05 — apiFetch 401: redirect /login (bukan silent empty)
| Field | Nilai |
|---|---|
| Ref audit | 4.2#5 |
| Bukti masalah | `lib/api.ts:101` `!res.ok → null` diam-diam (401 token expired jadi empty state) |
| Estimasi | 45 menit |
| Depends | — |
| Branch | `feat/audit2-T2-05-apifetch-401` |
| Status | 🔲 TODO |

**Scope:**
- [ ] `lib/api.ts`: pada `res.status === 401` → redirect `/login?reason=session` (server-side: `redirect()` Next.js)
- [ ] Pertahankan null untuk 403/404/5xx (tetap empty state — genuine)
- [ ] Tes: expire token → auto-redirect, bukan dashboard kosong

**DoD:** Sesi habis → user diarahkan login dgn pesan, bukan lihat dashboard kosong.

**Validation:**
```powershell
# Runtime: hapus/hapus-expire token → reload → harus redirect /login
```

**Risk:** Tinggi — `apiFetch` sentral, dipakai 60+ call. Perlu careful agar tidak break SSR. Tes paralel semua dashboard.

---

## 🔵 TIER 3 — NICE TO HAVE (post-beta)

### T3-01 — Konsolidasi formula NA: `naOf` saja
| Ref | 4.1#2 | Estimasi: 1 jam | Status: 🔲 |
**Masalah:** `academic.ts:131` `naSimple` masih hidup; GradebookPenilaian pakai naSimple, siswa/ortu pakai naOf → NA bisa beda. **Scope:** rewire Gradebook ke `naOf`, hapus `naSimple`. **Risk:** nilai guru bisa bergeser — komunikasikan.

### T3-02 — Build backend Skenario B
| Ref | B1-B8 | Estimasi: multi-sprint | Status: 🔲 |
**Masalah:** daily-quest, timeline ortu, teacher-by-student, kktp-config persist, monitoring KBM, rekap audit, auto-scheduling. **Scope:** desain backend per modul. Prioritas: kktp-config (B5) & monitoring KBM (B6) untuk KS lengkap.

### T3-03 — Push subscription UI (PWA)
| Ref | D11 | Estimasi: 2 jam | Status: 🔲 |
**Masalah:** `POST /push/subscribe` live tapi tak ada UI. **Scope:** tambah tombol "Aktifkan notifikasi" di profil siswa/ortu.

### T3-04 — VAPID runtime verification
| Ref | 4.4#6 | Estimasi: 30 menit | Status: 🔲 |
**Scope:** tes end-to-end push di produksi (butuh izin SSH Director).

### T3-05 — Siswa badge celebration label
| Ref | C3 | Estimasi: 15 menit | Status: 🔲 |
**Scope:** label "demo" saat celebration dipicu data SIM (hilang setelah T1-04).

### T3-06 — Orphan endpoint minor
| Ref | D10 (`PATCH /lms/modules/:id/progress`), D12 (`GET /wa-log` admin) | Estimasi: 1 jam | Status: 🔲 |
**Scope:** tambah action progres siswa di LMS; halaman admin WA log (opsional).

---

## 🛡️ RISK REGISTER (lintas-task)

| Risiko | Prob | Dampak | Mitigasi |
|--------|------|--------|----------|
| Type shape API ≠ view-model ortu (Pembayaran/Capaian) | Tinggi | Sedang | Buat fungsi mapping eksplisit di OrtuWorkspace; tes dgn data real |
| Multi-child state race di ortu (T1-02/03a/03b) | Sedang | Sedang | Lift `activeChildIndex` ke OrtuWorkspace; 1 sumber kebenaran |
| T2-05 break SSR (apiFetch sentral) | Sedang | Tinggi | Branch terpisah; tes SEMUA dashboard (siswa/ortu/guru/KS/executive/admin) |
| naOf vs naSimple (T3-01) ubah nilai guru | Tinggi | Sedang | Komunikasi Director dulu; reseed; bandingkan before/after |
| Hapus SIM terlalu agresif (Skenario B ikut terhapus) | Sedang | Sedang | Hanya hapus SIM di Skenario A (backend ada); Skenario B tetap + label |

---

## 🔄 ROLLBACK PLAN

Setiap task di branch terpisah (`feat/audit2-T<id>-...`). Jika produksi rusak:
1. `git checkout main` (atau staging) — branch task tak ter-merge
2. Jika sudah ter-merge: `git revert <merge-commit>` + `git push`
3. redeploy via `deploy.yml` (push ke staging/main)
4. Untuk T2-05 (apiFetch sentral): revert SEGERA — dampak luas

**Aturan:** TIDAK ada force-push ke branch protected. Pakai `git revert`.

---

## 📋 RITUAL EKSEKUSI (per task)

Sebelum mulai task:
1. `git fetch origin && git checkout origin/develop -b feat/audit2-T<id>-<slug>`
2. Baca task card ini + bukti `path:line` (verifikasi tak berubah sejak audit)
3. Update status di `AUDIT-v2-DONE-LOG.md` → 🔄 IN_PROGRESS

Sesudah selesai:
4. Jalankan **Validation** command di task card → semua lulus
5. `npx tsc --noEmit` + `npm run lint` (seluruh `src`) + `npm test` + `npm run build --workspace apps/web`
6. Isi done-entry di `AUDIT-v2-DONE-LOG.md` (template tersedia) → ✅ DONE + bukti
7. Commit `fix(audit2): <task-id> <slug>` (conventional)
8. PR `feat/audit2-T<id>` → develop (CI hijau) → staging (deploy, smoke test) → main

---

## 📈 PROGRESS DASHBOARD

| Tier | Total | 🔲 TODO | 🔄 | ✅ DONE | % selesai |
|------|-------|---------|-----|---------|-----------|
| TIER 1 (beta) | 6 | 0 | 0 | 6 | 100% |
| TIER 2 (demo) | 5 | 0 | 0 | 5 | 100% |
| TIER 3 (later) | 6 | 3 | 0 | 3 | 50% |
| **TOTAL** | **17** | **3** | **0** | **14** | **82.4%** |

> Update tabel ini tiap task selesai. Sumber kebenaran status = `AUDIT-v2-DONE-LOG.md`.
> **Merged to production:** PR #270 (staging) + PR #271 (main) — 2026-07-01.
> **Tier 3 remaining priority:** T3-06 (Orphan endpoints) → T3-02 (Backend Skenario B) → T3-04 (VAPID verify, needs Director SSH).

---

*File ini stabil (rencana). Jangan diedit kecuali scope task berubah (catat di decision-log). Progress aktual ada di `AUDIT-v2-DONE-LOG.md`.*
