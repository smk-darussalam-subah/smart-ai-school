const mockAccess = jest.fn(),
  mockApi = jest.fn();
jest.mock('@/app/dashboard/executive/executive-authority.server', () => ({
  requireExecutiveDashboardAccess: mockAccess,
}));
jest.mock('@/lib/api', () => ({ apiFetch: mockApi, apiFetchResult: async () => ({ status: 'success', httpStatus: 200, data: [] }) }));
import { fetchExecutiveBundle } from '@/app/dashboard/executive/actions';
import {
  JpOverviewSchema,
  JpOverviewQuerySchema,
  readJpOverview,
  jpOverviewCsv,
} from '@/lib/session-attendance';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { JpSummaryContent } from '@/app/dashboard/akademik/_components/AttendanceJpSummary';
import { TrendArea } from '@/app/dashboard/executive/_components/OpsPanels';
import BerandaSiswa from '@/app/dashboard/akademik/_components/siswa/BerandaSiswa';

const totals = (present = 1, absent = 1, unknown = 0) => ({
  expected: present + absent + unknown,
  recorded: present + absent,
  unknown,
  hadir: present,
  izin: 0,
  sakit: 0,
  alpha: absent,
  complete: unknown === 0 && present + absent > 0,
  pct:
    unknown || !(present + absent)
      ? null
      : Math.round((present / (present + absent)) * 10000) / 100,
  tone:
    unknown || !(present + absent)
      ? 'unknown'
      : absent === 0
        ? 'green'
        : present === 0
          ? 'red'
          : present <= absent
            ? 'yellow'
            : 'blue',
});
const overview = (t = totals()) => ({
  academicYear: '2026/2027',
  semester: 1,
  from: '2026-10-19',
  to: '2026-10-20',
  observedThrough: '2026-10-20',
  generatedAt: '2026-10-20T08:00:00.000Z',
  unit: 'student_session_jp',
  rosterBasis: 'current_roster_and_recorded_history',
  scope: 'authorized',
  filters: { teacherId: null, classId: null, subject: null, majorCode: 'AKL' },
  totals: t,
  days: [{ date: '2026-10-19', ...t }],
});
describe('JP provider -> validated executive consumer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue({ accessToken: 'synthetic' });
  });
  it.each([totals(0, 0, 2), totals(0, 2), totals(2, 0), totals(1, 1)])(
    'preserves unknown/true zero and counts for %j',
    async (t) => {
      const producer = overview(t);
      mockApi.mockImplementation(async (p: string) =>
        p === '/attendance/student-sessions/overview' ? producer : null,
      );
      const data = await fetchExecutiveBundle({
        academicYear: '2026/2027',
        semester: 1,
        majorCode: 'AKL',
      });
      expect(data.kpi.studentPct).toBe(t.pct);
      expect(data.health.pilars[0]?.pct).toBe(t.pct);
      expect(data.attendance?.totals.recorded).toBe(t.recorded);
      expect(mockApi).toHaveBeenCalledWith('/attendance/student-sessions/overview', 'synthetic', {
        academicYear: '2026/2027',
        semester: '1',
        majorCode: 'AKL',
      });
      expect(mockApi.mock.calls.some(([p]) => p === '/attendance/heatmap')).toBe(false);
    },
  );
  it('clears the old claim for unavailable or mismatched filter data', async () => {
    mockApi.mockResolvedValue(null);
    expect(
      (await fetchExecutiveBundle({ academicYear: '2026/2027', semester: 1, majorCode: 'AKL' })).kpi
        .studentPct,
    ).toBeNull();
    mockApi.mockImplementation(async (p: string) =>
      p === '/attendance/student-sessions/overview' ? overview() : null,
    );
    const wrong = await fetchExecutiveBundle({
      academicYear: '2026/2027',
      semester: 1,
      majorCode: 'TKJ',
    });
    expect(wrong.attendance).toBeNull();
    expect(wrong.kpi.studentPct).toBeNull();
  });
  it('rejects contradictory daily sums, duplicate dates and wrong scope', () => {
    const valid = overview();
    expect(JpOverviewSchema.safeParse(valid).success).toBe(true);
    expect(JpOverviewSchema.safeParse({ ...valid, days: [] }).success).toBe(false);
    expect(
      JpOverviewSchema.safeParse({ ...valid, days: [valid.days[0], valid.days[0]] }).success,
    ).toBe(false);
    expect(readJpOverview(valid, { scope: 'own', majorCode: 'AKL' })).toBeNull();
    expect(
      readJpOverview(valid, { academicYear: '2025/2026', semester: 1, majorCode: 'AKL' }),
    ).toBeNull();
  });
  it.each([
    { semester: 1 },
    { from: '2026-02-30', to: '2026-03-01' },
    { scope: 'all' },
    { studentId: 'forbidden' },
  ])('rejects malformed query %j', (query) => {
    expect(JpOverviewQuerySchema.safeParse(query).success).toBe(false);
  });
  it('renders honest JP provenance/counts, not a fabricated percentage', () => {
    const data = JpOverviewSchema.parse(overview(totals(0, 0, 2)));
    const html = renderToStaticMarkup(createElement(JpSummaryContent, { data }));
    expect(html).toContain('Kehadiran siswa per JP');
    expect(html).toContain('siswa-JP tercatat');
    expect(html).toContain('belum lengkap');
    expect(html).not.toContain('0%');
  });
  it('keeps gaps in the chart and displays real zero within the SVG viewbox', () => {
    const html = renderToStaticMarkup(
      createElement(TrendArea, { tren: { labels: ['19', '20', '21'], pcts: [0, null, 100] } }),
    );
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html).toContain('d="M');
    expect(html).not.toContain(' L');
  });
  it('exports the same aggregate/scope, preserving unknown and preventing CSV formula execution', () => {
    const data = JpOverviewSchema.parse(overview(totals(0, 0, 2)));
    data.filters.subject = '=SUM(1,2)';
    const csv = jpOverviewCsv(data);
    expect(csv).toContain(
      '"student_session_jp","2026/2027","1","2026-10-19","2026-10-20","authorized","AKL","\'=SUM(1,2)"',
    );
    expect(csv).toContain('"TOTAL","2","0","2","0","0","0","0",""');
    expect(jpOverviewCsv(JpOverviewSchema.parse(overview(totals(0, 2))))).toContain(
      '"TOTAL","2","2","0","0","0","0","2","0"',
    );
    expect(csv).not.toContain('studentId');
    expect(csv).not.toContain('teacherId');
  });
  it.each([
    [Infinity, 'Tanpa tenggat'],
    [0, 'Deadline hari ini!'],
    [2, '2 hari lagi'],
  ] as const)('student deadline %s is honest', (days, label) => {
    const html = renderToStaticMarkup(
      createElement(BerandaSiswa, {
        showToast: () => {},
        go: () => {},
        setModal: () => {},
        setBadgeCelebration: () => {},
        setActiveModulId: () => {},
        grades: [],
        badges: [],
        modules: [],
        schedule: [],
        quest: { title: 'Sintetis', tasks: [] },
        xp: { level: 1, current: 0, next: 100 },
        kehStats: { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0, pct: null },
        tasks: [
          {
            id: 1,
            title: 'Tugas sintetis',
            mp: 'Matematika',
            type: 'Tugas',
            deadline: '',
            dlDays: days,
            status: 'pending',
            guru: 'Guru sintetis',
            desc: '',
          },
        ],
      }),
    );
    expect(html).toContain(label);
    expect(html).not.toContain('Infinity');
  });
});
