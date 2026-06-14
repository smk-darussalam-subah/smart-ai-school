// =============================================================================
// kiosk.ts — Util Beranda Kiosk v3: tema soft harian, quote/hadist, kalender,
// dan DATA DUMMY sementara (agenda/kaldik, skor kondisi, tren rentang, rekap
// per-tanggal) sebelum data nyata. Semua dummy diberi tanda agar mudah diganti.
// =============================================================================

export interface KioskTheme { key: string; ac: string; ac2: string; soft: string; ring: string; ink: string }

// 7 tema SOFT (pastel) — indeks = hari (0=Minggu … 6=Sabtu). Harmonis, tak kontras.
const THEMES: KioskTheme[] = [
  { key: 'min', ac: '#4f46e5', ac2: '#a5b4fc', soft: '#eef2ff', ring: '#c7d2fe', ink: '#312e81' }, // Minggu — indigo
  { key: 'sen', ac: '#0d9488', ac2: '#5eead4', soft: '#f0fdfa', ring: '#99f6e4', ink: '#134e4a' }, // Senin — teal
  { key: 'sel', ac: '#0284c7', ac2: '#7dd3fc', soft: '#f0f9ff', ring: '#bae6fd', ink: '#075985' }, // Selasa — sky
  { key: 'rab', ac: '#7c3aed', ac2: '#c4b5fd', soft: '#f5f3ff', ring: '#ddd6fe', ink: '#5b21b6' }, // Rabu — violet
  { key: 'kam', ac: '#d97706', ac2: '#fcd34d', soft: '#fffbeb', ring: '#fde68a', ink: '#92400e' }, // Kamis — amber
  { key: 'jum', ac: '#059669', ac2: '#6ee7b7', soft: '#ecfdf5', ring: '#a7f3d0', ink: '#065f46' }, // Jumat — emerald
  { key: 'sab', ac: '#e11d48', ac2: '#fda4af', soft: '#fff1f2', ring: '#fecdd3', ink: '#9f1239' }, // Sabtu — rose
];

/** Tema untuk hari tertentu (default: WIB hari ini). */
export function themeForDay(dayIdx: number): KioskTheme {
  return THEMES[((dayIdx % 7) + 7) % 7]!;
}

// ── Quote / Hadist (sahih/hasan) — rotasi harian. Sumber masyhur & dapat diedit
//    nanti via modul. ──────────────────────────────────────────────────────────
export interface Quote { text: string; src: string }
const QUOTES: Quote[] = [
  { text: 'Sebaik-baik manusia adalah yang paling bermanfaat bagi manusia lain.', src: 'HR. Ahmad (hasan)' },
  { text: 'Barangsiapa menempuh jalan untuk menuntut ilmu, Allah mudahkan baginya jalan menuju surga.', src: 'HR. Muslim' },
  { text: 'Sampaikanlah dariku walaupun satu ayat.', src: 'HR. Bukhari' },
  { text: 'Tidak beriman salah seorang dari kalian hingga ia mencintai untuk saudaranya apa yang ia cintai untuk dirinya.', src: 'HR. Bukhari & Muslim' },
  { text: 'Senyummu kepada saudaramu adalah sedekah.', src: 'HR. Tirmidzi (hasan)' },
  { text: 'Mukmin yang kuat lebih baik dan lebih dicintai Allah daripada mukmin yang lemah.', src: 'HR. Muslim' },
  { text: 'Barangsiapa tidak menyayangi, tidak akan disayangi.', src: 'HR. Bukhari & Muslim' },
];
export function quoteForDay(dayIdx: number): Quote {
  return QUOTES[((dayIdx % QUOTES.length) + QUOTES.length) % QUOTES.length]!;
}

// ── Kalender: builder grid bulan (6 baris × 7 kolom, Minggu–Sabtu) ───────────
export interface CalCell { date: Date; inMonth: boolean }
export function monthGrid(year: number, month0: number): CalCell[] {
  const first = new Date(year, month0, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // mundur ke Minggu
  const cells: CalCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month0 });
  }
  return cells;
}
export const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const DOW_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =============================================================================
// DATA DUMMY (sementara — ganti dengan data nyata via kaldik & endpoint rekap)
// =============================================================================
export type EventType = 'exam' | 'holiday' | 'event' | 'break';
export interface KaldikEvent {
  id: string; name: string; date: string; endDate: string; type: EventType; source?: string;
  time?: string;          // mis. "07:30–09:00" (opsional)
  agendaOnly?: boolean;   // tampil di Agenda Hari Ini saja (bukan Upcoming/penanda utama)
}

