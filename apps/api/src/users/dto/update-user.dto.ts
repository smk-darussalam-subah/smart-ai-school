import { z } from 'zod';
import { PrimaryRoleSchema } from '@smk/auth';

export const UpdateUserRoleSchema = z.object({
  role: PrimaryRoleSchema,
}).strict();

export type UpdateUserRoleDto = z.infer<typeof UpdateUserRoleSchema>;

export const UpdateUserActiveSchema = z.object({
  isActive: z.boolean(),
}).strict();

export type UpdateUserActiveDto = z.infer<typeof UpdateUserActiveSchema>;
