import { z } from 'zod';
import { QuestionPayloadSchema } from '../../assessment/assessment-contract';

// AI-0A containment: Modul Ajar generation is ID-based. The browser may only
// request a saved RPP id and one target section; authoritative context is loaded
// server-side from academic.rpp.

export const AiRppSectionSchema = z.enum([
  'cp_tp',
  'atp',
  'profil',
  'sarana',
  'kegiatan',
  'asesmen',
  'remedial',
  'refleksi',
  'lampiran',
]);
export type AiRppSection = z.infer<typeof AiRppSectionSchema>;

export const GenerateRppStepSchema = z.object({
  rppId: z.string().uuid(),
  section: AiRppSectionSchema,
}).strict();
export type GenerateRppStepDto = z.infer<typeof GenerateRppStepSchema>;

export const AiQuestionPurposeSchema = z.enum(['diagnostik', 'formatif', 'sumatif-uts', 'sumatif-uas']);
export const AiQuestionContextModeSchema = z.enum(['umum', 'auto_vokasi', 'produktif']);
export const CognitiveLevelSchema = z.enum(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
export const AiQuestionCharacterSchema = z.enum(['konseptual', 'studi_kasus', 'praktik', 'literasi', 'numerasi']);

const TypeDistributionSchema = z.object({
  multiple_choice: z.number().int().min(0).max(20),
  true_false: z.number().int().min(0).max(20),
  matching: z.number().int().min(0).max(20),
  essay: z.number().int().min(0).max(20),
}).strict();

const DifficultyDistributionSchema = z.object({
  easy: z.number().int().min(0).max(20),
  medium: z.number().int().min(0).max(20),
  hard: z.number().int().min(0).max(20),
}).strict();

const CognitiveDistributionSchema = z.object({
  C1: z.number().int().min(0).max(20),
  C2: z.number().int().min(0).max(20),
  C3: z.number().int().min(0).max(20),
  C4: z.number().int().min(0).max(20),
  C5: z.number().int().min(0).max(20),
  C6: z.number().int().min(0).max(20),
}).strict();

function sumValues(value: Record<string, number>): number {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

export const GenerateQuestionDraftSchema = z.object({
  rppId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  purpose: AiQuestionPurposeSchema,
  questionCount: z.number().int().min(1).max(20),
  typeDistribution: TypeDistributionSchema,
  difficultyDistribution: DifficultyDistributionSchema,
  cognitiveDistribution: CognitiveDistributionSchema,
  tpRefs: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  contextMode: AiQuestionContextModeSchema.default('auto_vokasi'),
  character: AiQuestionCharacterSchema.default('konseptual'),
  teacherInstruction: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(12).max(120),
}).strict().superRefine((value, ctx) => {
  const sourceCount = [value.rppId, value.moduleId].filter(Boolean).length;
  if (sourceCount !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rppId'], message: 'Pilih tepat satu sumber: rppId atau moduleId' });
  }
  if (sumValues(value.typeDistribution) !== value.questionCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['typeDistribution'], message: 'Distribusi tipe harus sama dengan jumlah soal' });
  }
  if (sumValues(value.difficultyDistribution) !== value.questionCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['difficultyDistribution'], message: 'Distribusi kesulitan harus sama dengan jumlah soal' });
  }
  if (sumValues(value.cognitiveDistribution) !== value.questionCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cognitiveDistribution'], message: 'Distribusi level kognitif harus sama dengan jumlah soal' });
  }
});
export type GenerateQuestionDraftDto = z.infer<typeof GenerateQuestionDraftSchema>;

export const AcceptQuestionDraftSchema = z.object({
  idempotencyKey: z.string().trim().min(12).max(120),
  items: z.array(z.object({
    itemKey: z.string().trim().min(3).max(80),
    question: QuestionPayloadSchema,
    tpRefs: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    cognitiveLevel: CognitiveLevelSchema,
  }).strict()).min(1).max(20),
}).strict();
export type AcceptQuestionDraftDto = z.infer<typeof AcceptQuestionDraftSchema>;

export const RegenerateQuestionDraftItemSchema = z.object({
  teacherInstruction: z.string().trim().max(500).optional(),
}).strict();
export type RegenerateQuestionDraftItemDto = z.infer<typeof RegenerateQuestionDraftItemSchema>;

export const RejectQuestionDraftSchema = z.object({
  idempotencyKey: z.string().trim().min(12).max(120),
}).strict();
export type RejectQuestionDraftDto = z.infer<typeof RejectQuestionDraftSchema>;
