# PROMPT INTEGRASI MOCKUP-TO-PRODUCTION
## Dashboard Akademik DIIS — Smart AI School

> **Tujuan:** Mengubah 4 file mockup HTML menjadi komponen production-ready yang terintegrasi dengan backend NestJS + Next.js frontend DIIS, dengan sinkronisasi data real-time antar dashboard.

---

## 1. KONTEKS & ARSITEKTUR

### 1.1 File Mockup Sumber
| File | Role | Layout | Theme |
|------|------|--------|-------|
| `akademik-siswa.html` | Siswa | Mobile-first (560px), bottom nav 7 tab | Dark/Light (emerald primary, `--em:#10b981`) |
| `akademik-ortu.html` | Orang Tua | Mobile-first (560px), bottom nav 5 tab | Dark/Light (blue primary, `--pri:#3b82f6`) |
| `akademik-guru-utuh.html` | Guru | Hybrid: desktop sidebar + mobile bottom nav | Light-only (emerald tokens, `--em600:#059669`) |
| `akademik-ks.html` | KS/Waka Kurikulum | Desktop-first (240px sidebar + content) | Light-only (emerald tokens) |

### 1.2 Stack Target Production
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** NestJS + Prisma ORM + PostgreSQL
- **Auth:** Keycloak (RBAC: `SISWA`, `ORANG_TUA`, `GURU`, `KEPALA_SEKOLAH`)
- **Realtime:** WebSocket (Socket.io) untuk notifikasi & live monitoring
- **Notification:** WhatsApp Business API (untuk absensi siswa saja)

---

## 2. DAFTAR FITUR LENGKAP PER DASHBOARD

### 2.1 Dashboard Siswa (`akademik-siswa.html`)

#### Screen: Beranda
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Greeting dinamis | Sapaan berdasarkan waktu + nama siswa | `user.name`, `now.getHours()` |
| Daily Quest card | Ring progress harian (XP, streak, badge) | `dailyQuest`, `streak` |
| Stat grid (4 kartu) | Rata-rata nilai, ranking, hadir%, tugas pending | `NILAI`, `LEADERBOARD`, `KEH_STATS`, `TUGAS` |
| Jadwal hari ini | Timeline dengan highlight slot aktif | `SCHED[todayDow]`, `JP` |
| Tugas mendesak | 3 tugas terdekat deadline | `TUGAS.filter(pending/late)` |
| Nilai terbaru | 3 mapel terakhir dengan trend | `NILAI.slice(0,3)` |
| Pengumuman | 2 pengumuman terbaru | `PENGUMUMAN` |

#### Screen: Jadwal
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Day tabs (Sen-Sab) | Tab hari dengan badge jumlah JP | `SCHED`, `DOW` |
| Timeline per hari | Slot JP dengan warna mapel | `SCHED[day]`, `JP`, `JPN` |
| Lesson session popup | Modal detail sesi (mapel, guru, ruang) | `SCHED[day][idx]` |
| Active slot highlight | Auto-detect JP aktif berdasarkan jam | `now` vs `JP[slot][1]` |

#### Screen: Modul (LMS)
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Grouping per mapel | Modul dikelompokkan per mapel | `MODULS` grouped by `mapel` |
| Modul card 4-state | Selesai/Aktif/Terkunci dengan progress bar | `MODULS[i].status`, `.prog` |
| Learning path | Timeline vertikal TP per modul | `MODULS[i].tp` |
| Diagnostik quiz | Pre-test sebelum buka materi | `PG_BANK` filtered by `tp` |
| Badge celebration | Overlay konfetti saat badge diraih | `BADGES` |
| Modul detail modal | Deskripsi, materi, asesmen, KKTP | `MODULS[i]` |

#### Screen: Nilai
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Stat grid | Rata-rata, ranking, tuntas/total | `NILAI`, `LEADERBOARD` |
| KKTP info bar | Nilai KKTP + bobot komponen | `KKTP=75`, `NA_W` |
| Grade row per mapel | NA + 5-bar mini chart (UH/Praktik/Sikap/UTS/UAS) | `STUDENT_GRADES[mp]` |
| Grade detail modal | Breakdown nilai + bar per komponen | `NILAI[mp].raw` |
| Rapor modal | Tabel rapor + predikat + catatan wali | `NILAI`, `KKTP` |

