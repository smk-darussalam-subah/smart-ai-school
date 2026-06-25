import { z } from 'zod';

// Badges DTO (P14 — W3-1). Badge system for student achievement awards.

export const CreateBadgeSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).optional(),
  icon: z.string().trim().min(1).max(50), // emoji or SVG name
  criteria: z.object({
    type: z.enum(['grade_threshold', 'attendance_streak', 'assessment_completed', 'module_completed']),
    threshold: z.number().int().min(0).optional(),
    subject: z.string().optional(), // 'all' or specific subject
    count: z.number().int().min(1).optional(), // for count-based criteria
  }),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).default('bronze'),
});
export type CreateBadgeDto = z.infer<typeof CreateBadgeSchema>;

export const AwardBadgeSchema = z.object({
  badgeId: z.string().uuid(),
  studentId: z.string().uuid(),
});
export type AwardBadgeDto = z.infer<typeof AwardBadgeSchema>;

export const ListBadgeSchema = z.object({
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListBadgeDto = z.infer<typeof ListBadgeSchema>;
