// SIMULASI constants untuk Dashboard Siswa (W2)
// Semua data di file ini bertanda SIMULASI — backend menyusul
// Import dari lib/academic.ts untuk konstanta resmi (KKTP, NA_WEIGHTS, dll.)

import { KKTP_DEFAULT, NA_WEIGHTS, naOf } from '@/lib/academic';
import type {
  SiswaModul, SiswaBadge, SiswaTugas, SiswaNilai, SiswaCP,
  SiswaLeaderboardEntry, SiswaProfileCV, SiswaQuest,
  SiswaKalenderEvent, SiswaPengumuman, SiswaKehadiranStats, SiswaXP,
} from './siswa-types';

// ── Mapel Colors & Icons ─────────────────────────────────────────────────

export const MAPEL_COLORS = {
  'Pemrograman Web': '#10b981',
  'Basis Data': '#0ea5e9',
  'Matematika': '#a78bfa',
  'B.Indonesia': '#ec4899',
  'B.Inggris': '#f59e0b',
  'Fisika': '#ef4444',
  'PJOK': '#14b8a6',
  'PKn': '#8b5cf6',
};

export const MAPEL_ICONS: Record<string, string> = {
  'Pemrograman Web': 'code-2',
  'Basis Data': 'database',
  'Matematika': 'calculator',
  'B.Indonesia': 'book-open',
  'B.Inggris': 'languages',
  'Fisika': 'atom',
  'PJOK': 'dumbbell',
  'PKn': 'landmark',
};

export function mpColor(mp: string): string {
  return MAPEL_COLORS[mp as keyof typeof MAPEL_COLORS] || '#10b981';
}

export function mpIcon(mp: string): string {
  if (mp.includes('Pemrograman')) return 'code-2';
  if (mp.includes('Basis')) return 'database';
  if (mp.includes('Matematika')) return 'calculator';
  if (mp.includes('Indonesia')) return 'book-open';
  if (mp.includes('Inggris')) return 'languages';
  if (mp.includes('Fisika')) return 'atom';
  if (mp.includes('PJOK')) return 'dumbbell';
  if (mp.includes('PKn')) return 'landmark';
  return 'book';
}

// ── Student Grades (SIMULASI) ────────────────────────────────────────────

const STUDENT_GRADES: Record<string, [number, number, number, number, number]> = {
  'Pemrograman Web': [85, 88, 90, 82, 86],
  'Basis Data': [78, 82, 84, 74, 80],
  'Matematika': [70, 0, 75, 68, 72],
  'B.Indonesia': [88, 0, 85, 85, 86],
  'B.Inggris': [75, 0, 78, 72, 74],
  'Fisika': [65, 0, 70, 62, 68],
  'PJOK': [90, 92, 88, 88, 90],
  'PKn': [80, 0, 82, 78, 79],
};

const TRENDS = ['up', 'up', 'down', 'stable', 'up', 'down', 'stable', 'up'] as const;
const CPS = [72, 68, 58, 82, 65, 48, 85, 72];

export const SIM_NILAI: SiswaNilai[] = Object.keys(STUDENT_GRADES).map((mp, i) => {
  const sc = STUDENT_GRADES[mp]!;
  const components = { uh: sc[0], praktik: sc[1], sikap: sc[2], uts: sc[3], uas: sc[4] };
  // Filter out 0 values for NA calculation (treat as not yet graded)
  const filteredComponents = {
    uh: sc[0] || undefined,
    praktik: sc[1] || undefined,
    sikap: sc[2] || undefined,
    uts: sc[3] || undefined,
    uas: sc[4] || undefined,
  };
  const rata = naOf(filteredComponents) ?? 0;
  return {
    mp,
    scores: sc,
    rata,
    kktp: KKTP_DEFAULT,
    trend: TRENDS[i]!,
    cp: CPS[i]!,
  };
});

// ── Assignments / Tugas (SIMULASI) ───────────────────────────────────────