#### Screen: Tugas
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Filter tabs | Pending / Submitted / Graded / Late | `TUGAS.filter(status)` |
| Task card | Judul, mapel, deadline, status badge | `TUGAS[i]` |
| Submit flow | Upload file simulasi + konfirmasi | `TUGAS[i].status='submitted'` |
| Feedback guru | Tampilkan feedback untuk tugas graded | `TUGAS[i].feedback` |

#### Screen: Kehadiran
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Stat pills | Hadir/Izin/Sakit/Alpha bulan ini | `KEH_STATS` |
| Calendar heatmap | Grid 7-kolom, Sunday-first, 6-day week | `ATT_CAL` (generated) |
| Day detail modal | Detail per sesi JP | `JPN`, `JP` |
| Legend | Warna status kehadiran | static |
| Calendar CSS | `grid-template-columns:repeat(7,minmax(0,1fr))` — wajib `minmax(0,1fr)` | — |

#### Screen: Capaian
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| XP card | Level, XP bar, progress ke level berikutnya | `xp=3450` |
| Leaderboard | Ranking per jurusan (TJKT) | `LEADERBOARD` |
| Badge grid | 9 badge earned/locked dengan progress | `BADGES` |
| CP progress | Progress per CP dengan TP breakdown | `CPDATA` |
| Profile CV (swipe) | Timeline pembelajaran, skill bar, badge | `BADGES`, `CPDATA` |

### 2.2 Dashboard Orang Tua (`akademik-ortu.html`)

#### Screen: Beranda
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Student card | Nama, kelas, avg, hadir%, ranking | `CHILDREN[0]`, `NILAI`, `LEADERBOARD` |
| Kehadiran snapshot | Ring progress + status hari ini | `KEH_STATS` |
| WA notification | Notifikasi WA terakhir (absensi) | `WA_HISTORY[0]` |
| Jadwal hari ini | Timeline jadwal anak | `SCHED[todayDow]` |
| Ringkasan Pembayaran | Total unpaid + next due + link detail | `PEMBAYARAN.filter(unpaid)` |
| Nilai terbaru | 3 mapel dengan trend | `NILAI.slice(0,3)` |
| Pengumuman | 2 pengumuman terbaru | `PENGUMUMAN` |

#### Screen: Kehadiran
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Ring progress 90px | Persentase kehadiran bulan ini | `KEH_STATS.pct` |
| Stat grid 2x2 | Hadir/Izin/Sakit/Alpha | `KEH_STATS` |
| Calendar heatmap | Same as siswa (minmax(0,1fr) fix) | `ATT_CAL` |
| 3-month trend | Bar chart tren kehadiran | `ATT_TREND` |
| WA history | Riwayat notifikasi WA absensi | `WA_HISTORY` |
| Day detail modal | Detail per sesi + status | `JPN`, `JP` |

#### Screen: Nilai
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Stat grid | Rata-rata, ranking, tuntas/total | `NILAI`, `LEADERBOARD` |
| KKTP info | Nilai KKTP + bobot | `KKTP=75`, `NA_W` |
| Grade row | NA + 5-bar mini chart + trend | `NILAI[mp]` |
| Grade detail modal | Breakdown + individual UH scores | `NILAI[mp].raw` |
| Rapor modal | Tabel rapor + predikat + catatan wali | `NILAI` |

#### Screen: Pembayaran
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Filter tabs | Semua / Belum Bayar (count) / Lunas (count) | `PEMBAYARAN.filter(status)` |
| Pay item list | Jenis, amount (Rupiah), status badge, due date | `PEMBAYARAN[i]` |
| Pay detail modal | Amount banner, detail, "Bayar Sekarang" + "Upload Bukti" | `PEMBAYARAN[i]` |
| Nav badge | Jumlah unpaid di bottom nav | `PEMBAYARAN.filter(unpaid).length` |
| fmtRupiah() | Format: `Rp350.000` | `n.toLocaleString('id-ID')` |

