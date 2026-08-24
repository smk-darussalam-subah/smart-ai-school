import { z } from 'zod';
import { ApiPrimaryRoleSchema } from '../../common/dto/primary-role.dto';

export const UpdateUserRoleSchema = z.object({
  role: ApiPrimaryRoleSchema,
}).strict();

export type UpdateUserRoleDto = z.infer<typeof UpdateUserRoleSchema>;

export const UpdateUserActiveSchema = z.object({
  isActive: z.boolean(),
}).strict();

export type UpdateUserActiveDto = z.infer<typeof UpdateUserActiveSchema>;
