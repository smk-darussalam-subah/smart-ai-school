import { z } from 'zod';

export const UpdateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()),
}).strict();

export type UpdateRolePermissionsDto = z.infer<typeof UpdateRolePermissionsSchema>;
