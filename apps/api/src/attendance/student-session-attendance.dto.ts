import { z } from 'zod';
const date = z.string().date();
export const SessionAttendanceOverviewSchema = z
  .object({
    academicYear: z
      .string()
      .regex(/^\d{4}\/\d{4}$/)
      .optional(),
    semester: z.coerce.number().int().min(1).max(2).optional(),
    from: date.optional(),
    to: date.optional(),
    scope: z.literal('own').optional(),
    teacherId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
    majorCode: z.string().trim().min(1).max(20).optional(),
    subject: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .refine((q) => Boolean(q.academicYear) === Boolean(q.semester), 'Pilih periode lengkap.')
  .refine((q) => Boolean(q.from) === Boolean(q.to), 'Pilih kedua batas tanggal.')
  .refine(
    (q) =>
      !q.from ||
      !q.to ||
      (q.from <= q.to && Date.parse(q.to) - Date.parse(q.from) <= 92 * 86400000),
    'Rentang maksimal 93 hari.',
  );
export type SessionAttendanceOverviewQuery = z.infer<typeof SessionAttendanceOverviewSchema>;
export const SessionAttendanceReadSchema = z
  .object({ scope: z.literal('own').optional() })
  .strict();
export type SessionAttendanceReadQuery = z.infer<typeof SessionAttendanceReadSchema>;
export const SessionAttendanceRosterSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    scheduleId: z.string().uuid().optional(),
    date: date.optional(),
  })
  .strict()
  .refine(
    (x) => Boolean(x.sessionId) || Boolean(x.scheduleId && x.date),
    'Pilih sesi atau jadwal dan tanggal.',
  );
export const SessionAttendanceSaveSchema = z
  .object({
    records: z
      .array(
        z
          .object({
            studentId: z.string().uuid(),
            jp: z.number().int().min(1).max(40),
            status: z.enum(['hadir', 'izin', 'sakit', 'alpha']),
            notes: z.string().trim().max(1000).nullable().optional(),
            revision: z.number().int().min(0),
          })
          .strict(),
      )
      .min(1)
      .max(4000),
  })
  .strict()
  .superRefine((x, ctx) => {
    const keys = new Set<string>();
    for (const r of x.records) {
      const key = r.studentId + ':' + r.jp;
      if (keys.has(key))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Siswa/JP duplikat' });
      keys.add(key);
    }
  });
export const LearnerSessionAttendanceSchema = z
  .object({
    studentId: z.string().uuid().optional(),
    from: date,
    to: date,
    academicYear: z
      .string()
      .regex(/^\d{4}\/\d{4}$/)
      .optional(),
    semester: z.coerce.number().int().min(1).max(2).optional(),
  })
  .strict()
  .refine(
    (x) => Boolean(x.academicYear) === Boolean(x.semester),
    'Pilih tahun ajaran dan semester bersama.',
  )
  .refine(
    (x) => x.to >= x.from && (Date.parse(x.to) - Date.parse(x.from)) / 86400000 <= 61,
    'Rentang maksimal 62 hari.',
  );
export type SessionAttendanceSave = z.infer<typeof SessionAttendanceSaveSchema>;
export type SessionAttendanceRosterQuery = z.infer<typeof SessionAttendanceRosterSchema>;
export type LearnerSessionAttendanceQuery = z.infer<typeof LearnerSessionAttendanceSchema>;
