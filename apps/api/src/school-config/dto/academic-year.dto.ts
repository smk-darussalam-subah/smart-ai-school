import { z } from 'zod';

// H2: Backend date validation — endDate must be after startDate.
// Base object schema (no refine) — used as building block for both Create and Update.
const BaseAcademicYearSchema = z.object({
  code: z.string().regex(/^\d{4}\/\d{4}$/, 'Format harus YYYY/YYYY'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.boolean().default(false),
}).strict();

// Create: all fields required (except isActive which has default) + date ordering enforced.
export const CreateAcademicYearSchema = BaseAcademicYearSchema.refine(
  (data) => data.endDate > data.startDate,
  { message: 'Tanggal selesai harus setelah tanggal mulai.', path: ['endDate'] },
);

export type CreateAcademicYearDto = z.infer<typeof CreateAcademicYearSchema>;

// Update: partial (all fields optional) + conditional date ordering (only when both present).
export const UpdateAcademicYearSchema = BaseAcademicYearSchema.partial().refine(
  (data) => !data.startDate || !data.endDate || data.endDate > data.startDate,
  { message: 'Tanggal selesai harus setelah tanggal mulai.', path: ['endDate'] },
);

export type UpdateAcademicYearDto = z.infer<typeof UpdateAcademicYearSchema>;
