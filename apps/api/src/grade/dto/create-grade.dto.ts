import { z } from 'zod';

// academicYear TIDAK ada di body — diambil dari TeachingAssignment.academicYear
// submittedBy  TIDAK ada di body — diambil dari JWT (user yang login)
export const CreateGradeSchema = z
  .object({
    studentId:    z.string().uuid(),
    assignmentId: z.string().uuid(),
    semester:     z.number().int().min(1).max(2),
    score:        z.number().min(0).max(100),
    type:         z.enum(['uts', 'uh', 'uas', 'praktik', 'sikap']),
    notes:        z.string().max(1000).optional(),
  })
  .strict();

export type CreateGradeDto = z.infer<typeof CreateGradeSchema>;
