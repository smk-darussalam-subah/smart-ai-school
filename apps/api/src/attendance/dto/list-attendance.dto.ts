import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const ListAttendanceQuerySchema = z.object({
  classId:   z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  dateFrom:  z.string().regex(DATE_REGEX, 'Format: YYYY-MM-DD').optional(),
  dateTo:    z.string().regex(DATE_REGEX, 'Format: YYYY-MM-DD').optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

export type ListAttendanceQuery = z.infer<typeof ListAttendanceQuerySchema>;
