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
  status: z.enum(['draft', 'active', 'completed', 'cancelled']).optional(),
  purpose: z.enum(['regular', 'remedial']).optional(),
  type: z.enum(['diagnostik', 'formatif', 'sumatif']).optional(),
  subject: z.string().trim().min(1).max(100).optional(),
  classId: z.string().uuid().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type ListAssessmentSessionDto = z.infer<typeof ListAssessmentSessionSchema>;

export const FamilyRemedialQuerySchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(['active', 'completed']).optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(5),
}).strict();
export type FamilyRemedialQueryDto = z.infer<typeof FamilyRemedialQuerySchema>;

export const RemedialCandidatesQuerySchema = z.object({
  classId: z.string().uuid(),
  subject: z.string().trim().min(1).max(100),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  semester: z.coerce.number().int().min(1).max(2),
  type: z.enum(['uh', 'uts', 'uas', 'praktik', 'sikap']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type RemedialCandidatesQueryDto = z.infer<typeof RemedialCandidatesQuerySchema>;

export const CreateRemedialSessionSchema = z.object({
  title: z.string().trim().min(3).max(255),
  sourceGradeIds: z.array(z.string().uuid()).min(1).max(100),
  questionSelections: QuestionSelectionListSchema,
  dueAt: z.string().datetime({ offset: true }).optional(),
  instructions: z.string().trim().max(2_000).optional(),
  durationMinutes: z.number().int().min(1).max(300).optional(),
  randomizeOrder: z.boolean().optional(),
}).strict();
export type CreateRemedialSessionDto = z.infer<typeof CreateRemedialSessionSchema>;

export const UpdateRemedialSessionSchema = z.object({
  title: z.string().trim().min(3).max(255).optional(),
  questionSelections: QuestionSelectionListSchema.optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  instructions: z.string().trim().max(2_000).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(300).nullable().optional(),
  randomizeOrder: z.boolean().optional(),
}).strict();
export type UpdateRemedialSessionDto = z.infer<typeof UpdateRemedialSessionSchema>;

export const CancelRemedialSessionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
}).strict();
export type CancelRemedialSessionDto = z.infer<typeof CancelRemedialSessionSchema>;

export const FinalizeRemedialParticipantSchema = z.object({
  participantId: z.string().uuid(),
}).strict();
export type FinalizeRemedialParticipantDto = z.infer<typeof FinalizeRemedialParticipantSchema>;

export const RetryRemedialParticipantSchema = z.object({
  participantId: z.string().uuid(),
  title: z.string().trim().min(3).max(255).optional(),
  questionSelections: QuestionSelectionListSchema,
  dueAt: z.string().datetime({ offset: true }).optional(),
  instructions: z.string().trim().max(2_000).optional(),
  durationMinutes: z.number().int().min(1).max(300).optional(),
  randomizeOrder: z.boolean().optional(),
}).strict();
export type RetryRemedialParticipantDto = z.infer<typeof RetryRemedialParticipantSchema>;

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
