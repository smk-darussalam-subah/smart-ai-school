import type { ApiFetchResult, PaginatedResponse } from './api';
import { z } from 'zod';
const PeriodSchema = z
  .object({
    number: z.number().int().min(1).max(2),
    academicYear: z.object({ code: z.string().regex(/^\d{4}\/\d{4}$/) }),
    startDate: z.string().refine((date) => Number.isFinite(Date.parse(date))),
    endDate: z.string().refine((date) => Number.isFinite(Date.parse(date))),
  })
  .refine((period) => period.startDate.slice(0, 10) <= period.endDate.slice(0, 10));
const ScheduleReadSchema = z
  .object({
    id: z.string().min(1),
    classId: z.string().min(1),
    academicYear: z.string(),
    semester: z.number().int(),
    dayOfWeek: z.number().int().min(1).max(7),
    jpStart: z.number().int().min(1).max(64),
    jpEnd: z.number().int().min(1).max(64),
    class: z.object({ id: z.string(), name: z.string() }),
    teachingAssignment: z.object({ id: z.string(), subject: z.string() }),
  })
  .refine((row) => row.jpEnd >= row.jpStart && row.classId === row.class.id);

export interface AcademicPeriod {
  number: number;
  academicYear: { code: string };
  startDate: string;
  endDate: string;
}
export function selectAcademicPeriod(
  active: AcademicPeriod | null,
  configured: AcademicPeriod[],
  requested: { academicYear?: string; semester?: string },
): AcademicPeriod | null {
  const parsedActive = PeriodSchema.safeParse(active);
  const current = parsedActive.success ? parsedActive.data : null;
  const parsedConfigured = z.array(PeriodSchema).safeParse(configured);
  const year = requested.academicYear || current?.academicYear.code;
  const semester = requested.semester ? Number(requested.semester) : current?.number;
  const candidates = [
    ...(parsedConfigured.success ? parsedConfigured.data : []),
    ...(current ? [current] : []),
  ].filter(
    (p) =>
      p.academicYear.code === year &&
      p.number === semester &&
      /^\d{4}\/\d{4}$/.test(p.academicYear.code) &&
      [1, 2].includes(p.number) &&
      Number.isFinite(Date.parse(p.startDate)) &&
      Number.isFinite(Date.parse(p.endDate)) &&
      p.startDate.slice(0, 10) <= p.endDate.slice(0, 10),
  );
  if (
    new Set(candidates.map((p) => p.startDate.slice(0, 10) + '|' + p.endDate.slice(0, 10))).size > 1
  )
    return null;
  return candidates[0] ?? null;
}
export function periodPath(
  path: string,
  period: AcademicPeriod | null,
  mode: 'semester' | 'year' | 'attendance' | 'journal' = 'semester',
): string | null {
  if (!period) return null;
  const [base, raw] = path.split('?');
  const query = new URLSearchParams(raw);
  query.delete('limit');
  query.delete('page');
  if (mode === 'attendance' || mode === 'journal') {
    query.set(mode === 'attendance' ? 'dateFrom' : 'from', period.startDate.slice(0, 10));
    query.set(mode === 'attendance' ? 'dateTo' : 'to', period.endDate.slice(0, 10));
  } else {
    query.set('academicYear', period.academicYear.code);
    if (mode === 'semester') query.set('semester', String(period.number));
  }
  return base + '?' + query.toString();
}

/** All-or-unavailable: no partial page can silently certify a complete timetable or KPI. */
export async function readAcademicPages<T extends { id: string }>(
  path: string | null,
  request: (path: string) => Promise<ApiFetchResult<PaginatedResponse<T>>>,
): Promise<ApiFetchResult<PaginatedResponse<T>>> {
  if (!path) return { status: 'unavailable', message: 'Periode belum tersedia.' };
  const [base, raw] = path.split('?'),
    query = new URLSearchParams(raw);
  const items: T[] = [],
    seen = new Set<string>();
  let total: number | undefined;
  for (let page = 1; page <= 50; page++) {
    query.set('page', String(page));
    query.set('limit', '100');
    const result = await request(base + '?' + query.toString());
    if (result.status !== 'success') return result;
    const payload = result.data;
    if (
      !payload ||
      !Array.isArray(payload.data) ||
      !Number.isSafeInteger(payload.total) ||
      payload.total < 0 ||
      payload.total > 5000 ||
      payload.page !== page ||
      payload.limit !== 100 ||
      (total !== undefined && total !== payload.total) ||
      payload.data.length !== Math.min(100, payload.total - items.length)
    ) {
      return { status: 'unavailable', message: 'Data berubah atau tidak lengkap. Muat ulang.' };
    }
    total = payload.total;
    for (const row of payload.data) {
      if (!row || typeof row.id !== 'string' || !row.id || seen.has(row.id))
        return {
          status: 'unavailable',
          message: 'Identitas data berulang atau tidak valid. Muat ulang.',
        };
      if (base === '/schedules') {
        const schedule = ScheduleReadSchema.safeParse(row);
        if (
          !schedule.success ||
          schedule.data.academicYear !== query.get('academicYear') ||
          String(schedule.data.semester) !== query.get('semester')
        )
          return {
            status: 'unavailable',
            message: 'Jadwal tidak valid atau tidak sesuai periode pilihan.',
          };
      }
      seen.add(row.id);
      items.push(row);
    }
    if (items.length === total)
      return {
        status: 'success',
        httpStatus: 200,
        data: { data: items, total, page: 1, limit: items.length || 100 },
      };
  }
  return {
    status: 'unavailable',
    message: 'Cakupan terlalu besar. Pilih filter yang lebih spesifik.',
  };
}

