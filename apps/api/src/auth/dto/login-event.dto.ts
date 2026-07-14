import { z } from 'zod';

/**
 * DTO for recording a login event from the dashboard server action.
 * The server action captures IP and User-Agent from headers().
 * strict() prevents injection of userId/userName/userRole — those are
 * resolved server-side from the authenticated user's JWT.
 */
export const RecordLoginEventSchema = z
  .object({
    eventType: z.enum(['login', 'logout', 'failed']),
    ipAddress: z.string().max(45).nullable().optional(),
    userAgent: z.string().max(500).nullable().optional(),
  })
  .strict();

export type RecordLoginEventDto = z.infer<typeof RecordLoginEventSchema>;

/**
 * Query DTO for admin login-events listing.
 */
export const ListLoginEventsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  role: z.string().max(50).optional(),
  eventType: z.enum(['login', 'logout', 'failed']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListLoginEventsQueryDto = z.infer<typeof ListLoginEventsQuerySchema>;
