import { z } from 'zod';

// Question Bank DTO (P14 — W3-2). Reusable question repository for teachers.

export const CreateQuestionSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  type: z.enum(['multiple_choice', 'essay', 'true_false', 'matching']),
  body: z.string().trim().min(3).max(5000),
  options: z.any().optional(),
  answer: z.string().trim().max(5000).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  tags: z.array(z.string().trim().min(1).max(50)).default([]),
  // U2 Wave 2: essay rubrik — Array<{ id, name, weight, maxScore, description }>
  rubric: z.any().optional(),
});
export type CreateQuestionDto = z.infer<typeof CreateQuestionSchema>;

export const UpdateQuestionSchema = z.object({
  subject: z.string().trim().min(1).max(100).optional(),
  type: z.enum(['multiple_choice', 'essay', 'true_false', 'matching']).optional(),
  body: z.string().trim().min(3).max(5000).optional(),
  options: z.any().optional(),
  answer: z.string().trim().max(5000).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).optional(),
  // U2 Wave 2: essay rubrik
  rubric: z.any().optional(),
});
export type UpdateQuestionDto = z.infer<typeof UpdateQuestionSchema>;

export const ListQuestionSchema = z.object({
  subject: z.string().optional(),
  type: z.enum(['multiple_choice', 'essay', 'true_false', 'matching']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  tags: z.string().optional(), // comma-separated tags for filtering
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuestionDto = z.infer<typeof ListQuestionSchema>;

export const CreateQuestionSetSchema = z.object({
  name: z.string().trim().min(3).max(255),
  questionIds: z.array(z.string().uuid()).min(1).max(100),
});
export type CreateQuestionSetDto = z.infer<typeof CreateQuestionSetSchema>;

export const ListQuestionSetSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuestionSetDto = z.infer<typeof ListQuestionSetSchema>;

// U2 Wave 4: CSV Import schema
export const ImportQuestionsSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  rows: z.array(z.object({
    type: z.enum(['multiple_choice', 'essay', 'true_false', 'matching']),
    body: z.string().trim().min(3).max(5000),
    options: z.string().optional(), // JSON-encoded string
    answer: z.string().trim().max(5000).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    tags: z.string().optional(), // JSON-encoded or comma-separated
  })).min(1).max(500),
});
export type ImportQuestionsDto = z.infer<typeof ImportQuestionsSchema>;
