import { z } from 'zod';

export const CreateAssignmentSchema = z
  .object({
    teacherId: z.string().uuid(),
    classId: z.string().uuid(),
    subject: z.string().min(2).max(100),
    hoursPerWeek: z.number().int().min(1).max(40).default(2),
    academicYear: z
      .string()
      .regex(/^\d{4}\/\d{4}$/, 'Format academicYear: 2025/2026'),
  })
  .strict();

export type CreateAssignmentDto = z.infer<typeof CreateAssignmentSchema>;
