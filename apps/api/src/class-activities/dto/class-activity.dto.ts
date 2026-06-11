import { z } from 'zod';

export const CreateActivitySchema = z.object({
  classId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal: YYYY-MM-DD'),
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(5000).nullish(),
  category: z.enum(['pembelajaran', 'ulangan', 'praktikum', 'kegiatan', 'lainnya']).default('pembelajaran'),
  photoUrl: z.string().url().max(2000).nullish(),
});
export type CreateActivityDto = z.infer<typeof CreateActivitySchema>;

export const UpdateActivitySchema = CreateActivitySchema.partial();
export type UpdateActivityDto = z.infer<typeof UpdateActivitySchema>;

export const ListActivitiesQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  category: z.enum(['pembelajaran', 'ulangan', 'praktikum', 'kegiatan', 'lainnya']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListActivitiesQueryDto = z.infer<typeof ListActivitiesQuerySchema>;