#### Screen: Capaian
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| XP card | Level, XP, progress bar | `xp=3450` |
| Leaderboard | Ranking kelas TJKT | `LEADERBOARD` |
| Badge grid | 8 badge earned/locked | `BADGES` |
| CP progress | Progress per CP dengan TP chips | `CPDATA` |
| Learning timeline | Timeline pencapaian | static timeline array |
| Teacher contact modal | Daftar guru + WA/Telepon link | `TEACHERS` |

### 2.3 Dashboard Guru (`akademik-guru-utuh.html`)

#### Screen: Ringkasan (Beranda)
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| KPI grid (4 kartu) | Ketuntasan, rata-rata, CP progress, hadir | `STUD_BASE`, `NA_W`, `KKTP` |
| Today's schedule | Class cards dengan live pill | `SCHED[todayDow]` |
| Tindakan tindak lanjut | Remedial list + siswa belum tuntas | `STUD_BASE.filter(NA<KKTP)` |
| Quick actions | Absen, Penilaian, Input Nilai, Jurnal | navigasi ke modal/screen |
| Rekap hari ini | Tabel rekap kelas hari ini | `SCHED[todayDow]` |
| Grade book preview | Tabel siswa + NA + status tuntas | `STUD_BASE[kelas\|mapel]` |

#### Screen: Jadwal
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Week schedule grid | Matrix hari x JP dengan mapel | `SCHED` |
| Filter strip | TA, Semester, Kelas, Mapel | `OPTIONS`, `F` |

#### Screen: Pembelajaran
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Modul ajar list | Status (Disetujui/Menunggu/Draft), LMS toggle | `MODULS` |
| Modul kelas progress | Progress per kelas untuk modul | `MODUL_KELAS_PROG[id]` |
| RPP/Modul Ajar form | Form lengkap (TP, CP, materi, asesmen) | `s-rpp-form` |
| LMS editor | Editor konten modul LMS | `s-lms-editor` |

#### Screen: Penilaian
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Penilaian modal | Input nilai per siswa (UH/Praktik/Sikap/UTS/UAS) | `STUD_BASE` |
| Monitor LMS | Real-time siswa status pengerjaan | `STUD` + mock stats |
| AI Soal generator | Generate soal PG/Essay/Praktik | `openAISoal(type)` |
| Student detail | Modal detail nilai + trend siswa | `STUD[ri]` |

#### Screen: Kehadiran
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Absen modal | Input absen per siswa per sesi | `openAbsen(kelas,mapel)` |
| Rekap absen | Tabel rekap kehadiran kelas | `STUD_BASE` |

#### Screen: Penugasan
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Tugas list | Status (aktif/selesai), kumpul/dinilai/total | `TUGAS` |
| Pengumpulan detail | List siswa + status kumpul + file + nilai | `PENGUMPULAN` |

#### Screen: Capaian & Rapor
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| CP progress per mapel | Bar chart progress CP | `MAPELPROG` |
| Rapor preview | Tabel rapor per kelas | `STUD_BASE` |

#### Screen: Rekap Audit
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Rekap table | TA/Sem/Kelas/Mapel/Rata/Tuntas/Hadir/CP/Pert/Rencana/Jurnal | `REKAP` |

#### Screen: LMS Preview
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Preview siswa | Simulasi tampilan LMS dari sisi siswa | embedded view |

### 2.4 Dashboard KS/Waka Kurikulum (`akademik-ks.html`)

#### Screen: Beranda
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| KPI summary | Total guru, total rombel, modul pending, sumatif pending | `GURU.length`, `ROMBEL.length`, `MODUL.filter(Menunggu)` |
| Health gauge | Skor kesehatan akademik + breakdown per area | computed from `MON_DATA` |
| Papan KBM | Grid live monitoring kelas (JP, mapel, guru, ruang) | `SCHED_FULL`, `GURU` |
| Quick stats | Modul, sumatif, monitoring, rekap | counts |

#### Screen: Modul Ajar
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Modul approval list | Status (Menunggu/Disetujui/Ditolak), guru, mapel, TP | `MODUL` |
| Modul detail modal | CP, materi, asesmen, JP, progress | `MODUL[i]` |
| Approve/Reject action | Tombol approval modul ajar | `MODUL[i].status` |

