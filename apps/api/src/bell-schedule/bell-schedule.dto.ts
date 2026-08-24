import { z } from 'zod';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gunakan format YYYY-MM-DD');

export const BellScopeSchema = z.enum(['SCHOOL', 'RUANG_GURU', 'RUANG_TU']);
export const BellKindSchema = z.enum(['NORMAL', 'RAMADAN', 'EXAM', 'SPECIAL']);
export const BellSegmentTypeSchema = z.enum(['INSTRUCTION', 'BREAK', 'CEREMONY', 'OTHER']);

export const BellSegmentSchema = z.object({
  jpNumber: z.number().int().min(1).max(16).nullable(),
  label: z.string().trim().min(1).max(80),
  type: BellSegmentTypeSchema,
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  sortOrder: z.number().int().min(1).max(64),
}).strict().superRefine((segment, ctx) => {
  if (segment.endMinute <= segment.startMinute) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endMinute'], message: 'endMinute harus setelah startMinute' });
  }
  if (segment.type === 'INSTRUCTION' && segment.jpNumber === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['jpNumber'], message: 'Segmen pembelajaran wajib memiliki nomor JP' });
  }
  if (segment.type !== 'INSTRUCTION' && segment.jpNumber !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['jpNumber'], message: 'Hanya segmen pembelajaran yang boleh memiliki nomor JP' });
  }
});

const ProfileFields = {
  code: z.string().trim().min(2).max(60).regex(/^[A-Z0-9][A-Z0-9_-]*$/),
  name: z.string().trim().min(2).max(120),
  scope: BellScopeSchema.default('SCHOOL'),
  kind: BellKindSchema.default('NORMAL'),
  effectiveFrom: DateOnlySchema,
  effectiveUntil: DateOnlySchema.nullable().optional(),
  provenance: z.string().trim().min(3).max(255),
  segments: z.array(BellSegmentSchema).min(1).max(64),
};

export const CreateBellProfileSchema = z.object(ProfileFields).strict();
export type CreateBellProfileDto = z.infer<typeof CreateBellProfileSchema>;

export const UpdateBellProfileSchema = z.object({
  name: ProfileFields.name.optional(),
  kind: BellKindSchema.optional(),
  effectiveFrom: DateOnlySchema.optional(),
  effectiveUntil: DateOnlySchema.nullable().optional(),
  provenance: ProfileFields.provenance.optional(),
  segments: ProfileFields.segments.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Minimal satu perubahan wajib diisi');
export type UpdateBellProfileDto = z.infer<typeof UpdateBellProfileSchema>;

export const ResolveBellProfileQuerySchema = z.object({
  date: DateOnlySchema,
  scope: BellScopeSchema.default('SCHOOL'),
}).strict();
export type ResolveBellProfileQuery = z.infer<typeof ResolveBellProfileQuerySchema>;

export const ListBellProfileQuerySchema = z.object({
  scope: BellScopeSchema.optional(),
  includeRevoked: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
}).strict();
