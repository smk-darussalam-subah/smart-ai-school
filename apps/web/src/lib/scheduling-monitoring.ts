import { z } from 'zod';
const nullableCount = z.number().int().nonnegative().nullable();
const state = z.enum(['ready', 'denied', 'unavailable']);
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
export const MonitoringRowSchema = z.object({
  assignmentId: z.string().min(1),
  teacherId: z.string().min(1),
  classId: z.string().min(1),
  guru: z.string(),
  kelas: z.string(),
  mapel: z.string(),
  jp: z.number().nonnegative(),
  scheduledJp: nullableCount,
  avg: z.number().nullable(),
  gradeCount: z.number().int().nonnegative(),
  passedGradeCount: nullableCount,
  tuntasPct: z.number().min(0).max(100).nullable(),
  kktp: z.number().nullable(),
  kktpProvenance: z.string(),
  hadirPct: z.number().min(0).max(100).nullable(),
  attendance: z.object({
    unit: z.literal('daily_class_records'),
    present: nullableCount,
    recorded: nullableCount,
    date: dateOnly,
  }),
  jurnalCount: nullableCount,
  journalScope: z.literal('teacher_class'),
  sessions: z.object({
    due: nullableCount,
    completed: nullableCount,
    active: nullableCount,
    missed: nullableCount,
    cancelled: nullableCount,
    superseded: nullableCount,
    unit: z.literal('materialized_due_sessions'),
  }),
  lms: z.object({
    completed: nullableCount,
    recorded: nullableCount,
    unit: z.literal('module_progress_records'),
  }),
  status: z.enum(['on', 'warn', 'risk', 'unknown']),
});
export const MonitoringSchema = z
  .object({
    state,
    academicYear: z.string(),
    semester: z.number().int(),
    date: dateOnly,
    generatedAt: z.string().datetime(),
    filters: z.object({
      teacherId: z.string().nullable(),
      subject: z.string().nullable(),
      classId: z.string().nullable(),
      majorCode: z.string().nullable(),
    }),
    reason: z.string().nullable(),
    data: z.array(MonitoringRowSchema),
    domains: z.object({
      attendance: state.optional(),
      journal: state.optional(),
      schedules: state.optional(),
      sessions: state.optional(),
      lms: state.optional(),
    }),
    window: z.object({ from: dateOnly, to: dateOnly, semesterEnd: dateOnly }).nullable(),
  })
  .superRefine((value, context) => {
    if (new Set(value.data.map((row) => row.assignmentId)).size !== value.data.length)
      context.addIssue({ code: 'custom', message: 'Penugasan berulang.' });
    if (value.state !== 'ready' && value.data.length)
      context.addIssue({
        code: 'custom',
        message: 'Data tidak boleh muncul sebelum pembacaan siap.',
      });
    if (
      value.window &&
      (value.window.from > value.window.to || value.window.to > value.window.semesterEnd)
    )
      context.addIssue({ code: 'custom', message: 'Periode rekap tidak valid.' });
    value.data.forEach((row, index) => {
      if (
        (value.filters.teacherId && row.teacherId !== value.filters.teacherId) ||
        (value.filters.classId && row.classId !== value.filters.classId) ||
        (value.filters.subject && row.mapel !== value.filters.subject)
      )
        context.addIssue({
          code: 'custom',
          path: ['data', index],
          message: 'Penugasan tidak sesuai pilihan.',
        });
      const pairs: [number | null, number | null][] = [
        [row.passedGradeCount, row.gradeCount],
        [row.sessions.completed, row.sessions.due],
        [row.attendance.present, row.attendance.recorded],
        [row.lms.completed, row.lms.recorded],
      ];
      if (
        pairs.some(
          ([numerator, denominator]) =>
            numerator !== null && denominator !== null && numerator > denominator,
        )
      )
        context.addIssue({
          code: 'custom',
          path: ['data', index],
          message: 'Jumlah melebihi catatan pembanding.',
        });
      if (
        row.tuntasPct !== null &&
        (row.passedGradeCount === null ||
          row.gradeCount === 0 ||
          row.tuntasPct !== Math.round((row.passedGradeCount / row.gradeCount) * 100))
      )
        context.addIssue({
          code: 'custom',
          path: ['data', index, 'tuntasPct'],
          message: 'Persentase nilai tidak sesuai catatan.',
        });
    });
  });
export type MonitoringRow = z.infer<typeof MonitoringRowSchema>;
export type SchedulingMonitoring = z.infer<typeof MonitoringSchema>;
export function monitoringTeachers(rows: MonitoringRow[]) {
  const groups = new Map<string, { id: string; name: string; rows: MonitoringRow[] }>();
  for (const row of rows) {
    const teacher = groups.get(row.teacherId) ?? { id: row.teacherId, name: row.guru, rows: [] };
    teacher.rows.push(row);
    groups.set(row.teacherId, teacher);
  }
  return [...groups.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
export function monitoringSummary(rows: MonitoringRow[]) {
  // Journals are teacher/class; attendance is daily class. Neither may be summed per assignment.
  const journals = [
    ...new Map(rows.map((row) => [row.teacherId + '|' + row.classId, row.jurnalCount])).values(),
  ];
  const attendance = [...new Map(rows.map((row) => [row.classId, row.attendance])).values()];
  const total = (values: (number | null)[]) =>
    values.some((value) => value === null)
      ? null
      : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const due = total(rows.map((row) => row.sessions.due)),
    completed = total(rows.map((row) => row.sessions.completed));
  const gradeCount = rows.reduce((sum, row) => sum + row.gradeCount, 0),
    passed = total(rows.map((row) => row.passedGradeCount));
  return {
    assignments: rows.length,
    classes: new Set(rows.map((row) => row.classId)).size,
    journal: total(journals),
    recorded: total(attendance.map((row) => row.recorded)),
    present: total(attendance.map((row) => row.present)),
    due,
    completed,
    sessionPct: due && completed !== null ? Math.round((completed / due) * 100) : null,
    gradeCount,
    passed,
    gradePct: gradeCount && passed !== null ? Math.round((passed / gradeCount) * 100) : null,
  };
}
