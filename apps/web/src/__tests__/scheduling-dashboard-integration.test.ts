import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  periodPath,
  readAcademicPages,
  readAcademicCatalog,
  selectAcademicPeriod,
  scheduleCell,
  lessonLinks,
  officialSubjectLabel,
  type AcademicPeriod,
} from '@/lib/academic-scheduling';
import {
  MonitoringSchema,
  monitoringSummary,
  monitoringTeachers,
  type MonitoringRow,
  type SchedulingMonitoring,
} from '@/lib/scheduling-monitoring';
import { monitoringDocumentHtml, monitoringDocumentRows } from '@/lib/monitoring-document';
import SchedulingMonitoringPanel from '@/app/dashboard/akademik/_components/ks/SchedulingMonitoringPanel';
import ScheduleBoard, {
  ScheduleReadProvider,
} from '@/app/dashboard/akademik/_components/ks/ScheduleBoard';
import { BellPatternProvider } from '@/components/providers/BellPatternProvider';
import type { BellProfile } from '@/lib/bell-patterns';
import JadwalTimetable from '@/app/dashboard/akademik/_components/JadwalTimetable';
import ParentDayDetail from '@/app/dashboard/akademik/_components/ortu/DayDetailModal';
import {
  monitoringRatio,
  thresholdSource,
  monitoringReadMessage,
} from '@/lib/monitoring-presentation';
import { transformApiSchedule } from '@/app/dashboard/akademik/_components/siswa/siswa-data';
jest.mock('@/app/dashboard/akademik/actions', () => ({ fetchMonitoringKbm: jest.fn() }));
jest.mock('@/app/dashboard/_components/MonthCalendar', () => ({
  __esModule: true,
  default: () => null,
}));
const period: AcademicPeriod = {
  academicYear: { code: '2026/2027' },
  number: 1,
  startDate: '2026-10-13',
  endDate: '2026-10-13',
};
const row = (id = 'a1', teacherId = 't1'): MonitoringRow => ({
  assignmentId: id,
  teacherId,
  classId: 'c1',
  guru: 'Guru Sintetis',
  kelas: 'Kelas Sintetis',
  mapel: 'Matematika',
  jp: 4,
  scheduledJp: 4,
  avg: 75,
  gradeCount: 2,
  passedGradeCount: 1,
  tuntasPct: 50,
  kktp: 80,
  kktpProvenance: 'config',
  hadirPct: 90,
  attendance: { unit: 'daily_class_records', present: 18, recorded: 20, date: '2026-10-13' },
  jurnalCount: 3,
  journalScope: 'teacher_class',
  sessions: {
    due: 3,
    completed: 1,
    active: 1,
    missed: 1,
    cancelled: 1,
    superseded: 1,
    unit: 'materialized_due_sessions',
  },
  lms: { completed: 1, recorded: 2, unit: 'module_progress_records' },
  status: 'risk',
});
const snapshot = (data = [row()]): SchedulingMonitoring => ({
  academicYear: '2026/2027',
  semester: 1,
  state: 'ready',
  date: '2026-10-13',
  generatedAt: '2026-10-13T04:00:00Z',
  reason: null,
  data,
  filters: { teacherId: null, classId: null, majorCode: null, subject: null },
  domains: {
    attendance: 'ready',
    journal: 'ready',
    schedules: 'ready',
    sessions: 'ready',
    lms: 'ready',
  },
  window: { from: '2026-07-01', to: '2026-10-13', semesterEnd: '2026-12-31' },
});
const schedule = (id = 'schedule-1') => ({
  id,
  academicYear: '2026/2027',
  semester: 1,
  classId: 'c1',
  dayOfWeek: 2,
  jpStart: 1,
  jpEnd: 2,
  class: { id: 'c1', name: 'Kelas Sintetis', grade: 10, majorCode: 'TKJ' },
  teachingAssignment: {
    id: 'a1',
    subject: 'Matematika',
    teacher: { id: 't1', user: { fullName: 'Guru Sintetis' } },
  },
});
const profile: BellProfile = {
  id: 'bell',
  code: 'NORMAL',
  name: 'Bel sintetis',
  kind: 'NORMAL',
  effectiveFrom: '2026-10-01',
  effectiveUntil: null,
  provenance: 'test',
  revokedAt: null,
  segments: [1, 2].map((jp, index) => ({
    dayOfWeek: 0,
    type: 'INSTRUCTION',
    jpNumber: jp,
    label: 'JP ' + jp,
    startMinute: 420 + index * 40,
    endMinute: 460 + index * 40,
    sortOrder: index,
  })),
};
describe('complete, period-bound academic readers', () => {
  it('requires configured period dates and rejects conflicting copies', () => {
    expect(selectAcademicPeriod(period, [], {})).toEqual(period);
    expect(selectAcademicPeriod(null, [], {})).toBeNull();
    expect(selectAcademicPeriod(period, [], { semester: '2' })).toBeNull();
    expect(selectAcademicPeriod(period, [{ ...period, endDate: '2026-12-31' }], {})).toBeNull();
  });
  it('binds schedule/grade semesters, assignment year, and daily/journal date windows', () => {
    expect(
      new URLSearchParams(periodPath('/schedules?classId=c1', period)!.split('?')[1]).get(
        'semester',
      ),
    ).toBe('1');
    expect(periodPath('/teaching-assignments', period, 'year')).not.toContain('semester');
    expect(periodPath('/attendance', period, 'attendance')).toContain('dateFrom=2026-10-13');
    expect(periodPath('/class-activities', period, 'journal')).toContain('to=2026-10-13');
    expect(periodPath('/schedules', null)).toBeNull();
  });
  it('reads every page beyond the former first 100 rows', async () => {
    const request = jest.fn(async (path: string) => {
      const page = Number(new URLSearchParams(path.split('?')[1]).get('page'));
      return {
        status: 'success' as const,
        httpStatus: 200,
        data: {
          data: Array.from({ length: page === 1 ? 100 : 3 }, (_, index) => ({
            id: String((page - 1) * 100 + index),
          })),
          total: 103,
          page,
          limit: 100,
        },
      };
    });
    const result = await readAcademicPages(
      '/teaching-assignments?academicYear=2026%2F2027',
      request,
    );
    expect(result.status).toBe('success');
    if (result.status === 'success') expect(result.data.data).toHaveLength(103);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each(['forbidden', 'unavailable', 'requestError'] as const)(
    'preserves %s instead of empty success',
    async (status) => {
      expect(
        (await readAcademicPages('/schedules', async () => ({ status, message: 'synthetic' })))
          .status,
      ).toBe(status);
    },
  );
  it.each(['duplicate', 'truncated', 'changed-total', 'oversized'])(
    'refuses %s completeness failures',
    async (problem) => {
      const request = jest.fn(async (path: string) => {
        const page = Number(new URLSearchParams(path.split('?')[1]).get('page'));
        const data =
          page === 1
            ? Array.from({ length: problem === 'truncated' ? 20 : 100 }, (_, index) => ({
                id: String(index),
              }))
            : [{ id: problem === 'duplicate' ? '0' : '100' }];
        return {
          status: 'success' as const,
          httpStatus: 200,
          data: {
            data,
            total:
              problem === 'oversized'
                ? 5001
                : problem === 'changed-total' && page === 2
                  ? 102
                  : 101,
            page,
            limit: 100,
          },
        };
      });
      expect((await readAcademicPages('/teaching-assignments', request)).status).toBe(
        'unavailable',
      );
    },
  );
  it('refuses wrong-period and malformed schedule records', async () => {
    for (const value of [
      { ...schedule(), semester: 2 },
      { ...schedule(), jpStart: 0 },
    ]) {
      expect(
        (
          await readAcademicPages(periodPath('/schedules', period), async () => ({
            status: 'success',
            httpStatus: 200,
            data: { data: [value], total: 1, page: 1, limit: 100 },
          }))
        ).status,
      ).toBe('unavailable');
    }
  });
  it('reads the entire offset catalog and refuses a stale offset response', async () => {
    const request = jest.fn(async (path: string) => {
      const offset = Number(new URLSearchParams(path.split('?')[1]).get('offset'));
      expect(path).not.toContain('page=');
      return {
        status: 'success' as const,
        httpStatus: 200,
        data: {
          data: Array.from({ length: offset ? 1 : 100 }, (_, i) => ({ id: String(offset + i) })),
          total: 101,
          offset,
          limit: 100,
        },
      };
    });
    const result = await readAcademicCatalog('/subjects', request);
    expect(result.status === 'success' && result.data.data.length).toBe(101);
    expect(
      (
        await readAcademicCatalog('/subjects', async () => ({
          status: 'success',
          httpStatus: 200,
          data: { data: [], total: 0, offset: 100, limit: 100 },
        }))
      ).status,
    ).toBe('unavailable');
  });
});
describe('identity, grouping and truthful metric units', () => {
  it('keeps unknown and empty distinct in human-readable values', () => {
    expect(monitoringRatio(null, null)).toBe('Belum tersedia');
    expect(monitoringRatio(0, 0)).toBe('Belum ada catatan');
    expect(monitoringRatio(1, 3)).toBe('1 dari 3');
    expect(thresholdSource('config')).toBe('Aturan mapel');
    expect(thresholdSource('system_default')).toBe('Nilai bawaan');
  });
  it('does not expose technical error details or assume every network error is permission denial', () => {
    expect(monitoringReadMessage('P2002 HTTP 500 gagal mengakses server')).toContain('Muat ulang');
    expect(monitoringReadMessage('forbidden 403')).toContain('izin');
    expect(monitoringReadMessage('P2002 HTTP 500')).not.toMatch(/P2002|HTTP/);
  });
  it.each(['grades', 'sessions', 'attendance', 'lms'] as const)(
    'rejects impossible %s totals rather than rendering them',
    (kind) => {
      const data = row();
      if (kind === 'grades') data.passedGradeCount = data.gradeCount + 1;
      if (kind === 'sessions') data.sessions.completed = data.sessions.due! + 1;
      if (kind === 'attendance') data.attendance.present = data.attendance.recorded! + 1;
      if (kind === 'lms') data.lms.completed = data.lms.recorded! + 1;
      expect(MonitoringSchema.safeParse(snapshot([data])).success).toBe(false);
    },
  );
  it('rejects malformed timestamps, wrong-filter rows and denied payloads carrying data', () => {
    expect(MonitoringSchema.safeParse({ ...snapshot(), generatedAt: 'not-a-date' }).success).toBe(
      false,
    );
    expect(
      MonitoringSchema.safeParse({
        ...snapshot(),
        filters: { ...snapshot().filters, teacherId: 'other' },
      }).success,
    ).toBe(false);
    expect(MonitoringSchema.safeParse({ ...snapshot(), state: 'denied' }).success).toBe(false);
    expect(MonitoringSchema.safeParse(snapshot()).success).toBe(true);
  });
  it('groups the same teacher once but never merges same-named teachers', () => {
    const teachers = monitoringTeachers([row(), row('a2'), row('a3', 't2')]);
    expect(teachers).toHaveLength(2);
    expect(teachers[0]?.rows).toHaveLength(2);
  });
  it('weights grade records and deduplicates daily attendance and teacher/class journals', () => {
    expect(monitoringSummary([row(), row('a2')])).toMatchObject({
      journal: 3,
      recorded: 20,
      present: 18,
      gradeCount: 4,
      passed: 2,
      gradePct: 50,
      due: 6,
      completed: 2,
    });
  });
  it('missing/denied values and zero denominators never imply 0% failure', () => {
    const missing = {
      ...row(),
      jurnalCount: null,
      sessions: { ...row().sessions, due: null, completed: null },
      gradeCount: 0,
      passedGradeCount: null,
    };
    expect(monitoringSummary([missing])).toMatchObject({
      journal: null,
      sessionPct: null,
      gradePct: null,
    });
  });
  it('rejects duplicate assignment identities in the API snapshot', () => {
    expect(MonitoringSchema.safeParse(snapshot([row(), row()])).success).toBe(false);
  });
  it('keeps all concurrent schedules in both general and learner transformations', () => {
    const items = [
      schedule(),
      {
        ...schedule('schedule-2'),
        teachingAssignment: { ...schedule().teachingAssignment, subject: 'Fisika' },
      },
    ];
    expect(scheduleCell(items, 2, 1)).toHaveLength(2);
    expect(transformApiSchedule(items, profile)[2]?.[0]?.sessions?.map((s) => s.mp)).toEqual([
      'Matematika',
      'Fisika',
    ]);
  });
  it('uses only unique official codes, falling back to full names rather than invented abbreviations', () => {
    expect(officialSubjectLabel('Matematika', [{ name: 'Matematika', code: 'MTK' }])).toBe('MTK');
    expect(
      officialSubjectLabel('Matematika', [
        { name: 'Matematika', code: 'MTK' },
        { name: 'Matematika', code: 'MATH' },
      ]),
    ).toBe('Matematika');
    expect(officialSubjectLabel('Fisika', [])).toBe('Fisika');
  });
  it('does not select an arbitrary module or assessment across teachers or periods', () => {
    const module = {
      id: 'm1',
      teacherId: 't1',
      classId: 'c1',
      subject: 'Matematika',
      academicYear: '2026/2027',
      semester: 1,
      status: 'published',
    };
    const assessment = {
      id: 'x1',
      moduleId: 'm1',
      teacherId: 't1',
      classId: 'c1',
      academicYear: '2026/2027',
      semester: 1,
      status: 'completed',
      _count: { responses: 1 },
    };
    expect(
      lessonLinks(schedule(), { academicYear: '2026/2027', semester: 1 }, [module], [assessment]),
    ).toMatchObject({ moduleId: 'm1', assessmentSessionId: 'x1', hasFeedback: true });
    expect(
      lessonLinks(
        schedule(),
        { academicYear: '2026/2027', semester: 1 },
        [module, { ...module, id: 'm2' }],
        [assessment],
      ).moduleId,
    ).toBeUndefined();
    expect(
      lessonLinks(
        schedule(),
        { academicYear: '2026/2027', semester: 1 },
        [{ ...module, teacherId: 't2' }],
        [assessment],
      ).moduleId,
    ).toBeUndefined();
    expect(
      lessonLinks(
        schedule(),
        { academicYear: '2026/2027', semester: 1 },
        [module],
        [{ ...assessment, status: 'active' }],
      ).hasFeedback,
    ).toBe(false);
  });
});
describe('real component SSR and document safety', () => {
  it('parent detail never copies a daily attendance status into individual JP', () => {
    const html = renderToStaticMarkup(
      React.createElement(BellPatternProvider, {
        profiles: [profile],
        children: React.createElement(ParentDayDetail, {
          day: 13,
          month: 'Oktober',
          year: 2026,
          status: 'hadir',
          onClose: jest.fn(),
        }),
      }),
    );
    expect(html).toContain('Pola Jam Pelajaran');
    expect(html).toContain('Presensi setiap JP belum tersedia');
    expect(html).not.toContain('Detail per Sesi');
    expect(html).not.toContain('>hadir<');
    expect(html).not.toContain('semua sesi');
  });
  it('teacher timetable outage cannot certify zero JP or a holiday', () => {
    const html = renderToStaticMarkup(
      React.createElement(JadwalTimetable, {
        schedules: [],
        available: false,
        academicYear: '2026/2027',
        semester: 1,
      }),
    );
    expect(html).toContain('Jadwal belum dapat dimuat');
    expect(html).not.toContain('JP fisik');
  });
  function panel(data: SchedulingMonitoring | null, error: string | null = null) {
    return renderToStaticMarkup(
      React.createElement(SchedulingMonitoringPanel, {
        academicYear: '2026/2027',
        semester: 1,
        readResult: { data, error, loading: false, retry: jest.fn() },
      }),
    );
  }
  it('renders one accessible teacher disclosure with assignment detail and honest daily attendance', () => {
    const html = panel(snapshot([row(), row('a2')]));
    expect(html.match(/data-teacher-id=/g) ?? []).toHaveLength(1);
    expect(html).toContain('2 penugasan');
    expect(html).toContain('Kehadiran Harian Siswa');
    expect(html).not.toContain('Real-time');
    expect(html).not.toContain('0/0');
    expect(html).not.toMatch(
      /termaterialisasi|materialisasi|jatuh waktu|roster|snapshot|\/ due|\(config\)/i,
    );
    expect(html).toContain('Cara membaca ringkasan');
  });
  it('does not render stale KPIs or allow export when the source is unavailable', () => {
    const html = panel(null, 'synthetic outage');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Rincian Progres per Guru');
    expect(html).toMatch(/disabled=""/);
  });
  it('rejects a snapshot from a different filter synchronously', () => {
    const html = panel({ ...snapshot(), filters: { ...snapshot().filters, teacherId: 'other' } });
    expect(html).not.toContain('Rincian Progres per Guru');
  });
  it.each(['loading', 'error', 'denied'] as const)(
    'cannot export or show stale success in %s state',
    (state) => {
      const html = renderToStaticMarkup(
        React.createElement(SchedulingMonitoringPanel, {
          academicYear: '2026/2027',
          semester: 1,
          readResult: {
            data: { ...snapshot(), state: state === 'denied' ? 'denied' : 'ready' },
            loading: state === 'loading',
            error: state === 'error' ? 'synthetic outage' : null,
            retry: jest.fn(),
          },
        }),
      );
      expect(html).not.toContain('Rincian Progres per Guru');
      expect(html).toMatch(/disabled=""/);
    },
  );
  it('weekly board retains every overlapping row, official labels and all details', () => {
    const items = [
      schedule(),
      {
        ...schedule('schedule-2'),
        teachingAssignment: { ...schedule().teachingAssignment, subject: 'Fisika' },
      },
    ];
    const board = React.createElement(ScheduleBoard, {
      schedules: items,
      classes: [schedule().class],
      weekly: true,
    });
    const scoped = React.createElement(ScheduleReadProvider, {
      value: {
        academicYear: '2026/2027',
        semester: 1,
        teacherId: '',
        subject: '',
        available: true,
        subjects: [{ name: 'Matematika', code: 'MTK' }],
      },
      children: board,
    });
    const html = renderToStaticMarkup(
      React.createElement(BellPatternProvider, {
        profiles: [profile],
        periods: [period],
        children: scoped,
      }),
    );
    expect(html).toContain('2 sesi terjadwal');
    expect(html).toContain('Matematika');
    expect(html).toContain('Fisika');
    expect(html).toContain('bukan bukti sesi mengajar');
  });
  it('exports bound metadata, no formula cells and escaped script content', () => {
    const data = snapshot([
      { ...row(), guru: '<script>alert(1)</script>', mapel: '=IMPORTXML("synthetic")' },
    ]);
    const html = monitoringDocumentHtml(data, data.data, true);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('2026/2027');
    expect(html).toContain('Semester Ganjil');
    expect(html).toContain('bukan target seluruh semester');
    expect(monitoringDocumentRows(data.data)[0]?.[2]).toBe('=IMPORTXML("synthetic")');
  });
});
