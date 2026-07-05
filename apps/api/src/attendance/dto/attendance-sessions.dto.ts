import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * W2-A-1: Query schema untuk agregasi rekap kehadiran per sesi.
 * Filter classId + date range opsional. Default window 30 hari terakhir.
 */
export const AttendanceSessionsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  subject: z.string().max(100).optional(),
  from: z.string().regex(DATE_REGEX, 'Format: YYYY-MM-DD').optional(),
  to: z.string().regex(DATE_REGEX, 'Format: YYYY-MM-DD').optional(),
  trendDays: z.coerce.number().int().min(1).max(31).default(10),
});

export type AttendanceSessionsQuery = z.infer<typeof AttendanceSessionsQuerySchema>;
