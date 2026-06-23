// SIMULASI constants untuk Dashboard Orang Tua (TUGAS C)
// Semua data di file ini bertanda SIMULASI — backend menyusul
// Import dari lib/academic.ts untuk konstanta resmi (KKTP, NA_WEIGHTS, naOf, dll.)
// Import dari lib/bell-times.ts untuk JP_SLOTS (sumber tunggal jam pelajaran)

import { KKTP_DEFAULT, naOf, generateCalendar } from '@/lib/academic';
import type { StudentGradeComponents, AttendanceCellStatus, CalendarCell } from '@/lib/academic';
import { JP_SLOTS, fmtMin } from '@/lib/bell-times';
import type {
  OrtuChild, OrtuNilai, OrtuNilaiRaw, OrtuBadge, OrtuCP,
  OrtuLeaderboardEntry, OrtuPengumuman, OrtuWAHistory, OrtuTeacher,
  OrtuKehadiranStats, OrtuAttTrend, OrtuXP, OrtuTimelineItem,
} from './ortu-types';
import type { Pembayaran, Tugas } from '@/lib/academic';

// ── Mapel Colors & helpers ──────────────────────────────────────────────────

export const MAPEL_COLORS: Record<string, string> = {
  'Pemrograman Web': '#10b981',
  'Basis Data': '#0ea5e9',
  'Matematika': '#a78bfa',
  'B.Inggris': '#f59e0b',
  'B.Indonesia': '#ec4899',
  'Fisika': '#ef4444',
  'PJOK': '#14b8a6',
  'PKn': '#8b5cf6',
};

export function mpColor(mp: string): string {
  return MAPEL_COLORS[mp] || '#3b82f6';
}

/** Inisial dari nama (untuk avatar). */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('');
}

/** Label waktu untuk JP: "07:30–08:10" dari JP_SLOTS (sumber tunggal). */
export function jpTimeRange(jp: number): string {
  const slot = JP_SLOTS.find((s) => s.jp === jp);
  if (!slot) return '';
  return `${fmtMin(slot.startMin)}\u2013${fmtMin(slot.endMin)}`;
}

/** Label JP: "JP 1" */
export function jpLabel(jp: number): string {
  return `JP ${jp}`;
}

// ── Children (SIMULASI — 1 anak terdaftar) ──────────────────────────────────

export const SIM_CHILDREN: OrtuChild[] = [
  { id: 1, name: 'Rizky Pratama', kelas: 'XI TJKT 1', active: true, avg: 78, att: 92.8, wali: 'Budi Hartono, S.Kom' },
];

// ── Student Grades (SIMULASI) ───────────────────────────────────────────────
// Raw components with arrays for UH & Praktik (detail modal shows individual scores)
// NA computed via naOf() from lib/academic.ts — NOT a local duplicate

const STUDENT_GRADES_RAW: Record<string, OrtuNilaiRaw> = {
  'Pemrograman Web': { uh: [80, 85, 78], praktik: [88, 82, 85], sikap: 90, uts: 82, uas: 84 },
  'Basis Data': { uh: [75, 70, 72], praktik: [78, 75, 80], sikap: 85, uts: 70, uas: 75 },
  'Matematika': { uh: [70, 65, 68], praktik: [60, 65, 62], sikap: 80, uts: 65, uas: 68 },
  'B.Inggris': { uh: [85, 80, 82], praktik: [78, 82, 80], sikap: 88, uts: 80, uas: 82 },
  'B.Indonesia': { uh: [78, 80, 75], praktik: [82, 78, 80], sikap: 85, uts: 78, uas: 80 },
};

const TRENDS: Record<string, 'up' | 'down'> = {
  'Pemrograman Web': 'up',
  'Basis Data': 'down',
  'Matematika': 'down',
  'B.Inggris': 'up',
  'B.Indonesia': 'up',
};

