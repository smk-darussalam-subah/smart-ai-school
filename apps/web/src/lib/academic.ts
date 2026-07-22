// =============================================================================
// academic.ts — Fondasi bersama Dashboard Akademik (gelombang W0).
// Konstanta, tipe view-model, dan FUNGSI MURNI penilaian/kehadiran/format yang
// dipakai bersama dashboard Guru · Siswa · Ortu · KS.
//
// PRINSIP UTAMA — SATU SUMBER KEBENARAN:
//   • naOf()  = Nilai Akhir RESMI berbobot NA_WEIGHTS (keputusan Kang 2026-06-20,
//               sesuai mockup & standar rapor). Inilah formula kanonik tunggal yang
//               dipakai SEMUA dashboard (guru/siswa/ortu/KS). T3-01: naSimple
//               (formula lama tak-berbobot) telah dihapus — naOf satu-satunya NA.
//   • Status kehadiran TIDAK DIKARANG — generateCalendar() hanya membangun
//               struktur; status diisi dari data NYATA (/attendance).
//   • Hal waktu / JP / hari = pakai lib/bell-times.ts (sumber tunggal).
//               Modul ini TIDAK menduplikasi konstanta jam/JP/DOW.
//
// File ini MURNI (hanya `import type`) → aman dipakai di Server & Client Component.
// =============================================================================

import type { GradeItem } from '@/lib/api';

// ── Konstanta penilaian ──────────────────────────────────────────────────────

/** Kriteria Ketuntasan Tujuan Pembelajaran (default sekolah; kelak per-mapel/config). */
export const KKTP_DEFAULT = 75;

/** Lebar pita "mendekati KKTP" (status warn/mid) tepat di bawah KKTP. */
export const KKTP_NEAR_BAND = 8;

/** Urutan komponen nilai = urutan kolom Gradebook & urutan bobot rapor. */
export const GRADE_COMPONENT_KEYS = ['uh', 'praktik', 'sikap', 'uts', 'uas'] as const;
export type GradeComponentKey = (typeof GRADE_COMPONENT_KEYS)[number];

/** Bobot Nilai Akhir rapor: UH 20% · Praktik 25% · Sikap 15% · UTS 20% · UAS 20%. */
export const NA_WEIGHTS: Record<GradeComponentKey, number> = {
  uh: 0.2,
  praktik: 0.25,
  sikap: 0.15,
  uts: 0.2,
  uas: 0.2,
};

/** Nama bulan ringkas Indonesia (untuk fmtDateShort). Nama penuh ada di bell-times.ts. */
export const MONTHS_SHORT_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des',
] as const;

// ── Tipe view-model ───────────────────────────────────────────────────────────

/** Skor per komponen untuk seorang siswa pada satu mapel (satu skor per komponen). */
export type StudentGradeComponents = Partial<Record<GradeComponentKey, number>>;

/** Hasil agregasi baris GradeItem mentah menjadi komponen nilai per siswa. */
export interface AggregatedStudentGrade {
  studentId: string;
  name: string;
  nis: string;
  components: StudentGradeComponents;
}

/** Status ketuntasan turunan dari Nilai Akhir. */
export type GradeNaStatus = 'tuntas' | 'mid' | 'remedial';

/** Status satu sel kalender kehadiran. */
export type AttendanceCellStatus =
  | 'hadir' | 'izin' | 'sakit' | 'alpha' // status NYATA dari /attendance
  | 'none'   // hari sekolah tanpa catatan kehadiran
  | 'holiday' // Minggu/libur kalender, bukan hari aktif
  | 'outside' // tanggal bulan sebelumnya/berikutnya untuk melengkapi grid
  | 'empty'  // status kompatibilitas lama: sel struktural tanpa data
  | 'future'; // tanggal belum tiba

/** Satu sel pada grid kalender bulanan. */
export interface CalendarCell {
  day: number;
  status: AttendanceCellStatus;
  date: string;
  inMonth: boolean;
  dayOfWeek: number;
  holidayName?: string | null;
}

