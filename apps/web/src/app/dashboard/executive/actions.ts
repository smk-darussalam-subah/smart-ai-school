'use server';

// =============================================================================
// Server actions Dasbor Eksekutif — fetch paralel /analytics + reuse, lalu
// derivasi (health index, KPI, tren) di sisi server. Dipakai oleh page.tsx
// (muat awal) DAN client (saat filter berubah). Graceful null per-sumber.
// =============================================================================

import { apiFetch, apiFetchResult } from '@/lib/api';
import { z } from 'zod';
import { requireExecutiveDashboardAccess } from './executive-authority.server';
import { readJpOverview, type JpOverviewQuery } from '@/lib/session-attendance';
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

interface SppSummaryRow {
  year: number;
  month: number;
  status: string;
  totalAmount: string;
  count: number;
}
const SppSummarySchema = z.array(z.object({
  year: z.number().int(), month: z.number().int().min(1).max(12),
  status: z.enum(['paid', 'unpaid', 'late', 'waived']), count: z.number().int().nonnegative(),
  totalAmount: z.string().regex(/^\d+(\.\d+)?$/).refine(value => Number.isFinite(Number(value))),
}));
interface AcademicYearRow {
  code: string;
  isActive: boolean;
}

function toParams(filters: ExecFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.academicYear) p.academicYear = filters.academicYear;
  if (filters.semester) p.semester = String(filters.semester);
  if (filters.majorCode) p.majorCode = filters.majorCode;
  return p;
}

function deriveSpp(rows: SppSummaryRow[] | null): {
  months: SppMonth[];
  collectedPct: number | null;
} {
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
    { label: 'Kehadiran siswa per JP', pct: studentPct },
    { label: 'Presensi wajib guru', pct: teacher?.attendancePct ?? null },
    { label: 'Ketuntasan KKTP', pct: grades?.overall.kkmPassRate ?? null },
    { label: 'Kepatuhan RPP', pct: teacher?.rpp?.approvalRate ?? null },
  ];
  const avail = pilars.filter((p) => p.pct !== null).map((p) => p.pct as number);
  const score = avail.length ? Math.round(avail.reduce((a, b) => a + b, 0) / avail.length) : null;
  return { score, delta: studentDelta, pilars };
}

async function loadExecutiveBundle(token: string, filters: ExecFilters): Promise<ExecutiveData> {
  const active =
    !filters.academicYear || !filters.semester
      ? await apiFetch<{ number: number; academicYear: { code: string } }>(
          '/school/semesters/active',
          token,
        )
      : null;
  const selected = {
    ...filters,
    academicYear: filters.academicYear ?? active?.academicYear.code,
    semester: filters.semester ?? active?.number,
  };
  const qp = toParams(selected);
  const overviewQuery: JpOverviewQuery = {
    academicYear: selected.academicYear,
    semester: selected.semester,
    majorCode: filters.majorCode,
  };

  const [overview, grades, atRisk, aging, teacher, ppdb, sppResult, majors, years] =
    await Promise.all([
      selected.academicYear && selected.semester
        ? apiFetch<unknown>('/attendance/student-sessions/overview', token, qp)
        : Promise.resolve(null),
      apiFetch<GradeAnalytics>('/analytics/grades', token, qp),
      apiFetch<ExecutiveData['atRisk']>('/analytics/at-risk', token, qp),
      apiFetch<Aging>('/analytics/finance/aging', token, qp),
      apiFetch<TeacherCompliance>('/analytics/teacher-compliance', token, qp),
      apiFetch<PpdbStats>('/ppdb/stats', token),
      apiFetchResult<SppSummaryRow[]>('/finance/spp/summary', token),
      apiFetch<MajorRef[]>('/school/majors', token, { activeOnly: 'true' }),
      apiFetch<AcademicYearRow[]>('/school/academic-years', token),
    ]);

  const attendance = readJpOverview(overview, overviewQuery);
  const days = attendance?.days ?? [];
  const tren: TrenSeries = {
    labels: days.map((d) => d.date.slice(5)),
    pcts: days.map((d) => d.pct),
  };
  const studentSpark = tren.pcts.slice(-10);
  const studentPct = attendance?.totals.pct ?? null;
  const latest = studentSpark.at(-1),
    previous = studentSpark.at(-2);
  const studentDelta =
    typeof latest === 'number' && typeof previous === 'number'
      ? Math.round((latest - previous) * 10) / 10
      : null;

  const sppPayload = sppResult?.status === 'success' ? SppSummarySchema.safeParse(sppResult.data) : null;
  const sppState = sppPayload?.success
    ? 'ready' : sppResult?.status === 'forbidden' ? 'denied' : 'unavailable';
  const { months: spp, collectedPct } = deriveSpp(sppPayload?.success ? sppPayload.data : null);
  const health = deriveHealth(studentPct, studentDelta, teacher, grades);

  const kpi: Kpi = {
    studentPct,
    studentDelta,
    studentSpark,
    teacherPct: teacher?.attendancePct ?? null,
    avgGrade: grades && grades.overall.count > 0 ? grades.overall.mean : null,
    sppCollectedPct: collectedPct,
    ppdbConversion: ppdb?.conversionRate ?? null,
  };

  // Status sistem = keterjangkauan live (badge "Nyata"): API balas → DB hidup.
  const apiOk = grades !== null || atRisk !== null || ppdb !== null || teacher !== null;
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
  const activeYear =
    years?.find((y) => y.isActive)?.code ??
    years?.[0]?.code ??
    filters.academicYear ??
    grades?.filters.academicYear ??
    '';

  return {
    filters: {
      academicYear:
        selected.academicYear ??
        attendance?.academicYear ??
        grades?.filters.academicYear ??
        activeYear,
      semester: selected.semester ?? attendance?.semester ?? grades?.filters.semester ?? 1,
      majorCode: filters.majorCode,
    },
    majors: majors ?? [],
    studentsActive: teacher?.scope?.academicYear === selected.academicYear &&
      teacher?.scope?.semester === selected.semester &&
      teacher?.scope?.classId === null &&
      teacher?.scope?.majorCode === (filters.majorCode ?? null)
      ? teacher.studentsActive ?? null : null,
    health,
    kpi,
    attendance,
    tren,
    grades,
    atRisk,
    aging,
    teacher,
    ppdb,
    spp,
    sppState,
    system,
  };
}

async function loadAcademicYears(token: string): Promise<string[]> {
  const years = await apiFetch<AcademicYearRow[]>('/school/academic-years', token);
  return (years ?? []).map((y) => y.code);
}

/** Muat awal halaman dengan tepat satu resolusi authority. */
export async function fetchExecutivePageData(filters: ExecFilters): Promise<{
  initial: ExecutiveData;
  years: string[];
}> {
  const session = await requireExecutiveDashboardAccess();
  const token = session.accessToken;
  const [initial, years] = await Promise.all([
    loadExecutiveBundle(token, filters),
    loadAcademicYears(token),
  ]);
  return { initial, years };
}

export async function fetchExecutiveBundle(filters: ExecFilters): Promise<ExecutiveData> {
  const session = await requireExecutiveDashboardAccess();
  return loadExecutiveBundle(session.accessToken, filters);
}

/** Daftar tahun ajaran (untuk dropdown filter). */
export async function fetchAcademicYears(): Promise<string[]> {
  const session = await requireExecutiveDashboardAccess();
  return loadAcademicYears(session.accessToken);
}
