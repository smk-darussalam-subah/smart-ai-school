import { z } from 'zod';

// teacherId dan classId tidak bisa di-update (ganti teacher/class = delete + recreate)
// untuk menjaga semantik unique constraint [teacher,class,subject,year]
export const UpdateAssignmentSchema = z
  .object({
    subject: z.string().min(2).max(100).optional(),
    hoursPerWeek: z.number().int().min(1).max(40).optional(),
    academicYear: z
      .string()
      .regex(/^\d{4}\/\d{4}$/, 'Format academicYear: 2025/2026')
      .optional(),
  })
  .strict();

export type UpdateAssignmentDto = z.infer<typeof UpdateAssignmentSchema>;
