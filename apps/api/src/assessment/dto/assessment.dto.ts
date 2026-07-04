import { z } from 'zod';

// Assessment DTO (P12 — W2-9). Sesi asesmen + respons siswa.

export const CreateAssessmentSessionSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().trim().min(3).max(255),
  type: z.enum(['diagnostik', 'formatif', 'sumatif']),
  questions: z.array(z.any()).min(1).max(100),
  classId: z.string().uuid().nullish(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
  semester: z.coerce.number().int().min(1).max(2),
  // U2 Wave 1: timer + randomization
  durationMinutes: z.number().int().min(1).max(300).optional(),
  randomizeOrder: z.boolean().optional(),
});
export type CreateAssessmentSessionDto = z.infer<typeof CreateAssessmentSessionSchema>;

export const UpdateAssessmentSessionSchema = z.object({
  title: z.string().trim().min(3).max(255).optional(),
  questions: z.array(z.any()).min(1).max(100).optional(),
  classId: z.string().uuid().nullish(),
  // U2 Wave 1: timer + randomization
  durationMinutes: z.number().int().min(1).max(300).optional(),
  randomizeOrder: z.boolean().optional(),
});
export type UpdateAssessmentSessionDto = z.infer<typeof UpdateAssessmentSessionSchema>;

export const ListAssessmentSessionSchema = z.object({
  moduleId: z.string().uuid().optional(),
  status: z.enum(['draft', 'active', 'completed']).optional(),
  type: z.enum(['diagnostik', 'formatif', 'sumatif']).optional(),
  classId: z.string().uuid().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAssessmentSessionDto = z.infer<typeof ListAssessmentSessionSchema>;

export const SubmitResponseSchema = z.object({
  answers: z.any(),
  // U2 Wave 1: client sends when siswa started (ISO string)
  startedAt: z.string().datetime().optional(),
});
export type SubmitResponseDto = z.infer<typeof SubmitResponseSchema>;
