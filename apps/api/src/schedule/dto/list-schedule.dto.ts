import { z } from 'zod';
import { AcademicYearCodeSchema, SemesterNumberSchema } from '../../common/dto/academic-period.dto';

export const ListScheduleQuerySchema = z.object({
  classId:      z.string().uuid().optional(),
  teacherId:    z.string().uuid().optional(), // filter by teacher.id (via TeachingAssignment)
  dayOfWeek:    z.coerce.number().int().min(1).max(6).optional(),
  academicYear: AcademicYearCodeSchema.optional(),
  semester:     SemesterNumberSchema.optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().positive().max(500).default(20),
}).strict();

export type ListScheduleQuery = z.infer<typeof ListScheduleQuerySchema>;

export const AutoGenerateScheduleQuerySchema = z.object({
  academicYear: AcademicYearCodeSchema,
  semester: SemesterNumberSchema,
  days: z.coerce.number().int().min(1).max(6).default(6),
  jpPerDay: z.coerce.number().int().min(1).max(12).default(8),
  maxJpGuru: z.coerce.number().int().min(1).max(48).default(24),
}).strict();

export type AutoGenerateScheduleQuery = z.infer<typeof AutoGenerateScheduleQuerySchema>;
