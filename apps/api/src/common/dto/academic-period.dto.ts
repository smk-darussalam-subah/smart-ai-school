import { z } from 'zod';

export const AcademicYearCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4}\/\d{4}$/, 'Format tahun ajaran harus YYYY/YYYY');

export const SemesterNumberSchema = z.coerce.number().int().min(1).max(2);
