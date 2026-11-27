import { z } from 'zod';

const uuid = z.string().uuid();
const datetime = z.string().datetime({ offset: true });
const distinct = <T>(values: T[]) => new Set(values).size === values.length;
const optionalDate = datetime.nullable().optional();

export const ProgramKindSchema = z.object({
  name: z.string().trim().min(3).max(80),
  allowsGrade: z.boolean().default(false),
}).strict();

export const ProgramDraftSchema = z.object({
  requestId: uuid,
  title: z.string().trim().min(3).max(160),
  packageId: uuid,
  kindId: uuid,
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  semester: z.union([z.literal(1), z.literal(2)]),
  durationMinutes: z.number().int().min(1).max(360),
  randomizeOrder: z.boolean().default(false),
  gradeTarget: z.enum(['uh', 'uts', 'uas']).nullable().default(null),
  roster: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('all') }).strict(),
    z.object({ mode: z.literal('classes'), classIds: z.array(uuid).min(1).max(100).refine(distinct) }).strict(),
    z.object({ mode: z.literal('grades'), grades: z.array(z.union([z.literal(10), z.literal(11), z.literal(12)]))
      .min(1).max(3).refine(distinct) }).strict(),
  ]),
}).strict();

export const ScheduleRequestSchema = z.object({
  revision: z.number().int().min(0),
  packageId: uuid.nullable().optional(),
  examDate: z.string().date().nullable().optional(),
  room: z.string().trim().min(1).max(80).nullable().optional(),
  opensAt: optionalDate,
  latestEntryAt: optionalDate,
  closesAt: optionalDate,
  proctorIds: z.array(uuid).max(12).refine(distinct).default([]),
}).strict().superRefine((input, ctx) => {
  const times = [input.opensAt, input.latestEntryAt, input.closesAt].filter((value): value is string => Boolean(value));
  const ordered = times.map(Date.parse);
  if (ordered.some((time, index) => index > 0 && time < ordered[index - 1]!))
    ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'Urutkan jam buka, batas masuk, dan tutup.' });
  if (input.opensAt && input.closesAt && Date.parse(input.opensAt) >= Date.parse(input.closesAt))
    ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'Jam tutup harus setelah jam buka.' });
  if (input.examDate && times.some((time) =>
    new Date(Date.parse(time) + 7 * 3_600_000).toISOString().slice(0, 10) !== input.examDate))
    ctx.addIssue({ code: 'custom', path: ['examDate'], message: 'Gunakan satu tanggal WIB untuk seluruh jadwal.' });
});

export const PublishScheduleRequestSchema = z.object({ revision: z.number().int().min(1) }).strict();
export const ScheduleRequestPackagesQuerySchema = z.object({ after: uuid.optional() }).strict();
export const ProgramProctorSearchSchema = z.object({ q: z.string().trim().max(80).default('') }).strict();
export const ShareProgramPackageSchema = z.object({ shared: z.boolean() }).strict();
export const ProgramProfileSchema = z.object({
  instrument: z.string().trim().min(3).max(180),
  instrumentVersion: z.string().trim().min(1).max(40),
  observations: z.array(z.object({
    dimension: z.string().trim().min(2).max(100),
    kind: z.enum(['interest', 'observed_strength']),
    interpretation: z.string().trim().min(3).max(500),
    score: z.object({ value: z.number().finite().min(0), max: z.number().finite().positive().max(10_000) })
      .strict().refine(({ value, max }) => value <= max).optional(),
  }).strict()).min(1).max(16).refine((rows) => distinct(rows.map((row) => row.kind + ':' + row.dimension.toLowerCase()))),
  summary: z.string().trim().min(3).max(1600),
  nextSteps: z.string().trim().min(3).max(1600),
  publish: z.boolean().default(false),
}).strict();
export type ProgramDraft = z.infer<typeof ProgramDraftSchema>;
export type ProgramKind = z.infer<typeof ProgramKindSchema>;
export type ScheduleRequest = z.infer<typeof ScheduleRequestSchema>;
export type ProgramProfile = z.infer<typeof ProgramProfileSchema>;