export const SIM_TUGAS: SiswaTugas[] = [
  { id: 1, mp: 'Pemrograman Web', title: 'Layout Flexbox — Web Profil Sekolah', type: 'Praktik', deadline: '20 Jun', dlDays: 1, status: 'pending', guru: 'Budi Hartono', desc: 'Buat halaman web profil sekolah menggunakan flexbox. Minimal 3 section responsif.' },
  { id: 2, mp: 'Basis Data', title: 'Normalisasi 3NF — Toko Online', type: 'Tugas', deadline: '21 Jun', dlDays: 2, status: 'pending', guru: 'Budi Hartono', desc: 'Rancang skema database 3NF untuk toko online. Dokumentasi dalam PDF.' },
  { id: 3, mp: 'Matematika', title: 'Latihan SPL — Substitusi & Eliminasi', type: 'Latihan', deadline: '22 Jun', dlDays: 3, status: 'pending', guru: 'Siti Aminah', desc: 'Kerjakan 10 soal sistem persamaan linear. Tunjukkan langkah penyelesaian.' },
  { id: 4, mp: 'B.Inggris', title: 'Recount Text — My Holiday Experience', type: 'Tugas', deadline: '23 Jun', dlDays: 4, status: 'pending', guru: 'Eko Prasetyo', desc: 'Tulis recount text 300 kata tentang pengalaman liburan. Gunakan past tense.' },
  { id: 5, mp: 'Fisika', title: 'Laporan Praktikum — Gerak Lurus', type: 'Praktik', deadline: '25 Jun', dlDays: 6, status: 'pending', guru: 'Hendra Gunawan', desc: 'Buat laporan praktikum gerak lurus beraturan (GLB) dan gerak lurus berubah beraturan (GLBB).' },
  { id: 6, mp: 'Pemrograman Web', title: 'Pre-test CSS Selector', type: 'Diagnostik', deadline: '18 Jun', dlDays: 0, status: 'submitted', guru: 'Budi Hartono', desc: 'Pre-test kemampuan CSS selector dasar.' },
  { id: 7, mp: 'B.Indonesia', title: 'Esai Eksposisi — Pentingnya Literasi Digital', type: 'Tugas', deadline: '15 Jun', dlDays: -3, status: 'graded', score: 88, guru: 'Dewi Lestari', desc: 'Esai eksposisi 500 kata tentang literasi digital di kalangan remaja.' },
  { id: 8, mp: 'Matematika', title: 'UH 2 — Sistem Persamaan Linear', type: 'Sumatif', deadline: '12 Jun', dlDays: -6, status: 'graded', score: 72, guru: 'Siti Aminah', desc: 'Ulangan Harian 2 — 10 soal SPL.' },
  { id: 9, mp: 'Basis Data', title: 'Latihan ERD — Perpustakaan', type: 'Latihan', deadline: '10 Jun', dlDays: -8, status: 'graded', score: 85, guru: 'Budi Hartono', desc: 'Entity Relationship Diagram untuk sistem perpustakaan.' },
  { id: 10, mp: 'PJOK', title: 'Praktik Voli — Servis Bawah', type: 'Praktik', deadline: '8 Jun', dlDays: -10, status: 'graded', score: 92, guru: 'Doni Kurniawan', desc: 'Praktik servis bawah bola voli.' },
  { id: 11, mp: 'B.Inggris', title: 'Vocabulary Quiz — Unit 3', type: 'Kuis', deadline: '5 Jun', dlDays: -13, status: 'graded', score: 78, guru: 'Eko Prasetyo', desc: 'Kuis kosakata unit 3 — 20 soal.' },
  { id: 12, mp: 'PKn', title: 'Makalah — Pancasila dalam Kehidupan', type: 'Tugas', deadline: '3 Jun', dlDays: -15, status: 'graded', score: 80, guru: 'Nur Hidayah', desc: 'Makalah penerapan Pancasila dalam kehidupan sehari-hari.' },
];

// ── Kehadiran Stats (SIMULASI) ───────────────────────────────────────────

export const SIM_KEH_STATS: SiswaKehadiranStats = {
  hadir: 156,
  izin: 5,
  sakit: 4,
  alpha: 2,
  total: 167,
  pct: 92.8,
};

// ── Badges (SIMULASI) ────────────────────────────────────────────────────

