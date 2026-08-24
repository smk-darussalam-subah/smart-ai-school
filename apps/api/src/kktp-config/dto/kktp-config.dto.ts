import { z } from 'zod';
import { AcademicYearCodeSchema, SemesterNumberSchema } from '../../common/dto/academic-period.dto';

// T3-02 (B5): KKTP config DTOs.

export const UpsertKktpSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  kktp: z.coerce.number().int().min(0).max(100),
  academicYear: AcademicYearCodeSchema,
  semester: SemesterNumberSchema,
}).strict();
export type UpsertKktpDto = z.infer<typeof UpsertKktpSchema>;

export const ListKktpQuerySchema = z.object({
  academicYear: AcademicYearCodeSchema.optional(),
  semester: SemesterNumberSchema.optional(),
}).strict();
export type ListKktpQuery = z.infer<typeof ListKktpQuerySchema>;

export const RemoveKktpParamsSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  academicYear: AcademicYearCodeSchema,
  semester: SemesterNumberSchema,
}).strict();

export type RemoveKktpParams = z.infer<typeof RemoveKktpParamsSchema>;
