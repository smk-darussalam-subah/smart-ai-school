// =============================================================================
// DTO query Dasbor Eksekutif — filter opsional. Default ke TA/semester aktif.
// =============================================================================

import { z } from 'zod';

export const AnalyticsQuerySchema = z.object({
  academicYear: z
    .string()
    .regex(/^\d{4}\/\d{4}$/, 'Format tahun ajaran: 2025/2026')
    .optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  majorCode: z.string().max(10).optional(),
  classId: z.string().uuid().optional(),
});

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;