export interface ScheduledCellItem {
  id: string;
  classId: string;
  dayOfWeek: number;
  jpStart: number;
  jpEnd: number;
  teachingAssignment: {
    id?: string;
    subject: string;
    teacher?: { id?: string; user?: { fullName?: string } };
  };
  room?: string | null;
}
/** Catalog endpoints use offset, not page; normalize their contract without truncating it. */
export function readAcademicCatalog<T extends { id: string }>(
  path: string,
  request: (
    path: string,
  ) => Promise<ApiFetchResult<{ data: T[]; total: number; limit: number; offset: number }>>,
) {
  return readAcademicPages<T>(path, async (pagePath) => {
    const [base, raw] = pagePath.split('?'),
      query = new URLSearchParams(raw);
    const page = Number(query.get('page')),
      offset = (page - 1) * 100;
    query.delete('page');
    query.set('offset', String(offset));
    const result = await request(base + '?' + query.toString());
    if (result.status !== 'success') return result;
    if (result.data?.offset !== offset)
      return { status: 'unavailable', message: 'Halaman katalog tidak sesuai. Muat ulang.' };
    return { status: 'success', httpStatus: 200, data: { ...result.data, page } };
  });
}
/** Retain every schedule row. Different classes in a school-wide cell are not automatically a conflict. */
export function scheduleCell<T extends ScheduledCellItem>(
  items: T[],
  day: number,
  jp: number,
  classId?: string,
): T[] {
  return items
    .filter(
      (s) =>
        s.dayOfWeek === day &&
        jp >= s.jpStart &&
        jp <= s.jpEnd &&
        (!classId || s.classId === classId),
    )
    .sort((a, b) => a.jpStart - b.jpStart || a.id.localeCompare(b.id));
}
export function officialSubjectLabel(
  subject: string,
  catalog: { name: string; code: string }[],
): string {
  const matches = catalog.filter((row) => row.name === subject);
  const codes = new Set(matches.map((row) => row.code.trim()).filter(Boolean));
  return codes.size === 1 ? [...codes][0]! : subject;
}

/** A schedule has no module/assessment FK. Only an unambiguous, same-owner/period candidate may be linked. */
export function lessonLinks(
  schedule: ScheduledCellItem,
  period: { academicYear: string; semester: number },
  modules: {
    id: string;
    classId: string | null;
    subject: string;
    teacherId?: string;
    academicYear: string;
    semester: number;
    status: string;
  }[],
  assessments: {
    id: string;
    classId?: string | null;
    teacherId?: string;
    academicYear?: string;
    semester?: number;
    moduleId?: string | null;
    teachingAssignmentId?: string | null;
    module?: { subject?: string } | null;
    status: string;
    _count?: { responses?: number };
  }[],
) {
  const teacher = schedule.teachingAssignment.teacher?.id;
  const candidates = modules.filter(
    (m) =>
      teacher &&
      m.teacherId === teacher &&
      m.classId === schedule.classId &&
      m.subject === schedule.teachingAssignment.subject &&
      m.academicYear === period.academicYear &&
      m.semester === period.semester &&
      m.status === 'published',
  );
  const module = candidates.length === 1 ? candidates[0] : undefined;
  const sessions = assessments.filter(
    (s) =>
      module &&
      s.teacherId === teacher &&
      s.classId === schedule.classId &&
      s.moduleId === module.id &&
      s.academicYear === period.academicYear &&
      s.semester === period.semester &&
      (!s.teachingAssignmentId || s.teachingAssignmentId === schedule.teachingAssignment.id),
  );
  const assessment = sessions.length === 1 ? sessions[0] : undefined;
  return {
    moduleId: module?.id,
    moduleCandidates: candidates.length,
    assessmentSessionId: assessment?.id,
    hasFeedback:
      !!assessment && assessment.status === 'completed' && (assessment._count?.responses ?? 0) > 0,
  };
}
