import { z } from 'zod';

export const AppointmentKindSchema = z.enum(['DEFINITIVE', 'PLT']);
export const AppointmentStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'ENDED',
  'REJECTED',
  'CANCELLED',
  'SUPERSEDED',
]);

export const CreateAppointmentSchema = z.object({
  staffId: z.string().uuid(),
  positionId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  majorId: z.string().uuid().optional(),
  kind: AppointmentKindSchema.default('DEFINITIVE'),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date().optional(),
  reason: z.string().trim().min(3).max(1000).optional(),
  replacesAppointmentId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['effectiveUntil'],
      message: 'Tanggal akhir tidak boleh lebih awal dari tanggal mulai appointment.',
    });
  }
});

export const AppointmentDecisionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
}).strict();

export const AppointmentSuspendSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  expectedReturnDate: z.coerce.date(),
}).strict();

export const AppointmentEndSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  effectiveUntil: z.coerce.date().optional(),
}).strict();

export const AppointmentSupersedeSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
}).strict();

const QueryStringArraySchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return value;
}, z.array(AppointmentStatusSchema).min(1).max(9));

export const AppointmentListQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
  status: QueryStringArraySchema.optional(),
  positionId: z.string().uuid().optional(),
  majorId: z.string().uuid().optional(),
  kind: AppointmentKindSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const AppointmentCandidateQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['GURU', 'TATA_USAHA']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const AppointmentPermissionPreviewQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
  majorId: z.string().uuid().optional(),
}).strict();

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;
export type AppointmentDecisionDto = z.infer<typeof AppointmentDecisionSchema>;
export type AppointmentSuspendDto = z.infer<typeof AppointmentSuspendSchema>;
export type AppointmentEndDto = z.infer<typeof AppointmentEndSchema>;
export type AppointmentSupersedeDto = z.infer<typeof AppointmentSupersedeSchema>;
export type AppointmentListQueryDto = z.infer<typeof AppointmentListQuerySchema>;
export type AppointmentCandidateQueryDto = z.infer<typeof AppointmentCandidateQuerySchema>;
export type AppointmentPermissionPreviewQueryDto = z.infer<typeof AppointmentPermissionPreviewQuerySchema>;
