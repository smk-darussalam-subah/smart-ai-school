import { z } from 'zod';
import { UserRole } from '@smk/auth';

export const ListUsersQuerySchema = z.object({
  role: UserRole.optional(),
  search: z.string().max(100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const GroupedUsersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type GroupedUsersQuery = z.infer<typeof GroupedUsersQuerySchema>;
