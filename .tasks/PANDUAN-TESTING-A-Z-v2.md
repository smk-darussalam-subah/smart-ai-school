# PANDUAN TESTING A-Z v2 — DIIS Smart AI School

> **Tanggal:** 2026-06-26
> **Tujuan:** Pedoman uji beta test menyeluruh, berbasis bukti audit v2 (`AUDIT-INTEGRASI-v2-REPORT.md`).
> **Prinsip:** Setiap test case menunjukkan jalur user + expected result + catatan SIM/real (dari temuan audit).
> **Audiens:** Beta tester internal, Kang Sholah (Director), Cowork (koordinator), Claude Code (eksekutor fix).

---

## 1. PRASYARAT

### 1.1 Akun test per role (harus disiapkan di Keycloak + DB)
| Role | Email | Password | Sumber data |
|------|-------|----------|-------------|
| SUPER_ADMIN | admin@diis.test | Test123! | provisioning |
| KEPALA_SEKOLAH | ks@diis.test | Test123! | provisioning |
| GURU | guru@diis.test | Test123! | provisioning + teaching-assignment |
| SISWA | siswa@diis.test | Test123! | provisioning + parent link |
| ORANG_TUA | ortu@diis.test | Test123! | provisioning + my-children link |

> ⚠️ **Bukti kode:** `student.controller.ts:66` `@Get('my-children')` butuh relasi parent-child valid di DB. Pastikan seed staging punya relasi `parentId` benar — jika tidak, ortu dashboard kosong & fallback SIM muncul (lihat test O-03).

### 1.2 URL
- Staging (demo): `https://staging.smkdarussalamsubah.sch.id`
- Production (beta): `https://smkdarussalamsubah.sch.id`

### 1.3 Browser/Device
- Siswa & Ortu: Chrome Android (375px) / iPhone Safari
- Guru: Chrome desktop (1280px) + Chrome mobile (375px)
- KS: Chrome desktop (1280px+)
- Kiosk: Chrome fullscreen (1920px) di TV 43"

### 1.4 Master data wajib ada (staging)
18 mapel · 10 kelas · 10 guru · 4 jurusan · 1 tahun ajaran · 1 semester aktif · 5 RPP (3 approved/1 submitted/1 draft) · jadwal Sen-Sab JP1-8 · SPP 3 bulan mix · 5 announcement published · 2 assessment session · badge katalog + 3 badge siswa · WA log 5 entri.

---

## 2. TEST SUITE — SISWA (Mobile 375px)