export const SIM_BADGES: SiswaBadge[] = [
  { name: 'HTML Starter', icon: 'code-2', color: '#10b981', earned: true, cat: 'CP1 · TP1', score: 88, prog: null, desc: 'Selesai modul Struktur HTML dengan nilai ≥85' },
  { name: 'CSS Stylist', icon: 'palette', color: '#0ea5e9', earned: true, cat: 'CP1 · TP2', score: 85, prog: null, desc: 'Selesai modul Styling CSS dengan nilai ≥80' },
  { name: 'Perfect Week', icon: 'flame', color: '#f59e0b', earned: true, cat: 'Kehadiran', score: null, prog: null, desc: 'Hadir 5 hari berturut-turut tanpa absen' },
  { name: 'Quick Submit', icon: 'zap', color: '#a78bfa', earned: true, cat: 'Tugas', score: null, prog: null, desc: 'Submit 10 tugas sebelum deadline' },
  { name: 'Flex Master', icon: 'layout', color: '#ec4899', earned: false, cat: 'CP2 · TP1', score: null, prog: 75, desc: 'Selesai modul Flexbox dengan nilai ≥80' },
  { name: 'Form Validator', icon: 'check-square', color: '#8b5cf6', earned: false, cat: 'CP2 · TP2', score: null, prog: 0, desc: 'Selesai modul Form & Validasi' },
  { name: 'Math Solver', icon: 'calculator', color: '#ef4444', earned: false, cat: 'Matematika', score: null, prog: 58, desc: 'Selesai 4 modul Matematika dengan rata-rata ≥75' },
  { name: 'English Star', icon: 'languages', color: '#14b8a6', earned: false, cat: 'B.Inggris', score: null, prog: 72, desc: 'Selesai 5 modul B.Inggris dengan rata-rata ≥80' },
  { name: 'Sport Champion', icon: 'dumbbell', color: '#f97316', earned: false, cat: 'PJOK', score: null, prog: 85, desc: 'Nilai PJOK ≥90 di 3 sumatif' },
];

// ── Modules (SIMULASI — LMS backend belum ada) ──────────────────────────

export const SIM_MODULS: SiswaModul[] = [
  { id: 1, tp: 'TP 1.1', judul: 'Struktur HTML Semantik', alokasi: '4 JP', kktp: 75, status: 'Selesai', lms: true, prog: 100, badge: 'HTML Starter', mapel: 'Pemrograman Web' },
  { id: 2, tp: 'TP 1.2', judul: 'Styling CSS & Layout', alokasi: '6 JP', kktp: 75, status: 'Selesai', lms: true, prog: 100, badge: 'CSS Stylist', mapel: 'Pemrograman Web' },
  { id: 3, tp: 'TP 2.1', judul: 'Flexbox & Responsif', alokasi: '6 JP', kktp: 78, status: 'Aktif', lms: true, prog: 75, badge: 'Flex Master', mapel: 'Pemrograman Web' },
  { id: 4, tp: 'TP 2.2', judul: 'Form & Validasi', alokasi: '4 JP', kktp: 75, status: 'Terkunci', lms: false, prog: 0, badge: null, mapel: 'Pemrograman Web' },
  { id: 5, tp: 'TP 1.1', judul: 'Normalisasi 3NF', alokasi: '4 JP', kktp: 75, status: 'Selesai', lms: true, prog: 100, badge: 'DB Normalizer', mapel: 'Basis Data' },
  { id: 6, tp: 'TP 1.2', judul: 'Relasi Tabel & ERD', alokasi: '6 JP', kktp: 75, status: 'Aktif', lms: true, prog: 60, badge: null, mapel: 'Basis Data' },
  { id: 7, tp: 'TP 1.1', judul: 'Sistem Persamaan Linear', alokasi: '4 JP', kktp: 75, status: 'Selesai', lms: true, prog: 100, badge: 'Math Solver', mapel: 'Matematika' },
  { id: 8, tp: 'TP 1.2', judul: 'Matriks & Determinan', alokasi: '6 JP', kktp: 75, status: 'Aktif', lms: true, prog: 40, badge: null, mapel: 'Matematika' },
  { id: 9, tp: 'TP 2.1', judul: 'Program Linear', alokasi: '4 JP', kktp: 75, status: 'Terkunci', lms: false, prog: 0, badge: null, mapel: 'Matematika' },
  { id: 10, tp: 'TP 1.1', judul: 'Recount Text', alokasi: '4 JP', kktp: 75, status: 'Selesai', lms: true, prog: 100, badge: 'English Star', mapel: 'B.Inggris' },
  { id: 11, tp: 'TP 1.2', judul: 'Narrative Text', alokasi: '4 JP', kktp: 75, status: 'Terkunci', lms: false, prog: 0, badge: null, mapel: 'B.Inggris' },
];

