import { z } from 'zod';
import { AnswerMapSchema, QuestionSelectionListSchema } from '../assessment-contract';

export const CreateAssessmentSessionSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().trim().min(3).max(255),
  type: z.enum(['diagnostik', 'formatif', 'sumatif']),
  questionSelections: QuestionSelectionListSchema,
  gradeTarget: z.enum(['uh', 'uts', 'uas']).nullable().optional(),
  classId: z.string().uuid().nullish(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
  semester: z.coerce.number().int().min(1).max(2),
  durationMinutes: z.number().int().min(1).max(300).optional(),
  randomizeOrder: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.type === 'diagnostik' && value.gradeTarget != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gradeTarget'], message: 'Diagnostik tidak membuat Grade' });
  }
  if (value.type === 'formatif' && value.gradeTarget != null && value.gradeTarget !== 'uh') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gradeTarget'], message: 'Formatif harus menargetkan UH' });
  }
  if (value.type === 'sumatif' && value.gradeTarget !== 'uts' && value.gradeTarget !== 'uas') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gradeTarget'], message: 'Sumatif wajib memilih UTS atau UAS' });
  }
});
export type CreateAssessmentSessionDto = z.infer<typeof CreateAssessmentSessionSchema>;

export const UpdateAssessmentSessionSchema = z.object({
  title: z.string().trim().min(3).max(255).optional(),
  questionSelections: QuestionSelectionListSchema.optional(),
  gradeTarget: z.enum(['uh', 'uts', 'uas']).nullable().optional(),
  classId: z.string().uuid().nullish(),
  durationMinutes: z.number().int().min(1).max(300).optional(),
  randomizeOrder: z.boolean().optional(),
}).strict();
export type UpdateAssessmentSessionDto = z.infer<typeof UpdateAssessmentSessionSchema>;

export const ListAssessmentSessionSchema = z.object({
  moduleId: z.string().uuid().optional(),
  status: z.enum(['draft', 'active', 'completed']).optional(),
  type: z.enum(['diagnostik', 'formatif', 'sumatif']).optional(),
  subject: z.string().trim().min(1).max(100).optional(),
  classId: z.string().uuid().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type ListAssessmentSessionDto = z.infer<typeof ListAssessmentSessionSchema>;

export const SubmitResponseSchema = z.object({
  answers: AnswerMapSchema,
}).strict();
export type SubmitResponseDto = z.infer<typeof SubmitResponseSchema>;

export const AutosaveResponseSchema = z.object({
  answers: AnswerMapSchema,
}).strict();
export type AutosaveResponseDto = z.infer<typeof AutosaveResponseSchema>;

export const GradeEssaySchema = z.object({
  questionId: z.string().uuid(),
  criteriaScores: z.record(z.string().min(1).max(80), z.number().finite().min(0).max(100)),
}).strict();
export type GradeEssayDto = z.infer<typeof GradeEssaySchema>;
