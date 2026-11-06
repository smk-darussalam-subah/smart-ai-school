import { z } from 'zod';

/** Recap is a separate read contract; legacy/learner final percentages stay unchanged. */
export const AttendanceRecapSchema = z
  .object({
    academicYear: z
      .string()
      .regex(/^\d{4}\/\d{4}$/)
      .optional(),
    semester: z.coerce.number().int().min(1).max(2).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    context: z.enum(['own', 'homeroom', 'authorized']).default('own'),
    classId: z.string().uuid().optional(),
    teacherId: z.string().uuid().optional(),
    majorCode: z.string().trim().min(1).max(20).optional(),
    grade: z.coerce.number().int().min(10).max(12).optional(),
    subject: z.string().trim().min(1).max(120).optional(),
    jp: z.coerce.number().int().min(1).max(40).optional(),
    jpFrom: z.coerce.number().int().min(1).max(40).optional(),
    jpTo: z.coerce.number().int().min(1).max(40).optional(),
    view: z
      .enum(['summary', 'students', 'matrix', 'missing', 'detail', 'audit', 'export'])
      .default('summary'),
    matrixDate: z.string().date().optional(),
    studentId: z.string().uuid().optional(),
    search: z.string().trim().max(100).default(''),
    status: z.enum(['H', 'I', 'S', 'A', 'U', 'N', 'C']).optional(),
    sort: z.enum(['name', 'attendance', 'alpha']).default('name'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .superRefine((q, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (Boolean(q.academicYear) !== Boolean(q.semester)) fail('Pilih periode lengkap.');
    if (Boolean(q.from) !== Boolean(q.to)) fail('Pilih kedua batas tanggal.');
    if (q.from && q.to && (q.from > q.to || Date.parse(q.to) - Date.parse(q.from) > 92 * 86400000))
      fail('Rentang maksimal 93 hari.');
    if (q.matrixDate && q.from && q.to && (q.matrixDate < q.from || q.matrixDate > q.to))
      fail('Tanggal matriks di luar rentang.');
    if (['detail', 'audit'].includes(q.view) && !q.studentId) fail('Pilih siswa.');
    if (
      Boolean(q.jpFrom) !== Boolean(q.jpTo) ||
      (q.jpFrom && q.jpTo && q.jpFrom > q.jpTo) ||
      (q.jp && q.jpFrom)
    )
      fail('Pilih satu JP atau rentang JP yang valid.');
  });
export type AttendanceRecapQuery = z.infer<typeof AttendanceRecapSchema>;
export type RecapStatus = 'H' | 'I' | 'S' | 'A' | 'U' | 'N' | 'C';
export type RecapUnit = {
  studentId: string;
  name: string;
  nis: string;
  classId: string;
  className: string;
  date: string;
  jp: number;
  startAt: string;
  endAt: string;
  status: RecapStatus;
  sessionId: string;
  teacherId: string;
  teacher: string;
  subject: string;
  notes: string | null;
  revision: number | null;
  recordedAt: string | null;
  sources: string[];
};

/** Count physical student/date/JP units, never average rounded percentages. */
export function recapMetrics(rows: readonly Pick<RecapUnit, 'status' | 'studentId'>[]) {
  const counts = { H: 0, I: 0, S: 0, A: 0, U: 0, N: 0, C: 0 };
  for (const row of rows) counts[row.status]++;
  const recorded = counts.H + counts.I + counts.S + counts.A,
    due = recorded + counts.U;
  const percent = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : null);
  return {
    ...counts,
    recorded,
    due,
    attendancePct: percent(counts.H, recorded),
    coveragePct: percent(recorded, due),
    provisional: counts.U > 0,
    students: new Set(rows.map((r) => r.studentId)).size,
  };
}
