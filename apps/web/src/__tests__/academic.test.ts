// Unit test fondasi akademik (W0). Mengunci: (1) naOf MATCH formula bobot mockup;
// (2) kalender tak mengarang status; (3) format Rupiah/tanggal deterministik.
// T3-01: naSimple (formula lama tak-berbobot) telah dihapus — naOf satu-satunya NA.

import type { GradeItem } from '@/lib/api';
import {
  naOf,
  gradeStatus,
  predikat,
  aggregateStudentGrades,
  fmtRupiahExact,
  daysUntil,
  fmtDateShort,
  generateCalendar,
  NA_WEIGHTS,
  GRADE_COMPONENT_KEYS,
  KKTP_DEFAULT,
  type StudentGradeComponents,
} from '@/lib/academic';

// Replika persis formula mockup: Math.round(Σ score*NA_W[i] *10)/10 (5 komponen).
function mockupNaWeighted(s: number[]): number {
  const w = [0.2, 0.25, 0.15, 0.2, 0.2];
  return Math.round(s.reduce((a, b, i) => a + b * (w[i] ?? 0), 0) * 10) / 10;
}

describe('naOf — Nilai Akhir RESMI berbobot (keputusan Kang 2026-06-20)', () => {
  it('SETARA formula bobot mockup saat 5 komponen lengkap', () => {
    const s = [80, 90, 85, 70, 75];
    const c: StudentGradeComponents = { uh: s[0], praktik: s[1], sikap: s[2], uts: s[3], uas: s[4] };
    expect(naOf(c)).toBe(mockupNaWeighted(s)); // 80.3
  });

  it('normalisasi bobot saat ada komponen kosong', () => {
    const c: StudentGradeComponents = { uh: 80, praktik: 90 }; // (80*.2+90*.25)/(.45)=85.56→85.6
    expect(naOf(c)).toBe(85.6);
  });

  it('null bila tak ada komponen', () => {
    expect(naOf({})).toBeNull();
  });

  it('bobot berjumlah 1', () => {
    const total = GRADE_COMPONENT_KEYS.reduce((a, k) => a + NA_WEIGHTS[k], 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('gradeStatus', () => {
  it('ambang KKTP default 75, band 8', () => {
    expect(gradeStatus(75)).toBe('tuntas');
    expect(gradeStatus(90)).toBe('tuntas');
    expect(gradeStatus(74)).toBe('mid');
    expect(gradeStatus(67)).toBe('mid'); // 75-8
    expect(gradeStatus(66)).toBe('remedial');
    expect(gradeStatus(0)).toBe('remedial');
  });

  it('menghormati KKTP kustom', () => {
    expect(gradeStatus(70, 70)).toBe('tuntas');
    expect(gradeStatus(69, 70)).toBe('mid');
  });

  it('KKTP_DEFAULT = 75', () => {
    expect(KKTP_DEFAULT).toBe(75);
  });
});

describe('predikat — A/B/C/D rapor', () => {
  it('ambang A≥90 · B≥80 · C≥KKTP · D di bawah KKTP', () => {
    expect(predikat(95)).toBe('A');
    expect(predikat(90)).toBe('A');
    expect(predikat(89)).toBe('B');
    expect(predikat(80)).toBe('B');
    expect(predikat(79)).toBe('C');
    expect(predikat(75)).toBe('C'); // = KKTP
    expect(predikat(74)).toBe('D');
    expect(predikat(0)).toBe('D');
  });

  it('menghormati KKTP kustom (C mengikuti ambang tuntas)', () => {
    expect(predikat(70, 70)).toBe('C');
    expect(predikat(69, 70)).toBe('D');
  });
});

describe('aggregateStudentGrades — jembatan data produksi', () => {
  const mk = (
    studentId: string,
    name: string,
    nis: string,
    type: GradeItem['type'],
    score: string,
  ): GradeItem => ({
    id: `${studentId}-${type}`,
    studentId,
    semester: 1,
    academicYear: '2025/2026',
    score,
    type,
    notes: null,
    student: { id: studentId, nis, user: { fullName: name } },
    assignment: { subject: 'MTK', classId: 'c1', academicYear: '2025/2026', class: { id: 'c1', name: 'X AKL 1' } },
  });

  it('mengelompokkan baris per siswa lalu naOf bisa dipanggil', () => {
    const rows: GradeItem[] = [
      mk('s2', 'Budi', '102', 'uh', '80'),
      mk('s2', 'Budi', '102', 'uts', '70'),
      mk('s1', 'Ani', '101', 'uh', '90'),
      mk('s1', 'Ani', '101', 'praktik', '100'),
    ];
    const agg = aggregateStudentGrades(rows);
    expect(agg.map((a) => a.name)).toEqual(['Ani', 'Budi']); // terurut nama
    expect(naOf(agg[0]!.components)).toBe(95.6); // Ani: (90*.2+100*.25)/(.45)=95.56→95.6
    expect(naOf(agg[1]!.components)).toBe(75);   // Budi: (80*.2+70*.2)/(.4)=75
  });

  it('skor terakhir menang per (siswa, komponen) — mirror produksi', () => {
    const rows: GradeItem[] = [
      mk('s1', 'Ani', '101', 'uh', '60'),
      mk('s1', 'Ani', '101', 'uh', '88'),
    ];
    const agg = aggregateStudentGrades(rows);
    expect(agg[0]!.components.uh).toBe(88);
  });
});

describe('fmtRupiahExact', () => {
  it('pemisah ribuan titik, eksak', () => {
    expect(fmtRupiahExact(350000)).toBe('Rp350.000');
    expect(fmtRupiahExact(1500000)).toBe('Rp1.500.000');
    expect(fmtRupiahExact(0)).toBe('Rp0');
    expect(fmtRupiahExact(999)).toBe('Rp999');
  });

  it('menangani negatif', () => {
    expect(fmtRupiahExact(-5000)).toBe('-Rp5.000');
  });
});

describe('daysUntil', () => {
  const now = new Date('2026-06-20T00:00:00Z');
  it('hari ke depan', () => {
    expect(daysUntil('2026-06-25', now)).toBe(5);
  });
  it('lampau = negatif', () => {
    expect(daysUntil('2026-06-18', now)).toBe(-2);
  });
  it('hari ini = 0', () => {
    expect(daysUntil('2026-06-20T00:00:00Z', now)).toBe(0);
  });
});

describe('fmtDateShort', () => {
  it('format Indonesia ringkas, stabil timezone', () => {
    expect(fmtDateShort('2026-06-13')).toBe('13 Jun 2026');
    expect(fmtDateShort('2026-01-01')).toBe('1 Jan 2026');
    expect(fmtDateShort('2026-12-31')).toBe('31 Des 2026');
  });
});

describe('generateCalendar — struktur, tanpa mengarang status', () => {
  const Y = 2026;
  const M = 5; // Juni 2026
  const firstDow = new Date(Y, M, 1).getDay();
  const daysInMonth = new Date(Y, M + 1, 0).getDate();

  it('padding awal = firstDow sel kosong', () => {
    const cells = generateCalendar(Y, M);
    const lead = cells.slice(0, firstDow);
    expect(lead).toHaveLength(firstDow);
    expect(lead.every((c) => c.status === 'empty' && c.day === 0)).toBe(true);
    expect(cells).toHaveLength(firstDow + daysInMonth);
  });

  it('semua hari Minggu = empty (libur)', () => {
    const cells = generateCalendar(Y, M);
    for (const c of cells) {
      if (c.day === 0) continue;
      const dow = (c.day + firstDow - 1) % 7;
      if (dow === 0) expect(c.status).toBe('empty');
    }
  });

  it('tanggal > todayDay = future; hari sekolah tanpa data = none', () => {
    const cells = generateCalendar(Y, M, { todayDay: 15 });
    const d20 = cells.find((c) => c.day === 20 && c.status !== 'empty');
    // 20 Juni 2026 adalah Sabtu (bukan Minggu) → future
    expect(d20?.status).toBe('future');
    const d10 = cells.find((c) => c.day === 10);
    const dow10 = (10 + firstDow - 1) % 7;
    if (dow10 !== 0) expect(d10?.status).toBe('none');
  });

  it('mengisi status NYATA dari statusByDay (tak mengarang)', () => {
    const cells = generateCalendar(Y, M, { todayDay: 28, statusByDay: { 2: 'hadir', 3: 'alpha' } });
    expect(cells.find((c) => c.day === 2)?.status).toBe('hadir');
    expect(cells.find((c) => c.day === 3)?.status).toBe('alpha');
  });

  it('mendukung Map untuk statusByDay', () => {
    const m = new Map<number, 'hadir' | 'izin'>([[4, 'izin']]);
    const cells = generateCalendar(Y, M, { todayDay: 28, statusByDay: m });
    expect(cells.find((c) => c.day === 4)?.status).toBe('izin');
  });
});
