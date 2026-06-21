'use server';

// =============================================================================
// Server actions Dasbor Eksekutif — fetch paralel /analytics + reuse, lalu
// derivasi (health index, KPI, tren) di sisi server. Dipakai oleh page.tsx
// (muat awal) DAN client (saat filter berubah). Graceful null per-sumber.
// =============================================================================

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import type {
  Aging,
  ExecFilters,
  ExecutiveData,
  GradeAnalytics,
  KioskHealth,
  Kpi,
  MajorRef,
  PpdbStats,
  SppMonth,
  SystemStatus,
  TeacherCompliance,
  TrenSeries,
} from './types';

interface HeatmapResp {
  dates: string[];
  classes: { cells: { date: string; total: number; hadir: number; pct: number | null }[] }[];
  overall?: { today?: { pct: number | null } };
}
interface SppSummaryRow {
  year: number;
  month: number;
  status: string;
  totalAmount: string;
  count: number;
}
interface AcademicYearRow {
  code: string;
  isActive: boolean;
}

const TREND_DAYS = 12;

function toParams(filters: ExecFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.academicYear) p.academicYear = filters.academicYear;
  if (filters.semester) p.semester = String(filters.semester);
  if (filters.majorCode) p.majorCode = filters.majorCode;
  return p;
}

/** Rata-rata kehadiran harian keseluruhan dari grid heatmap. */
function dailyOverall(heat: HeatmapResp | null): TrenSeries {
  if (!heat || !heat.dates?.length) return { labels: [], pcts: [] };
  const n = heat.dates.length;
  const pcts: number[] = [];
  for (let i = 0; i < n; i++) {
    let h = 0;
    let t = 0;
    for (const c of heat.classes) {
      const cell = c.cells[i];
      if (cell) {
        h += cell.hadir;
        t += cell.total;
      }
    }
    pcts.push(t ? Math.round((h / t) * 1000) / 10 : 0);
  }
  return { labels: heat.dates.map((d) => d.slice(5)), pcts };
}

function deriveSpp(rows: SppSummaryRow[] | null): { months: SppMonth[]; collectedPct: number | null } {
  if (!rows || rows.length === 0) return { months: [], collectedPct: null };
  const map = new Map<string, { month: number; year: number; paid: number; total: number }>();
  let paidAll = 0;
  let totalAll = 0;
  for (const r of rows) {
    const key = `${r.year}-${r.month}`;
    const cur = map.get(key) ?? { month: r.month, year: r.year, paid: 0, total: 0 };
    const amt = parseFloat(r.totalAmount) || 0;
    cur.total += amt;
    totalAll += amt;
    if (r.status === 'paid') {
      cur.paid += amt;
      paidAll += amt;
    }
    map.set(key, cur);
  }
  const months = [...map.values()]
    .map((m) => ({ ...m, pct: m.total ? Math.round((m.paid / m.total) * 1000) / 10 : 0 }))
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-12);
  const collectedPct = totalAll ? Math.round((paidAll / totalAll) * 1000) / 10 : null;
  return { months, collectedPct };
}

function deriveHealth(
  studentPct: number | null,
  studentDelta: number | null,
  teacher: TeacherCompliance | null,
  grades: GradeAnalytics | null,
): KioskHealth {
  const pilars = [
    { label: 'Kehadiran Siswa', pct: studentPct },
    { label: 'Kehadiran Guru', pct: teacher?.gpsPct ?? null },
    { label: 'Ketuntasan KKM', pct: grades?.overall.kkmPassRate ?? null },
    { label: 'Kepatuhan RPP', pct: teacher?.rpp.approvalRate ?? null },
  ];
  const avail = pilars.filter((p) => p.pct !== null).map((p) => p.pct as number);
  const score = avail.length ? Math.round(avail.reduce((a, b) => a + b, 0) / avail.length) : null;
  return { score, delta: studentDelta, pilars };
}