#### Screen: Audit Sumatif
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Sumatif list | Status audit (Menunggu/Selesai), guru, jenis, soal | `SUMATIF` |
| Sumatif detail | Deskripsi, KKM, soal count | `SUMATIF[i]` |

#### Screen: Monitoring KBM
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Monitor table | Guru, mapel, kelas, CP%, pertemuan, hadir%, rata, status | `MON_DATA` |
| Monitor detail modal | Detail per guru/mapel | `openMonDetail(guruId,mapel,kelas)` |
| Status indicator | on/warn/off dengan color coding | `MON_DATA[i].status` |

#### Screen: Rekap Audit
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Rekap table | Per kelas/mapel: rata, tuntas, hadir, CP, pert, rencana, jurnal | `REKAP` (shared with guru) |
| Filter | TA, guru, mapel | `OPTIONS`, `F` |

#### Screen: KKTP
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| KKTP settings | Input/edit KKTP per mapel | `KKTP=75` (editable) |
| NA bobot display | Bobot UH/Praktik/Sikap/UTS/UAS | `NA_W=[.20,.25,.15,.20,.20]` |

#### Screen: Jadwal & Tugas
| Fitur | Fungsi | Data Source |
|-------|--------|-------------|
| Auto-schedule | Constraint-based greedy scheduling | `SCHED_CONFIG`, `SCHED_FULL` |
| Teacher load | JP per guru, mapel assigned | `GURU_MAPEL`, `renderTload()` |
| Schedule grid | Matrix hari x JP untuk semua rombel | `SCHED_FULL` |
| Conflict detection | Highlight konflik jadwal | `SCHED_CONFLICTS` |

---

## 3. REKOMENDASI VISUALISASI DATA PER ROLE

### 3.1 Siswa
| Visualisasi | Tipe | Tujuan |
|-------------|------|--------|
| Daily Quest Ring | SVG circular progress | Motivasi harian (XP, streak) |
| Calendar Heatmap | Grid 7-kolom warna status | Pola kehadiran bulanan |
| Grade Mini-Bar | 5-bar horizontal (UH/PK/SK/UTS/UAS) | Komposisi nilai per mapel |
| Leaderboard Table | Ranked rows dengan medal | Gamifikasi kompetisi |
| Badge Grid | 3-column emoji card | Achievement collection |
| Learning Path | Vertical timeline dengan status | Progress TP per CP |
| XP Progress Bar | Horizontal bar dengan level | Gamifikasi leveling |

### 3.2 Orang Tua
| Visualisasi | Tipe | Tujuan |
|-------------|------|--------|
| Attendance Ring | SVG circular 90px | Snapshot kehadiran |
| Payment Summary | Card dengan amount + due date | Awareness tagihan |
| Payment List | Item dengan status badge + Rupiah | Tracking pembayaran |
| 3-Month Trend Bar | Horizontal bar chart | Tren kehadiran |
| WA History Timeline | List dengan icon + badge | Audit notifikasi absensi |
| Grade Row with Trend | Bar + trend arrow | Monitoring nilai |
| Calendar Heatmap | Same as siswa | Pola kehadiran anak |

### 3.3 Guru
| Visualisasi | Tipe | Tujuan |
|-------------|------|--------|
| KPI Grid | 2x2 card dengan delta | Quick metric glance |
| Class Card | Horizontal card dengan live pill | Status kelas aktif |
| Grade Book Table | Tabel siswa x NA dengan color coding | Bulk grading view |
| Monitor Table | Real-time status pengerjaan LMS | Live monitoring |
| CP Progress Bar | Horizontal bar per mapel | Coverage kurikulum |
| Modul Status Badge | Status pill (Disetujui/Menunggu/Draft) | Tracking approval |
| Session Float | Floating action button untuk sesi aktif | Quick action |

