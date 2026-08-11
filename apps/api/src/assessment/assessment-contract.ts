import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(80);
const bodySchema = z.string().trim().min(3).max(5000);
const tagSchema = z.string().trim().min(1).max(50);

export const AssessmentOptionSchema = z.object({
  id: idSchema,
  text: z.string().trim().min(1).max(500),
}).strict();

export const RubricCriterionSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  weight: z.number().finite().positive().max(100),
  maxScore: z.number().finite().positive().max(100),
}).strict();

export const MatchingPairSchema = z.object({
  id: idSchema,
  prompt: z.string().trim().min(1).max(1000),
  match: z.string().trim().min(1).max(1000),
}).strict();

const questionBase = z.object({
  subject: z.string().trim().min(1).max(100),
  body: bodySchema,
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  tags: z.array(tagSchema).max(20).default([]),
});

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function refineMultipleChoice(
  value: { options: Array<{ id: string; text: string }>; answer: string },
  ctx: z.RefinementCtx,
): void {
  const optionIds = value.options.map((option) => option.id);
  const optionTexts = value.options.map((option) => option.text.toLocaleLowerCase('id-ID'));
  if (!hasUniqueValues(optionIds)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'ID opsi harus unik' });
  }
  if (!hasUniqueValues(optionTexts)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Teks opsi harus unik' });
  }
  if (!optionIds.includes(value.answer)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'Kunci harus salah satu ID opsi' });
  }
}

function refineMatching(
  value: { pairs: Array<{ id: string }>; answer: Record<string, string> },
  ctx: z.RefinementCtx,
): void {
  const promptIds = value.pairs.map((pair) => pair.id);
  if (!hasUniqueValues(promptIds)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pairs'], message: 'ID pasangan harus unik' });
  }
  const answerKeys = Object.keys(value.answer);
  const answerValues = Object.values(value.answer);
  if (answerKeys.length !== promptIds.length || !promptIds.every((id) => answerKeys.includes(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'Mapping jawaban harus mencakup semua pasangan' });
  }
  if (!answerValues.every((id) => promptIds.includes(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'Mapping jawaban mengandung ID pasangan tidak valid' });
  }
  if (!hasUniqueValues(answerValues)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'Mapping jawaban menjodohkan harus bijective' });
  }
}

function refineEssay(
  value: { rubric: Array<{ id: string; weight: number }> },
  ctx: z.RefinementCtx,
): void {
  const criterionIds = value.rubric.map((criterion) => criterion.id);
  if (!hasUniqueValues(criterionIds)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rubric'], message: 'ID kriteria rubrik harus unik' });
  }
  const totalWeight = value.rubric.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (Math.round(totalWeight * 100) !== 10_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rubric'], message: 'Total bobot rubrik harus 100' });
  }
}

const MultipleChoiceQuestionRawSchema = questionBase.extend({
  type: z.literal('multiple_choice'),
  options: z.array(AssessmentOptionSchema).min(2).max(6),
  answer: idSchema,
}).strict();

export const MultipleChoiceQuestionSchema = MultipleChoiceQuestionRawSchema.superRefine(refineMultipleChoice);

export const TrueFalseQuestionSchema = questionBase.extend({
  type: z.literal('true_false'),
  answer: z.boolean(),
}).strict();

const MatchingQuestionRawSchema = questionBase.extend({
  type: z.literal('matching'),
  pairs: z.array(MatchingPairSchema).min(2).max(20),
  answer: z.record(idSchema, idSchema),
}).strict();

export const MatchingQuestionSchema = MatchingQuestionRawSchema.superRefine(refineMatching);

const EssayQuestionRawSchema = questionBase.extend({
  type: z.literal('essay'),
  guideAnswer: z.string().trim().max(5000).optional(),
  rubric: z.array(RubricCriterionSchema).min(1).max(12),
}).strict();

export const EssayQuestionSchema = EssayQuestionRawSchema.superRefine(refineEssay);

