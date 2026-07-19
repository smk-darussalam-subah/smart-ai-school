// Peta status kehadiran → label & kelas warna (W0b). Warna semantik translucent
// agar TEMA-AGNOSTIK: terbaca di permukaan terang (guru/KS) maupun gelap (siswa/ortu).
// Selaras warna mockup: hadir=emerald · izin=sky · sakit=amber · alpha=rose.

import type { AttendanceCellStatus } from '@/lib/academic';

export const ATTENDANCE_LABELS: Record<AttendanceCellStatus, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpha: 'Alpha',
  none: 'Tanpa catatan',
  holiday: 'Libur',
  outside: 'Luar bulan',
  empty: '',
  future: 'Belum tiba',
};

/** Kelas Tailwind sel kalender per status (translucent → stabil lintas tema). */
export const ATTENDANCE_CELL_CLASS: Record<AttendanceCellStatus, string> = {
  hadir: 'bg-emerald-500/25 text-emerald-600 ring-1 ring-inset ring-emerald-500/30',
  izin: 'bg-sky-500/20 text-sky-600 ring-1 ring-inset ring-sky-500/25',
  sakit: 'bg-amber-500/20 text-amber-600 ring-1 ring-inset ring-amber-500/25',
  alpha: 'bg-rose-500/20 text-rose-600 ring-1 ring-inset ring-rose-500/25',
  none: 'bg-zinc-500/10 text-zinc-400',
  holiday: 'bg-rose-500/10 text-rose-500 ring-1 ring-inset ring-rose-500/20',
  outside: 'bg-zinc-500/[0.05] text-zinc-500/45',
  empty: 'bg-transparent',
  future: 'bg-zinc-500/[0.06] text-zinc-400/60',
};

/** Status kehadiran "nyata" yang bisa diklik untuk detail (bukan struktural). */
export const REAL_ATTENDANCE_STATUSES: AttendanceCellStatus[] = ['hadir', 'izin', 'sakit', 'alpha'];
