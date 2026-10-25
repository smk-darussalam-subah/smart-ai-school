import { webcrypto } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AcceptQuestionDraftSchema,
  GenerateQuestionDraftSchema,
} from '../../../api/src/ai/dto/generate.dto';
import {
  questionDraftSaveKey,
  questionDraftGenerateKey,
  distributeQuestionCount,
} from '@/app/dashboard/akademik/_components/question-bank-ai-operation';
import QuestionBankAiReview from '@/app/dashboard/akademik/_components/QuestionBankAiReview';
import type { AiQuestionDraftItem } from '@/app/dashboard/akademik/actions';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (n: number, long = false): AiQuestionDraftItem => ({
  itemKey: long ? `${n}`.padEnd(80, 'x') : id(n),
  question: {
    type: 'true_false',
    subject: 'Matematika',
    body: 'Bilangan negatif lebih kecil daripada nol.',
    answer: true,
    difficulty: 'medium',
    tags: [],
  },
  tpRefs: ['TP 2', 'TP 1'],
  cognitiveLevel: 'C2',
  rationale: 'Pemahaman bilangan',
  warnings: [],
});
beforeAll(() =>
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }),
);
describe('bounded AI save operation', () => {
  it.each([1, 2, 3, 20])(
    'accepts %i UUID and max-length item IDs with the actual API schema',
    async (count) => {
      for (const long of [false, true]) {
        const items = Array.from({ length: count }, (_, index) => item(index + 1, long)).map(
          ({ itemKey, question, tpRefs, cognitiveLevel }) => ({
            itemKey,
            question,
            tpRefs,
            cognitiveLevel,
          }),
        );
        const key = await questionDraftSaveKey(id(99), items);
        expect(key).toHaveLength(71);
        expect(AcceptQuestionDraftSchema.safeParse({ idempotencyKey: key, items }).success).toBe(
          true,
        );
      }
    },
  );
  it('is retry-stable independent of object/selection/TP ordering, but never reuses a key for changed content', async () => {
    const items = [item(1), item(2)];
    const first = await questionDraftSaveKey(id(99), items);
    const reversed = [...items]
      .reverse()
      .map((row) => ({ ...row, tpRefs: [...row.tpRefs].reverse() }));
    expect(await questionDraftSaveKey(id(99), reversed)).toBe(first);
    expect(await questionDraftSaveKey(id(98), items)).not.toBe(first);
    expect(
      await questionDraftSaveKey(id(99), [
        { ...items[0]!, question: { ...items[0]!.question, body: 'Pertanyaan diubah.' } },
        items[1]!,
      ]),
    ).not.toBe(first);
  });
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))(
    'allocation keeps integer total %i',
    (count) => {
      const result = distributeQuestionCount({ pg: 2, tf: 1, essay: 1, match: 0 }, count);
      expect(Object.values(result).reduce((a, b) => a + b)).toBe(count);
      expect(Object.values(result).every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
      expect(result.match).toBe(0);
    },
  );
  it('retains explicit zero weights instead of inventing a pedagogical choice', () =>
    expect(distributeQuestionCount({ pg: 0, essay: 0 }, 4)).toEqual({ pg: 0, essay: 0 }));
  it('generated request key is short, stable for retry and distinct for a new requested batch', async () => {
    const request = {
      rppId: id(10),
      purpose: 'formatif' as const,
      questionCount: 3,
      typeDistribution: { multiple_choice: 1, true_false: 1, matching: 0, essay: 1 },
      difficultyDistribution: { easy: 1, medium: 1, hard: 1 },
      cognitiveDistribution: { C1: 1, C2: 1, C3: 1, C4: 0, C5: 0, C6: 0 },
      tpRefs: ['TP 1'],
      contextMode: 'umum' as const,
      character: 'konseptual' as const,
    };
    const key = await questionDraftGenerateKey(request, id(50));
    expect(GenerateQuestionDraftSchema.safeParse({ ...request, idempotencyKey: key }).success).toBe(
      true,
    );
    expect(await questionDraftGenerateKey(request, id(50))).toBe(key);
    expect(await questionDraftGenerateKey(request, id(51))).not.toBe(key);
  });
  it('review exposes the correct key and separates selected from reviewed', () => {
    const row = item(1);
    const html = renderToStaticMarkup(
      React.createElement(QuestionBankAiReview, {
        drafts: [row],
        selected: new Set([row.itemKey]),
        reviewed: new Set<string>(),
        disabled: false,
        regeneratingKey: null,
        onSelect() {},
        onReview() {},
        onEdit() {},
        onRegenerate() {},
      }),
    );
    expect(html).toContain('Kunci jawaban:');
    expect(html).toContain('Benar');
    expect(html).toContain('0 sudah diperiksa');
    expect(html).toContain('Soal 1 sudah diperiksa');
  });
});
