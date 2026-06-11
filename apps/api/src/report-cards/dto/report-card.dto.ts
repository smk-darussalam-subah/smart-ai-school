import { z } from 'zod';

export const GenerateReportsSchema = z.object({
  classId: z.string().uuid(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
  semester: z.coerce.number().int().min(1).max(2),
});
export type GenerateReportsDto = z.infer<typeof GenerateReportsSchema>;

export const TransitionSchema = z.object({
  action: z.enum(['check', 'return', 'publish', 'distribute']),
});
export type TransitionDto = z.infer<typeof TransitionSchema>;

export const UpdateNotesSchema = z.object({
  notes: z.string().trim().max(5000).nullable(),
});
export type UpdateNotesDto = z.infer<typeof UpdateNotesSchema>;

export const ListReportsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  status: z.enum(['draft', 'checked', 'published', 'distributed']).optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListReportsQueryDto = z.infer<typeof ListReportsQuerySchema>;
