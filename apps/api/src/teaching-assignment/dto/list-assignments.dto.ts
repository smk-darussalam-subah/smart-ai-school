import { z } from 'zod';

export const ListAssignmentsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  academicYear: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListAssignmentsQuery = z.infer<typeof ListAssignmentsQuerySchema>;
