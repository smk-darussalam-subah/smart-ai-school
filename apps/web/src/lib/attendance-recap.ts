import { z } from 'zod';
const uuid = z.string().uuid();
const date = z.string().date();
export const RecapStatus = z.enum(['H', 'I', 'S', 'A', 'U', 'N', 'C']);
export const recapStatusLabels = {
  H: 'Hadir',
  I: 'Izin',
  S: 'Sakit',
  A: 'Alpha',
  U: 'Belum dicatat',
  N: 'Belum jatuh tempo',
  C: 'Dibatalkan / libur',
};
export const RecapQuerySchema = z
  .object({
    academicYear: z
      .string()
      .regex(/^\d{4}\/\d{4}$/)
      .optional(),
    semester: z.number().int().min(1).max(2).optional(),
    from: date.optional(),
    to: date.optional(),
    context: z.enum(['own', 'homeroom', 'authorized']).default('own'),
    classId: uuid.optional(),
    teacherId: uuid.optional(),
    majorCode: z.string().trim().min(1).max(20).optional(),
    grade: z.number().int().min(10).max(12).optional(),
    subject: z.string().trim().min(1).max(120).optional(),
    jp: z.number().int().min(1).max(40).optional(),
    jpFrom: z.number().int().min(1).max(40).optional(),
    jpTo: z.number().int().min(1).max(40).optional(),
    view: z
      .enum(['summary', 'students', 'matrix', 'missing', 'detail', 'audit', 'export'])
      .default('summary'),
    matrixDate: date.optional(),
    studentId: uuid.optional(),
    search: z.string().trim().max(100).default(''),
    status: RecapStatus.optional(),
    sort: z.enum(['name', 'attendance', 'alpha']).default('name'),
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((q) => Boolean(q.academicYear) === Boolean(q.semester))
  .refine((q) => Boolean(q.from) === Boolean(q.to))
  .refine(
    (q) =>
      !q.from ||
      !q.to ||
      (q.from <= q.to && Date.parse(q.to) - Date.parse(q.from) <= 92 * 86400000),
  )
  .refine((q) => !['detail', 'audit'].includes(q.view) || Boolean(q.studentId))
  .refine(
    (q) =>
      Boolean(q.jpFrom) === Boolean(q.jpTo) &&
      (!q.jpFrom || !q.jpTo || q.jpFrom <= q.jpTo) &&
      !(q.jp && q.jpFrom),
  );
export type RecapQuery = z.input<typeof RecapQuerySchema>;
const count = z.number().int().nonnegative(),
  percent = z.number().min(0).max(100).nullable();
const MetricsObject = z.object({
  H: count,
  I: count,
  S: count,
  A: count,
  U: count,
  N: count,
  C: count,
  recorded: count,
  due: count,
  attendancePct: percent,
  coveragePct: percent,
  provisional: z.boolean(),
  students: count,
});
const metricsCheck = (m: z.infer<typeof MetricsObject>, ctx: z.RefinementCtx) => {
  const r = m.H + m.I + m.S + m.A,
    d = r + m.U,
    pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : null);
  if (
    r !== m.recorded ||
    d !== m.due ||
    m.attendancePct !== pct(m.H, r) ||
    m.coveragePct !== pct(r, d) ||
    m.provisional !== m.U > 0
  )
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Perhitungan rekap tidak konsisten.' });
};
const Metrics = MetricsObject.superRefine(metricsCheck);
const Slot = z.object({
  jp: z.number().int().min(1).max(40),
  status: RecapStatus,
  sessionId: uuid,
  subject: z.string(),
  teacher: z.string(),
});
const Timeline = Slot.extend({
  studentId: uuid,
  name: z.string(),
  nis: z.string(),
  classId: uuid,
  className: z.string(),
  date,
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  teacherId: uuid,
  notes: z.string().max(1000).nullable(),
  revision: count.nullable(),
  recordedAt: z.string().datetime().nullable(),
  sources: z.array(uuid).max(100),
});
export const RecapSchema = z
  .object({
    academicYear: z.string(),
    semester: z.number().int(),
    from: date,
    to: date,
    periodRange: z.object({ from: date, to: date }),
    serverDate: date,
    generatedAt: z.string().datetime(),
    context: z.enum(['own', 'homeroom', 'authorized']),
    scopeLabel: z.string(),
    availableContexts: z
      .array(z.enum(['own', 'homeroom', 'authorized']))
      .min(1)
      .max(3),
    rosterBasis: z.literal('current_roster_and_recorded_history'),
    filters: z.object({
      classId: uuid.nullable(),
      teacherId: uuid.nullable(),
      majorCode: z.string().nullable(),
      subject: z.string().nullable(),
      grade: z.number().nullable(),
      jp: z.number().nullable(),
      jpFrom: z.number().nullable(),
      jpTo: z.number().nullable(),
    }),
    resultFilters: z.object({
      search: z.string(),
      status: RecapStatus.nullable(),
      sort: z.enum(['name', 'attendance', 'alpha']),
      studentId: uuid.nullable(),
    }),
    dueBasis: z.literal('jp_end_wib'),
    view: z.enum(['summary', 'students', 'matrix', 'missing', 'detail', 'audit', 'export']),
    matrixDate: date,
    metrics: Metrics,
    days: z.array(MetricsObject.extend({ date }).superRefine(metricsCheck)).max(93),
    jps: z
      .array(MetricsObject.extend({ jp: z.number().int().positive() }).superRefine(metricsCheck))
      .max(40),
    options: z.object({
      classes: z
        .array(z.object({ id: uuid, name: z.string(), grade: z.number(), majorCode: z.string() }))
        .max(11000),
      subjects: z.array(z.string()).max(10000),
      teachers: z.array(z.object({ id: uuid, name: z.string() })).max(10000),
      jps: z.array(z.number().int().positive()).max(40),
    }),
    coverage: z.object({
      basis: z.literal('persisted_sessions'),
      classesWithoutSessions: count,
      historicalMembership: z.literal('current_mandate_and_retained_records'),
    }),
    classes: z
      .array(z.object({ id: uuid, name: z.string(), metrics: Metrics, hasSessions: z.boolean() }))
      .max(1000),
    students: z
      .array(
        z.object({
          id: uuid,
          name: z.string(),
          nis: z.string(),
          className: z.string(),
          metrics: Metrics,
          slots: z.array(Slot).max(40),
        }),
      )
      .max(50),
    missing: z
      .array(
        z.object({
          sessionId: uuid,
          date,
          classId: uuid,
          className: z.string(),
          teacher: z.string(),
          subject: z.string(),
          jps: z.array(z.number()).max(40),
          students: count,
        }),
      )
      .max(50),
    timeline: z.array(Timeline).max(50000),
    audits: z
      .array(
        z.object({
          id: uuid,
          at: z.string().datetime(),
          actor: z.string(),
          changes: z
            .array(
              z.object({
                jp: z.number(),
                from: z.string().nullable(),
                to: z.string(),
                notesChanged: z.boolean(),
              }),
            )
            .max(4000),
        }),
      )
      .max(50),
    pagination: z.object({
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      total: count,
    }),
  })
  .superRefine((v, ctx) => {
    const fields = ['H', 'I', 'S', 'A', 'U', 'N', 'C', 'recorded', 'due'] as const;
    if (
      v.from > v.to ||
      v.periodRange.from > v.periodRange.to ||
      v.from < v.periodRange.from ||
      v.to > v.periodRange.to ||
      v.timeline.some((t) => t.date < v.from || t.date > v.to || t.startAt >= t.endAt) ||
      new Set(v.timeline.map((t) => `${t.studentId}:${t.date}:${t.jp}`)).size !==
        v.timeline.length ||
      !v.availableContexts.includes(v.context) ||
      new Set(v.availableContexts).size !== v.availableContexts.length ||
      new Set(v.days.map((d) => d.date)).size !== v.days.length ||
      new Set(v.jps.map((j) => j.jp)).size !== v.jps.length ||
      v.days.some((d) => d.date < v.from || d.date > v.to) ||
      fields.some(
        (k) =>
          v.metrics[k] !== v.days.reduce((s, d) => s + d[k], 0) ||
          v.metrics[k] !== v.jps.reduce((s, j) => s + j[k], 0),
      )
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cakupan rekap tidak konsisten.' });
  });
export type AttendanceRecap = z.infer<typeof RecapSchema>;
export type RecapRead =
  | { state: 'ready'; data: AttendanceRecap }
  | { state: 'error' | 'denied'; message: string };
export function readAttendanceRecap(raw: unknown, q: RecapQuery): AttendanceRecap | null {
  const parsed = RecapSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  if (
    (q.academicYear && q.academicYear !== r.academicYear) ||
    (q.semester && q.semester !== r.semester) ||
    (q.from && q.from !== r.from) ||
    (q.to && q.to !== r.to) ||
    ((q.context ?? 'own') !== 'authorized' && (q.context ?? 'own') !== r.context) ||
    r.view !== (q.view ?? 'summary') ||
    r.pagination.page !== (q.page ?? 1) ||
    r.pagination.pageSize !== (q.pageSize ?? 20) ||
    (q.matrixDate && q.matrixDate !== r.matrixDate) ||
    (q.search ?? '') !== r.resultFilters.search ||
    (q.status ?? null) !== r.resultFilters.status ||
    (q.sort ?? 'name') !== r.resultFilters.sort ||
    (q.studentId ?? null) !== r.resultFilters.studentId ||
    (
      ['classId', 'teacherId', 'majorCode', 'subject', 'grade', 'jp', 'jpFrom', 'jpTo'] as const
    ).some((k) => (q[k] ?? null) !== r.filters[k]) ||
    (q.studentId && (r.timeline.some((t) => t.studentId !== q.studentId) || r.metrics.students > 1))
  )
    return null;
  return r;
}
/** Spreadsheet formula injection is escaped even when names/subjects were entered by staff. */
export function attendanceRecapCsv(data: AttendanceRecap) {
  const cell = (v: string | number | null) =>
    '"' +
    String(v ?? '')
      .replace(/^\s*([=+@-])/, "'$1")
      .replaceAll('"', '""') +
    '"';
  const rows = [
    ['Tanggal', 'Kelas', 'NIS', 'Nama', 'JP', 'Mapel', 'Guru', 'Status', 'Keterangan'],
    ...data.timeline.map((r) => [
      r.date,
      r.className,
      r.nis,
      r.name,
      r.jp,
      r.subject,
      r.teacher,
      recapStatusLabels[r.status],
      r.notes,
    ]),
  ];
  return '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