export const QuestionPayloadSchema = z.union([
  MultipleChoiceQuestionSchema,
  TrueFalseQuestionSchema,
  MatchingQuestionSchema,
  EssayQuestionSchema,
]);

export const StoredQuestionSnapshotSchema = z.union([
  MultipleChoiceQuestionRawSchema.extend({ id: idSchema, points: z.number().finite().positive().max(100) }).strict()
    .superRefine(refineMultipleChoice),
  TrueFalseQuestionSchema.extend({ id: idSchema, points: z.number().finite().positive().max(100) }).strict(),
  MatchingQuestionRawSchema.extend({ id: idSchema, points: z.number().finite().positive().max(100) }).strict()
    .superRefine(refineMatching),
  EssayQuestionRawSchema.extend({ id: idSchema, points: z.number().finite().positive().max(100) }).strict()
    .superRefine(refineEssay),
]);

export const QuestionSelectionSchema = z.object({
  questionId: z.string().uuid(),
  points: z.number().finite().positive().max(100),
  order: z.number().int().min(0).max(200),
}).strict();

export const QuestionSelectionListSchema = z.array(QuestionSelectionSchema)
  .min(1)
  .max(100)
  .superRefine((selections, ctx) => {
    const ids = selections.map((selection) => selection.questionId);
    const orders = selections.map((selection) => selection.order);
    const totalPoints = selections.reduce((sum, selection) => sum + selection.points, 0);
    if (!hasUniqueValues(ids)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Soal tidak boleh dipilih dua kali' });
    }
    if (!hasUniqueValues(orders.map(String))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Urutan soal tidak boleh duplikat' });
    }
    if (totalPoints < 1 || totalPoints > 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Total poin sesi harus 1-1000' });
    }
  });

export const MultipleChoiceAnswerSchema = z.object({
  type: z.literal('multiple_choice'),
  optionId: idSchema,
}).strict();

export const TrueFalseAnswerSchema = z.object({
  type: z.literal('true_false'),
  value: z.boolean(),
}).strict();

export const MatchingAnswerSchema = z.object({
  type: z.literal('matching'),
  pairs: z.record(idSchema, idSchema),
}).strict().superRefine((value, ctx) => {
  const keys = Object.keys(value.pairs);
  const values = Object.values(value.pairs);
  if (keys.length > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pairs'], message: 'Jawaban menjodohkan terlalu besar' });
  }
  if (!hasUniqueValues(values)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pairs'], message: 'Jawaban menjodohkan harus bijective' });
  }
});

export const EssayAnswerSchema = z.object({
  type: z.literal('essay'),
  text: z.string().trim().max(10000),
}).strict();

export const AnswerValueSchema = z.union([
  MultipleChoiceAnswerSchema,
  TrueFalseAnswerSchema,
  MatchingAnswerSchema,
  EssayAnswerSchema,
]);

export const AnswerMapSchema = z.record(z.string().uuid(), AnswerValueSchema).superRefine((value, ctx) => {
  if (Object.keys(value).length > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Jumlah jawaban terlalu besar' });
  }
});

export const ItemScoreSchema = z.object({
  questionId: z.string().uuid(),
  type: z.enum(['multiple_choice', 'true_false', 'matching', 'essay']),
  status: z.enum(['auto', 'manual_pending', 'manual_scored']),
  points: z.number().finite().min(0).max(100),
  maxPoints: z.number().finite().positive().max(100),
  scorePct: z.number().finite().min(0).max(100).nullable(),
  rubricScores: z.record(idSchema, z.number().finite().min(0).max(100)).optional(),
}).strict();

export const ItemScoresSchema = z.array(ItemScoreSchema).max(100);

export type QuestionPayload = z.infer<typeof QuestionPayloadSchema>;
export type StoredQuestionSnapshot = z.infer<typeof StoredQuestionSnapshotSchema>;
export type QuestionSelection = z.infer<typeof QuestionSelectionSchema>;
export type AssessmentAnswerMap = z.infer<typeof AnswerMapSchema>;
export type AssessmentItemScore = z.infer<typeof ItemScoreSchema>;
