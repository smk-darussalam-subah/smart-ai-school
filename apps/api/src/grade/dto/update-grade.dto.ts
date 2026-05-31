import { z } from 'zod';

// Hanya score dan notes yang bisa diubah.
// type, studentId, assignmentId, semester = immutable setelah submit.
export const UpdateGradeSchema = z
  .object({
    score: z.number().min(0).max(100).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict()
  .refine((d) => d.score !== undefined || d.notes !== undefined, {
    message: 'Setidaknya satu field (score atau notes) harus diisi',
  });

export type UpdateGradeDto = z.infer<typeof UpdateGradeSchema>;
