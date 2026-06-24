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

// ── Student-level analytics (W1-3 + W1-4) ──────────────────────────────────
// Extends executive query dengan studentId + date range untuk attendance.
// Ownership di-resolve di service layer (SISWA→own, ORTU→children, GURU→own classes).

export const StudentAnalyticsQuerySchema = AnalyticsQuerySchema.extend({
  studentId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type StudentAnalyticsQuery = z.infer<typeof StudentAnalyticsQuerySchema>;
