import { createElement } from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
jest.mock('@/app/dashboard/akademik/session-attendance-actions', () => ({
  fetchSessionAttendanceOverview: jest.fn(),
}));
jest.mock('@/app/dashboard/executive/actions', () => ({ fetchExecutiveBundle: jest.fn() }));
import ExecutiveDashboard from '@/app/dashboard/executive/_components/ExecutiveDashboard';
import { executiveSample } from '../../../../scripts/fixtures/attendance-wiring-ui-actions';
import {
  AgingBar,
  PpdbFunnel,
  SppBars,
  TrendArea,
} from '@/app/dashboard/executive/_components/OpsPanels';
import { GaugeHealth, KpiStrip } from '@/app/dashboard/executive/_components/HeaderPanels';
import {
  KkmHeatmap,
  GradeBoxPlot,
  ScatterCorrelation,
} from '@/app/dashboard/executive/_components/AcademicPanels';
import RingkasanGuru from '@/app/dashboard/akademik/_components/RingkasanGuru';
import {
  attendanceDayLabel,
  attendanceRangeLabel,
  attendanceNumber,
} from '@/lib/attendance-presentation';
import type { GradeAnalytics } from '@/app/dashboard/executive/types';
import { wibTodayISO } from '@/lib/bell-times';

describe('attendance UI presentation without changing domain values', () => {
  it('starts the executive surface with its header and keeps attendance detail closed until requested', () => {
    const html = render(
      createElement(ExecutiveDashboard, {
        initial: executiveSample({ academicYear: '2026/2027', semester: 1, majorCode: 'AKL' }),
        years: ['2026/2027'],
      }),
    );
    expect(html.indexOf('Dasbor Eksekutif')).toBeLessThan(html.indexOf('KPI Utama'));
    expect(html).toContain('aria-label="Rincian absensi siswa"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-label="Ringkasan kehadiran per JP"');
    expect(html).toContain('Lihat data tren');
  });
  it('reuses the framed production panel while keeping KPI units and one semantic list', () => {
    const html = render(
      createElement(KpiStrip, {
        kpi: {
          studentPct: null,
          studentDelta: null,
          studentSpark: [],
          teacherPct: 0,
          avgGrade: null,
          sppCollectedPct: null,
          ppdbConversion: null,
        },
      }),
    );
    expect(html).toContain('aria-label="KPI Utama"');
    expect(html).toContain('rounded-2xl');
    expect(html.match(/<section\b/g)).toHaveLength(1);
    expect(html.match(/<dl\b/g)).toHaveLength(1);
    expect(html).toContain('Kehadiran siswa per JP');
    expect(html).toContain('Ringkasan JP belum tersedia');
    expect(html).toContain('0%');
  });
  it('separates unavailable finance/PPDB from a successful zero', () => {
    expect(render(createElement(AgingBar, { aging: null }))).toContain(
      'Data tunggakan belum tersedia',
    );
    expect(
      render(createElement(AgingBar, { aging: { buckets: [], totalAmount: 0, totalStudents: 0 } })),
    ).toContain('Tidak ada tunggakan');
    expect(render(createElement(PpdbFunnel, { ppdb: null }))).toContain('Data PPDB belum tersedia');
    expect(
      render(createElement(PpdbFunnel, { ppdb: { total: 0, byStatus: {}, conversionRate: 0 } })),
    ).toContain('Belum ada lead PPDB');
  });
  it('labels the inherited health delta as JP attendance, not a new index calculation', () => {
    const html = render(
      createElement(GaugeHealth, {
        health: { score: 60, delta: 0, pilars: [{ label: 'Kehadiran siswa per JP', pct: null }] },
      }),
    );
    expect(html).toContain('Perubahan kehadiran JP');
    expect(html).toContain('Tidak berubah');
    expect(html).toContain('60');
  });
  it('provides every trend value as a semantic table including null and true zero', () => {
    const html = render(
      createElement(TrendArea, {
        tren: { labels: ['10-19', '10-20', '10-21'], pcts: [0, null, 75.5] },
      }),
    );
    expect(html).toContain('Lihat data tren');
    expect(html).toContain('scope="col"');
    expect(html).toContain('Belum lengkap');
    expect(html).toContain('75,5%');
    expect(html).toContain('0%');
    expect(html).not.toContain('NaN');
  });
  it('provides SPP month, paid count and zero percent without relying on bar color', () => {
    const html = render(
      createElement(SppBars, { state: 'ready', spp: [{ month: 10, year: 2026, paid: 0, total: 10, pct: 0 }] }),
    );
    expect(html).toContain('Lihat data SPP');
    expect(html).toContain('Okt');
    expect(html).toContain('2026');
    expect(html).toContain('0%');
  });
  it('keeps official subject names and readable heatmap cells instead of four-character aliases', () => {
    const grades = {
      kkmMatrix: {
        majors: ['AKL'],
        subjects: ['Dasar Akuntansi'],
        cells: [{ majorCode: 'AKL', subject: 'Dasar Akuntansi', count: 2, passRate: 80, kktp: 90 }],
      },
    } as GradeAnalytics;
    const html = render(createElement(KkmHeatmap, { grades }));
    expect(html).toContain('Dasar Akuntansi');
    expect(html).toContain('scope="row"');
    expect(html).toContain('text-slate-950');
    expect(html).toContain('80% entri mencapai KKTP');
  });
  it('makes grade and correlation values available without the SVG', () => {
    const grades = {
      byMajor: [{ majorCode: 'AKL', count: 2, min: 0, q1: 20, median: 50, q3: 80, max: 100 }],
      correlation: {
        n: 2,
        r: 1,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
      },
    } as GradeAnalytics;
    expect(render(createElement(GradeBoxPlot, { grades }))).toContain('Lihat distribusi nilai');
    const html = render(createElement(ScatterCorrelation, { grades }));
    expect(html).toContain('Lihat data korelasi');
    expect(html).toContain('0%');
    expect(html).not.toContain('kehadiran prediktor prestasi');
  });
  it.each(['denied', 'unavailable'] as const)(
    'teacher recovery text is specific to %s',
    (state) => {
      const html = render(
        createElement(RingkasanGuru, {
          grades: [],
          attendances: [],
          activities: [],
          rpp: [],
          todayClasses: [],
          todayDate: wibTodayISO(),
          onAbsen: () => {},
          onJurnal: () => {},
          availability: {
            grades: state,
            attendance: 'ready',
            journal: 'ready',
            rpp: 'ready',
            assessments: 'ready',
            kktp: 'ready',
            today: 'ready',
          },
        }),
      );
      if (state === 'denied') {
        expect(html).toContain('Sebagian data tidak ditampilkan karena izin akun Anda.');
        expect(html).not.toContain('Daftar ini belum lengkap; coba muat ulang halaman.');
      } else expect(html).toContain('Daftar ini belum lengkap; coba muat ulang halaman.');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('Penjelasan Nilai mencapai KKTP');
    },
  );
  it('formats dates and counts locally, while leaving numerical and CSV contracts untouched', () => {
    expect(attendanceRangeLabel('2026-10-19', '2026-10-20')).toContain('2026');
    expect(attendanceRangeLabel('2026-10-19', '2026-10-20')).not.toContain('2026-10-19');
    expect(attendanceNumber(12345)).toBe('12.345');
    expect(attendanceDayLabel('10-20')).toContain('20');
  });
});
