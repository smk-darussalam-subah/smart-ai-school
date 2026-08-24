import { z } from 'zod';
import { AcademicYearCodeSchema } from '../../common/dto/academic-period.dto';

export const ListAssignmentsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  academicYear: AcademicYearCodeSchema.optional(),
  subject: z.string().trim().max(100).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict();

export type ListAssignmentsQuery = z.infer<typeof ListAssignmentsQuerySchema>;