// Pembayaran & Tugas = view-model untuk gelombang Ortu/Siswa (backend menyusul).
export type PembayaranStatus = 'unpaid' | 'paid';
export interface Pembayaran {
  id: string;
  jenis: string;
  amount: number;
  due: string; // ISO date
  status: PembayaranStatus;
  paidDate?: string;
  desc?: string;
}

export type TugasStatus = 'pending' | 'submitted' | 'graded' | 'late';
export interface Tugas {
  id: string;
  mp: string;
  judul: string;
  guru?: string;
  deadline: string; // ISO date
  status: TugasStatus;
  desc?: string;
  feedback?: string | null;
}

// ── Penilaian (fungsi murni) ──────────────────────────────────────────────────

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Nilai Akhir RESMI = berbobot NA_WEIGHTS (UH20·Praktik25·Sikap15·UTS20·UAS20),
 * dibulatkan 1 desimal. Bobot dinormalisasi ulang atas komponen yang TERSEDIA
 * agar adil bila ada komponen kosong (mis. UAS belum diisi). Formula kanonik
 * tunggal yang dipakai semua dashboard. null bila tak ada komponen (tampilkan "—").
 * T3-01: naSimple (formula lama tak-berbobot) telah dihapus — naOf satu-satunya NA.
 */
export function naOf(c: StudentGradeComponents): number | null {
  const present = GRADE_COMPONENT_KEYS.filter((k) => typeof c[k] === 'number');
  if (present.length === 0) return null;
  const weightSum = present.reduce((a, k) => a + NA_WEIGHTS[k], 0);
  const acc = present.reduce((a, k) => a + (c[k] as number) * NA_WEIGHTS[k], 0);
  return round1(acc / weightSum);
}

/**
 * Status ketuntasan dari sebuah nilai:
 * ≥ KKTP → 'tuntas' · ≥ KKTP−band → 'mid' · sisanya → 'remedial'.
 * Ambang identik dengan pewarnaan sel Gradebook produksi.
 */
export function gradeStatus(v: number, kktp: number = KKTP_DEFAULT): GradeNaStatus {
  if (v >= kktp) return 'tuntas';
  if (v >= kktp - KKTP_NEAR_BAND) return 'mid';
  return 'remedial';
}

/** Predikat rapor. */
export type Predikat = 'A' | 'B' | 'C' | 'D';

/**
 * Predikat rapor dari Nilai Akhir: A ≥ 90 · B ≥ 80 · C ≥ KKTP (tuntas minimal) ·
 * D di bawah KKTP. Selaras mockup rapor (C = ambang KKTP = tuntas).
 */
export function predikat(na: number, kktp: number = KKTP_DEFAULT): Predikat {
  if (na >= 90) return 'A';
  if (na >= 80) return 'B';
  if (na >= kktp) return 'C';
  return 'D';
}

/**
 * Agregasi baris GradeItem mentah (dari GET /grades) menjadi komponen per siswa.
 * Mirror logika GradebookPenilaian: skor TERAKHIR menang per (siswa, komponen).
 * Inilah jembatan yang membuat naOf()/naWeighted() bisa dipanggil atas data
 * produksi nyata. Hasil terurut berdasarkan nama siswa.
 */
