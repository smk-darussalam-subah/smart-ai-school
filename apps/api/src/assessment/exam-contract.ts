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
  room: z.string().trim().min(1).max(80).optional(),
  opensAt: iso,
  latestEntryAt: iso,
  closesAt: iso,
  proctorIds: z.array(uuid).min(1).max(12).optional(),
  agendaId: uuid.optional(),
  roomAssignments: z.array(z.object({
    slotId: uuid, studentIds: z.array(uuid).min(1).max(500),
  }).strict()).min(1).max(30).optional(),
  makeupOfSessionId: uuid.optional(),
  participantIds: z.array(uuid).min(1).max(500).optional(),
}).strict().superRefine((value, ctx) => {
  const open = Date.parse(value.opensAt), entry = Date.parse(value.latestEntryAt), close = Date.parse(value.closesAt);
  if (open >= close || open > entry || entry > close || close - open > 12 * 60 * 60_000)
    ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'Urutkan waktu buka, batas masuk dan tutup pada hari ujian.' });
  const assignmentIds = value.roomAssignments?.flatMap((item) => item.studentIds) ?? [];
  if (value.agendaId
    ? !value.roomAssignments || value.room || value.proctorIds || assignmentIds.length > 500 ||
      new Set(assignmentIds).size !== assignmentIds.length ||
      new Set(value.roomAssignments.map((item) => item.slotId)).size !== value.roomAssignments.length
    : Boolean(value.roomAssignments) || !value.room || !value.proctorIds) {
    ctx.addIssue({ code: 'custom', message: 'Pilih penugasan ruang agenda atau ruang dan proktor sesi.' });
  }
  if (Boolean(value.makeupOfSessionId) !== Boolean(value.participantIds))
    ctx.addIssue({ code: 'custom', path: ['participantIds'], message: 'Pilih peserta dan sesi asal khusus ujian susulan.' });
  if (value.proctorIds && new Set(value.proctorIds).size !== value.proctorIds.length ||
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

const hourWindow = <T extends { opensAt: string; closesAt: string }>(value: T) =>
  Date.parse(value.opensAt) < Date.parse(value.closesAt);

export const ExamAgendaSchema = z.object({
  title: z.string().trim().min(2).max(120),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  semester: z.union([z.literal(1), z.literal(2)]),
  opensAt: iso, closesAt: iso,
}).strict().refine(hourWindow, 'Jam tutup agenda harus setelah jam buka.');

export const ExamSlotSchema = z.object({
  agendaId: uuid, room: z.string().trim().min(1).max(80),
  opensAt: iso, closesAt: iso, capacity: z.number().int().min(1).max(500), supervisorId: uuid,
}).strict().refine(hourWindow, 'Jam tutup ruang harus setelah jam buka.');

export const CohortProctorSchema = z.object({
  grade: z.union([z.literal(10), z.literal(11), z.literal(12)]),
  userId: uuid, canTransfer: z.boolean().default(false),
}).strict();
export const ExamSupervisorSchema = z.object({ supervisorId: uuid }).strict();
export const RoomIncidentSchema = z.object({ intentId: uuid, reason: z.string().trim().min(8).max(500) }).strict();
export const RoomResolutionSchema = z.object({
  decision: z.enum(['resume', 'makeup']), reason: z.string().trim().min(8).max(500),
}).strict();

export type ExamAgendaInput = z.infer<typeof ExamAgendaSchema>;
export type ExamSlotInput = z.infer<typeof ExamSlotSchema>;
export type CohortProctorInput = z.infer<typeof CohortProctorSchema>;

export const TransferDeviceSchema = z.object({
  studentId: uuid, slotId: uuid, intentId: uuid, expectedVersion: z.number().int().min(1),
  reason: z.string().trim().min(8).max(500),
  newDeviceId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
}).strict();
export type TransferDeviceInput = z.infer<typeof TransferDeviceSchema>;
