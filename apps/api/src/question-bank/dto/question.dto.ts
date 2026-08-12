import { z } from 'zod';
import { QuestionPayloadSchema } from '../../assessment/assessment-contract';

export const CreateQuestionSchema = QuestionPayloadSchema;
export type CreateQuestionDto = z.infer<typeof CreateQuestionSchema>;

export const UpdateQuestionSchema = QuestionPayloadSchema;
export type UpdateQuestionDto = z.infer<typeof UpdateQuestionSchema>;

export const DuplicateQuestionSchema = z.object({
  subject: z.string().trim().min(1).max(100).optional(),
}).strict();
export type DuplicateQuestionDto = z.infer<typeof DuplicateQuestionSchema>;

export const ListQuestionSchema = z.object({
  subject: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().max(120).optional(),
  type: z.enum(['multiple_choice', 'essay', 'true_false', 'matching']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  tags: z.string().trim().max(500).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type ListQuestionDto = z.infer<typeof ListQuestionSchema>;

export const CreateQuestionSetSchema = z.object({
  name: z.string().trim().min(3).max(255),
  questionIds: z.array(z.string().uuid()).min(1).max(100),
}).strict();
export type CreateQuestionSetDto = z.infer<typeof CreateQuestionSetSchema>;

export const ListQuestionSetSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type ListQuestionSetDto = z.infer<typeof ListQuestionSetSchema>;

export const ImportQuestionRowSchema = z.object({
  rowKey: z.string().trim().min(3).max(120),
  question: QuestionPayloadSchema,
}).strict();

export const ImportQuestionsSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  batchKey: z.string().trim().min(8).max(120),
  rows: z.array(ImportQuestionRowSchema).min(1).max(500),
}).strict();
export type ImportQuestionsDto = z.infer<typeof ImportQuestionsSchema>;