/** [DUMMY] Agenda/kaldik bulan berjalan. Hari libur (holiday/break) TIDAK dihitung hari aktif. */
export function dummyEvents(year: number, month0: number): KaldikEvent[] {
  const m = String(month0 + 1).padStart(2, '0');
  const d = (day: number) => `${year}-${m}-${String(day).padStart(2, '0')}`;
  return [
    { id: 'e1', name: 'Penilaian Akhir Semester (PAS)', date: d(16), endDate: d(24), type: 'exam', source: 'Kurikulum' },
    { id: 'e2', name: 'Rapat Pleno Kenaikan Kelas', date: d(20), endDate: d(20), type: 'event', source: 'Humas', time: '09:00–11:00' },
    { id: 'e3', name: 'Class Meeting', date: d(25), endDate: d(27), type: 'event', source: 'Kesiswaan' },
    { id: 'e4', name: 'Libur Semester Genap', date: d(28), endDate: d(30), type: 'holiday', source: 'Kaldik' },
    // Sub-agenda berjadwal (contoh) untuk hari pertama PAS — demo Agenda Hari Ini.
    { id: 's0', name: 'Apel & Pengarahan PAS', date: d(16), endDate: d(16), type: 'event', source: 'Kesiswaan', time: '06:45–07:15', agendaOnly: true },
    { id: 's1', name: 'PAS — Sesi 1', date: d(16), endDate: d(16), type: 'exam', source: 'Kurikulum', time: '07:30–09:00', agendaOnly: true },
    { id: 's2', name: 'PAS — Sesi 2', date: d(16), endDate: d(16), type: 'exam', source: 'Kurikulum', time: '09:30–11:00', agendaOnly: true },
    { id: 's3', name: 'PAS — Sesi 3', date: d(16), endDate: d(16), type: 'exam', source: 'Kurikulum', time: '12:30–14:00', agendaOnly: true },
  ];
}
export const EVENT_META: Record<EventType, { label: string; dot: string; soft: string; text: string }> = {
  exam: { label: 'Ujian', dot: '#fca5a5', soft: '#fef2f2', text: '#b91c1c' },
  holiday: { label: 'Libur', dot: '#93c5fd', soft: '#eff6ff', text: '#1d4ed8' },
  break: { label: 'Jeda', dot: '#fcd34d', soft: '#fffbeb', text: '#b45309' },
  event: { label: 'Acara', dot: '#6ee7b7', soft: '#ecfdf5', text: '#047857' },
};
/** Hari libur (untuk eksklusi hari aktif rekap). [DUMMY → nanti dari kaldik] */
export function isHoliday(dateStr: string, events: KaldikEvent[]): boolean {
  return events.some((e) => (e.type === 'holiday' || e.type === 'break') && dateStr >= e.date && dateStr <= e.endDate);
}

/** [DUMMY] Skor Kondisi Sekolah (agregat). studentPct nyata bila ada; sisanya dummy. */
export interface HealthBreak { label: string; pct: number }
export interface SchoolHealth { score: number; delta: number; breakdown: HealthBreak[] }
export function dummyHealth(studentPct: number | null): SchoolHealth {
  const siswa = studentPct ?? 92;
  const breakdown: HealthBreak[] = [
    { label: 'Kehadiran Siswa', pct: Math.round(siswa) },
    { label: 'Kehadiran Guru', pct: 96 },     // [DUMMY]
    { label: 'KPI Guru', pct: 88 },           // [DUMMY]
    { label: 'Ketercapaian Pembelajaran', pct: 85 }, // [DUMMY]
  ];
  const score = Math.round(breakdown.reduce((a, b) => a + b.pct, 0) / breakdown.length);
  return { score, delta: 2.3, breakdown }; // delta [DUMMY]
}

/** Rentang tren yang bisa dipilih. */
export const TREND_RANGES = [
  { key: '10h', label: '10H', days: 10 },
  { key: '1b', label: '1B', days: 30 },
  { key: '3b', label: '3B', days: 90 },
  { key: '6b', label: '6B', days: 180 },
  { key: '1t', label: '1Th', days: 365 },
] as const;
export type TrendRangeKey = typeof TREND_RANGES[number]['key'];

/** [DUMMY] Seri tren untuk rentang panjang (granularitas auto: harian≤10, mingguan≤90, bulanan>90). */
export function dummyTrend(days: number): { labels: string[]; pcts: number[] } {
  const points = days <= 10 ? days : days <= 90 ? Math.round(days / 7) : Math.round(days / 30);
  const labels: string[] = []; const pcts: number[] = [];
  for (let i = points - 1; i >= 0; i--) {
    labels.push(days <= 10 ? `H-${i}` : days <= 90 ? `Mg-${i}` : `Bl-${i}`);
    pcts.push(88 + Math.round(Math.sin(i * 1.1) * 4) + (i % 3)); // pola dummy stabil
  }
  return { labels, pcts };
}

/** [DUMMY] Rekap kehadiran untuk satu/beberapa tanggal (mengabaikan hari libur). */
export interface AttendanceRecap { activeDays: number; hadirPct: number; izin: number; sakit: number; alpha: number }
export function dummyRecap(dates: string[], events: KaldikEvent[]): AttendanceRecap {
  const active = dates.filter((d) => !isHoliday(d, events));
  const n = active.length || 1;
  return {
    activeDays: active.length,
    hadirPct: Math.round((90 + (active.length % 5)) * 10) / 10,
    izin: 2 * n, sakit: 3 * n, alpha: 1 * n,
  };
}
