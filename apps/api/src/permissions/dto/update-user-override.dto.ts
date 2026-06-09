import { z } from 'zod';

export const UserPermissionOverrideSchema = z.object({
  permissionId: z.string().uuid(),
  grant: z.boolean(),
}).strict();

export type UserPermissionOverrideDto = z.infer<typeof UserPermissionOverrideSchema>;
