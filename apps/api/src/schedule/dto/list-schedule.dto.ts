import { z } from 'zod';

export const ListScheduleQuerySchema = z.object({
  classId:      z.string().uuid().optional(),
  teacherId:    z.string().uuid().optional(), // filter by teacher.id (via TeachingAssignment)
  dayOfWeek:    z.coerce.number().int().min(1).max(6).optional(),
  academicYear: z.string().optional(),
  semester:     z.coerce.number().int().min(1).max(2).optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().positive().max(100).default(20),
});

export type ListScheduleQuery = z.infer<typeof ListScheduleQuerySchema>;
