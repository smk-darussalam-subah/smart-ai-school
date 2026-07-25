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
}).strict();

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

export const AppointmentListQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
  status: AppointmentStatusSchema.optional(),
}).strict();

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;
export type AppointmentDecisionDto = z.infer<typeof AppointmentDecisionSchema>;
export type AppointmentSuspendDto = z.infer<typeof AppointmentSuspendSchema>;
export type AppointmentEndDto = z.infer<typeof AppointmentEndSchema>;
export type AppointmentSupersedeDto = z.infer<typeof AppointmentSupersedeSchema>;
export type AppointmentListQueryDto = z.infer<typeof AppointmentListQuerySchema>;
