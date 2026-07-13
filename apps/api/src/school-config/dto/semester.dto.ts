import { z } from 'zod';

// H2: Backend date validation — endDate must be after startDate.
const BaseSemesterSchema = z.object({
  academicYearId: z.string().uuid(),
  number: z.number().int().min(1).max(2),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.boolean().default(false),
}).strict();

// Create: all fields required + date ordering enforced.
export const CreateSemesterSchema = BaseSemesterSchema.refine(
  (data) => data.endDate > data.startDate,
  { message: 'Tanggal selesai harus setelah tanggal mulai.', path: ['endDate'] },
);

export type CreateSemesterDto = z.infer<typeof CreateSemesterSchema>;

// Update: partial + conditional date ordering (only when both present).
export const UpdateSemesterSchema = BaseSemesterSchema.partial().refine(
  (data) => !data.startDate || !data.endDate || data.endDate > data.startDate,
  { message: 'Tanggal selesai harus setelah tanggal mulai.', path: ['endDate'] },
);

export type UpdateSemesterDto = z.infer<typeof UpdateSemesterSchema>;
