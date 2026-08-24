import { z } from 'zod';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gunakan format YYYY-MM-DD');
const IdempotencySchema = z.string().uuid();

export const MaterializeClassSessionsSchema = z.object({
  date: DateOnlySchema,
}).strict();

export const ClassSessionTransitionSchema = z.object({
  idempotencyKey: IdempotencySchema,
}).strict();
export type ClassSessionTransitionDto = z.infer<typeof ClassSessionTransitionSchema>;

export const ClassSessionReasonActionSchema = z.object({
  idempotencyKey: IdempotencySchema,
  reason: z.string().trim().min(5).max(500),
}).strict();
export type ClassSessionReasonActionDto = z.infer<typeof ClassSessionReasonActionSchema>;

export const ReassignClassSessionSchema = ClassSessionReasonActionSchema.extend({
  teacherId: z.string().uuid(),
}).strict();
export type ReassignClassSessionDto = z.infer<typeof ReassignClassSessionSchema>;

export const RecoverClassSessionSchema = ClassSessionReasonActionSchema.extend({
  targetStatus: z.literal('SCHEDULED'),
}).strict();
export type RecoverClassSessionDto = z.infer<typeof RecoverClassSessionSchema>;

export const ListClassSessionQuerySchema = z.object({
  date: DateOnlySchema.optional(),
  from: DateOnlySchema.optional(),
  until: DateOnlySchema.optional(),
  classId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  status: z.enum(['SCHEDULED', 'REASSIGNED', 'STARTED', 'COMPLETED', 'MISSED', 'CANCELLED', 'SUPERSEDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict().superRefine((value, ctx) => {
  if (value.from && value.until && value.until < value.from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['until'], message: 'until tidak boleh sebelum from' });
  }
  if (value.date && (value.from || value.until)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'Gunakan date atau rentang from/until, bukan keduanya' });
  }
});
export type ListClassSessionQuery = z.infer<typeof ListClassSessionQuerySchema>;
