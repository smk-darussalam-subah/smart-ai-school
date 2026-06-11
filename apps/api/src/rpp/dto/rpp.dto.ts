import { z } from 'zod';

export const CreateRppSchema = z.object({
  subject: z.string().trim().min(2).max(100),
  title: z.string().trim().min(3).max(255),
  content: z.string().trim().max(100_000).nullish(),
  fileUrl: z.string().url().max(2000).nullish(),
  classId: z.string().uuid().nullish(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
  semester: z.coerce.number().int().min(1).max(2),
  submit: z.boolean().default(false), // true = langsung submitted
});
export type CreateRppDto = z.infer<typeof CreateRppSchema>;

export const UpdateRppSchema = CreateRppSchema.omit({ submit: true }).partial();
export type UpdateRppDto = z.infer<typeof UpdateRppSchema>;

export const ReviewRppSchema = z.object({
  decision: z.enum(['approved', 'revision']),
  note: z.string().trim().max(5000).nullish(),
}).refine((d) => d.decision !== 'revision' || (d.note && d.note.length >= 3), {
  message: 'Keputusan revisi wajib disertai catatan untuk guru',
  path: ['note'],
});
export type ReviewRppDto = z.infer<typeof ReviewRppSchema>;

export const ListRppQuerySchema = z.object({
  status: z.enum(['draft', 'submitted', 'approved', 'revision']).optional(),
  teacherId: z.string().uuid().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListRppQueryDto = z.infer<typeof ListRppQuerySchema>;
