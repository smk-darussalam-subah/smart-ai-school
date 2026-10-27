import { z } from 'zod';
import type { ApiFetchResult } from './api';

export type LearnerAttendanceState = 'ready' | 'denied' | 'unavailable' | 'period-unavailable';
export interface AttendancePeriod {
  dateFrom: string;
  dateTo: string;
  academicYear?: string;
  semester?: number;
}
const dateKey = z.string().date();
const rowSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
  classId: z.string().min(1),
  date: z
    .string()
    .transform((value) => value.slice(0, 10))
    .pipe(dateKey),
  status: z.enum(['hadir', 'izin', 'sakit', 'alpha']),
  notes: z.string().nullable().optional(),
});
export type LearnerAttendanceRow = z.infer<typeof rowSchema>;

/** Daily class attendance, never JP/session participation or staff GPS presence. */
export function readLearnerAttendance(result: ApiFetchResult<unknown> | null, studentId?: string) {
  const empty: LearnerAttendanceRow[] = [];
  if (!result) return { state: 'period-unavailable' as const, data: empty };
  if (result.status !== 'success')
    return {
      state: result.status === 'forbidden' ? ('denied' as const) : ('unavailable' as const),
      data: empty,
    };
  const parsed = z.object({ data: z.array(rowSchema) }).safeParse(result.data);
  if (!parsed.success) return { state: 'unavailable' as const, data: empty };
  const rows = studentId
    ? parsed.data.data.filter((row) => row.studentId === studentId)
    : parsed.data.data;
  const days = new Set<string>();
  for (const row of rows) {
    const key = `${row.studentId}\0${row.date}`;
    if (days.has(key)) return { state: 'unavailable' as const, data: empty };
    days.add(key);
  }
  return { state: 'ready' as const, data: rows };
}

export function attendanceStats(rows: readonly { status: string }[]) {
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const hadir = count('hadir'),
    izin = count('izin'),
    sakit = count('sakit'),
    alpha = count('alpha');
  const total = hadir + izin + sakit + alpha;
  return {
    hadir,
    izin,
    sakit,
    alpha,
    total,
    pct: total ? Math.round((hadir / total) * 1000) / 10 : null,
  };
}

export function jakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function attendanceMonth<T extends { date: string }>(
  rows: readonly T[],
  month = jakartaToday().slice(0, 7),
): T[] {
  return rows.filter((row) => row.date.slice(0, 7) === month);
}
export function attendanceMessage(state: LearnerAttendanceState): string {
  return state === 'denied'
    ? 'Anda tidak memiliki izin melihat kehadiran.'
    : state === 'period-unavailable'
      ? 'Pilih periode sekolah untuk melihat kehadiran.'
      : state === 'unavailable'
        ? 'Kehadiran belum dapat dimuat. Coba muat ulang.'
        : 'Belum ada catatan kehadiran pada rentang ini.';
}

/** Keep gaps as gaps rather than joining dates that were never recorded. */
export function attendanceTrend(rows: readonly { date: string; pct: number | null }[]) {
  const points: { date: string; x: number; y: number }[] = [];
  const segments: string[][] = [];
  let segment: string[] = [];
  rows.forEach((row, index) => {
    if (row.pct === null) {
      if (segment.length) segments.push(segment);
      segment = [];
      return;
    }
    const x = rows.length === 1 ? 310 : 8 + (index / (rows.length - 1)) * 604;
    const y = 90 - row.pct * 0.8;
    points.push({ date: row.date, x, y });
    segment.push(`${x},${y}`);
  });
  if (segment.length) segments.push(segment);
  return { points, segments: segments.map((values) => values.join(' ')) };
}
