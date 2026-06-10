import { z } from 'zod';
import { UserRole } from '@smk/auth';

export const UpdateUserRoleSchema = z.object({
  role: UserRole,
}).strict();

export type UpdateUserRoleDto = z.infer<typeof UpdateUserRoleSchema>;

export const UpdateUserActiveSchema = z.object({
  isActive: z.boolean(),
}).strict();

export type UpdateUserActiveDto = z.infer<typeof UpdateUserActiveSchema>;
