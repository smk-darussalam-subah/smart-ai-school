// =============================================================================
// Class DTOs — Zod schemas
// =============================================================================

import { z } from 'zod';

export const CreateClassSchema = z.object({
  name: z.string().trim().min(2).max(50),
  majorCode: z.string().trim().min(2).max(10).toUpperCase(),
  grade: z.coerce.number().int().min(10).max(12),
  academicYear: z
    .string()
    .regex(/^\d{4}\/\d{4}$/, 'Format tahun ajaran: 2025/2026'),
  capacity: z.coerce.number().int().min(1).max(60).default(36),
  teacherId: z.string().uuid().nullish(),
});
export type CreateClassDto = z.infer<typeof CreateClassSchema>;

export const UpdateClassSchema = CreateClassSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateClassDto = z.infer<typeof UpdateClassSchema>;

// N2: z.coerce.boolean() parses "false" as true because Boolean("false") === true.
// Use preprocess to correctly handle string query params.
const stringToBool = z.preprocess((v) => v === 'true' || v === true, z.boolean());

export const ListClassesQuerySchema = z.object({
  grade: z.coerce.number().int().min(10).max(12).optional(),
  majorCode: z.string().trim().max(10).optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  includeInactive: stringToBool.default(false),
  page: z.coerce.number().int().min(1).default(1),
  // N1: Raised from 100 to 200 to match frontend management page requirements.
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListClassesQueryDto = z.infer<typeof ListClassesQuerySchema>;