### 3.4 KS/Waka Kurikulum
| Visualisasi | Tipe | Tujuan |
|-------------|------|--------|
| Health Gauge | Large number + breakdown bars | Skor kesehatan akademik |
| Papan KBM Grid | Auto-fill card grid | Live monitoring semua kelas |
| Monitor Heat Table | Tabel dengan color-coded status | Identifikasi masalah |
| Teacher Load Bar | Horizontal bar per guru | Distribusi beban kerja |
| Schedule Matrix | Grid hari x JP | Validasi jadwal |
| Approval Queue | List dengan status badge | Workflow approval |
| Rekap Table | Sortable table dengan filter | Audit data akademik |

---

## 4. HUBUNGAN DATA & SINKRONISASI ANTAR DASHBOARD

### 4.1 Shared Data Constants (WAJIB SAMA)
```
KKTP = 75                          // Kriteria Ketuntasan
NA_W = [0.20, 0.25, 0.15, 0.20, 0.20]  // Bobot: UH, Praktik, Sikap, UTS, UAS
JP = [["JP 1","07.30–08.10"], ...]     // Slot Jam Pelajaran
JPN = [[1,0],[2,1],[3,2],[4,4],[5,5],[6,6],[7,8],[8,9]]  // Mapping JP ke index
DOW = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
MON = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']
```

### 4.2 Data Flow Matrix
```
                    SISWA          ORTU           GURU           KS
STUDENT_GRADES      read (own)     read (child)   read (class)   read (all)
SCHED               read (own)     read (child)   read (own)     read (all)
TUGAS               read (own)     —              CRUD           read (audit)
KEH_STATS           read (own)     read (child)   input (class)  read (all)
NILAI               read (own)     read (child)   input (class)  read (audit)
MODULS              read (own)     —              CRUD           approve
PEMBAYARAN          —              read (child)   —              read (audit)
WA_HISTORY          —              read (child)   trigger        read (audit)
LEADERBOARD         read (own)     read (child)   read (class)   read (all)
BADGES              read (own)     read (child)   award          read (audit)
CPDATA              read (own)     read (child)   manage         approve
PENGUMUMAN          read           read           create         create/approve
```

### 4.3 Synchronization Rules
1. **Nilai Input → Realtime Push**: Guru input nilai → siswa & ortu dashboard update via WebSocket
2. **Absensi → WA Notification**: Guru input absen (alpha/izin/sakit) → trigger WA ke ortu → update WA_HISTORY di ortu dashboard
3. **Modul Approval**: Guru submit modul → KS dashboard muncul di approval queue → KS approve → siswa dashboard modul unlocks
4. **Tugas Submission**: Siswa submit tugas → guru dashboard muncul di pengumpulan → guru nilai → siswa & ortu dashboard update
5. **Pembayaran**: Ortu bayar → KS dashboard update rekap → ortu dashboard status lunas
6. **Leaderboard**: Nilai berubah → recompute ranking → siswa & ortu dashboard update

### 4.4 Calendar Synchronization
- **Sunday-first grid**: Headers `M S S R K J S` (Minggu→Sabtu)
- **6-day school week**: Senin–Sabtu aktif, Minggu libur
- **Offset formula**: `const offset = firstDow;` (bukan `firstDow===0?6:firstDow-1`)
- **Empty day**: `if(dow===0){cal.push({day:d,status:'empty'});continue;}`
- **Grid CSS**: `grid-template-columns:repeat(7,minmax(0,1fr))` — WAJIB `minmax(0,1fr)` bukan `1fr`
- **Today highlight**: `outline:2px solid var(--pri);outline-offset:-3px` — WAJIB outline, BUKAN box-shadow

---

## 5. STANDAR KODE PRODUCTION

### 5.1 TypeScript Interfaces (Shared Package)
```typescript
// packages/types/src/academic.ts
export interface StudentGrade {
  mp: string;
  uh: number[];
  praktik: number[];
  sikap: number;
  uts: number;
  uas: number;
}

export interface NilaiAkhir {
  mp: string;
  na: number;  // computed via naOf()
  raw: StudentGrade;
  trend: 'up' | 'down';
}

export interface Pembayaran {
  id: number;
  jenis: string;
  amount: number;
  due: string;      // ISO date
  status: 'unpaid' | 'paid';
  paidDate?: string;
  desc: string;
}

export interface Kehadiran {
  day: number;
  status: 'hadir' | 'izin' | 'sakit' | 'alpha' | 'empty' | 'future';
}

export interface Tugas {
  id: number;
  mp: string;
  judul: string;
  guru: string;
  deadline: string;  // ISO date
  status: 'pending' | 'submitted' | 'graded' | 'late';
  desc: string;
  feedback: string | null;
}
```

