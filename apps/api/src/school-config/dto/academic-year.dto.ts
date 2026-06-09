import { z } from 'zod';

export const CreateAcademicYearSchema = z.object({
  code: z.string().regex(/^\d{4}\/\d{4}$/, 'Format harus YYYY/YYYY'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.boolean().default(false),
}).strict();

export type CreateAcademicYearDto = z.infer<typeof CreateAcademicYearSchema>;

export const UpdateAcademicYearSchema = CreateAcademicYearSchema.partial();

export type UpdateAcademicYearDto = z.infer<typeof UpdateAcademicYearSchema>;
