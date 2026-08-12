import type { QuestionDifficulty, QuestionType } from '../actions';

export interface QuestionSourceOption {
  sourceType: 'module' | 'rpp';
  id: string;
  label: string;
  tpRefs: string[];
  tpOptions?: Array<{ ref: string; text: string }>;
}

export const COGNITIVE_LEVELS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const;
export type CognitiveLevelOption = (typeof COGNITIVE_LEVELS)[number];
export type AiPurpose = 'diagnostik' | 'formatif' | 'sumatif-uts' | 'sumatif-uas';
export type AiContextMode = 'umum' | 'auto_vokasi' | 'produktif';
export type AiCharacter = 'konseptual' | 'studi_kasus' | 'praktik' | 'literasi' | 'numerasi';
export type TypeDistribution = Record<QuestionType, number>;
export type DifficultyDistribution = Record<QuestionDifficulty, number>;
export type CognitiveDistribution = Record<CognitiveLevelOption, number>;

function sumValues(value: Record<string, number>): number {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

export function isAiDistributionValid(input: {
  questionCount: number;
  typeDistribution: TypeDistribution;
  difficultyDistribution: DifficultyDistribution;
  cognitiveDistribution: CognitiveDistribution;
}): boolean {
  return sumValues(input.typeDistribution) === input.questionCount
    && sumValues(input.difficultyDistribution) === input.questionCount
    && sumValues(input.cognitiveDistribution) === input.questionCount;
}

export function buildAiQuestionDraftRequest(input: {
  source: QuestionSourceOption;
  purpose: AiPurpose;
  questionCount: number;
  typeDistribution: TypeDistribution;
  difficultyDistribution: DifficultyDistribution;
  cognitiveDistribution: CognitiveDistribution;
  tpRefs: string[];
  contextMode: AiContextMode;
  character: AiCharacter;
  teacherInstruction?: string;
  idempotencyKey: string;
}) {
  const allowedRefs = new Set(normalizeSourceTpOptions(input.source).map((tp) => tp.ref));
  const requestedRefs = input.tpRefs.map((ref) => ref.trim()).filter(Boolean);
  if (requestedRefs.length === 0 || requestedRefs.some((ref) => !allowedRefs.has(ref))) {
    throw new Error('TP harus dipilih dari sumber authoritative.');
  }
  return {
    ...(input.source.sourceType === 'module' ? { moduleId: input.source.id } : { rppId: input.source.id }),
    purpose: input.purpose,
    questionCount: input.questionCount,
    typeDistribution: input.typeDistribution,
    difficultyDistribution: input.difficultyDistribution,
    cognitiveDistribution: input.cognitiveDistribution,
    tpRefs: requestedRefs,
    contextMode: input.contextMode,
    character: input.character,
    ...(input.teacherInstruction?.trim() ? { teacherInstruction: input.teacherInstruction.trim() } : {}),
    idempotencyKey: input.idempotencyKey,
  };
}

export function normalizeSourceTpOptions(source: QuestionSourceOption): Array<{ ref: string; text: string }> {
  if (source.tpOptions && source.tpOptions.length > 0) return source.tpOptions;
  return source.tpRefs.map((ref) => ({ ref, text: ref }));
}
