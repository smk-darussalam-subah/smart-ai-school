import { z } from 'zod';

export const SemesterClosingQuerySchema = z.object({
  semesterId: z.string().uuid().optional(),
}).strict();
export type SemesterClosingQueryDto = z.infer<typeof SemesterClosingQuerySchema>;

export const CloseSemesterSchema = z.object({
  semesterId: z.string().uuid(),
  nextSemesterId: z.string().uuid().nullable().optional(),
  readinessVersion: z.string().trim().min(1).max(40),
  readinessHash: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  idempotencyKey: z.string().trim().min(12).max(180),
  confirmation: z.literal('TUTUP SEMESTER'),
}).strict();
export type CloseSemesterDto = z.infer<typeof CloseSemesterSchema>;