export async function fetchExecutiveBundle(filters: ExecFilters): Promise<ExecutiveData> {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';
  const qp = toParams(filters);

  const empty: ExecutiveData = {
    filters: { academicYear: filters.academicYear ?? '', semester: filters.semester ?? 1, majorCode: filters.majorCode },
    majors: [],
    studentsActive: null,
    health: { score: null, delta: null, pilars: [] },
    kpi: { studentPct: null, studentDelta: null, studentSpark: [], teacherPct: null, avgGrade: null, sppCollectedPct: null, ppdbConversion: null },
    tren: { labels: [], pcts: [] },
    grades: null,
    atRisk: null,
    aging: null,
    teacher: null,
    ppdb: null,
    spp: [],
    system: { overall: 'unknown', services: [] },
  };
  if (!token) return empty;

  const [heat, grades, atRisk, aging, teacher, ppdb, sppRows, students, majors, years] = await Promise.all([
    apiFetch<HeatmapResp>('/attendance/heatmap', token, { days: String(TREND_DAYS) }),
    apiFetch<GradeAnalytics>('/analytics/grades', token, qp),
    apiFetch<ExecutiveData['atRisk']>('/analytics/at-risk', token, qp),
    apiFetch<Aging>('/analytics/finance/aging', token, qp),
    apiFetch<TeacherCompliance>('/analytics/teacher-compliance', token, qp),
    apiFetch<PpdbStats>('/ppdb/stats', token),
    apiFetch<SppSummaryRow[]>('/finance/spp/summary', token),
    apiFetch<{ total: number }>('/students', token, { status: 'active', limit: '1' }),
    apiFetch<MajorRef[]>('/school/majors', token, { activeOnly: 'true' }),
    apiFetch<AcademicYearRow[]>('/school/academic-years', token),
  ]);

  const tren = dailyOverall(heat);
  const studentSpark = tren.pcts.slice(-10);
  const studentPct = heat?.overall?.today?.pct ?? (studentSpark.length ? studentSpark[studentSpark.length - 1]! : null);
  const studentDelta =
    studentSpark.length >= 2 ? Math.round((studentSpark[studentSpark.length - 1]! - studentSpark[studentSpark.length - 2]!) * 10) / 10 : null;

  const { months: spp, collectedPct } = deriveSpp(sppRows);
  const health = deriveHealth(studentPct, studentDelta, teacher, grades);

  const kpi: Kpi = {
    studentPct,
    studentDelta,
    studentSpark,
    teacherPct: teacher?.gpsPct ?? null,
    avgGrade: grades?.overall.mean ?? null,
    sppCollectedPct: collectedPct,
    ppdbConversion: ppdb?.conversionRate ?? null,
  };

  // Status sistem = keterjangkauan live (badge "Nyata"): API balas → DB hidup.
  const apiOk = grades !== null || atRisk !== null || ppdb !== null || students !== null;
  const system: SystemStatus = {
    overall: apiOk ? 'ok' : 'error',
    services: [
      { label: 'Aplikasi Web', ok: true },
      { label: 'Server API', ok: apiOk },
      { label: 'Basis Data', ok: apiOk },
      { label: 'Autentikasi', ok: !!token },
    ],
  };

  // Tahun ajaran aktif → default filter bila belum di-set.
  const activeYear = years?.find((y) => y.isActive)?.code ?? years?.[0]?.code ?? filters.academicYear ?? grades?.filters.academicYear ?? '';

  return {
    filters: {
      academicYear: filters.academicYear ?? grades?.filters.academicYear ?? activeYear,
      semester: filters.semester ?? grades?.filters.semester ?? 1,
      majorCode: filters.majorCode,
    },
    majors: majors ?? [],
    studentsActive: students?.total ?? null,
    health,
    kpi,
    tren,
    grades,
    atRisk,
    aging,
    teacher,
    ppdb,
    spp,
    system,
  };
}

/** Daftar tahun ajaran (untuk dropdown filter). */
export async function fetchAcademicYears(): Promise<string[]> {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';
  if (!token) return [];
  const years = await apiFetch<AcademicYearRow[]>('/school/academic-years', token);
  return (years ?? []).map((y) => y.code);
}
