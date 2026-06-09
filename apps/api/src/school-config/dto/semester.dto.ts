import { z } from 'zod';

export const CreateSemesterSchema = z.object({
  academicYearId: z.string().uuid(),
  number: z.number().int().min(1).max(2),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.boolean().default(false),
}).strict();

export type CreateSemesterDto = z.infer<typeof CreateSemesterSchema>;

export const UpdateSemesterSchema = CreateSemesterSchema.partial();

export type UpdateSemesterDto = z.infer<typeof UpdateSemesterSchema>;