| ID | Modul | Langkah | Expected | Catatan audit v2 | Pass/Fail |
|----|-------|---------|----------|------------------|-----------|
| S-01 | Login | Buka URL → login siswa@diis.test | Redirect ke `/dashboard/akademik` (mobile, 7-tab bottom-nav) | apiFetch 401→silent null (4.2#5); cek tak redirect login drum | |
| S-02 | Beranda | Lihat beranda | Greeting WIB, stat grid, tugas hari ini, badge terbaru | Data real via `page.tsx:55-69` (11 calls) | |
| S-03 | Beranda | Verifikasi badges real vs SIM | Jika siswa punya badge → real; jika 0 badge → **harusnya empty state** | ⚠️ `CapaianSiswa.tsx:46` fallback SIM_BADGES — **BUG: data palsu muncul** (A9) | |
| S-04 | Jadwal | Tap "Jadwal" | Jadwal hari ini JP slots + kalender mingguan | Real `/schedules?studentId=` | |
| S-05 | Jadwal | Tap cell | Modal detail sesi (mapel/guru/ruang/JP) | — | |
| S-06 | Jadwal | Cek hari Minggu | Tampilkan "Libur" | `generateCalendar` `academic.ts:250` Minggu=empty | |
| S-07 | Modul | Tap "Modul" | Daftar modul LMS published kelas siswa | Real `/lms/modules/my-learning` (P26) | |
| S-08 | Modul | Tap modul | Detail: materi, TP, KKTP | — | |
| S-09 | Nilai | Tap "Nilai" | Daftar nilai per mapel + NA + status tuntas/remedial | ⚠️ `NilaiSiswa.tsx:20` fallback SIM_NILAI saat kosong (A13) | |
| S-10 | Nilai | Cek nilai kosong (siswa baru) | **Expected: empty state. BUG jika: data SIM muncul** | ⚠️ Validasi P1.2 setelah fix | |
| S-11 | Tugas | Tap "Tugas" | Daftar tugas aktif | Real `/student-dashboard/assignments` (P26) | |
| S-12 | Hadir | Tap "Hadir" | Stats hadir/izin/sakit/alpha + kalender bulanan | Real `/analytics/attendance/stats` | |
| S-13 | Hadir | Tap tanggal kalender | Modal detail kehadiran | — | |
| S-14 | Capaian | Tap "Capaian" | XP bar, level, leaderboard, CP, badge collection | ⚠️ `CapaianSiswa.tsx:46-49` fallback SIM (A9-A12) | |
| S-15 | Capaian | Cek leaderboard kosong | **Expected: empty. BUG jika: leaderboard SIM 5 nama muncul** | ⚠️ A10 — cegah sebelum beta | |
| S-16 | Theme | Tap toggle (sun/moon) | Dark↔light, persist `diis-theme` | localStorage scoped | |
| S-17 | Bell | Tap icon bell | Modal pengumuman | Real `/announcements` | |
| S-18 | Akun | Tap icon user | Bottom sheet: nama, email, logout | P7.5; cek F7 staging→prod | |
| S-19 | Logout | Tap "Keluar" | Redirect `/login` | `/api/auth/federated-logout` | |
| S-20 | Responsive | Width 375px | No horizontal overflow | — | |
| S-21 | Daily Quest | Lihat quest ring beranda | Tampil dengan badge "SIMULASI" | B1 — backend belum ada, label benar | |

---

## 3. TEST SUITE — ORANG TUA (Mobile 375px)

| ID | Modul | Langkah | Expected | Catatan audit v2 | Pass/Fail |
|----|-------|---------|----------|------------------|-----------|
| O-01 | Login | Login ortu@diis.test | Redirect `/dashboard/akademik` (mobile, 5-tab) | — | |
| O-02 | Beranda | Lihat beranda | Info anak, pengumuman, ringkasan | ⚠️ **`BerandaOrtu.tsx:41` pakai SIM_CHILDREN[0] hardcode** — identitas anak PALSU (A1) | |
| O-03 | Beranda | Cek relasi parent-child | Jika `my-children` return data → nama anak real; jika kosong → **harus empty** | ⚠️ BUG: anak PALSU muncul walau DB kosong (A1). Bug blocker demo ortu. | |
| O-04 | Beranda | Cek ringkasan SPP | Real unpaid total + jatuh tempo | ⚠️ `BerandaOrtu.tsx:53` SIM_PEMBAYARAN — **SPP palsu** (A3) | |
| O-05 | Beranda | Cek jadwal anak hari ini | Timeline mapel anak | ⚠️ `BerandaOrtu.tsx:49` SIM_SCHEDULE — **jadwal palsu** (A2) | |
| O-06 | Beranda | Cek notif WA terbaru | Kartu WA absensi | ⚠️ `BerandaOrtu.tsx:61` SIM_WA_HISTORY — **WA palsu** (A4) | |
| O-07 | Kehadiran | Tap "Kehadiran" | Kalender anak + stats bulanan | ⚠️ `KehadiranOrtu.tsx:64-67` SIM_KEH_STATS — **stats palsu** (A8) | |
| O-08 | Nilai | Tap "Nilai" | Daftar nilai anak | Real `/grades` (P25); fallback SIM saat kosong | |
| O-09 | Bayar | Tap "Bayar" | Daftar SPP + status | 🔴 **`PembayaranOrtu.tsx:19-22` pure SIM_PEMBAYARAN — abaikan props spp real** (A6). **BETA BLOCKER.** | |
| O-10 | Capaian | Tap "Capaian" | XP/badge/CP/leaderboard anak | ⚠️ `CapaianOrtu.tsx` pure SIM (A7) | |
| O-11 | Bell | Tap bell | Modal pengumuman | Real | |
| O-12 | Child Selector | Tap dropdown child | Daftar anak atau toast | 🔴 Skenario C1 — onClick hanya toast, tak switch sungguhan | |
| O-13 | Theme | Tap toggle | Dark↔light persist `diis-ortu-theme` | — | |
| O-14 | Logout | Tap "Keluar" | Redirect `/login` | — | |

> **Catatan kritikal:** Mayoritas Beranda/Pembayaran/Capaian ortu menampilkan SIM. **JANGAN demo ortu ke VIP sebelum P1.1 selesai.** Data real sudah di-fetch di `page.tsx:212-230` tapi sub-komponen abaikan.

---

## 4. TEST SUITE — GURU (Desktop 1280 + Mobile 375)

| ID | Modul | Langkah | Expected | Catatan audit v2 | Pass/Fail |
|----|-------|---------|----------|------------------|-----------|
| G-01 | Login | Login guru@diis.test | Redirect dashboard guru (sidebar desktop) | — | |
| G-02 | Beranda | Lihat beranda | Jadwal hari ini, kelas berjalan, RPP turnaround | Real `/schedules`, `/class-activities`, `/rpp` | |
| G-03 | Modul Ajar | Klik "Modul Ajar" | Daftar RPP status draft/submitted/approved/revision | Real `/rpp` | |
| G-04 | Modul Ajar | "Buat Baru" → wizard | Form multi-step | `ModulAjarForm.tsx` 11-step | |
| G-05 | Modul Ajar | Isi → Submit | Status "submitted" | — | |
| G-06 | Modul Ajar | Edit RPP draft | Form terisi existing | — | |
| G-07 | AI Generate | Step 3 (ATP) → Generate | Real AI dari `/ai/generate-atp` | ✅ Real (P20) | |
| G-08 | AI Generate | Step lain → Generate | Label "SIMULASI" jelas | ⚠️ C2 — `ModulAjarForm.tsx:124` showToast SIM, label kurang jelas | |
| G-09 | Gradebook | Klik "Penilaian" | Gradebook siswa per kelas/mapel | Real `/grades`; NA pakai `naSimple` (4.1#2 — belum `naOf`) | |
| G-10 | Gradebook | Input nilai baru | Modal input (uh/praktik/sikap/uts/uas) | `POST /grades` | |
| G-11 | Gradebook | Submit | Tersimpan, muncul di list, trigger event `GRADE_SUBMITTED` | listener: notif+badge+xp | |
| G-12 | Absen | Klik "Absen" kelas hari ini | Modal bulk status per siswa | `POST /attendance` | |
| G-13 | Absen | Submit | Tersimpan, trigger WA event `ATTENDANCE_RECORDED` | listener notif+badge | |
| G-14 | Jurnal | Buka jurnal | Modal kegiatan kelas | Real `/class-activities` | |
| G-15 | LMS | Klik "LMS" | Daftar modul LMS milik guru | Real `/lms/modules` | |
| G-16 | LMS | Buat modul (3-tab editor) | Tab Materi/Asesmen/Badge | `ModulLmsForm.tsx` (P21) | |
| G-17 | LMS | Tab Badge — katalog | ⚠️ SIM_BADGE_CATALOG bertanda SIM | A18 — backend `/badges` ada, tinggal wire | |
| G-18 | LMS | Publish modul | Status published | — | |
| G-19 | LMS Preview | "Pratinjau Lengkap" | Standalone phone-frame + matrix progress | `LmsPreviewScreen.tsx` (P22); progres siswa SIM bertanda | |
| G-20 | Question Bank | Buka Question Bank editor | CRUD PG/essay/true_false | ✅ Real `/questions`, `/question-sets` (P20) | |
| G-21 | Session Flow | "Sesi Asesmen" → buat dari modul | Modal buat sesi | ✅ Real `/assessment` (P12) | |
| G-22 | Session | Start session → lihat hasil | Status active → realtime monitor | `PenilaianSesiModal.tsx` ⚠️ data SIM bertanda (Skenario B) | |
| G-23 | CP Progress | Lihat progres ketercapaian | SIMULASI bertanda | B10 — backend `/cp-progress` belum ada | |
| G-24 | Rapor | Buka rapor | Section A real; B-G SIMULASI | B9 — endpoint ada (D2-D7), tinggal wire | |
| G-25 | Responsive | 375px → bottom-nav; 1280px → sidebar | Layout switch | — | |

---

## 5. TEST SUITE — KEPALA SEKOLAH (Desktop 1280+)

| ID | Modul | Langkah | Expected | Catatan audit v2 | Pass/Fail |
|----|-------|---------|----------|------------------|-----------|
| K-01 | Login | Login ks@diis.test | Redirect KS dashboard (sidebar 240px) | — | |
| K-02 | Beranda | Lihat KPI cards | Kehadiran/kelas berjalan/modul pending/sumatif pending | Real `/rpp`, `/attendance`, `/schedules` | |
| K-03 | Beranda | KPI "Guru Hadir" | ⚠️ `SIMULASI` badge — belum ada backend | KsWorkspace.tsx:278 | |
| K-04 | Beranda | Health score gauge | ⚠️ SIMULASI (`SIM_HEALTH`) — backend orphan ada | A15 — `/analytics/*` ready, tinggal wire | |
| K-05 | Beranda | Tren kehadiran 10H/1B/3B | ⚠️ SIMULASI (`SIM_TREN_*`) — backend orphan ada | A16 — wire via `/attendance/heatmap` | |
| K-06 | Filter | Pilih TA/Sem/Guru/Mapel | "Filter SIMULASI" badge | Global filter SIM — frontend only | |
| K-07 | Modul Ajar | Daftar RPP semua guru | Real `/rpp` | — | |
| K-08 | Modul Ajar | Approve RPP submitted | Status approved → auto-create LMS draft | ✅ listener `lms.event-listener.ts:19` | |
| K-09 | Modul Ajar | Revise + catatan | Status revision | — | |
| K-10 | Sumatif | Tap "Sumatif" | Queue asesmen sumatif | ✅ Real `/assessment/sessions` (P29); fallback SIM saat kosong (A14) | |
| K-11 | Sumatif | Tap sesi | Pratinjau soal + approve/tolak | ⚠️ SIMULASI soal lengkap | |
| K-12 | Monitoring | Matrix Guru×Kelas | ⚠️ SIMULASI penuh | B6 — backend monitoring belum ada | |
| K-13 | Rekap | Tabel rincian | ⚠️ SIMULASI penuh | B7 — backend rekap belum ada | |
| K-14 | KKTP | Slider per mapel | SIM, "Simpan" toast SIMULASI | B5 — kktp-config persist belum ada | |
| K-15 | Jadwal | Lihat jadwal | Real `/schedules` | — | |
| K-16 | Jadwal | "Generate Ulang" | ⚠️ SIMULASI — backend auto-sched belum ada | B8 | |
| K-17 | Executive | Buka `/dashboard/executive` | 15 panel real (13 nyata) | ✅ Real via `executive/actions.ts:139-148` | |
| K-18 | Admin | `/dashboard/struktur-organisasi` | Tree organisasi | ✅ Real (per v1, verified prod) | |
| K-19 | Admin | `/dashboard/kalender` | Kalender akademik | ✅ Real `/school/calendar` | |
| K-20 | Admin | `/dashboard/tahun-ajaran` | List tahun ajaran+semester | ✅ Real | |
| K-21 | Responsive | 1280px | Sidebar visible, modal buka | — | |

---

## 6. TEST SUITE — KIOSK (TV 43" 1920px)

| ID | Modul | Langkah | Expected | Catatan audit v2 | Pass/Fail |
|----|-------|---------|----------|------------------|-----------|
| KS-01 | Display | Buka `/ruang-guru/[token]` | Fullscreen, grid 12-col papan | Real `/public-kiosk/kiosk` | |
| KS-02 | Papan | Lihat grid rombel×JP | Semua kelas terlihat, adaptive no-scroll | Real `/schedules` + `/attendance/heatmap` | |
| KS-03 | Papan | Hover cell | HTML tooltip (JP/mapel/guru/ruang) — 1 tooltip saja | ✅ Real (Task A) | |
| KS-04 | Papan | Tap cell | Modal drill-down sesi | ✅ Real | |
| KS-05 | Papan | Lihat status eksekusi | ⚠️ "Fase 2" badge — KBM real-time belum | B12 | |
| KS-06 | Papan | Absen per JP strip | ⚠️ "Fase 2 SIMULASI" bertanda | B12 | |
| KS-07 | KPI | Lihat kartu | Total kelas/guru hadir/kelas berjalan/avg kehadiran | ✅ Real (sebagian), sebagian Fase 2 | |
| KS-08 | AI Panel | Ketik → send | AI merespons (Ollama lokal) | ✅ Real `/ai/chat` | |
| KS-09 | Alert | Tap "Umumkan" | ⚠️ "Fase 2 SIMULASI" TTS | B13 | |
| KS-10 | Physical | Tes di TV 43" fisik | Layout proporsional | 🔲 Butuh hardware (per v1) | |

---

## 7. CROSS-ROLE INTEGRATION TESTS

| ID | Langkah | Expected | Bukti sistem |
|----|---------|----------|--------------|
| X-01 | Guru input nilai → reload siswa | Nilai muncul di tab "Nilai" siswa | event GRADE_SUBMITTED + siswa `/grades` real | |
| X-02 | Guru input nilai → reload ortu | Nilai anak muncul di tab Nilai ortu | ortu `/grades?studentId` real | |
| X-03 | Guru input absen alpha → cek WA log | Entry WA log tercipta | listener `notification.listener.ts:220` + WaLogService | |
| X-04 | Guru submit RPP → KS approve → cek LMS | RPP approved → LMS draft auto-create | `lms.event-listener.ts:19` @OnEvent RPP_REVIEWED | |
| X-05 | Guru input nilai → cek badge siswa | Jika trigger kriteria → badge auto-award | `badges.listener.ts:31` @OnEvent GRADE_SUBMITTED | |
| X-06 | Guru input nilai → cek XP siswa | +30 XP idempoten | `gamification.listener.ts:30` | |
| X-07 | TU catat SPP → cek ortu | Status SPP update ortu | ⚠️ **FAIL saat ini** — PembayaranOrtu pakai SIM, abaikan data real (A6) | |
| X-08 | SA buat pengumuman → cek semua role | Pengumuman muncul lintas dashboard | `/announcements` real + listener ANNOUNCEMENT_PUBLISHED | |

---

## 8. EDGE CASES

| ID | Skenario | Expected | Catatan |
|----|----------|----------|---------|
| EC-01 | Data kosong (semester baru) | **Empty state**, BUKAN SIM | ⚠️ REGRESI: siswa capaian/nilai, ortu beranda/pembayaran TAMPIL SIM palsu (A9-A13, A1-A6). **Wajib fix P1.2 sebelum beta.** |
| EC-02 | Hari Minggu | Jadwal "Libur" | `generateCalendar` Minggu=empty ✅ |
| EC-03 | Siswa tanpa ortu | Tidak crash | — |
| EC-04 | Guru tanpa kelas | Beranda "Belum ada kelas" | — |
| EC-05 | API down | dataWarning banner non-blok | `akademik/page.tsx:47` ✅ |
| EC-06 | Token expired (401) | ⚠️ Saat ini: silent empty state (misleading). Idealnya redirect /login | 4.2#5 — P2.5 |
| EC-07 | Theme toggle rapid | Visual stabil | — |
| EC-08 | Keyboard nav (Tab/Enter/Space) | Semua interaktif accessible | a11y | |
| EC-09 | Modal focus trap | Focus trapped, restore on close | — | |
| EC-10 | Ortu tanpa relasi parent-child | Beranda anak PALSU muncul (SIM_CHILDREN[0]) | 🔴 BUG A1 — harus empty state |

---

## 9. REGRESSION CHECKLIST (otomatis)

| ID | Item | Cara verifikasi | Target |
|----|------|-----------------|--------|
| R-01 | KKTP tidak hardcoded | grep `\b75\b` di luar academic.ts | Hanya `KKTP_DEFAULT=75` |
| R-02 | NA_WEIGHTS tidak hardcoded | grep `0\.20\|0\.25\|0\.15` | Hanya `academic.ts:36` |
| R-03 | JP_SLOTS tidak hardcoded | grep `07:30\|08:10` | Hanya `bell-times.ts:25` |
| R-04 | Minggu = Libur | grep `jsDay === 0\|dow === 0` | `generateCalendar` ✅ |
| R-05 | Tidak double tooltip | audit manual kiosk | ✅ Task A |
| R-06 | SIM fallback di siswa | grep `length > 0 \? .* : SIM_` di siswa/ | **0 setelah P1.2** |
| R-07 | Pure SIM di ortu sub-komponen | grep `SIM_PEMBAYARAN\|SIM_CHILDREN` di ortu komponen (bukan data module) | **0 setelah P1.1** |
| R-08 | `tsc --noEmit` | `npx tsc --noEmit` di root | 0 errors |
| R-09 | eslint | `npm run lint` | 0 errors |
| R-10 | jest | `npm test` | 841+ pass |
| R-11 | next build | `npm run build` di apps/web | success |
| R-12 | `any`/`as any` | grep di apps/api/src & apps/web/src | minimal (strict) |

---

## 10. PRIORITAS TESTING (urutan eksekusi beta)

### Tier 1 — Sebelum buka beta (wajib hijau)
1. Jalankan P1.1 + P1.2 + P1.3 (lihat Audit v2 §8) → fix beta blocker
2. Seed staging lengkap (§1.4)
3. Jalankan S-01..S-21 + O-01..O-14 + G-01..G-13 → semua Pass
4. Jalankan X-07 (SPP ortu) → harus Pass setelah P1.1
5. Jalankan EC-01 (data kosong) → harus empty state, bukan SIM

### Tier 2 — Sebelum demo VIP
6. Jalankan K-01..K-21 (KS) + KS-01..KS-10 (Kiosk)
7. Jalankan X-01..X-08 (cross-role)
8. Rekam video backup flow Tier-1 (asuransi demo)

### Tier 3 — Post-beta
9. Edge cases EC-07..EC-09
10. Skenario B backend build (daily quest, timeline, kktp-config, monitoring KBM)

---

## 11. RITUAL PENUTUP TESTING

```
[✅] 5 role test suite (Siswa 21, Ortu 14, Guru 25, KS 21, Kiosk 10) = 91 test case
[✅] Cross-role integration 8 test (X-01..X-08)
[✅] Edge cases 10 (EC-01..EC-10)
[✅] Regression checklist 12 (R-01..R-12)
[✅] Setiap test case ditandai real/SIM berdasarkan bukti audit v2
[✅] Beta blocker (P1.1: ortu sub-komponen) dan data-palsu-risk (EC-01) teridentifikasi
```

**Total: 121 test case** siap dieksekusi. Urutan prioritas di §10.

---

*Panduan ini bersifat hidup — update Actual/Pass-Fail kolom saat eksekusi. Acuan bukti: `AUDIT-INTEGRASI-v2-REPORT.md` (6/26).*
