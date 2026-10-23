import { z } from 'zod';
const date = z.string().date();
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
  .object({ studentId: z.string().uuid().optional(), from: date, to: date })
  .strict()
  .refine(
    (x) => x.to >= x.from && (Date.parse(x.to) - Date.parse(x.from)) / 86400000 <= 61,
    'Rentang maksimal 62 hari.',
  );
export type SessionAttendanceSave = z.infer<typeof SessionAttendanceSaveSchema>;
export type SessionAttendanceRosterQuery = z.infer<typeof SessionAttendanceRosterSchema>;
export type LearnerSessionAttendanceQuery = z.infer<typeof LearnerSessionAttendanceSchema>;
