import { z } from 'zod';
import type { StudentQuestion } from '@/components/learning/QuestionAnswerInput';

const id = z.string().trim().min(1);
const text = z.string().refine((value) => value.trim().length > 0);
const base = { id, body: text, points: z.number().finite().positive().max(100) };
const option = z.object({ id, text });
const pair = z.object({ id, prompt: text, match: text });
const criterion = z.object({
  id,
  name: text,
  description: z.string().optional(),
  weight: z.number().finite().positive().max(100),
  maxScore: z.number().finite().positive().max(100),
});
const previewSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('multiple_choice'),
    options: z.array(option).min(2),
    answer: id,
  }),
  z.object({ ...base, type: z.literal('true_false'), answer: z.boolean() }),
  z.object({
    ...base,
    type: z.literal('matching'),
    pairs: z.array(pair).min(2),
    answer: z.record(id, id),
    choiceIds: z.record(id, z.string().uuid()).optional(),
  }),
  z.object({
    ...base,
    type: z.literal('essay'),
    rubric: z.array(criterion).min(1),
    guideAnswer: z.string().optional(),
  }),
]);

export type PreviewQuestion = z.infer<typeof previewSchema>;

function uniqueIds(items: { id: string }[]) {
  return new Set(items.map(({ id }) => id)).size === items.length;
}

function hasCompleteKey(question: PreviewQuestion): boolean {
  switch (question.type) {
    case 'multiple_choice':
      return (
        uniqueIds(question.options) && question.options.some(({ id }) => id === question.answer)
      );
    case 'matching': {
      const ids = new Set(question.pairs.map(({ id }) => id));
      const answers = new Set(Object.values(question.answer));
      const choices = question.choiceIds ? new Set(Object.values(question.choiceIds)) : null;
      return (
        ids.size === question.pairs.length &&
        Object.keys(question.answer).length === ids.size &&
        answers.size === ids.size &&
        (!choices || choices.size === ids.size) &&
        [...ids].every(
          (id) =>
            Object.hasOwn(question.answer, id) &&
            answers.has(id) &&
            (!question.choiceIds || Object.hasOwn(question.choiceIds, id)),
        )
      );
    }
    case 'essay':
      return (
        uniqueIds(question.rubric) &&
        Math.round(
          question.rubric.reduce((total, criterion) => total + criterion.weight, 0) * 100,
        ) === 10_000
      );
    case 'true_false':
      return true;
  }
}

/** Bank records and saved session snapshots use different encodings for the same question. */
export function parsePreviewQuestion(source: unknown, points?: number): PreviewQuestion | null {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const row = source as Record<string, unknown>;
  let answer = row.answer;
  if (row.type === 'true_false') {
    if (answer === 'true') answer = true;
    if (answer === 'false') answer = false;
  }
  if (row.type === 'matching' && typeof answer === 'string') {
    try {
      answer = JSON.parse(answer) as unknown;
    } catch {
      return null;
    }
  }
  const parsed = previewSchema.safeParse({
    ...row,
    points: points ?? row.points,
    answer,
    pairs: row.pairs ?? row.options,
    guideAnswer: row.guideAnswer ?? (typeof row.answer === 'string' ? row.answer : undefined),
  });
  return parsed.success && hasCompleteKey(parsed.data) ? parsed.data : null;
}

/** Build only the fields used by the real learner controls. Teacher keys stay outside them. */
export function studentPreviewQuestion(question: PreviewQuestion): StudentQuestion {
  const common = { id: question.id, body: question.body, points: question.points };
  switch (question.type) {
    case 'multiple_choice':
      return { ...common, type: question.type, options: question.options };
    case 'true_false':
      return { ...common, type: question.type };
    case 'matching':
      return {
        ...common,
        type: question.type,
        prompts: question.pairs.map(({ id, prompt }) => ({ id, prompt })),
        choices: matchingPreviewChoices(question),
      };
    case 'essay':
      return {
        ...common,
        type: question.type,
        rubricCriteria: question.rubric.map(({ id, name, maxScore }) => ({ id, name, maxScore })),
      };
  }
}

function matchingPreviewChoices(question: Extract<PreviewQuestion, { type: 'matching' }>) {
  const choices = question.pairs.map(({ id, match }) => ({
    id: question.choiceIds?.[id] ?? `preview-${id}`,
    text: match,
  }));
  return question.choiceIds
    ? choices.sort((left, right) => left.id.localeCompare(right.id))
    : choices.reverse();
}
