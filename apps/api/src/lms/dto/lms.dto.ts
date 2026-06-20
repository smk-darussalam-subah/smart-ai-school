import { z } from 'zod';

// LMS DTO (2P-1). Modul belajar + progres siswa.

export const CreateLmsModuleSchema = z.object({
  subject: z.string().trim().min(2).max(100),
  title: z.string().trim().min(3).max(255),
  tp: z.string().trim().max(50).nullish(),
  jpAllocation: z.coerce.number().int().min(1).max(40).nullish(),
  kktp: z.coerce.number().int().min(0).max(100).default(75),
  content: z.string().trim().max(200_000).nullish(),
  classId: z.string().uuid().nullish(),
  rppId: z.string().uuid().nullish(),
  orderIndex: z.coerce.number().int().min(0).max(9999).default(0),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
  semester: z.coerce.number().int().min(1).max(2),
  publish: z.boolean().default(false), // true = langsung dipublikasikan ke siswa
});
export type CreateLmsModuleDto = z.infer<typeof CreateLmsModuleSchema>;

export const UpdateLmsModuleSchema = CreateLmsModuleSchema.omit({ publish: true }).partial();
export type UpdateLmsModuleDto = z.infer<typeof UpdateLmsModuleSchema>;

export const ListLmsModuleQuerySchema = z.object({
  subject: z.string().trim().max(100).optional(),
  classId: z.string().uuid().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListLmsModuleQueryDto = z.infer<typeof ListLmsModuleQuerySchema>;

export const UpdateProgressSchema = z.object({
  progress: z.coerce.number().int().min(0).max(100),
  status: z.enum(['locked', 'active', 'completed']).optional(),
});
export type UpdateProgressDto = z.infer<typeof UpdateProgressSchema>;
