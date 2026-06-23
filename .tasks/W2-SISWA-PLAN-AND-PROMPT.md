# W2 SISWA — PLAN + PROMPT PEMBUKA SESI

> **Dibuat:** 2026-06-21 · **Branch:** `feat/2P-akademik-siswa` (dari `origin/main` @ `4760c12`)
> **Mockup sumber:** `.tasks/akademik-mockup/akademik-siswa.html` (1273 baris)
> **Status produksi:** W0 ✅ Production · W1 ✅ Production (PR #213) · **W2 = sesi ini**

---

## JAWABAN OPSI B (staging sync)

**Tidak perlu. Tidak rawan.** `origin/staging` (6d31580) tertinggal 44 commit di belakang `origin/main` (4760c12). Staging tidak punya apa-apa yang belum ada di main. PR staging → main = empty no-op. Untuk W2, branch langsung dari `origin/main`. Sync staging bisa dilakukan kapan saja nanti (main → staging via PR).

---

## BAGIAN 1: PLAN IMPLEMENTASI W2 SISWA

### 1.1 Ringkasan Eksekutif

Bangun dashboard siswa mobile-first (max-width 560px, bottom nav 7 tab) dari mockup `akademik-siswa.html`. Route: `/dashboard/akademik` dengan role-branching (SISWA → SiswaWorkspace, GURU → AkademikWorkspace yang sudah ada). Tema dark/light dengan localStorage. Semua fitur mockup WAJIB diimplementasikan — backend belum ada → SIMULASI bertanda.

### 1.2 Sumber Mockup & Referensi

| # | File | Baris | Fungsi |
|---|------|-------|--------|
| 1 | `.tasks/akademik-mockup/akademik-siswa.html` | 1273 | Mockup sumber utama — WAJIB baca utuh |
| 2 | `apps/web/src/lib/academic.ts` | 262 | W0: KKTP_DEFAULT, NA_WEIGHTS, naOf(), gradeStatus(), predikat(), generateCalendar(), fmtRupiahExact(), daysUntil(), fmtDateShort() |
| 3 | `apps/web/src/lib/bell-times.ts` | 112 | W0: JP_SLOTS, currentJp(), jpStartLabel(), wibNow(), BELL_SEGMENTS |
| 4 | `apps/web/src/components/academic/shared/` | — | W0: CalendarHeatmap, GradeRow, GradeDetailModal, RaporModal, ScoreBar, ThemeToggle |
| 5 | `apps/web/src/app/dashboard/akademik/page.tsx` | 104 | Route guru saat ini — pola getServerSession + getEffectiveRoles + apiFetch paralel |
| 6 | `apps/web/src/app/dashboard/akademik/_components/AkademikWorkspace.tsx` | 230 | Pattern workspace guru — 7 sub-nav tabs, context bar |
| 7 | `.tasks/akademik-mockup/ROLLOUT-PLAN-BERTAHAP.md` | 169 | Rencana gelombang, prinsip data jujur |
| 8 | `.tasks/akademik-mockup/INTEGRATION-PROMPT-PRODUCTION.md` | 693 | Spesifikasi fitur lengkap per dashboard |

### 1.3 Struktur 7 Screen + Overlay

| Screen | Nav Tab | Ikon | Data Nyata | Simulasi |
|--------|---------|------|------------|----------|
| **Beranda** | Beranda | home | Jadwal hari ini (from /schedules), Nilai terbaru (from /grades) | Daily Quest ring, streak, XP, stat cards (kehadiran/rata²/badge), continue learning modcard, badge preview |
| **Jadwal** | Jadwal | calendar-clock | /schedules own + JP_SLOTS | Kalender akademik, lesson session modal, class detail modal |
| **Modul** | Modul | book-open | — (LMS backend belum ada) | Modul list per mapel, modul detail dengan 4 tab (diagnostik/materi/tugas/asesmen), learning path, badge celebration |
| **Nilai** | Nilai | trending-up | /grades own (filter studentId=self) | Summary stats, filter tabs, grade detail modal dengan ring, rapor modal |
| **Tugas** | Tugas | clipboard-list | — (tugas backend belum ada) | Filter tabs (pending/submitted/graded), task cards, submit flow dengan upload zone, feedback guru |
| **Kehadiran** | Hadir | user-check | /attendance own | Big ring 92.8%, stats row, calendar heatmap, day detail modal |
| **Capaian** | Capaian | award | — (XP/badge backend belum ada) | XP card, leaderboard per jurusan, CP progress per mapel, skill badges grid, badge detail modal |
| **Profile CV** | (swipe) | — | — | Slide-in: stats, skills, badges, timeline (PKL/workshop/sertifikasi), CP progress, download CV |
| **Pengumuman** | (bell) | — | /announcements | Modal daftar pengumuman |

### 1.4 Routing Strategy

**Pilihan: Role-branching di `/dashboard/akademik`**

```
/dashboard/akademik/page.tsx
├── role includes SISWA → <SiswaWorkspace />  (W2 — sesi ini)
├── role includes GURU → <AkademikWorkspace />  (W1 — sudah production)
├── role includes KS → <KsWorkspace />  (W4 — future)
└── fallback → redirect /dashboard
```

**Alasan:**
- Sidebar sudah punya link "Akademik" → `/dashboard/akademik` untuk SISWA
- Tidak perlu route baru atau ubah Sidebar
- Pisah komponen workspace per role → tidak campur kode
- Guard: `getEffectiveRoles(session)` sudah ada polanya di page.tsx guru

### 1.5 File Structure (target)

```
apps/web/src/app/dashboard/akademik/
├── page.tsx                          # MODIFIED: tambah role-branch SISWA
├── _components/
│   ├── AkademikWorkspace.tsx         # EXISTING (W1 Guru — JANGAN SENTUH)
│   ├── guru-types.ts                 # EXISTING
│   ├── ... (W1 files)                # EXISTING
│   └── siswa/                        # NEW — W2 Siswa
│       ├── SiswaWorkspace.tsx         # Main client component: bottom nav, screen routing, theme
│       ├── siswa-types.ts             # Types: SiswaModul, SiswaBadge, SiswaTugas, etc.
│       ├── siswa-data.ts              # SIMULASI constants: MODULS, BADGES, LEADERBOARD, CPDATA, etc.
│       ├── BerandaSiswa.tsx           # Screen 1: Beranda
│       ├── JadwalSiswa.tsx            # Screen 2: Jadwal
│       ├── ModulSiswa.tsx             # Screen 3: Modul list
│       ├── ModulDetailSiswa.tsx       # Screen 3b: Modul detail (learning path + 4 tabs)
│       ├── NilaiSiswa.tsx             # Screen 4: Nilai
│       ├── TugasSiswa.tsx             # Screen 5: Tugas
│       ├── KehadiranSiswa.tsx         # Screen 6: Kehadiran
│       ├── CapaianSiswa.tsx           # Screen 7: Capaian
│       ├── ProfileCV.tsx              # Overlay: Profile CV slide-in
│       ├── PengumumanModal.tsx        # Modal: Pengumuman
│       ├── BadgeCelebration.tsx       # Overlay: Badge celebration dengan confetti
│       ├── LessonSessionModal.tsx     # Modal: Lesson session (from schedule)
│       ├── ClassDetailModal.tsx       # Modal: Class detail (from schedule)
│       ├── TaskDetailModal.tsx        # Modal: Task detail + submit flow
│       ├── DayDetailModal.tsx         # Modal: Attendance day detail
│       └── BadgeDetailModal.tsx       # Modal: Badge detail
```

### 1.6 Batch Plan (9 batch — paralel dengan pola W1)

#### Batch A — Shell + Route + Data Foundation

**Tujuan:** Nail down route, workspace shell, bottom nav, theme, dan semua SIMULASI data constants.

**Files:**
1. `siswa-types.ts` — Types:
   - `SiswaModul` (id, tp, judul, alokasi, kktp, status: 'Selesai'|'Aktif'|'Terkunci', lms, prog, badge, mapel)
   - `SiswaBadge` (name, icon, color, earned, cat, score?, prog?, desc)
   - `SiswaTugas` (id, mp, title, type, deadline, dlDays, status, guru, desc, score?, feedback?)
   - `SiswaNilai` (mp, scores[5], rata, kktp, trend, cp)
   - `SiswaCP` (cp, desc, progres, tps[])
   - `SiswaLeaderboardEntry` (name, kelas, xp, badges, avg, me?)
   - `SiswaProfileCV` (name, role, tags, stats, skills, timeline)
   - `SiswaQuest` (title, tasks[])
   - `SiswaKalenderEvent` (d, m, title, desc, color)
   - `SiswaPengumuman` (ic, color, title, from, time, body, tag, tagColor)

2. `siswa-data.ts` — SIMULASI constants (dari mockup lines 555-710):
   - `SIM_MODULS` — 11 modul across 4 mapel
   - `SIM_BADGES` — 9 badges (4 earned, 5 in-progress)
   - `SIM_TUGAS` — 12 tugas (5 pending, 1 submitted, 6 graded)
   - `SIM_NILAI` — 8 mapel with 5 component scores each
   - `SIM_CPDATA` — 4 CP with TP breakdown
   - `SIM_LEADERBOARD` — 6 entries (1 me)
   - `SIM_PROFILE_CV` — skills (5), timeline (5)
   - `SIM_DAILY_QUEST` — 3 tasks
   - `SIM_KALENDER` — 5 events
   - `SIM_PENGUMUMAN` — 5 announcements
   - `SIM_KEH_STATS` — {hadir:156, izin:5, sakit:4, alpha:2, total:167, pct:92.8}
   - `SIM_XP` — {level:12, current:3450, next:5000}
   - `MAPEL_COLORS` — 8 mapel color map
   - `MAPEL_ICONS` — 8 mapel icon map
   - Helper: `mpColor(mp)`, `mpIcon(mp)`

3. `SiswaWorkspace.tsx` — Main client component:
   - State: `activeScreen` ('beranda'|'jadwal'|'modul'|'nilai'|'tugas'|'kehadiran'|'capaian')
   - State: `activeModulId` (for modul detail), `profileOpen` (for CV slide-in)
   - State: `modalContent` (for generic modal), `badgeCelebration` (for badge overlay)
   - State: `theme` ('dark'|'light') with localStorage 'diis-theme'
   - Bottom nav 7 items (fixed, mobile-only, with active indicator)
   - Topbar (sticky, with brand, theme toggle, bell, settings)
   - Screen routing via conditional render
   - Toast system
   - Swipe gesture → profile CV

4. `page.tsx` — MODIFIED: tambah role-branch
   - Import `SiswaWorkspace`
   - After `getEffectiveRoles`: if `roles.includes('SISWA') && !roles.includes('GURU')` → fetch siswa-specific data + render `<SiswaWorkspace />`
   - Keep existing GURU branch intact

**Gate:** `npx tsc --noEmit` 0 error → `next build` sukses

#### Batch B — Beranda

**Tujuan:** Screen Beranda lengkap dengan semua section dari mockup lines 609-409.

**Sections (urutan mockup):**
1. Greeting (nama, kelas, sekolah, streak badge)
2. Daily Quest mini ring (circular progress + quest count)
3. 4 stat cards grid (Kehadiran %, Rata² Nilai, Tugas Pending, Badge Earned) — each clickable to respective screen
4. Continue Learning modcard (active modul with progress bar)
5. Jadwal Hari Ini timeline (today's schedule with JP slots, active highlight, done/upcoming badges)
6. Tugas Mendesak (3 pending tasks sorted by deadline)
7. Nilai Terbaru (4 recent grades with bar + score)
8. Progress Capaian badge preview (6 badges grid)

**Data:**
- Real: `/schedules?day=today` for today's schedule, `/grades?studentId=self` for recent grades
- Simulasi: Daily Quest, streak, stat cards (kehadiran/XP/badge), continue learning, badge preview

**Interactions:**
- Stat card click → go to respective screen
- Continue learning click → go to modul detail
- Schedule item click → LessonSessionModal (if active) or ClassDetailModal
- Task click → TaskDetailModal
- Grade click → go to nilai screen
- Badge click → go to capaian screen

#### Batch C — Jadwal + Modals

**Tujuan:** Screen Jadwal (mockup lines 411-422) + lesson session modal + class detail modal.

**Sections:**
1. Day tabs (Sen-Sab) with "Aktif"/"Libur" badge
2. Timeline per hari (JP slots with mapel color, guru, ruang, status dot: done/now/next)
3. Kalender Akademik (list of upcoming events with date chip)

**Modals:**
- `LessonSessionModal` — when clicking active JP slot:
  - Mapel info (icon, guru, ruang, JP time)
  - Rangkaian Pembelajaran (list of moduls for that mapel)
  - "Buka Modul Aktif" button → navigate to modul detail
- `ClassDetailModal` — when clicking non-active JP slot:
  - Mapel, guru, ruang, sesi info

**Data:**
- Real: `/schedules` (student's own schedule, filter by day)
- Simulasi: Kalender Akademik events

#### Batch D — Modul + Detail + Badge Celebration

**Tujuan:** Screen Modul (mockup lines 424-439, 736-762, 764-828) + modul detail + badge celebration overlay.

**Screen Modul (list):**
- Grouped by mapel (header with color gradient, icon, count)
- Module rows: 4-state (done/active/locked/todo) with status icon, title, TP, alokasi, progress bar, badge tag
- Click → open modul detail (locked → toast)

**Screen Modul Detail:**
- Header card (banner with mapel color, title, TP, alokasi, status, KKTP, progress)
- Learning Path (vertical stepper):
  1. Asesmen Diagnostik (5 soal PG)
  2. Materi (video + modul PDF)
  3. Tugas Praktikum
  4. Asesmen Sumatif (20 soal, passing grade KKTP)
  5. Skill Badge
- 4 tabs: Diagnostik | Materi | Tugas | Asesmen
  - Diagnostik: PG questions with selectable options
  - Materi: video card + modul PDF card
  - Tugas: praktikum task card with status
  - Asesmen: start button → triggers badge celebration

**Badge Celebration overlay:**
- Confetti animation (CSS-based, 20 spans with random color/position/delay)
- Badge image (circular, with ring)
- Title, name, description, score
- "Lihat Badge" button → go to capaian

**Data:** All SIMULASI (LMS backend belum ada) — SIMULASI badge jujur

#### Batch E — Nilai

**Tujuan:** Screen Nilai (mockup lines 441-456, 951-1011) + reuse W0 GradeDetailModal + RaporModal.

**Sections:**
1. Summary card (4 statpills: Rata², Tuntas, Remedial, Tertinggi)
2. Filter tabs (Semua / Tuntas / Remedial) + Rapor button
3. Grade list per mapel:
   - Icon (mapel color), mapel name, component scores mini text (UH · Praktik · UTS · UAS)
   - Progress bar (green if tuntas, amber if remedial)
   - Score (large, colored) + trend icon
   - Click → GradeDetailModal

**GradeDetailModal:**
- Ring (90px, colored by tuntas/remedial)
- Component breakdown (UH, Praktik, UTS, UAS, CP%)
- Status field (tuntas/remedial with KKTP info)
- Remedial warning note if not tuntas

**RaporModal:**
- Reuse `RaporModal` from `components/academic/shared/`
- Table: Mapel | UH | Prak | UTS | UAS | NA | Predikat
- Summary: Rata², Tuntas/Total, Ranking
- NA formula info (bobot: UH 20% · Praktik 25% · Sikap 15% · UTS 20% · UAS 20%)
- Download PDF button (toast simulasi)

**Data:**
- Real: `/grades?studentId=self` → aggregate with `aggregateStudentGrades()` → `naOf()` for NA
- Simulasi: trend, CP%, ranking

#### Batch F — Tugas

**Tujuan:** Screen Tugas (mockup lines 458-469, 1004-1088) + task detail modal with submit flow.

**Sections:**
1. Filter tabs with count badges (Belum Dikerjakan / Dikumpulkan / Dinilai)
2. Task cards per filter:
   - Pending: icon, title, mapel, deadline (urgent if ≤1 day), type tag
   - Submitted: icon, title, mapel, "Menunggu penilaian guru", "Dikumpulkan" tag
   - Graded: icon, title, mapel, score (tuntas/remedial colored), type tag
3. Click → TaskDetailModal

**TaskDetailModal:**
- Title, mapel, guru
- Statpills: Jenis, Deadline, Nilai (if graded)
- Status note (urgent/submitted/graded)
- Description
- If pending: "Kumpulkan Tugas" button → submit flow

**Submit flow:**
- Instruction from guru
- Accepted formats info
- Upload zone (click to simulate upload)
- Uploaded file list (with remove button)
- Notes textarea (optional)
- "Kumpulkan" button → confirm → update status to 'submitted' → toast

**Data:** All SIMULASI (tugas backend belum ada)

#### Batch G — Kehadiran

**Tujuan:** Screen Kehadiran (mockup lines 471-496, 1090-1118) + day detail modal + reuse CalendarHeatmap.

**Sections:**
1. Big attendance ring (100px, percentage)
2. Stats row (4 statpills: Hadir, Izin, Sakit, Alpha)
3. Calendar heatmap:
   - Month/year header
   - Sunday-first grid (7 cols: M S S R K J S)
   - Cells: hadir/izin/sakit/alpha/empty/future with color coding
   - Today highlight (outline, not box-shadow — W0 convention)
   - Click day → DayDetailModal
4. Legend (4 status colors)

**DayDetailModal:**
- Date, status label
- Status note (hadir = 8 JP tercatat, alpha = WA notifikasi)
- Status field (colored)

**Data:**
- Real: `/attendance?studentId=self` for monthly attendance
- Use `generateCalendar()` from lib/academic.ts to build calendar structure
- Map attendance records to `statusByDay` → feed to CalendarHeatmap or custom render

**Reuse:** `CalendarHeatmap` from `components/academic/shared/` (if API matches) or custom render following W0 convention (CSS `repeat(7,minmax(0,1fr))` + today `outline`)

#### Batch H — Capaian + Profile CV

**Tujuan:** Screen Capaian (mockup lines 498-520, 1120-1161) + badge detail modal + profile CV slide-in.

**Screen Capaian:**
1. XP card (level, name, XP bar, current XP → next level)
2. Leaderboard per jurusan (6 entries, me highlighted, rank medal colors)
3. CP Progress per mapel (4 CP cards with TP breakdown, progress bar, done/active status)
4. Skill Badges grid (9 badges: earned with score, in-progress with %)
5. Click badge → BadgeDetailModal

**BadgeDetailModal:**
- Badge icon (large, colored)
- Name, status (earned/in-progress)
- Description
- Score (if earned) or progress bar (if in-progress)

**Profile CV (slide-in from right):**
- Triggered by: swipe left gesture, or swipe hint button on right edge
- Header (gradient bg, avatar, name, role, tags)
- CV stat grid (3 stats: Rata², Total XP, Badge)
- Skill Kompetensi (5 skills with icon, level, progress bar)
- Badge & Sertifikasi (earned badges grid)
- Pengalaman & Sertifikasi (timeline: PKL, workshop, sertifikasi, lomba, bootcamp)
- Progress Pembelajaran (4 CP progress bars)
- "Unduh CV PDF" button (toast simulasi)
- Close: swipe right or back button

**Data:** All SIMULASI (XP/leaderboard/badge/CV backend belum ada)

#### Batch I — Pengumuman + Polish + Parity Check

**Tujuan:** Pengumuman modal, theme integration, toast system, final parity audit.

**PengumumanModal:**
- Triggered by: bell icon in topbar
- List of announcements (icon, title, from, time, body, tag)
- Tag colors (Penting=red, Mapel=green, Info=amber, Tugas=blue, Badge=violet)
- Count: total + penting count

**Theme integration:**
- `ThemeToggle` from W0 shared (or custom inline in topbar)
- localStorage 'diis-theme' (dark default)
- CSS variables for dark/light (match mockup tokens)
- Apply theme to `<html data-theme="dark|light">`

**Toast system:**
- Create toast div on demand, auto-remove after 3s
- Bottom-center, emerald accent

**Parity audit:**
- Walk through mockup screen by screen
- Verify every `id="s-*"` section is implemented
- Verify every `render*()` function has corresponding component
- Verify every `open*()` modal has corresponding modal
- Verify every interaction (onclick) has corresponding handler
- Verify mobile-first layout (560px max-width)
- Verify bottom nav 7 items
- Verify dark/light theme toggle
- Verify SIMULASI badges ("Simulasi" label where appropriate)

### 1.7 Data Flow Summary

```
page.tsx (server)
├── getServerSession + getEffectiveRoles
├── if SISWA:
│   ├── apiFetch /grades?studentId=self
│   ├── apiFetch /attendance?studentId=self
│   ├── apiFetch /schedules?day=today
│   ├── apiFetch /announcements?limit=5
│   └── <SiswaWorkspace
│         grades={grades}
│         attendance={attendance}
│         schedule={schedule}
│         announcements={announcements}
│       />
└── if GURU: (existing — JANGAN SENTUH)

SiswaWorkspace (client)
├── Props: real data from server
├── Import: SIMULASI constants from siswa-data.ts
├── State: activeScreen, modals, theme
├── Render: 7 screens + overlays + modals
└── Children screens receive:
    ├── Real data (grades, attendance, schedule, announcements)
    └── SIMULASI data (from siswa-data.ts imports)
```

### 1.8 Quality Gates

| Gate | Command | Criteria |
|------|---------|----------|
| Type check | `npx tsc --noEmit` | 0 error |
| Build | `next build` | Sukses |
| Lint | `npx eslint apps/web/src/app/dashboard/akademik/_components/siswa/` | 0 error |
| Parity | Manual walk-through mockup vs implementation | Setiap screen, modal, interaction terimplementasi |
| Mobile | DevTools 390px viewport | Bottom nav visible, no overflow, modals scrollable |
| Theme | Toggle dark/light | All elements readable, tokens switch correctly |
| No regress | Login as GURU → /dashboard/akademik | Guru workspace masih berfungsi |

### 1.9 Git Workflow

```bash
# Dari origin/main terbaru
git fetch origin
git checkout -b feat/2P-akademik-siswa origin/main

# Implementasi batch A-I
# Setiap batch: tsc + build → commit

# Sebelum PR:
npx tsc --noEmit
next build
# Code review (persona code-reviewer + security-reviewer)

# PR:
gh pr create --base main --head feat/2P-akademik-siswa \
  --title "feat(2P): W2 Dashboard Siswa — 7 tab mobile-first" \
  --body "..."
```

### 1.10 Estimasi

| Batch | Estimasi | Complexity |
|-------|----------|------------|
| A: Shell + Route + Data | 1 sesi | Medium — foundation, banyak constants |
| B: Beranda | 1 sesi | High — 8 section, banyak data source |
| C: Jadwal + Modals | 0.5 sesi | Medium — reuse W0 pattern |
| D: Modul + Detail + Celebration | 1.5 sesi | High — 4 tab, learning path, confetti |
| E: Nilai | 0.5 sesi | Low — reuse W0 GradeDetailModal + RaporModal |
| F: Tugas | 0.5 sesi | Medium — submit flow with upload |
| G: Kehadiran | 0.5 sesi | Low — reuse CalendarHeatmap |
| H: Capaian + Profile CV | 1 sesi | High — XP, leaderboard, CP, badge, CV slide-in |
| I: Pengumuman + Polish | 0.5 sesi | Low — polish + parity audit |
| **Total** | **~6.5 sesi** | |

---

## BAGIAN 2: PROMPT PEMBUKA SESI W2 SISWA

> **Cara pakai:** Paste utuh bagian ini ke awal sesi AI baru untuk implementasi W2.

---

### PROMPT PEMBUKA — W2 DASHBOARD SISWA DIIS

Kamu adalah **Senior Full-Stack Engineer** di tim DIIS (Digital Integrated Information System — Smart AI School, SMK Darussalam Subah). Stack: Next.js 15 + React 19 + Tailwind (frontend), NestJS 11 + Fastify + Prisma + PostgreSQL + Keycloak (backend), monorepo Turborepo.

**Misi tunggal sesi ini:** Implementasikan W2 Dashboard Siswa — migrasi mockup `akademik-siswa.html` (1273 baris) menjadi komponen production-ready di route `/dashboard/akademik` (role SISWA), mobile-first 560px, bottom nav 7 tab, dark/light theme.

**Status produksi saat ini:**
- W0 (fondasi shared) ✅ Production — `lib/academic.ts` + `lib/bell-times.ts` + `components/academic/shared/`
- W1 (Guru dashboard) ✅ Production — PR #213 merged, main @ `4760c12`
- **W2 (Siswa) = sesi ini** — branch `feat/2P-akademik-siswa` dari `origin/main`

---

#### TIGA LARANGAN MUTLAK

**Larangan #1 — JANGAN REDUKSI FITUR**
Setiap screen, setiap fungsi, setiap modal, setiap elemen UI yang ada di mockup WAJIB diimplementasikan. Backend belum ada → SIMULASI bertanda (badge "Simulasi" / data dummy berlabel), BUKAN dihapus. Mockup punya 7 tab bottom-nav → production HARUS 7 tab. Mockup punya badge celebration → implementasi. Mockup punya profile CV slide-in → implementasi.

**Larangan #2 — JANGAN LOOP ERROR**
Jika fix gagal 2x dengan pendekatan yang sama, STOP. Baca ulang mockup + kode yang ada. Kalau 2 pendekatan berbeda masih buntu → tanya saya dengan: (a) error message, (b) 2 pendekatan yang dicoba, (c) root cause hipotesis.

**Larangan #3 — JANGAN LANGGAR STANDAR**
- JANGAN buat konstanta baru (KKTP, NA_W, JP, dll.) — sudah ada di `lib/academic.ts` / `lib/bell-times.ts`. Import dari sana.
- JANGAN buat fungsi `naOf`, `generateCalendar`, `gradeStatus`, `predikat`, `fmtRupiah` versi sendiri — sudah ada & teruji.
- JANGAN duplikat komponen W0 — reuse `CalendarHeatmap`, `GradeRow`, `GradeDetailModal`, `RaporModal`, `ScoreBar`, `ThemeToggle` dari `components/academic/shared/`.
- JANGAN ubah Prisma schema / migration tanpa persetujuan.
- JANGAN push ke `main` atau `staging` (branch protected).
- JANGAN sentuh kode W1 Guru (`AkademikWorkspace.tsx` dan teman-temannya). Tambah role-branch di `page.tsx`, jangan modifikasi workspace guru.

---

#### FILE REFERENSI WAJIB BACA (urutan baca)

Sebelum ngoding, baca file-file ini utuh (bukan skim):

| # | File | Kenapa wajib |
|---|------|--------------|
| 1 | `apps/web/src/lib/academic.ts` (262 baris) | W0: KKTP_DEFAULT=75, NA_WEIGHTS, naOf(), gradeStatus(), predikat(), aggregateStudentGrades(), generateCalendar(), fmtRupiahExact(), daysUntil(), fmtDateShort(). Import dari sini. |
| 2 | `apps/web/src/lib/bell-times.ts` (112 baris) | W0: JP_SLOTS (8 slot), BELL_SEGMENTS, currentJp(), jpStartLabel(), wibNow(), fmtMin(). Jangan hardcode jam. |
| 3 | `apps/web/src/components/academic/shared/index.ts` | W0 barrel: CalendarHeatmap, GradeRow, GradeDetailModal, RaporModal, ScoreBar, ThemeToggle, ATTENDANCE_LABELS, grade-meta. |
| 4 | `.tasks/akademik-mockup/akademik-siswa.html` (1273 baris) | Mockup sumber UTAMA. Baca utuh — setiap `id="s-*"`, setiap `render*()`, setiap `open*()`. |
| 5 | `apps/web/src/app/dashboard/akademik/page.tsx` (104 baris) | Route guru saat ini. Pola: getServerSession, getEffectiveRoles, apiFetch paralel. TAMBAHKAN role-branch SISWA, jangan hapus GURU. |
| 6 | `apps/web/src/app/dashboard/akademik/_components/AkademikWorkspace.tsx` (230 baris) | Pattern workspace guru. Pelajari struktur: context bar, sub-nav, screen routing. JANGAN modifikasi. |
| 7 | `.tasks/W2-SISWA-PLAN-AND-PROMPT.md` (file ini) | Plan lengkap batch A-I. Ikuti urutan batch. |
| 8 | `.tasks/akademik-mockup/ROLLOUT-PLAN-BERTAHAP.md` (169 baris) | Prinsip data jujur, pola deploy, gate kualitas. |
| 9 | `apps/web/src/lib/api.ts` | apiFetch() helper, tipe GradeItem, AttendanceItem. Pola fetch server-side. |

**Setelah baca, sebelum ngoding, beri saya ringkasan 1 paragraf:** "Saya sudah baca X file. Yang sudah ada: ... Yang belum ada: ... Yang akan saya kerjakan di sesi ini: ... Ada Y screen dengan Z fitur total."

---

#### MOCKUP STRUCTURE (apa yang HARUS ada di production)

**7 Bottom Nav Tabs:**
1. **Beranda** — Greeting + streak, Daily Quest ring, 4 stat cards (kehadiran/rata²/tugas/badge), Continue Learning modcard, Jadwal hari ini (timeline), Tugas mendesak (3), Nilai terbaru (4), Badge preview (6)
2. **Jadwal** — Day tabs (Sen-Sab), Timeline per hari (JP slots, done/now/next), Kalender Akademik events
3. **Modul** — Grouped per mapel, 4-state module rows (done/active/locked/todo), Modul Detail: header + learning path (5 step) + 4 tabs (diagnostik/materi/tugas/asesmen), Badge Celebration overlay
4. **Nilai** — Summary (4 statpills), Filter tabs (all/tuntas/remedial) + Rapor button, Grade list (icon, component scores, bar, score, trend), Grade detail modal (ring + breakdown), Rapor modal (table + predikat + download)
5. **Tugas** — Filter tabs (pending/submitted/graded) with count, Task cards, Task detail modal, Submit flow (upload zone + file list + notes + confirm)
6. **Kehadiran** — Big ring (92.8%), Stats row (4 pills), Calendar heatmap (Sunday-first, 6 hari sekolah), Day detail modal, Legend
7. **Capaian** — XP card (level + bar), Leaderboard (6 entries, me highlighted), CP progress (4 CP with TP breakdown), Skill badges grid (9 badges), Badge detail modal

**Overlays:**
- **Profile CV** — slide-in from right (swipe gesture): header (gradient + avatar), stat grid (3), skills (5 with bar), badges (earned), timeline (5: PKL/workshop/sertifikasi/lomba/bootcamp), CP progress (4), download CV button
- **Badge Celebration** — confetti + badge info + score + actions
- **Pengumuman** — modal: list of announcements with tags
- **Lesson Session** — modal: mapel info + modul list + "Buka Modul Aktif"
- **Class Detail** — modal: mapel + guru + ruang + sesi
- **Task Detail** — modal: info + status + submit flow
- **Day Detail** — modal: date + status + note
- **Badge Detail** — modal: badge icon + name + desc + progress/score
- **Grade Detail** — modal: ring + component breakdown + status
- **Rapor** — modal: table + summary + download

**Theme:** Dark/Light toggle, localStorage 'diis-theme', emerald primary (#10b981), CSS variables for both themes.

**Layout:** Mobile-first max-width 560px, sticky topbar, fixed bottom nav (7 items), content area with padding.

---

#### DATA SOURCES

**Data NYATA (endpoint sudah ada):**
- `/grades?studentId=self` → nilai siswa → aggregate dengan `aggregateStudentGrades()` + `naOf()`
- `/attendance?studentId=self` → kehadiran → map ke `generateCalendar()` statusByDay
- `/schedules` (student's own) → jadwal per hari → timeline dengan `JP_SLOTS` + `currentJp()`
- `/announcements?limit=5` → pengumuman

**Data SIMULASI (backend belum ada — beri tanda jujur):**
- Daily Quest, XP, streak, level
- Modul/LMS (list, detail, diagnostik, materi, tugas, asesmen)
- Tugas (list, detail, submit flow)
- Badge, leaderboard, CP granular, Profile CV
- Kalender Akademik events

Untuk data SIMULASI, buat constants di `siswa-data.ts` dengan prefix `SIM_` dan beri komentar `// SIMULASI — backend menyusul`. Tampilkan badge "Simulasi" di UI untuk fitur yang belum terhubung backend.

---

#### ROUTING STRATEGY

Modifikasi `apps/web/src/app/dashboard/akademik/page.tsx`:

```typescript
// Setelah getEffectiveRoles:
if (roles.includes('SISWA') && !roles.includes('GURU') && !roles.includes('KEPALA_SEKOLAH')) {
  // Fetch siswa-specific data
  const [grades, attendance, schedule, announcements] = await Promise.all([
    apiFetch(`/grades?studentId=${session.user.id}`, token),
    apiFetch(`/attendance?studentId=${session.user.id}`, token),
    apiFetch('/schedules?day=today', token),
    apiFetch('/announcements?limit=5', token),
  ]);
  return <SiswaWorkspace grades={grades} attendance={attendance} schedule={schedule} announcements={announcements} />;
}
// Existing GURU branch — JANGAN SENTUH
```

---

#### BATCH URUTAN (ikuti ini)

**Batch A** — Shell + Route + Data Foundation → `SiswaWorkspace.tsx`, `siswa-types.ts`, `siswa-data.ts`, modifikasi `page.tsx`
**Batch B** — Beranda → `BerandaSiswa.tsx`
**Batch C** — Jadwal + Modals → `JadwalSiswa.tsx`, `LessonSessionModal.tsx`, `ClassDetailModal.tsx`
**Batch D** — Modul + Detail + Celebration → `ModulSiswa.tsx`, `ModulDetailSiswa.tsx`, `BadgeCelebration.tsx`
**Batch E** — Nilai → `NilaiSiswa.tsx` (reuse W0 GradeDetailModal + RaporModal)
**Batch F** — Tugas → `TugasSiswa.tsx`, `TaskDetailModal.tsx`
**Batch G** — Kehadiran → `KehadiranSiswa.tsx`, `DayDetailModal.tsx` (reuse W0 CalendarHeatmap)
**Batch H** — Capaian + Profile CV → `CapaianSiswa.tsx`, `BadgeDetailModal.tsx`, `ProfileCV.tsx`
**Batch I** — Pengumuman + Polish + Parity → `PengumumanModal.tsx`, theme, toast, final audit

Setiap batch: `npx tsc --noEmit` 0 error → `next build` sukses → commit.

---

#### GATE KUALITAS (sebelum PR)

1. `npx tsc --noEmit` — 0 error
2. `next build` — sukses
3. Login as GURU → `/dashboard/akademik` — guru workspace masih berfungsi (no regression)
4. Login as SISWA → `/dashboard/akademik` — siswa workspace tampil
5. Mobile 390px viewport — bottom nav visible, no overflow
6. Theme toggle — dark/light switch correct
7. Walk-through mockup vs implementation — setiap screen, modal, interaction

---

#### KEY CONVENTIONS (dari W1 yang sudah production)

- **CSS:** Tailwind classes, CSS variables untuk theme tokens (dark/light)
- **Icons:** `lucide-react` (sama dengan mockup `data-lucide`)
- **State:** React useState/useMemo (client component), no global store
- **Server data:** `apiFetch()` dengan token dari `getServerSession`
- **Simulasi data:** Constants dengan prefix `SIM_`, badge "Simulasi" di UI
- **Kalender:** `generateCalendar(year, monthIndex0, { todayDay, statusByDay })` dari `lib/academic.ts`
- **JP slots:** `JP_SLOTS` + `currentJp()` dari `lib/bell-times.ts`
- **Nilai Akhir:** `naOf(components)` + `gradeStatus(na)` + `predikat(na)` dari `lib/academic.ts`
- **Format:** `fmtDateShort(iso)`, `fmtRupiahExact(n)`, `daysUntil(iso)` dari `lib/academic.ts`

---

Mulai dari **Batch A**. Baca 9 file referensi di atas utuh, beri ringkasan pemahaman, lalu eksekusi.