// ── CP with TP breakdown (SIMULASI) ──────────────────────────────────────

export const SIM_CPDATA: SiswaCP[] = [
  { cp: 'CP 1', desc: 'Antarmuka web fungsional', progres: 88, tps: [{ tp: 'TP 1.1', desc: 'Struktur HTML semantik', done: true, badge: 'HTML Starter' }, { tp: 'TP 1.2', desc: 'Styling CSS dasar', done: true, badge: 'CSS Stylist' }] },
  { cp: 'CP 2', desc: 'Layout responsif', progres: 74, tps: [{ tp: 'TP 2.1', desc: 'Flexbox & responsif', done: true, badge: 'Flex Master' }, { tp: 'TP 2.2', desc: 'Form & validasi', done: false, badge: null }] },
  { cp: 'CP 3', desc: 'Interaktivitas dasar', progres: 35, tps: [{ tp: 'TP 3.1', desc: 'JavaScript dasar', done: false, badge: null }] },
  { cp: 'CP 4', desc: 'Proyek web', progres: 0, tps: [{ tp: 'TP 4.1', desc: 'Proyek akhir', done: false, badge: null }] },
];

// ── Leaderboard (SIMULASI — per jurusan TJKT) ────────────────────────────

export const SIM_LEADERBOARD: SiswaLeaderboardEntry[] = [
  { name: 'Ahmad Fauzi', kelas: 'XI TJKT 2', xp: 4120, badges: 7, avg: 88.5 },
  { name: 'Siti Rahma', kelas: 'XI TJKT 1', xp: 3980, badges: 6, avg: 86.2 },
  { name: 'Rizky Pratama', kelas: 'XI TJKT 1', xp: 3450, badges: 4, avg: 82.1, me: true },
  { name: 'Dewi Anjani', kelas: 'XI TJKT 2', xp: 3200, badges: 5, avg: 80.8 },
  { name: 'Bagas Wicaksono', kelas: 'XI TJKT 1', xp: 2980, badges: 3, avg: 78.5 },
  { name: 'Nadia Putri', kelas: 'XI TJKT 2', xp: 2750, badges: 4, avg: 77.2 },
];

// ── Profile CV (SIMULASI) ───────────────────────────────────────────────

export const SIM_PROFILE_CV: SiswaProfileCV = {
  name: 'Rizky Pratama',
  role: 'Siswa XI TJKT 1 · SMK Darussalam Subah',
  tags: ['TJKT', 'Web Dev', 'Database', 'Networking'],
  stats: [{ n: '82.1', l: 'Rata² Nilai' }, { n: '3.4K', l: 'Total XP' }, { n: '4', l: 'Badge' }],
  skills: [
    { ic: 'code-2', color: '#10b981', name: 'HTML & CSS', level: 'Advanced', pct: 88 },
    { ic: 'database', color: '#0ea5e9', name: 'SQL & Normalisasi', level: 'Intermediate', pct: 72 },
    { ic: 'layout', color: '#a78bfa', name: 'Flexbox & Grid', level: 'Intermediate', pct: 75 },
    { ic: 'github', color: '#ec4899', name: 'Git & Version Control', level: 'Beginner', pct: 45 },
    { ic: 'network', color: '#f59e0b', name: 'Jaringan Komputer', level: 'Intermediate', pct: 68 },
  ],
  timeline: [
    { title: 'PKL — PT Teknologi Maju', date: 'Jan-Mar 2026', desc: 'Web developer intern. Membangun 3 halaman landing page company profile menggunakan HTML/CSS/JS. Mendapat rating "Sangat Baik".' },
    { title: 'Workshop UI/UX Design', date: 'Feb 2026', desc: 'Peserta workshop Figma & design thinking oleh IDN Boarding School. 3 hari intensif.' },
    { title: 'Uji Kompetensi LSP — Junior Web Developer', date: 'Mei 2026', desc: 'Lulus sertifikasi BNSP. Skor: 87/100. Kompetensi: HTML, CSS, JavaScript dasar.' },
    { title: 'Lomba Web Design — Festival Vokasi', date: 'Mar 2026', desc: 'Juara 2 tingkat kabupaten. Tema: "Website Sekolah Modern".' },
    { title: 'Bootcamp JavaScript', date: 'Apr 2026', desc: '5 sesi bootcamp JavaScript dasar oleh Dicoding x DIIS. Selesai dengan nilai 85.' },
  ],
};