export function aggregateStudentGrades(rows: GradeItem[]): AggregatedStudentGrade[] {
  const byStudent = new Map<string, AggregatedStudentGrade>();
  for (const g of rows) {
    let row = byStudent.get(g.studentId);
    if (!row) {
      row = {
        studentId: g.studentId,
        name: g.student.user.fullName,
        nis: g.student.nis,
        components: {},
      };
      byStudent.set(g.studentId, row);
    }
    row.components[g.type] = Number(g.score);
  }
  return [...byStudent.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Format & tanggal (fungsi murni) ────────────────────────────────────────────

/**
 * Format Rupiah EKSAK dengan pemisah ribuan titik: 350000 → "Rp350.000".
 * Implementasi manual (tanpa Intl) agar deterministik lintas environment/test.
 * Catatan: berbeda dari fmtRupiah ringkas di dashboard executive (mis. "Rp1.5 jt")
 * yang sengaja lossy untuk kepadatan chart — di sini WAJIB eksak untuk tagihan.
 */
export function fmtRupiahExact(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = Math.abs(Math.round(n)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp${grouped}`;
}

/**
 * Selisih hari (dibulatkan ke atas) dari `now` ke `dateStr` (ISO). Negatif = lewat.
 * `now` di-inject untuk keterujian; default Date sekarang.
 */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  const target = new Date(dateStr).getTime();
  return Math.ceil((target - now.getTime()) / 86_400_000);
}

/**
 * Tanggal ringkas Indonesia: "2026-06-13" → "13 Jun 2026".
 * Memakai komponen UTC agar string ISO date-only tidak bergeser oleh timezone.
 */
export function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getUTCDate()} ${MONTHS_SHORT_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ── Kalender kehadiran (fungsi murni) ──────────────────────────────────────────

/**
 * Bangun STRUKTUR kalender bulanan: Sunday-first (kolom Minggu=0), sekolah 6 hari
 * (Senin–Sabtu), Minggu libur. Status sel diisi dari `statusByDate` (data NYATA
 * /attendance) — fungsi ini TIDAK pernah mengarang status kehadiran.
 *
 * @param year        tahun penuh (mis. 2026)
 * @param monthIndex0 indeks bulan 0–11 (0=Januari)
 * @param opts.todayDay   tanggal "hari ini"; tanggal > nilai ini → 'future'. Omit = tak ada penanda future.
 * @param opts.statusByDate peta YYYY-MM-DD→status kehadiran nyata. Tanggal sekolah tanpa entri → 'none'.
 */
export function generateCalendar(
  year: number,
  monthIndex0: number,
  opts: {
    todayDay?: number;
    statusByDate?: Record<string, AttendanceCellStatus> | Map<string, AttendanceCellStatus>;
    holidays?: Array<{ start: string; end?: string | null; name?: string | null }>;
  } = {},
): CalendarCell[] {
  const { todayDay, statusByDate, holidays = [] } = opts;
  const lookup = (dateIso: string): AttendanceCellStatus | undefined =>
    statusByDate instanceof Map ? statusByDate.get(dateIso) : statusByDate?.[dateIso];
  const dateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const holidayByDate = new Map<string, string | null>();
  for (const holiday of holidays) {
    const start = new Date(`${holiday.start.slice(0, 10)}T00:00:00`);
    const end = new Date(`${(holiday.end ?? holiday.start).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      holidayByDate.set(dateKey(cursor), holiday.name ?? null);
    }
  }

  const firstDow = new Date(year, monthIndex0, 1).getDay(); // 0=Minggu … 6=Sabtu
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const visibleCellCount = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < visibleCellCount; i++) {
    const date = new Date(year, monthIndex0, 1 - firstDow + i);
    const day = date.getDate();
    const inMonth = date.getMonth() === monthIndex0;
    const dayOfWeek = date.getDay();
    const dateIso = dateKey(date);
    const holidayName = holidayByDate.get(dateIso) ?? null;

    if (!inMonth) {
      cells.push({ day, status: 'outside', date: dateIso, inMonth, dayOfWeek, holidayName });
      continue;
    }

    if (dayOfWeek === 0 || holidayName) {
      cells.push({
        day,
        status: 'holiday',
        date: dateIso,
        inMonth,
        dayOfWeek,
        holidayName: holidayName ?? 'Minggu',
      });
      continue;
    }

    cells.push({
      day,
      status: todayDay != null && day > todayDay ? 'future' : lookup(dateIso) ?? 'none',
      date: dateIso,
      inMonth,
      dayOfWeek,
      holidayName,
    });
  }
  return cells;
}
