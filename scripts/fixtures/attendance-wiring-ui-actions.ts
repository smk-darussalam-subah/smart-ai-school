import { readJpOverview, type JpOverviewQuery } from '../../apps/web/src/lib/session-attendance';
import type { ExecFilters, ExecutiveData } from '../../apps/web/src/app/dashboard/executive/types';

export const lab = { calls: 0, executiveCalls: 0, mode: 'complete', delay: 0 };
export function sample(query: JpOverviewQuery, mode = lab.mode) {
  const hadir = mode === 'zero' || mode === 'empty' ? 0 : mode === 'large' ? 102000 : 6;
  const alpha = mode === 'empty' ? 0 : mode === 'large' ? 34000 : 2;
  const unknown = mode === 'unknown' ? 2 : 0;
  const totals = {
    expected: hadir + alpha + unknown,
    recorded: hadir + alpha,
    unknown,
    hadir,
    alpha,
    izin: 0,
    sakit: 0,
    complete: !unknown && hadir + alpha > 0,
    pct: unknown || !(hadir + alpha) ? null : (hadir / (hadir + alpha)) * 100,
    tone: unknown || !(hadir + alpha) ? 'unknown' : hadir ? 'blue' : 'red',
  };
  const value = {
    academicYear: query.academicYear ?? '2026/2027',
    semester: query.semester ?? 1,
    from: query.from ?? '2026-10-19',
    to: query.to ?? '2026-10-20',
    observedThrough: query.to ?? '2026-10-20',
    generatedAt: '2026-10-20T08:00:00.000Z',
    scope: query.scope === 'own' ? 'own' : 'authorized',
    unit: 'student_session_jp',
    rosterBasis: 'current_roster_and_recorded_history',
    filters: {
      classId: query.classId ?? null,
      teacherId: query.teacherId ?? null,
      subject: query.subject ?? null,
      majorCode: query.majorCode ?? null,
    },
    totals,
    days: [{ date: query.from ?? '2026-10-19', ...totals }],
  };
  const data = readJpOverview(value, query);
  if (!data) throw Error('Synthetic overview must satisfy the production schema');
  return data;
}
export async function fetchSessionAttendanceOverview(query: JpOverviewQuery) {
  lab.calls++;
  const mode = lab.mode,
    delay = lab.delay;
  await new Promise((resolve) => setTimeout(resolve, delay));
  if (mode === 'error')
    return { state: 'error' as const, message: 'Ringkasan JP belum dapat dimuat. Coba lagi.' };
  if (mode === 'denied')
    return { state: 'denied' as const, message: 'Akses ringkasan JP tidak tersedia.' };
  return { state: 'ready' as const, data: sample(query, mode) };
}
export function executiveSample(filters: ExecFilters, mode = lab.mode): ExecutiveData {
  const data = sample(filters, filters.majorCode === 'TKJ' ? 'zero' : mode);
  const unavailable = mode === 'attendance-unavailable';
  return {
    filters: { ...filters, academicYear: data.academicYear, semester: data.semester },
    attendance: unavailable ? null : data,
    majors: ['AKL', 'TKJ', 'TKR'].map((code) => ({ code, name: code })),
    studentsActive: null,
    health: {
      score: null,
      delta: null,
      pilars: [{ label: 'Kehadiran siswa per JP', pct: unavailable ? null : data.totals.pct }],
    },
    kpi: {
      studentPct: unavailable ? null : data.totals.pct,
      studentDelta: null,
      studentSpark: [75, null, 0, 75],
      teacherPct: null,
      avgGrade: null,
      sppCollectedPct: null,
      ppdbConversion: null,
    },
    tren: unavailable
      ? { labels: [], pcts: [] }
      : { labels: ['19', '20', '21', '22'], pcts: [75, null, 0, 75] },
    grades: {
      filters: {
        academicYear: data.academicYear,
        semester: data.semester,
        kkm: null,
        thresholdMode: 'authoritative_per_subject',
        majorCode: filters.majorCode ?? null,
        classId: null,
      },
      overall: {
        count: 2,
        mean: 75,
        median: 75,
        q1: 50,
        q3: 100,
        min: 0,
        max: 100,
        kkmPassRate: 50,
      },
      byMajor: [
        {
          majorCode: 'AKL',
          count: 2,
          mean: 75,
          median: 75,
          q1: 50,
          q3: 100,
          min: 0,
          max: 100,
          kkmPassRate: 50,
        },
      ],
      bySubject: [
        {
          subject: 'Dasar Akuntansi dan Keuangan Lembaga',
          count: 2,
          mean: 75,
          kkmPassRate: 50,
          kktp: 80,
          kktpProvenance: 'fixture',
        },
      ],
      kkmMatrix: {
        majors: ['AKL'],
        subjects: ['Dasar Akuntansi dan Keuangan Lembaga'],
        cells: [
          {
            majorCode: 'AKL',
            subject: 'Dasar Akuntansi dan Keuangan Lembaga',
            count: 2,
            passRate: 50,
            kktp: 80,
          },
        ],
      },
      kktpCatalog: [
        { subject: 'Dasar Akuntansi dan Keuangan Lembaga', value: 80, provenance: 'fixture' },
      ],
      correlation: {
        n: 2,
        r: 1,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
      },
    },
    atRisk: {
      total: 1,
      byClass: [{ className: 'X AKL', majorCode: 'AKL', grade: 10, count: 1 }],
      windowDays: 30,
      threshold: 3,
    },
    aging: {
      totalAmount: 150000,
      totalStudents: 2,
      buckets: [
        { key: 'current', label: '0-30 hari', amount: 100000, students: 1 },
        { key: 'late', label: '31-60 hari', amount: 50000, students: 1 },
      ],
    },
    teacher: {
      totalTeachers: 10,
      presentToday: 2,
      gpsPct: 100,
      attendancePct: 25,
      rpp: {
        state: 'ready',
        draft: 1,
        submitted: 2,
        approved: 3,
        revision: 0,
        total: 6,
        approvalRate: 50,
      },
    },
    ppdb: {
      total: 10,
      byStatus: { contacted: 3, interested: 1, registered: 2, paid: 1, accepted: 2 },
      conversionRate: 20,
    },
    spp: [
      { month: 10, year: 2026, paid: 8, total: 10, pct: 80 },
      { month: 11, year: 2026, paid: 0, total: 10, pct: 0 },
    ],
    system: {
      overall: 'ok',
      services: [
        { label: 'API sintetis', ok: true },
        { label: 'Web sintetis', ok: true },
      ],
    },
  };
}
export async function fetchExecutiveBundle(filters: ExecFilters) {
  lab.executiveCalls++;
  const mode = lab.mode,
    delay = lab.delay;
  await new Promise((resolve) => setTimeout(resolve, delay));
  if (mode === 'error' || mode === 'denied') throw Error('Synthetic executive transport failure');
  return executiveSample(filters, mode);
}
