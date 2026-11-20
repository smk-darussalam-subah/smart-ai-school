import { z } from 'zod';

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
export const ExamListSchema = z.object({
  day: z.string().date(),
  limit: z.coerce.number().int().min(1).max(60).default(30),
  cursor: uuid.optional(),
}).strict();

export const ExamPlanSchema = z.object({
  packageId: uuid,
  room: z.string().trim().min(1).max(80),
  opensAt: iso,
  latestEntryAt: iso,
  closesAt: iso,
  proctorIds: z.array(uuid).min(1).max(12),
  makeupOfSessionId: uuid.optional(),
  participantIds: z.array(uuid).min(1).max(500).optional(),
}).strict().superRefine((value, ctx) => {
  const open = Date.parse(value.opensAt), entry = Date.parse(value.latestEntryAt), close = Date.parse(value.closesAt);
  if (open > entry || entry >= close || close - open > 12 * 60 * 60_000)
    ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'Urutkan waktu buka, batas masuk dan tutup pada hari ujian.' });
  if (Boolean(value.makeupOfSessionId) !== Boolean(value.participantIds))
    ctx.addIssue({ code: 'custom', path: ['participantIds'], message: 'Pilih peserta dan sesi asal khusus ujian susulan.' });
  if (new Set(value.proctorIds).size !== value.proctorIds.length ||
      (value.participantIds && new Set(value.participantIds).size !== value.participantIds.length))
    ctx.addIssue({ code: 'custom', message: 'Proktor dan peserta harus unik.' });
});

export const ExamIncidentSchema = z.object({
  kind: z.enum(['device', 'room', 'school']),
  reason: z.string().trim().min(8).max(500),
}).strict();
export const ExamCancelSchema = z.object({ reason: z.string().trim().min(8).max(500) }).strict();
export const ExamDecisionSchema = z.object({
  decision: z.enum(['resume', 'extra_time', 'makeup', 'transfer']),
  reason: z.string().trim().min(8).max(500),
  studentIds: z.array(uuid).min(1).max(500).refine((ids) => new Set(ids).size === ids.length),
  extraMinutes: z.number().int().min(1).max(120).optional(),
  newDeviceId: uuid.optional(),
}).strict().refine(
  (value) => (value.decision === 'extra_time') === Boolean(value.extraMinutes) &&
    (value.decision === 'transfer') === Boolean(value.newDeviceId) &&
    (value.decision !== 'transfer' || value.studentIds.length === 1),
  { message: 'Tambahan waktu dan perpindahan perangkat harus memakai peserta yang sesuai.' },
);

export type ExamList = z.infer<typeof ExamListSchema>;
export type ExamPlan = z.infer<typeof ExamPlanSchema>;
export type ExamIncidentInput = z.infer<typeof ExamIncidentSchema>;
export type ExamDecision = z.infer<typeof ExamDecisionSchema>;