### 5.2 Helper Functions (Shared Utils)
```typescript
// Bobot NA: UH 20%, Praktik 25%, Sikap 15%, UTS 20%, UAS 20%
export const NA_W = [0.20, 0.25, 0.15, 0.20, 0.20];
export const KKTP = 75;

export function naOf(s: StudentGrade): number {
  const uh = avg(s.uh);
  const pk = avg(s.praktik);
  return Math.round(uh*NA_W[0] + pk*NA_W[1] + s.sikap*NA_W[2] + s.uts*NA_W[3] + s.uas*NA_W[4]);
}

export function cls(v: number): 'ok' | 'warn' | 'bad' {
  return v >= KKTP ? 'ok' : v >= KKTP - 8 ? 'warn' : 'bad';
}

export function fmtRupiah(n: number): string {
  return 'Rp' + n.toLocaleString('id-ID');
}

export function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
```

### 5.3 Component Architecture (Next.js)
```
apps/web/src/components/academic/
├── shared/
│   ├── CalendarHeatmap.tsx      # Reusable attendance calendar
│   ├── GradeRow.tsx             # Reusable grade row with mini-bar
│   ├── GradeDetailModal.tsx     # Reusable grade breakdown modal
│   ├── RaporModal.tsx           # Reusable rapor table modal
│   ├── LeaderboardTable.tsx     # Reusable leaderboard
│   ├── BadgeGrid.tsx            # Reusable badge collection
│   ├── CPProgress.tsx           # Reusable CP progress with TP chips
│   ├── ThemeToggle.tsx          # Reusable theme toggle with localStorage
│   └── PaymentItem.tsx          # Reusable payment list item
├── siswa/
│   ├── DailyQuest.tsx
│   ├── LessonSessionModal.tsx
│   ├── ModulLearningPath.tsx
│   ├── QuizEngine.tsx
│   ├── BadgeCelebration.tsx
│   └── ProfileCV.tsx
├── ortu/
│   ├── ChildSelector.tsx
│   ├── WAHistoryList.tsx
│   ├── PaymentSummary.tsx
│   ├── PaymentDetailModal.tsx
│   └── TeacherContactModal.tsx
├── guru/
│   ├── KPICard.tsx
│   ├── ClassCard.tsx
│   ├── GradeBookTable.tsx
│   ├── AbsenModal.tsx
│   ├── PenilaianModal.tsx
│   ├── RPPForm.tsx
│   ├── LMSEditor.tsx
│   ├── AISoalGenerator.tsx
│   ├── MonitorTable.tsx
│   └── SessionFloat.tsx
└── ks/
    ├── HealthGauge.tsx
    ├── PapanKBM.tsx
    ├── ModulApprovalQueue.tsx
    ├── SumatifAuditList.tsx
    ├── MonitorHeatTable.tsx
    ├── KKTPSettings.tsx
    ├── AutoScheduler.tsx
    └── TeacherLoadBar.tsx
```

### 5.4 API Endpoints (NestJS)
```
# Shared
GET  /api/academic/schedule/:dayOfWeek
GET  /api/academic/announcements
GET  /api/academic/kktp

# Siswa & Ortu
GET  /api/academic/grades/:studentId
GET  /api/academic/attendance/:studentId/:month
GET  /api/academic/leaderboard/:jurusan
GET  /api/academic/badges/:studentId
GET  /api/academic/cp-progress/:studentId
GET  /api/academic/modules/:studentId
GET  /api/academic/tasks/:studentId
GET  /api/finance/payments/:studentId

# Guru
GET  /api/academic/students/:classId/:mapel
POST /api/academic/grades/input
POST /api/academic/attendance/input
POST /api/academic/attendance/trigger-wa
POST /api/academic/tasks/create
GET  /api/academic/tasks/:taskId/submissions
POST /api/academic/modules/create
PUT  /api/academic/modules/:id
POST /api/academic/ai/generate-soal

# KS
GET  /api/academic/audit/modules
PUT  /api/academic/audit/modules/:id/approve
GET  /api/academic/audit/sumatif
GET  /api/academic/monitor/kbm
GET  /api/academic/audit/rekap
PUT  /api/academic/settings/kktp
POST /api/academic/schedule/auto-generate
GET  /api/academic/schedule/teacher-load
```

