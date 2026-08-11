import { createHash } from 'crypto';
import { buildAiQuestionDraftRequest, isAiDistributionValid } from '../app/dashboard/akademik/_components/question-bank-ai-request';
import { buildQuestionImportIdentity } from '../app/dashboard/akademik/_components/question-bank-import-identity';

const originalCrypto = globalThis.crypto;

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      subtle: {
        digest: jest.fn(async (_algorithm: string, data: BufferSource) => {
          const buffer = Buffer.from(data instanceof ArrayBuffer ? data : data.buffer);
          const digest = createHash('sha256').update(buffer).digest();
          return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
        }),
      },
    },
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
});

describe('QuestionBankEditor CSV import contract', () => {
  it('builds customizable AI draft requests from a selected source', () => {
    const request = buildAiQuestionDraftRequest({
      source: {
        sourceType: 'rpp',
        id: 'rpp-1',
        label: 'Modul Ajar TKJ',
        tpRefs: ['TP 1', 'TP 2'],
        tpOptions: [{ ref: 'TP 1', text: 'Subnetting' }, { ref: 'TP 2', text: 'Routing' }],
      },
      purpose: 'sumatif-uts',
      questionCount: 6,
      typeDistribution: { multiple_choice: 2, true_false: 1, matching: 1, essay: 2 },
      difficultyDistribution: { easy: 1, medium: 3, hard: 2 },
      cognitiveDistribution: { C1: 1, C2: 1, C3: 1, C4: 1, C5: 1, C6: 1 },
      tpRefs: ['TP 1', 'TP 2'],
      contextMode: 'produktif',
      character: 'studi_kasus',
      teacherInstruction: '  Pakai konteks bengkel sekolah  ',
      idempotencyKey: 'idem-1',
    });

    expect(request).toMatchObject({
      rppId: 'rpp-1',
      purpose: 'sumatif-uts',
      questionCount: 6,
      contextMode: 'produktif',
      character: 'studi_kasus',
      teacherInstruction: 'Pakai konteks bengkel sekolah',
      idempotencyKey: 'idem-1',
    });
    expect(request).not.toHaveProperty('moduleId');
  });

  it('rejects TP refs that are not present in the selected source', () => {
    expect(() => buildAiQuestionDraftRequest({
      source: { sourceType: 'rpp', id: 'rpp-1', label: 'Modul Ajar TKJ', tpRefs: ['TP 1'] },
      purpose: 'formatif',
      questionCount: 1,
      typeDistribution: { multiple_choice: 1, true_false: 0, matching: 0, essay: 0 },
      difficultyDistribution: { easy: 1, medium: 0, hard: 0 },
      cognitiveDistribution: { C1: 1, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0 },
      tpRefs: ['TP 2'],
      contextMode: 'auto_vokasi',
      character: 'konseptual',
      idempotencyKey: 'idem-2',
    })).toThrow('TP harus dipilih dari sumber authoritative');
  });

  it('uses normalized row content, not filename, for CSV import identity', async () => {
    const rows = [{
      rowNumber: 1,
      data: {
        subject: 'TJKT',
        type: 'true_false' as const,
        body: 'Switch bekerja pada layer data-link.',
        answer: true,
        difficulty: 'easy' as const,
        tags: ['jaringan'],
      },
    }];

    const first = await buildQuestionImportIdentity('TJKT', rows);
    const retry = await buildQuestionImportIdentity('TJKT', rows);
    const baseRow = rows[0]!;
    const changed = await buildQuestionImportIdentity('TJKT', [{
      ...baseRow,
      data: { ...baseRow.data, body: 'Router bekerja pada layer network.' },
    }]);

    expect(first.batchKey).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(first.rowKeys.get(1)).toMatch(/^row-1-[a-f0-9]{24}$/);
    expect(retry.batchKey).toBe(first.batchKey);
    expect(changed.batchKey).not.toBe(first.batchKey);
  });

  it('rejects AI distributions that do not match the requested question count', () => {
    expect(isAiDistributionValid({
      questionCount: 4,
      typeDistribution: { multiple_choice: 2, true_false: 1, matching: 0, essay: 1 },
      difficultyDistribution: { easy: 1, medium: 2, hard: 1 },
      cognitiveDistribution: { C1: 1, C2: 1, C3: 1, C4: 1, C5: 0, C6: 0 },
    })).toBe(true);

    expect(isAiDistributionValid({
      questionCount: 4,
      typeDistribution: { multiple_choice: 4, true_false: 0, matching: 0, essay: 0 },
      difficultyDistribution: { easy: 1, medium: 1, hard: 1 },
      cognitiveDistribution: { C1: 1, C2: 1, C3: 1, C4: 1, C5: 0, C6: 0 },
    })).toBe(false);
  });
});
