import { z } from 'zod';

export const ListStudentsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'graduated', 'dropped']).optional(),
  search: z.string().max(100).optional(),
  // Sorting (whitelist kolom — cegah injeksi orderBy sembarang).
  sortBy: z.enum(['nis', 'fullName', 'status', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListStudentsQuery = z.infer<typeof ListStudentsQuerySchema>;