---

## 6. ERROR HANDLING & VALIDASI

### 6.1 Frontend Error Boundaries
- Setiap screen dibungkus `<ErrorBoundary>` dengan fallback UI yang menampilkan pesan error + tombol retry
- Skeleton loading saat fetch data (shimmer placeholder)
- Empty state untuk data kosong (gambar + pesan "Belum ada data")
- Network error toast: "Koneksi terputus. Data mungkin tidak terbaru."

### 6.2 Data Validation
```typescript
// Validasi nilai input (Guru)
function validateGradeInput(value: number, field: string): ValidationResult {
  if (isNaN(value)) return { valid: false, msg: `${field} harus berupa angka` };
  if (value < 0 || value > 100) return { valid: false, msg: `${field} harus 0-100` };
  return { valid: true };
}

// Validasi absensi (Guru)
const VALID_ATTENDANCE = ['hadir', 'izin', 'sakit', 'alpha'];
function validateAttendance(status: string): boolean {
  return VALID_ATTENDANCE.includes(status);
}

// Validasi pembayaran (Ortu)
function validatePaymentAmount(amount: number, expected: number): boolean {
  return amount === expected; // VA amount must match exactly
}

// Validasi deadline tugas (Siswa)
function validateTaskDeadline(deadline: string, now: Date): boolean {
  return new Date(deadline) > now; // Cannot submit after deadline
}
```

### 6.3 WA Notification Validation
- **TRIGGER**: HANYA untuk absensi (alpha/izin/sakit per sesi) — bukan untuk nilai, tugas, atau pembayaran
- **RATE LIMIT**: Max 1 WA per siswa per sesi (hindari spam)
- **TIME WINDOW**: Hanya kirim WA pada jam 07.00–20.00 WIB
- **DEDUP**: Cek `WA_HISTORY` dalam 2 jam terakhir untuk siswa yang sama
- **FALLBACK**: Jika WA gagal, log ke database + retry 3x dengan backoff

### 6.4 Production Error Scenarios
| Skenario | Handling |
|----------|----------|
| Siswa tidak punya jadwal hari ini | Tampilkan "Libur — tidak ada jadwal" |
| Nilai belum diinput guru | Tampilkan "—" bukan 0 |
| Pembayaran belum tercatat | Tampilkan "Belum ada tagihan" |
| Kehadiran bulan depan | Tampilkan calendar dengan status 'future' (opacity 0.4) |
| Leaderboard kosong | Tampilkan "Belum ada data ranking" |
| Modul belum di-approve KS | Tampilkan status 'Terkunci' di siswa |
| WA gagal terkirim | Log error + tampilkan badge "Gagal" di WA_HISTORY |
| Network timeout | Retry 3x + toast "Koneksi lambat" |
| Session expired | Redirect ke login Keycloak |

---

## 7. TEMA & RESPONSIVE DESIGN

### 7.1 Theme System
```css
/* Siswa & Ortu: Dual theme (dark/light) dengan localStorage */
:root[data-theme="dark"] { --bg:#0a0f1a; --text:#e8eef5; ... }
:root[data-theme="light"] { --bg:#f4f6fb; --text:#0f1e35; ... }

/* Guru & KS: Light-only (production context: classroom/office) */
:root { --bg:#f4f7f5; --ink:#0f2e25; ... }

/* localStorage keys */
Siswa: 'diis-theme'
Ortu:  'diis-ortu-theme'
```

