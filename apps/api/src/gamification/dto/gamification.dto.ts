import { z } from 'zod';

// Gamification DTO (P15 — W3-3). XP, levels, streaks for students.

export const AwardXpSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().int().min(1).max(10000),
  reason: z.string().trim().min(3).max(255),
});
export type AwardXpDto = z.infer<typeof AwardXpSchema>;

export const LeaderboardXpSchema = z.object({
  classId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type LeaderboardXpDto = z.infer<typeof LeaderboardXpSchema>;

export const AddXpInternalSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().int().min(1).max(10000),
  reason: z.string().trim().min(3).max(255),
  source: z.enum(['lms_progress', 'grade_submitted', 'attendance', 'manual']),
  idempotencyKey: z.string().optional(), // e.g. 'grade:<gradeId>' for auto-award
});
export type AddXpInternalDto = z.infer<typeof AddXpInternalSchema>;
