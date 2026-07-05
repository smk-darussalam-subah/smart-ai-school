import { z } from 'zod';

/**
 * W2-A-2: Query schema untuk list submissions (tugas siswa).
 * Diagregasi dari AssessmentSession (type formatif) + AssessmentResponse.
 */
export const ListSubmissionsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  subject: z.string().max(100).optional(),
  status: z.enum(['aktif', 'selesai', 'all']).default('all'),
});

export type ListSubmissionsQuery = z.infer<typeof ListSubmissionsQuerySchema>;
