import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const mockAccess = jest.fn(),
  mockRead = jest.fn(),
  mockResult = jest.fn();
jest.mock('@/app/dashboard/executive/executive-authority.server', () => ({
  requireExecutiveDashboardAccess: () => mockAccess(),
}));
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockRead(...args),
  apiFetchResult: (...args: unknown[]) => mockResult(...args),
}));
import { fetchExecutiveBundle } from '@/app/dashboard/executive/actions';
import { AgingBar, SdmCard, SppBars } from '@/app/dashboard/executive/_components/OpsPanels';
import { KkmHeatmap } from '@/app/dashboard/executive/_components/AcademicPanels';
import type { Aging, GradeAnalytics, TeacherCompliance } from '@/app/dashboard/executive/types';

const filters = { academicYear: '2026/2027', semester: 1, majorCode: 'AKL' };
const grades = (count: number, mean: number): GradeAnalytics => ({
  filters: {
    ...filters,
    majorCode: 'AKL',
    classId: null,
    kkm: null,
    thresholdMode: 'authoritative_per_subject',
  },
  overall: {
    count,
    mean,
    median: mean,
    q1: mean,
    q3: mean,
    min: mean,
    max: mean,
    kkmPassRate: count ? 50 : null,
  },
  byMajor: [],
  bySubject: [
    { subject: 'Math', count, mean, kktp: 75, kkmPassRate: 50, kktpProvenance: 'system_default' },
  ],
  kkmMatrix: {
    majors: ['AKL'],
    subjects: ['Math'],
    cells: [{ majorCode: 'AKL', subject: 'Math', count, passRate: 50 }],
  },
  kktpCatalog: [{ subject: 'Math', value: 75, provenance: 'system_default' }],
  correlation: { r: 0, n: 0, points: [] },
});
describe('Executive aggregation source-to-consumer closure', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockAccess.mockResolvedValue({ accessToken: 'synthetic' });
    mockRead.mockResolvedValue(null);
    mockResult.mockResolvedValue({ status: 'success', data: [], httpStatus: 200 });
  });
  it.each([
    [0, 0, null],
    [2, 0, 0],
    [2, 85, 85],
  ])('count %s mean %s becomes visible KPI %s', async (count, mean, expected) => {
    mockRead.mockImplementation(async (p: string) =>
      p === '/analytics/grades' ? grades(count!, mean!) : null,
    );
    expect((await fetchExecutiveBundle(filters)).kpi.avgGrade).toBe(expected);
  });
  it('keeps unavailable grades unknown, without erasing healthy SPP', async () => {
    mockResult.mockResolvedValue({
      status: 'success',
      data: [{ year: 2026, month: 10, status: 'paid', count: 1, totalAmount: '100' }],
      httpStatus: 200,
    });
    const data = await fetchExecutiveBundle(filters);
    expect(data.kpi.avgGrade).toBeNull();
    expect(data.kpi.sppCollectedPct).toBe(100);
    expect(data.sppState).toBe('ready');
  });
  it.each(['forbidden', 'unavailable'])(
    'preserves %s SPP state through action and actual card',
    async (status) => {
      mockResult.mockResolvedValue({ status, message: 'synthetic' });
      mockRead.mockImplementation(async (p: string) =>
        p === '/analytics/grades' ? grades(2, 85) : null,
      );
      const data = await fetchExecutiveBundle(filters);
      expect(data.sppState).toBe(status === 'forbidden' ? 'denied' : 'unavailable');
      expect(data.kpi.avgGrade).toBe(85);
      expect(data.kpi.sppCollectedPct).toBeNull();
      const html = renderToStaticMarkup(
        React.createElement(SppBars, { spp: data.spp, state: data.sppState }),
      );
      expect(html).not.toContain('Belum ada data SPP yang dapat ditampilkan');
      expect(html).toContain(status === 'forbidden' ? 'Akses data SPP' : 'Gunakan Segarkan');
    },
  );
  it('only successful empty SPP is labelled empty', async () => {
    const data = await fetchExecutiveBundle(filters);
    expect(
      renderToStaticMarkup(React.createElement(SppBars, { spp: data.spp, state: data.sppState })),
    ).toContain('Belum ada data SPP');
  });
  it('malformed SPP is unavailable rather than collected0 or successful empty', async () => {
    mockResult.mockResolvedValue({
      status: 'success',
      data: [{ year: 2026, month: 99, status: 'paid', totalAmount: 'NaN', count: 1 }],
      httpStatus: 200,
    });
    const data = await fetchExecutiveBundle(filters);
    expect(data.sppState).toBe('unavailable');
    expect(data.kpi.sppCollectedPct).toBeNull();
  });
  it('no operational teachers means undefined ratio, never Infinity', () => {
    const html = renderToStaticMarkup(
      React.createElement(SdmCard, {
        teacher: { totalTeachers: 0 } as TeacherCompliance,
        studentsActive: 30,
      }),
    );
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('1 :');
  });
  it.each([0, 30])(
    'uses scoped operational student count %s, never whole-school270',
    async (studentsActive) => {
      const teacher = { totalTeachers: 14, studentsActive, scope: { ...filters, classId: null } };
      mockRead.mockImplementation(async (p: string) =>
        p === '/analytics/teacher-compliance' ? teacher : p === '/students' ? { total: 270 } : null,
      );
      const data = await fetchExecutiveBundle(filters);
      expect(data.studentsActive).toBe(studentsActive);
      expect(mockRead.mock.calls.some(([p]) => p === '/students')).toBe(false);
      const html = renderToStaticMarkup(
        React.createElement(SdmCard, {
          teacher: teacher as TeacherCompliance,
          studentsActive: data.studentsActive,
        }),
      );
      expect(html).toContain(studentsActive === 0 ? '1 : 0' : '1 : 2');
      expect(html).not.toContain('1 : 19');
    },
  );
  it('refuses stale or old-API student scope', async () => {
    mockRead.mockResolvedValue(null);
    mockRead.mockImplementation(async (p: string) =>
      p === '/analytics/teacher-compliance'
        ? { studentsActive: 270, scope: { ...filters, majorCode: 'OTHER' } }
        : null,
    );
    expect((await fetchExecutiveBundle(filters)).studentsActive).toBeNull();
  });
  it('marks default thresholds without changing pass rate or calling them official', () => {
    const source = grades(5, 80);
    const html = renderToStaticMarkup(React.createElement(KkmHeatmap, { grades: source }));
    expect(html).toContain('5');
    expect(html).toContain('entri memakai ambang bawaan');
    expect(html).toContain('(75)');
    expect(html).not.toContain('KKTP resmi');
    expect(source.overall.kkmPassRate).toBe(50);
    source.bySubject[0]!.kktpProvenance = 'config';
    expect(renderToStaticMarkup(React.createElement(KkmHeatmap, { grades: source }))).not.toContain(
      'entri memakai ambang bawaan',
    );
  });
  it('accepts the real waived status without changing the existing finance calculation', async () => {
    mockResult.mockResolvedValue({
      status: 'success',
      data: [{ year: 2026, month: 10, status: 'waived', totalAmount: '100', count: 1 }],
      httpStatus: 200,
    });
    const data = await fetchExecutiveBundle(filters);
    expect(data.sppState).toBe('ready');
    expect(data.spp[0]?.total).toBe(100);
  });
  it.each(['AKL', undefined])(
    'aging caption follows the actual requested scope %s',
    async (majorCode) => {
      const sample: Aging = {
        buckets: [
          {
            key: '90',
            label: '>90 hari',
            amount: majorCode ? 100 : 1000,
            students: majorCode ? 1 : 2,
          },
        ],
        totalAmount: majorCode ? 100 : 1000,
        totalStudents: majorCode ? 1 : 2,
        scope: { period: 'all_years', majorCode: majorCode ?? null, classId: null },
      };
      mockRead.mockImplementation(async (p: string) =>
        p === '/analytics/finance/aging' ? sample : null,
      );
      const data = await fetchExecutiveBundle({ ...filters, majorCode });
      expect(mockRead.mock.calls.find(([p]) => p === '/analytics/finance/aging')?.[2]).toEqual(
        expect.objectContaining(majorCode ? { majorCode } : { academicYear: filters.academicYear }),
      );
      const html = renderToStaticMarkup(
        React.createElement(AgingBar, { aging: data.aging, majorCode }),
      );
      expect(html).toContain(majorCode ? 'Jurusan AKL' : 'Semua jurusan');
      if (majorCode) expect(html).not.toContain('Semua jurusan');
      expect(data.aging?.totalAmount).toBe(majorCode ? 100 : 1000);
    },
  );
  it('does not show a stale/foreign-scope amount and distinguishes missing from zero', () => {
    const data: Aging = {
      buckets: [],
      totalAmount: 1000,
      totalStudents: 2,
      scope: { period: 'all_years', majorCode: null, classId: null },
    };
    expect(
      renderToStaticMarkup(React.createElement(AgingBar, { aging: data, majorCode: 'AKL' })),
    ).toContain('Cakupan piutang tidak sesuai');
    expect(
      renderToStaticMarkup(React.createElement(AgingBar, { aging: null, majorCode: 'AKL' })),
    ).toContain('Data tunggakan belum tersedia');
    const empty = {
      ...data,
      totalAmount: 0,
      totalStudents: 0,
      scope: { ...data.scope!, majorCode: 'AKL' },
    };
    const html = renderToStaticMarkup(
      React.createElement(AgingBar, { aging: empty, majorCode: 'AKL' }),
    );
    expect(html).toContain('Tidak ada tunggakan pada cakupan ini');
    expect(html).not.toContain('Semua jurusan');
  });
});
