// =============================================================================
// academic.ts — Fondasi bersama Dashboard Akademik (gelombang W0).
// Konstanta, tipe view-model, dan FUNGSI MURNI penilaian/kehadiran/format yang
// dipakai bersama dashboard Guru · Siswa · Ortu · KS.
//
// PRINSIP UTAMA — SATU SUMBER KEBENARAN:
//   • naOf()  = Nilai Akhir RESMI berbobot NA_WEIGHTS (keputusan Kang 2026-06-20,
//               sesuai mockup & standar rapor). Inilah formula kanonik yang dipakai
//               SEMUA dashboard (guru/siswa/ortu/KS).
//   • naSimple() = rata-rata SEDERHANA komponen — perilaku Gradebook guru yang
//               masih LIVE (GradebookPenilaian.tsx). Dipertahankan sbg rujukan;
//               di W1 Gradebook guru DIREWIRE ke naOf agar seluruh dashboard setara.
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
  | 'empty'  // sel kosong (Minggu libur / padding awal bulan)
  | 'future'; // tanggal belum tiba

/** Satu sel pada grid kalender bulanan. day=0 berarti sel padding kosong. */
export interface CalendarCell {
  day: number;
  status: AttendanceCellStatus;
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

function presentScores(c: StudentGradeComponents): number[] {
  return GRADE_COMPONENT_KEYS
    .map((k) => c[k])
    .filter((v): v is number => typeof v === 'number');
}

/**
 * Nilai Akhir RESMI = berbobot NA_WEIGHTS (UH20·Praktik25·Sikap15·UTS20·UAS20),
 * dibulatkan 1 desimal. Bobot dinormalisasi ulang atas komponen yang TERSEDIA
 * agar adil bila ada komponen kosong (mis. UAS belum diisi). Formula kanonik
 * yang dipakai semua dashboard. null bila tak ada komponen (tampilkan "—").
 */
export function naOf(c: StudentGradeComponents): number | null {
  const present = GRADE_COMPONENT_KEYS.filter((k) => typeof c[k] === 'number');
  if (present.length === 0) return null;
  const weightSum = present.reduce((a, k) => a + NA_WEIGHTS[k], 0);
  const acc = present.reduce((a, k) => a + (c[k] as number) * NA_WEIGHTS[k], 0);
  return round1(acc / weightSum);
}

/**
 * Rata-rata SEDERHANA (tak berbobot) komponen yang tersedia, 1 desimal.
 * = perilaku Gradebook guru yang masih LIVE (GradebookPenilaian) — dipertahankan
 * sebagai rujukan transisi sampai W1 merewire Gradebook ke naOf. null bila kosong.
 */
export function naSimple(c: StudentGradeComponents): number | null {
  const v = presentScores(c);
  if (v.length === 0) return null;
  return round1(v.reduce((a, b) => a + b, 0) / v.length);
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
 * (Senin–Sabtu), Minggu libur. Status sel diisi dari `statusByDay` (data NYATA
 * /attendance) — fungsi ini TIDAK pernah mengarang status kehadiran.
 *
 * @param year        tahun penuh (mis. 2026)
 * @param monthIndex0 indeks bulan 0–11 (0=Januari)
 * @param opts.todayDay   tanggal "hari ini"; tanggal > nilai ini → 'future'. Omit = tak ada penanda future.
 * @param opts.statusByDay peta tanggal→status kehadiran nyata. Tanggal sekolah tanpa entri → 'none'.
 */
export function generateCalendar(
  year: number,
  monthIndex0: number,
  opts: {
    todayDay?: number;
    statusByDay?: Record<number, AttendanceCellStatus> | Map<number, AttendanceCellStatus>;
  } = {},
): CalendarCell[] {
  const { todayDay, statusByDay } = opts;
  const lookup = (d: number): AttendanceCellStatus | undefined =>
    statusByDay instanceof Map ? statusByDay.get(d) : statusByDay?.[d];

  const firstDow = new Date(year, monthIndex0, 1).getDay(); // 0=Minggu … 6=Sabtu
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();

  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: 0, status: 'empty' }); // padding awal
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (d + firstDow - 1) % 7; // 0=Minggu
    if (dow === 0) {
      cells.push({ day: d, status: 'empty' }); // Minggu libur
      continue;
    }
    if (todayDay != null && d > todayDay) {
      cells.push({ day: d, status: 'future' });
      continue;
    }
    cells.push({ day: d, status: lookup(d) ?? 'none' });
  }
  return cells;
}
