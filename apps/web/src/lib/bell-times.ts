// =============================================================================
// bell-times.ts — Jadwal bel SMK Darussalam Subah (konfirmasi Kang 2026-06-13).
// 1 JP = 40 menit. Dipakai bersama oleh Papan Pembelajaran (header JP + sorot JP
// berjalan), jam Beranda, dan (Fase 2) trigger alert keterlambatan.
//
// Tabel resmi:
//   07.15–07.30 Briefing/Literasi/Sholat Dhuha
//   JP1 07.30–08.10  JP2 08.10–08.50  JP3 08.50–09.30
//   09.30–09.45 Istirahat 1
//   JP4 09.45–10.25  JP5 10.25–11.05  JP6 11.05–11.45
//   11.45–12.25 Istirahat 2 / Ishoma
//   JP7 12.25–13.05  JP8 13.05–13.45
//
// Catatan: nilai ini idealnya jadi config `bell_times` (TU ubah tanpa deploy) —
// untuk Fase 1 dijadikan konstanta. Sumber kebenaran tunggal ada di sini.
// =============================================================================

export interface JpSlot {
  jp: number;
  startMin: number; // menit dari tengah malam (WIB)
  endMin: number;
}

export const JP_SLOTS: JpSlot[] = [
  { jp: 1, startMin: 7 * 60 + 30, endMin: 8 * 60 + 10 },
  { jp: 2, startMin: 8 * 60 + 10, endMin: 8 * 60 + 50 },
  { jp: 3, startMin: 8 * 60 + 50, endMin: 9 * 60 + 30 },
  { jp: 4, startMin: 9 * 60 + 45, endMin: 10 * 60 + 25 },
  { jp: 5, startMin: 10 * 60 + 25, endMin: 11 * 60 + 5 },
  { jp: 6, startMin: 11 * 60 + 5, endMin: 11 * 60 + 45 },
  { jp: 7, startMin: 12 * 60 + 25, endMin: 13 * 60 + 5 },
  { jp: 8, startMin: 13 * 60 + 5, endMin: 13 * 60 + 45 },
];

export const JP_COUNT = JP_SLOTS.length;

// Semua segmen hari (KBM + istirahat) untuk status JP berjalan.
export const BELL_SEGMENTS: { label: string; startMin: number; endMin: number; isJp: boolean }[] = [
  { label: 'Briefing/Literasi/Dhuha', startMin: 7 * 60 + 15, endMin: 7 * 60 + 30, isJp: false },
  ...JP_SLOTS.map((s) => ({ label: `JP${s.jp}`, startMin: s.startMin, endMin: s.endMin, isJp: true })),
  { label: 'Istirahat 1', startMin: 9 * 60 + 30, endMin: 9 * 60 + 45, isJp: false },
  { label: 'Ishoma', startMin: 11 * 60 + 45, endMin: 12 * 60 + 25, isJp: false },
].sort((a, b) => a.startMin - b.startMin);

const pad = (n: number) => String(n).padStart(2, '0');

/** menit → "HH:MM" */
export function fmtMin(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Label jam mulai JP, mis. jpStartLabel(3) → "08:50". */
export function jpStartLabel(jp: number): string {
  const s = JP_SLOTS.find((x) => x.jp === jp);
  return s ? fmtMin(s.startMin) : '';
}

/**
 * Waktu sekarang dalam WIB (Asia/Jakarta, UTC+7) — independen dari TZ server/kontainer.
 * Geser epoch +7 jam lalu baca komponen UTC = jam dinding WIB.
 */
export function wibNow(now: Date = new Date()): { minutes: number; jsDay: number } {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return { minutes: wib.getUTCHours() * 60 + wib.getUTCMinutes(), jsDay: wib.getUTCDay() };
}

/**
 * dayOfWeek untuk tabel Schedule (1=Senin … 6=Sabtu). Minggu → 0 (libur, tak ada
 * jadwal). JS getDay sudah selaras: Senin=1 … Sabtu=6, Minggu=0.
 */
export function scheduleDayOfWeek(now: Date = new Date()): number {
  return wibNow(now).jsDay; // 0=Minggu (libur), 1=Senin … 6=Sabtu
}

/** Tanggal hari ini di WIB sebagai "YYYY-MM-DD" (untuk filter dateFrom/dateTo). */
export function wibTodayISO(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Label tanggal Indonesia, mis. "Kamis, 13 Juni 2026" (WIB). */
export function wibDateLabel(now: Date = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${hari[wib.getUTCDay()]}, ${wib.getUTCDate()} ${bulan[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`;
}

/** JP yang sedang berlangsung (1–8), atau 0 bila di luar jam pelajaran. */
export function currentJp(minutes: number): number {
  const s = JP_SLOTS.find((x) => minutes >= x.startMin && minutes < x.endMin);
  return s ? s.jp : 0;
}

/** Label status untuk header, mis. "JP-3 berlangsung (08:50–09:30)" / "Ishoma (…)". */
export function jpStatusLabel(minutes: number): string {
  const seg = BELL_SEGMENTS.find((x) => minutes >= x.startMin && minutes < x.endMin);
  if (!seg) return minutes < 7 * 60 + 15 ? 'Belum mulai' : 'Di luar jam pelajaran';
  const range = `${fmtMin(seg.startMin)}–${fmtMin(seg.endMin)}`;
  return seg.isJp ? `${seg.label} berlangsung (${range})` : `${seg.label} (${range})`;
}