// ── Daily Quest (SIMULASI) ──────────────────────────────────────────────

export const SIM_DAILY_QUEST: SiswaQuest = {
  title: 'Daily Quest',
  tasks: [
    { ic: 'book-open', label: 'Selesaikan 1 modul', done: true },
    { ic: 'clipboard-list', label: 'Kumpulkan 1 tugas', done: false },
    { ic: 'check-circle', label: 'Lihat pengumuman', done: true },
  ],
};

// ── Kalender Akademik (SIMULASI) ────────────────────────────────────────

export const SIM_KALENDER: SiswaKalenderEvent[] = [
  { d: 17, m: 'Jun', title: 'Libur Idul Adha', desc: 'Libur nasional', color: '#f59e0b' },
  { d: 20, m: 'Jun', title: 'Deadline Tugas Flexbox', desc: 'Pemrograman Web', color: '#ef4444' },
  { d: 23, m: 'Jun', title: 'Ujian Tengah Semester', desc: '23-27 Juni · 08:00-12:00', color: '#0ea5e9' },
  { d: 30, m: 'Jun', title: 'Pengembalian Rapor', desc: 'Penyerahan rapor semester genap', color: '#10b981' },
  { d: 1, m: 'Jul', title: 'Awal Semester Baru', desc: 'Pendaftaran ulang kelas XII', color: '#a78bfa' },
];

// ── Pengumuman (SIMULASI) ───────────────────────────────────────────────

export const SIM_PENGUMUMAN: SiswaPengumuman[] = [
  { ic: 'alert-circle', color: '#ef4444', title: 'Ujian Tengah Semester (UTS)', from: 'Kesiswaan', time: '2 jam lalu', body: 'UTS Semester Genap akan dilaksanakan 23-27 Juni 2026. Jadwal lengkap dapat diunduh di portal sekolah.', tag: 'Penting', tagColor: '#ef4444' },
  { ic: 'book-open', color: '#10b981', title: 'Modul Baru: Flexbox & Responsif', from: 'Budi Hartono, S.Kom · Pemrograman Web', time: '5 jam lalu', body: 'Modul TP 2.1 sudah tersedia. Kerjakan asesmen diagnostik sebelum membuka materi.', tag: 'Mapel', tagColor: '#10b981' },
  { ic: 'calendar-clock', color: '#f59e0b', title: 'Libur Hari Raya Idul Adha', from: 'Kesiswaan', time: '1 hari lalu', body: 'Libur Idul Adha 1447 H pada 17 Juni 2026. Pembelajaran dimulai kembali 18 Juni.', tag: 'Info', tagColor: '#f59e0b' },
  { ic: 'clipboard-list', color: '#0ea5e9', title: 'Deadline Tugas Praktikum', from: 'Budi Hartono, S.Kom', time: '1 hari lalu', body: 'Tugas Layout Flexbox — Web Profil Sekolah deadline 20 Juni. Upload di portal LMS.', tag: 'Tugas', tagColor: '#0ea5e9' },
  { ic: 'award', color: '#a78bfa', title: 'Badge Baru Tersedia: Flex Master', from: 'Sistem', time: '2 hari lalu', body: 'Selesaikan modul Flexbox & Responsif dengan nilai ≥80 untuk mendapatkan badge Flex Master!', tag: 'Badge', tagColor: '#a78bfa' },
];

// ── XP / Level (SIMULASI) ───────────────────────────────────────────────

export const SIM_XP: SiswaXP = {
  level: 12,
  current: 3450,
  next: 5000,
};
