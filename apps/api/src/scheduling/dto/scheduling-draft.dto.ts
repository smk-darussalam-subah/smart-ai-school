import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { isIsoCalendarDate } from '../../common/helpers/iso-calendar-date';

export const DateOnly = z.string().refine(isIsoCalendarDate, 'Tanggal YYYY-MM-DD tidak valid');
const integer = z.number().int().min(0).max(2147483647);
export const DraftSlotSchema = z.object({
  assignmentId: z.string().uuid(),
  sessionIndex: integer,
  dayOfWeek: z.number().int().min(1).max(7),
  jpStart: integer.min(1),
  jpEnd: integer.min(1),
  roomLabel: z.string().trim().min(1).max(50).nullable().default(null),
  concurrencyGroupId: z.string().uuid().nullable().default(null),
}).strict().refine((slot) => slot.jpEnd >= slot.jpStart, 'JP akhir harus >= JP awal');
export type DraftSlot = z.infer<typeof DraftSlotSchema>;
export const CreateDraftSchema = z.object({
  academicYearId: z.string().uuid(),
  semesterNumber: z.number().int().min(1).max(2),
  name: z.string().trim().min(1).max(120),
  effectiveFrom: DateOnly,
  effectiveUntil: DateOnly,
  classIds: z.array(z.string().uuid()).min(1).max(1024)
    .refine((ids) => new Set(ids).size === ids.length, 'Kelas duplikat')
    .transform((ids) => [...ids].sort()),
}).strict().refine((dto) => dto.effectiveUntil >= dto.effectiveFrom, 'Rentang tanggal terbalik');
export const RenameDraftSchema = z.object({
  expectedRevision: integer,
  name: z.string().trim().min(1).max(120),
}).strict();
export const ReplaceDraftSchema = z.object({
  expectedRevision: integer,
  slots: z.array(DraftSlotSchema).max(10000),
}).strict();
export const ArchiveDraftSchema = z.object({ expectedRevision: integer }).strict();
export const PrecheckDraftSchema = z.object({ slots: z.array(DraftSlotSchema).max(10000).optional() }).strict();
export const ListDraftSchema = z.object({
  academicYearId: z.string().uuid(),
  semesterNumber: z.coerce.number().int().min(1).max(2),
  status: z.enum(['DRAFT', 'ARCHIVED']).optional(),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const IdempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_.:-]+$/);

/** Used at service entry as well as HTTP boundaries to keep non-HTTP callers strict. */
export function parseDraft<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new BadRequestException(result.error.errors);
  return result.data;
}
