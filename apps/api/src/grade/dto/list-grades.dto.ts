import { z } from 'zod';

export const ListGradesQuerySchema = z.object({
  studentId:    z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  classId:      z.string().uuid().optional(),
  semester:     z.coerce.number().int().min(1).max(2).optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  type:         z.enum(['uts', 'uh', 'uas', 'praktik', 'sikap']).optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().positive().max(100).default(20),
});

export type ListGradesQuery = z.infer<typeof ListGradesQuerySchema>;
