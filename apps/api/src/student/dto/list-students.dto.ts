import { z } from 'zod';

export const ListStudentsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'graduated', 'dropped']).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListStudentsQuery = z.infer<typeof ListStudentsQuerySchema>;
