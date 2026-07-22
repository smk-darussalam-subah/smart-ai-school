import { z } from 'zod';

export const ListStudentsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'graduated', 'dropped']).optional(),
  grade: z.coerce.number().int().min(10).max(12).optional(),
  majorCode: z.string().trim().min(1).max(10).optional(),
  joinedYear: z.coerce.number().int().min(2000).max(2100).optional(),
  parentState: z.enum(['with_parent', 'without_parent']).optional(),
  classState: z.enum(['with_class', 'without_class']).optional(),
  accountStatus: z.enum(['active', 'inactive']).optional(),
  consentStatus: z.enum(['given', 'pending']).optional(),
  search: z.string().max(100).optional(),
  // Sorting (whitelist kolom — cegah injeksi orderBy sembarang).
  sortBy: z.enum(['nis', 'fullName', 'status', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListStudentsQuery = z.infer<typeof ListStudentsQuerySchema>;