/** Average an array of scores, rounded to integer. */
function avgArr(arr: number[]): number {
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export const SIM_NILAI: OrtuNilai[] = Object.keys(STUDENT_GRADES_RAW).map((mp) => {
  const raw = STUDENT_GRADES_RAW[mp]!;
  // Average UH & Praktik arrays → pass single values to naOf() (lib canonical)
  const components: StudentGradeComponents = {
    uh: avgArr(raw.uh),
    praktik: avgArr(raw.praktik),
    sikap: raw.sikap,
    uts: raw.uts,
    uas: raw.uas,
  };
  const na = naOf(components) ?? 0;
  return { mp, na, raw, trend: TRENDS[mp] ?? 'up' };
});

// ── Schedule (SIMULASI — by day-of-week, 1=Senin … 6=Sabtu) ────────────────

export interface SimScheduleSlot {
  jp: number;
  mapel: string;
  guru: string;
  room: string;
}

export const SIM_SCHEDULE: Record<number, SimScheduleSlot[]> = {
  1: [ // Senin
    { jp: 1, mapel: 'Pemrograman Web', guru: 'Budi Hartono, S.Kom', room: 'Lab 1' },
    { jp: 2, mapel: 'Pemrograman Web', guru: 'Budi Hartono, S.Kom', room: 'Lab 1' },
    { jp: 5, mapel: 'Basis Data', guru: 'Siti Aminah, S.Pd', room: 'Lab 2' },
    { jp: 6, mapel: 'Basis Data', guru: 'Siti Aminah, S.Pd', room: 'Lab 2' },
  ],
  2: [ // Selasa
    { jp: 2, mapel: 'Pemrograman Web', guru: 'Budi Hartono, S.Kom', room: 'Lab 1' },
    { jp: 3, mapel: 'Pemrograman Web', guru: 'Budi Hartono, S.Kom', room: 'Lab 1' },
    { jp: 9, mapel: 'Matematika', guru: 'Ahmad Rizal, M.Pd', room: 'Rg 305' },
  ],
  3: [ // Rabu
    { jp: 1, mapel: 'Basis Data', guru: 'Siti Aminah, S.Pd', room: 'Lab 2' },
    { jp: 2, mapel: 'Basis Data', guru: 'Siti Aminah, S.Pd', room: 'Lab 2' },
    { jp: 5, mapel: 'B.Inggris', guru: 'Dewi Sartika, S.Pd', room: 'Rg 201' },
  ],
  4: [ // Kamis
    { jp: 5, mapel: 'Matematika', guru: 'Ahmad Rizal, M.Pd', room: 'Rg 305' },
    { jp: 6, mapel: 'Matematika', guru: 'Ahmad Rizal, M.Pd', room: 'Rg 305' },
    { jp: 9, mapel: 'B.Indonesia', guru: 'Rini Pratiwi, S.Pd', room: 'Rg 201' },
  ],
  5: [ // Jumat
    { jp: 1, mapel: 'Pemrograman Web', guru: 'Budi Hartono, S.Kom', room: 'Lab 1' },
    { jp: 2, mapel: 'Pemrograman Web', guru: 'Budi Hartono, S.Kom', room: 'Lab 1' },
  ],
  6: [ // Sabtu
    { jp: 3, mapel: 'B.Inggris', guru: 'Dewi Sartika, S.Pd', room: 'Rg 201' },
    { jp: 4, mapel: 'B.Inggris', guru: 'Dewi Sartika, S.Pd', room: 'Rg 201' },
  ],
};

// ── Tugas (SIMULASI — read-only view for parents) ──────────────────────────

export const SIM_TUGAS: Tugas[] = [
  { id: '1', mp: 'Pemrograman Web', judul: 'Latihan Flexbox Responsif', guru: 'Budi Hartono, S.Kom', deadline: '2026-06-19', status: 'pending', desc: 'Buat halaman web responsif menggunakan flexbox. Minimal 3 breakpoint.', feedback: null },
  { id: '2', mp: 'Basis Data', judul: 'Normalisasi 3NF — Studi Kasus', guru: 'Siti Aminah, S.Pd', deadline: '2026-06-20', status: 'pending', desc: 'Normalisasi tabel dari 1NF hingga 3NF. Sertakan ERD.', feedback: null },
  { id: '3', mp: 'Matematika', judul: 'Soal Program Linear', guru: 'Ahmad Rizal, M.Pd', deadline: '2026-06-18', status: 'late', desc: 'Kerjakan soal 1-10 halaman 145 modul.', feedback: null },
  { id: '4', mp: 'B.Inggris', judul: 'Recount Text — Liburan', guru: 'Dewi Sartika, S.Pd', deadline: '2026-06-10', status: 'submitted', desc: 'Tulis recount text 300 kata tentang liburan.', feedback: 'Bagus! Struktur sudah tepat, perhatikan penggunaan past tense.' },
  { id: '5', mp: 'Pemrograman Web', judul: 'Form Validation dengan JS', guru: 'Budi Hartono, S.Kom', deadline: '2026-06-05', status: 'submitted', desc: 'Buat form dengan validasi email, password, dan nomor telepon.', feedback: 'Sangat baik! Validasi email perfect. Password strength perlu ditingkatkan.' },
  { id: '6', mp: 'Basis Data', judul: 'Query JOIN — Latihan', guru: 'Siti Aminah, S.Pd', deadline: '2026-05-28', status: 'submitted', desc: 'Kerjakan 15 soal query JOIN INNER, LEFT, RIGHT.', feedback: 'Lengkap dan benar. Teruskan!' },
];

// ── Pembayaran (SIMULASI) ───────────────────────────────────────────────────

export const SIM_PEMBAYARAN: Pembayaran[] = [
  { id: '1', jenis: 'SPP Juni', amount: 350000, due: '2026-06-25', status: 'unpaid', desc: 'SPP bulan Juni 2026' },
  { id: '2', jenis: 'SPP Mei', amount: 350000, due: '2026-05-25', status: 'paid', paidDate: '20 Mei 2026', desc: 'SPP bulan Mei 2026' },
  { id: '3', jenis: 'Uang Praktik', amount: 200000, due: '2026-06-15', status: 'unpaid', desc: 'Biaya praktik semester genap' },
  { id: '4', jenis: 'Seragam', amount: 300000, due: '2026-04-10', status: 'paid', paidDate: '5 Apr 2026', desc: 'Seragam batik + olahraga' },
  { id: '5', jenis: 'Modul', amount: 150000, due: '2026-06-30', status: 'unpaid', desc: 'Modul pembelajaran semester genap' },
  { id: '6', jenis: 'SPP April', amount: 350000, due: '2026-04-25', status: 'paid', paidDate: '20 Apr 2026', desc: 'SPP bulan April 2026' },
  { id: '7', jenis: 'Ujian LSP', amount: 500000, due: '2026-05-10', status: 'paid', paidDate: '5 Mei 2026', desc: 'Biaya uji kompetensi LSP BNSP' },
];

// ── Badges (SIMULASI — emoji-based) ─────────────────────────────────────────

export const SIM_BADGES: OrtuBadge[] = [
  { emoji: '\u{1F680}', name: 'First Steps', desc: 'Menyelesaikan modul pertama', earned: true },
  { emoji: '\u{1F525}', name: 'Streak Master', desc: '15 hari hadir berturut-turut', earned: true },
  { emoji: '\u{1F4BB}', name: 'Code Warrior', desc: 'Selesaikan 3 modul coding', earned: true },
  { emoji: '\u{1F4CA}', name: 'Data Wizard', desc: 'Lulus ujian Basis Data >80', earned: true },
  { emoji: '\u{1F4DD}', name: 'Task Hero', desc: 'Kumpulkan 10 tugas tepat waktu', earned: true },
  { emoji: '\u{1F31F}', name: 'Honor Student', desc: 'Rata-rata >85', earned: false },
  { emoji: '\u{1F3C6}', name: 'Champion', desc: 'Top 3 di kelas', earned: false },
  { emoji: '\u{1F3AF}', name: 'Perfect Attendance', desc: '1 bulan tanpa absen', earned: false },
];

// ── CP with TP breakdown (SIMULASI) ─────────────────────────────────────────

export const SIM_CPDATA: OrtuCP[] = [
  { cp: 'CP 1', desc: 'Pemrograman Web Dasar', progres: 85, tps: [
    { tp: 'TP 1.1', desc: 'HTML Semantik', done: true },
    { tp: 'TP 1.2', desc: 'CSS Layout', done: true },
    { tp: 'TP 2.1', desc: 'Flexbox', done: true },
    { tp: 'TP 2.2', desc: 'Form & Validasi', done: false },
  ]},
  { cp: 'CP 2', desc: 'Basis Data Relasional', progres: 60, tps: [
    { tp: 'TP 1.1', desc: 'Normalisasi', done: true },
    { tp: 'TP 1.2', desc: 'ERD & Relasi', done: true },
    { tp: 'TP 2.1', desc: 'Query Dasar', done: false },
    { tp: 'TP 2.2', desc: 'JOIN & Agregasi', done: false },
  ]},
  { cp: 'CP 3', desc: 'Matematika Terapan', progres: 45, tps: [
    { tp: 'TP 1.1', desc: 'SPL', done: true },
    { tp: 'TP 1.2', desc: 'Matriks', done: false },
    { tp: 'TP 2.1', desc: 'Program Linear', done: false },
  ]},
];

// ── Leaderboard (SIMULASI — per jurusan TJKT) ──────────────────────────────
// Field: `me` (bukan `isMe`) — sesuai §6.7 Field Name Safety

export const SIM_LEADERBOARD: OrtuLeaderboardEntry[] = [
  { name: 'Ahmad Fauzi', kelas: 'XI TJKT 2', xp: 4120, badges: 7, avg: 85.5 },
  { name: 'Siti Rahma', kelas: 'XI TJKT 1', xp: 3980, badges: 6, avg: 82.2 },
  { name: 'Rizky Pratama', kelas: 'XI TJKT 1', xp: 3450, badges: 5, avg: 78, me: true },
  { name: 'Dewi Anjani', kelas: 'XI TJKT 2', xp: 3200, badges: 5, avg: 76.8 },
  { name: 'Bagas Wicaksono', kelas: 'XI TJKT 1', xp: 2980, badges: 3, avg: 74.5 },
  { name: 'Nadia Putri', kelas: 'XI TJKT 2', xp: 2750, badges: 4, avg: 73.2 },
];

// ── Pengumuman (SIMULASI) ───────────────────────────────────────────────────

export const SIM_PENGUMUMAN: OrtuPengumuman[] = [
  { id: 1, title: 'Libur Hari Raya', date: '17 Jun 2026', tag: 'Libur', body: 'Diberitahukan bahwa sekolah libur tanggal 17-18 Juni 2026 dalam rangka Hari Raya. Masuk kembali 19 Juni.' },
  { id: 2, title: 'Pengumpulan SPP Juni', date: '15 Jun 2026', tag: 'Pembayaran', body: 'Pengumpulan SPP bulan Juni paling lambat 25 Juni 2026. Pembayaran via transfer atau tunai di TU.' },
  { id: 3, title: 'Ujian Tengah Semester', date: '10 Jun 2026', tag: 'Akademik', body: 'UTS akan dilaksanakan 23-27 Juni 2026. Jadwal lengkap dapat diunduh di portal siswa.' },
  { id: 4, title: 'Workshop UI/UX', date: '5 Jun 2026', tag: 'Ekstrakurikuler', body: 'Workshop UI/UX Design oleh IDN Boarding School. Pendaftaran dibuka hingga 12 Juni. Kuota 30 siswa.' },
  { id: 5, title: 'Rapat Orang Tua', date: '1 Jun 2026', tag: 'Penting', body: 'Rapat orang tua kelas XI akan diadakan Sabtu, 20 Juni 2026 pukul 09.00 di Aula. Mohon hadir.' },
];

// ── WA History (SIMULASI — absence notifications only: alpha/izin/sakit) ────

export const SIM_WA_HISTORY: OrtuWAHistory[] = [
  { date: '15 Jun 2026', session: 'JP 1-3', status: 'izin', sentTo: '0812-3456-7890', time: '07:35', note: 'Izin keperluan keluarga' },
  { date: '8 Jun 2026', session: 'JP 4-6', status: 'sakit', sentTo: '0812-3456-7890', time: '09:40', note: 'Sakit demam' },
  { date: '28 Mei 2026', session: 'Full day', status: 'alpha', sentTo: '0812-3456-7890', time: '13:00', note: 'Tanpa keterangan — tindak lanjut diminta' },
];

// ── Teacher contacts (SIMULASI) ─────────────────────────────────────────────

export const SIM_TEACHERS: OrtuTeacher[] = [
  { name: 'Budi Hartono, S.Kom', role: 'Wali Kelas', mapel: 'Pemrograman Web', phone: '0812-1111-2222', wa: '6281211112222' },
  { name: 'Siti Aminah, S.Pd', role: 'Guru Mapel', mapel: 'Basis Data', phone: '0813-3333-4444', wa: '6281333334444' },
  { name: 'Ahmad Rizal, M.Pd', role: 'Guru Mapel', mapel: 'Matematika', phone: '0814-5555-6666', wa: '6281455556666' },
  { name: 'Dewi Sartika, S.Pd', role: 'Guru Mapel', mapel: 'B.Inggris', phone: '0815-7777-8888', wa: '6281577778888' },
  { name: 'Rini Pratiwi, S.Pd', role: 'Guru Mapel', mapel: 'B.Indonesia', phone: '0816-9999-0000', wa: '6281699990000' },
];

// ── Kehadiran Stats (SIMULASI) ──────────────────────────────────────────────

export const SIM_KEH_STATS: OrtuKehadiranStats = {
  hadir: 156,
  izin: 5,
  sakit: 4,
  alpha: 2,
  total: 167,
  pct: 92.8,
};

// ── Attendance Trend 3-month (SIMULASI) ─────────────────────────────────────

export const SIM_ATT_TREND: OrtuAttTrend[] = [
  { month: 'Apr', pct: 90.5, hadir: 152 },
  { month: 'Mei', pct: 94.1, hadir: 158 },
  { month: 'Jun', pct: 92.8, hadir: 156 },
];

// ── XP / Level (SIMULASI) ───────────────────────────────────────────────────
// Field: `current` (bukan `total`) — sesuai §6.7 Field Name Safety

export const SIM_XP: OrtuXP = {
  level: 4,
  current: 3450,
  next: 4000,
};

// ── Learning Timeline (SIMULASI) ────────────────────────────────────────────

export const SIM_TIMELINE: OrtuTimelineItem[] = [
  { title: 'Modul Selesai: Flexbox & Responsif', date: '16 Jun 2026', desc: 'TP 2.1 Pemrograman Web — Progress 75%' },
  { title: 'Badge Diraih: Code Warrior', date: '14 Jun 2026', desc: 'Menyelesaikan 3 modul coding' },
  { title: 'Tugas Dinilai: Recount Text', date: '10 Jun 2026', desc: 'B.Inggris — Feedback: "Struktur sudah tepat"' },
  { title: 'Modul Selesai: Normalisasi 3NF', date: '5 Jun 2026', desc: 'TP 1.1 Basis Data — Badge: DB Wizard' },
  { title: 'Ujian LSP — Junior Web Developer', date: 'Mei 2026', desc: 'Lulus sertifikasi BNSP, skor 87/100' },
];

// ── Derived helpers ─────────────────────────────────────────────────────────

/** Rata-rata NA semua mapel (1 desimal). */
export function avgNa(nilai: OrtuNilai[]): number {
  if (nilai.length === 0) return 0;
  return Math.round((nilai.reduce((s, n) => s + n.na, 0) / nilai.length) * 10) / 10;
}

/** Ranking anak di leaderboard (1-based). */
export function childRank(leaderboard: OrtuLeaderboardEntry[]): number {
  return leaderboard.findIndex((s) => s.me) + 1;
}

/** Jumlah mapel tuntas (NA >= KKTP). */
export function tuntasCount(nilai: OrtuNilai[], kktp: number = KKTP_DEFAULT): number {
  return nilai.filter((n) => n.na >= kktp).length;
}

/** Status kelas nilai: ok/warn/bad untuk pewarnaan. */
export function gradeCls(v: number, kktp: number = KKTP_DEFAULT): 'ok' | 'warn' | 'bad' {
  if (v >= kktp) return 'ok';
  if (v >= 60) return 'warn';
  return 'bad';
}

// ── Attendance Calendar (SIMULASI) ─────────────────────────────────────────
// Uses generateCalendar() from lib/academic.ts (sumber tunggal) — NOT a local
// duplicate. Generates a realistic status pattern for the current month.

/** Generate SIM attendance calendar for current month using lib/academic.ts. */
export function simAttCalendar(todayDay: number): CalendarCell[] {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex0 = now.getMonth();

  // Build a realistic status map — most days 'hadir', few exceptions
  const statusByDay: Record<number, AttendanceCellStatus> = {};
  for (let d = 1; d <= todayDay; d++) {
    if (d % 13 === 0) statusByDay[d] = 'izin';
    else if (d % 17 === 0) statusByDay[d] = 'sakit';
    else if (d % 23 === 0) statusByDay[d] = 'alpha';
    else statusByDay[d] = 'hadir';
  }

  return generateCalendar(year, monthIndex0, { todayDay, statusByDay });
}

/** Status labels for day detail modal. */
export const ATT_STATUS_LABELS: Record<string, string> = {
  hadir: 'Hadir — semua sesi',
  izin: 'Izin — keperluan keluarga',
  sakit: 'Sakit — demam',
  alpha: 'Alpha — tanpa keterangan',
  empty: 'Libur',
  none: 'Belum ada catatan',
  future: 'Tanggal future — belum ada data',
};

/** Current month name in Indonesian (for calendar header). */
export function currentMonthYear(): { month: string; year: number } {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return { month: months[now.getMonth()]!, year: now.getFullYear() };
}
