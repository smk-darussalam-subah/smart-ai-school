import { z } from 'zod';

export const learningStatus = {
  SCHEDULED: 'Terjadwal',
  REASSIGNED: 'Guru pengganti',
  STARTED: 'Berlangsung',
  COMPLETED: 'Selesai',
  MISSED: 'Terlewat',
  CANCELLED: 'Dibatalkan',
  SUPERSEDED: 'Jadwal diganti',
} as const;
export type LearningStatus = keyof typeof learningStatus;
export function learningRecordStatus(status: string) {
  return (
    (
      {
        draft: 'Draf',
        submitted: 'Diajukan',
        curriculum_reviewed: 'Diperiksa kurikulum',
        approved: 'Disetujui',
        revision: 'Perlu revisi',
        active: 'Aktif',
        completed: 'Selesai',
        cancelled: 'Dibatalkan',
      } as Record<string, string>
    )[status] ?? 'Status belum dikenali'
  );
}
const timestamp = z.string().datetime({ offset: true });
export const LearningSessionSchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid(),
  classId: z.string().uuid(),
  teachingAssignmentId: z.string().uuid(),
  assignedTeacherId: z.string().uuid(),
  assignedTeacherName: z.string(),
  classNameSnapshot: z.string(),
  subjectSnapshot: z.string(),
  roomSnapshot: z.string().nullable(),
  serviceDate: timestamp,
  scheduledStartAt: timestamp,
  scheduledEndAt: timestamp,
  status: z.enum([
    'SCHEDULED',
    'REASSIGNED',
    'STARTED',
    'COMPLETED',
    'MISSED',
    'CANCELLED',
    'SUPERSEDED',
  ]),
  startedAt: timestamp.nullable(),
  completedAt: timestamp.nullable(),
  missedAt: timestamp.nullable(),
  cancelledAt: timestamp.nullable(),
  reassignedAt: timestamp.nullable(),
  cancellationReason: z.string().nullable(),
  reassignmentReason: z.string().nullable(),
  canOperate: z.boolean(),
  operationBlockedReason: z.string().nullable(),
  academicYear: z.object({ code: z.string() }),
  semester: z.object({ number: z.number().int() }),
  schedule: z.object({ jpStart: z.number().int().positive(), jpEnd: z.number().int().positive() }),
});
export type LearningSession = z.infer<typeof LearningSessionSchema>;
export type LearningScope = 'own' | 'operations';
export type LearningRead<T> =
  | { state: 'ready'; data: T }
  | { state: 'error' | 'denied'; message: string };
export const RecapQuerySchema = z
  .object({
    academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
    semester: z.number().int().min(1).max(2),
    from: z.string().date(),
    until: z.string().date(),
    scope: z.enum(['own', 'operations']),
  })
  .strict()
  .refine(
    (x) => x.from <= x.until && (Date.parse(x.until) - Date.parse(x.from)) / 86400000 < 31,
    'Pilih rentang tanggal paling lama 31 hari.',
  );
export type RecapQuery = z.infer<typeof RecapQuerySchema>;
export const SupportingModuleSchema = z.object({
  id: z.string().uuid(),
  teacherId: z.string().uuid(),
  classId: z.string().uuid().nullable(),
  subject: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  status: z.string(),
  academicYear: z.string(),
  semester: z.number(),
  body: z
    .object({
      cp: z.string().optional(),
      tp: z.array(z.string()).optional(),
      kegiatan: z
        .array(
          z.object({
            pertemuan: z.string().optional(),
            pendahuluan: z.string().optional(),
            inti: z.string().optional(),
            penutup: z.string().optional(),
          }),
        )
        .optional(),
    })
    .nullable()
    .optional(),
});
export const SupportingJournalSchema = z.object({
  id: z.string().uuid(),
  teacherId: z.string().uuid(),
  classId: z.string().uuid(),
  date: timestamp,
  title: z.string(),
  description: z.string().nullable(),
});
export const SupportingAttendanceSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().uuid(),
  classId: z.string().uuid(),
  date: timestamp,
  jp: z.number().int().positive(),
  startAt: timestamp,
  endAt: timestamp,
  status: z.enum(['hadir', 'izin', 'sakit', 'alpha']).nullable(),
  notes: z.string().nullable(),
  student: z.object({ id: z.string().uuid(), user: z.object({ fullName: z.string() }) }),
});
export const SupportingAssessmentSchema = z.object({
  id: z.string().uuid(),
  teacherId: z.string().uuid(),
  classId: z.string().uuid().nullable(),
  teachingAssignmentId: z.string().uuid().nullable(),
  title: z.string(),
  status: z.string(),
  academicYear: z.string(),
  semester: z.number(),
});
export interface LearningContext {
  capabilities: { journal: boolean; attendance: boolean; module: boolean; assessment: boolean };
  modules: LearningRead<z.infer<typeof SupportingModuleSchema>[]>;
  journals: LearningRead<z.infer<typeof SupportingJournalSchema>[]>;
  attendance: LearningRead<z.infer<typeof SupportingAttendanceSchema>[]>;
  assessments: LearningRead<z.infer<typeof SupportingAssessmentSchema>[]>;
}
export function groupLearningSessions(rows: readonly LearningSession[]) {
  const groups = new Map<string, { id: string; name: string; sessions: LearningSession[] }>();
  for (const row of rows) {
    const group = groups.get(row.assignedTeacherId) ?? {
      id: row.assignedTeacherId,
      name: row.assignedTeacherName,
      sessions: [],
    };
    group.sessions.push(row);
    groups.set(group.id, group);
  }
  return [...groups.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'id') || a.id.localeCompare(b.id),
  );
}
export function learningCounts(rows: readonly LearningSession[]) {
  return {
    total: rows.length,
    completed: rows.filter((x) => x.status === 'COMPLETED').length,
    started: rows.filter((x) => x.status === 'STARTED').length,
    planned: rows.filter((x) => x.status === 'SCHEDULED' || x.status === 'REASSIGNED').length,
  };
}
export function learningTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
export function learningDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}
