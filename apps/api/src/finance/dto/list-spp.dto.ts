import { z } from 'zod';

export const ListSppQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  year:      z.coerce.number().int().min(2020).max(2100).optional(),
  status:    z.enum(['unpaid', 'paid', 'late', 'waived']).optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

export type ListSppQuery = z.infer<typeof ListSppQuerySchema>;
