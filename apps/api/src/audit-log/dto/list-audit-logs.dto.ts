import { z } from 'zod';

export const ListAuditLogsSchema = z.object({
  actorId: z.string().optional(),
  resourceType: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  statusCode: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListAuditLogsDto = z.infer<typeof ListAuditLogsSchema>;