### 7.2 Color Role Differentiation
| Role | Primary Color | Dark Theme | Light Theme |
|------|--------------|------------|-------------|
| Siswa | Emerald | `#10b981` | `#059669` |
| Ortu | Blue | `#3b82f6` | `#2563eb` |
| Guru | Emerald | — | `#059669` (light only) |
| KS | Emerald | — | `#059669` (light only) |

### 7.3 Responsive Breakpoints
```css
/* Mobile-first (Siswa & Ortu) */
.app { max-width: 560px; margin: 0 auto; }
.bottomnav { max-width: 560px; }

/* Desktop (Guru & KS) */
/* Guru: Hybrid — sidebar 220px on desktop, bottom nav on mobile */
@media (min-width: 1024px) {
  .sidebar { display: flex; width: 220px; }
  .bottomnav { display: none; }
}
@media (max-width: 1023px) {
  .sidebar { display: none; }
  .bottomnav { display: flex; }
}

/* KS: Desktop-first — sidebar 240px always */
.app { display: grid; grid-template-columns: 240px 1fr; }
@media (max-width: 768px) {
  .app { grid-template-columns: 1fr; }
  .side { display: none; }
}
```

### 7.4 Calendar CSS (CRITICAL — Fixes Overflow)
```css
/* WAJIB: minmax(0,1fr) bukan 1fr untuk mencegah overflow */
.cal-wrap { padding-bottom: 4px; overflow: hidden; }
.cal {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));  /* CRITICAL FIX */
  gap: 3px;
  width: 100%;
}
.cal .cal-cell { aspect-ratio: 1; border-radius: 5px; }
.cal .cal-cell.today {
  outline: 2px solid var(--pri);   /* CRITICAL: outline, NOT box-shadow */
  outline-offset: -3px;            /* Draws INSIDE cell, zero overflow */
}
```

### 7.5 Accessibility (WCAG 2.1 AA)
- Color contrast ratio ≥ 4.5:1 untuk text normal
- Color contrast ratio ≥ 3:1 untuk large text dan UI components
- Status indicators TIDAK boleh mengandalkan warna saja (tambahkan icon/text)
- Semua interactive elements harus accessible via keyboard
- Modal harus trap focus dan restore focus on close
- `aria-label` untuk icon-only buttons
- `role="dialog"` dan `aria-modal="true"` untuk modal/bottom sheet

---

## 8. CHECKLIST PRODUCTION READINESS

### 8.1 Data Integration
- [ ] Ganti semua hardcoded data dengan API calls
- [ ] Implementasi SWR/React Query untuk caching & revalidation
- [ ] WebSocket untuk realtime updates (nilai, absensi, notifikasi)
- [ ] Optimistic updates untuk input nilai & absensi
- [ ] Offline-first dengan PWA cache untuk siswa & ortu

### 8.2 Security
- [ ] Role-based access control (RBAC) via Keycloak
- [ ] API endpoint authorization guards
- [ ] Input sanitization (XSS prevention)
- [ ] Rate limiting untuk AI soal generator & WA API
- [ ] Audit log untuk semua perubahan data akademik

### 8.3 Performance
- [ ] Code splitting per dashboard (lazy load)
- [ ] Image optimization untuk badge emoji/icons
- [ ] Debounce untuk filter & search inputs
- [ ] Virtual scrolling untuk tabel siswa besar (>100 siswa)
- [ ] CSS containment untuk calendar grid

### 8.4 Testing
- [ ] Unit test: `naOf()`, `cls()`, `fmtRupiah()`, `daysUntil()`, `generateCal()`
- [ ] Integration test: API endpoints per role
- [ ] E2E test: Siswa submit tugas → Guru nilai → Siswa lihat feedback
- [ ] E2E test: Guru input absen → WA terkirim → Ortu lihat notifikasi
- [ ] E2E test: Guru submit modul → KS approve → Siswa lihat modul unlock
- [ ] Visual regression test: calendar overflow, theme switching

### 8.5 Deployment
- [ ] Environment variables untuk API URL, WA API key, Keycloak config
- [ ] Docker multi-stage build per dashboard
- [ ] CI/CD pipeline: lint → test → build → deploy
- [ ] Health check endpoint
- [ ] Sentry/error tracking integration
