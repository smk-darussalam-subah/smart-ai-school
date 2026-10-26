import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom } from 'rxjs';
import { AuthUser } from '@smk/auth';
import { AssessmentService } from '../assessment/assessment.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionSchema } from '../question-bank/dto/question.dto';
import {
  StoredQuestionSnapshotSchema,
  QuestionPayloadSchema,
  StoredQuestionSnapshot,
} from '../assessment/assessment-contract';
import {
  assertSecureStudentQuestions,
  dbQuestionToSnapshot,
  parseSnapshotQuestions,
  sanitizeQuestionForStudent,
  scoreAnswers,
  secureMatchingSnapshot,
  validateAnswersForSnapshot,
} from '../assessment/assessment-runtime';

const id = '10000000-0000-4000-8000-000000000001';
const legacy = {
  id,
  type: 'matching' as const,
  subject: 'Matematika',
  body: 'Pasangkan pernyataan.',
  difficulty: 'medium' as const,
  tags: [],
  points: 100,
  pairs: [
    { id: 'p1', prompt: 'Dua', match: '2' },
    { id: 'p2', prompt: 'Tiga', match: '3' },
  ],
  answer: { p1: 'p1', p2: 'p2' },
};
const derive = (pairId: string) => {
  let hash = 0;
  for (const char of `${id}:${pairId}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `choice-${hash.toString(36)}`;
};
function secure() {
  return StoredQuestionSnapshotSchema.parse(secureMatchingSnapshot(legacy)) as Extract<
    StoredQuestionSnapshot,
    { type: 'matching' }
  >;
}

describe('F02 opaque matching boundary', () => {
  it('accepts an optional manual request UUID without weakening strict question validation', () => {
    const { id: _id, points: _points, ...payload } = legacy;
    expect(CreateQuestionSchema.safeParse({ ...payload, requestId: id }).success).toBe(true);
    expect(CreateQuestionSchema.safeParse({ ...payload, requestId: 'bad' }).success).toBe(false);
    expect(
      CreateQuestionSchema.safeParse({ ...payload, requestId: id, teacherId: 'foreign' }).success,
    ).toBe(false);
    expect(
      CreateQuestionSchema.safeParse({ ...payload, requestId: id, choiceIds: {} }).success,
    ).toBe(false);
  });
  it.each(['<p></p>', '<p>&nbsp; &nbsp;</p>', '<script>alert(1)</script>'])(
    'rejects empty formatted authoring body %s',
    (body) => {
      const { id: _id, points: _points, ...payload } = legacy;
      expect(
        QuestionPayloadSchema.safeParse({ ...payload, body: '<!--diis-question-html:v1-->' + body })
          .success,
      ).toBe(false);
    },
  );
  it('rejects the original public-ID forgery and raw pair IDs', () => {
    const question = secure();
    for (const pairs of [
      { p1: derive('p1'), p2: derive('p2') },
      { p1: 'p1', p2: 'p2' },
    ]) {
      const answers = { [id]: { type: 'matching' as const, pairs } };
      expect(() => validateAnswersForSnapshot(answers, [question])).toThrow(
        'Pasangan jawaban tidak valid',
      );
      expect(scoreAnswers(answers, [question]).score).toBe(0);
    }
  });
  it('keeps tokens stable after JSON reload, without exposing the private mapping', () => {
    const question = secure();
    const parsed = parseSnapshotQuestions(JSON.parse(JSON.stringify([question])));
    const publicQuestion = sanitizeQuestionForStudent(question);
    expect(sanitizeQuestionForStudent(parsed[0]!)).toEqual(publicQuestion);
    expect(publicQuestion).not.toHaveProperty('answer');
    expect(publicQuestion).not.toHaveProperty('pairs');
    expect(publicQuestion).not.toHaveProperty('choiceIds');
    expect(secure().choiceIds).not.toEqual(question.choiceIds);
    expect(secureMatchingSnapshot(question)).toBe(question);
  });
  it.each([false, true])('grades correct and partial answers with nonidentity=%s', (swapped) => {
    const question = secure();
    if (swapped) question.answer = { p1: 'p2', p2: 'p1' };
    const pairs = Object.fromEntries(
      question.pairs.map((pair) => [pair.id, question.choiceIds![question.answer[pair.id]!]!]),
    );
    const answers = { [id]: { type: 'matching' as const, pairs } };
    validateAnswersForSnapshot(answers, [question]);
    expect(scoreAnswers(answers, [question]).score).toBe(100);
    delete pairs.p2;
    expect(scoreAnswers(answers, [question]).score).toBe(50);
    expect(scoreAnswers({}, [question]).score).toBe(0);
  });
  it.each([
    { p1: '00000000-0000-4000-8000-000000000001' },
    { p1: '00000000-0000-4000-8000-000000000001', p2: '00000000-0000-4000-8000-000000000001' },
    { p1: 'choice-forged', p2: 'choice-other' },
    {
      p1: '00000000-0000-4000-8000-000000000001',
      p2: '00000000-0000-4000-8000-000000000002',
      foreign: '00000000-0000-4000-8000-000000000003',
    },
  ])('rejects malformed persisted maps %j', (choiceIds) => {
    expect(StoredQuestionSnapshotSchema.safeParse({ ...legacy, choiceIds }).success).toBe(false);
  });
  it('does not permit authoring DTOs to choose security metadata', () => {
    const { id: _id, points: _points, ...payload } = legacy;
    expect(
      QuestionPayloadSchema.safeParse({ ...payload, choiceIds: secure().choiceIds }).success,
    ).toBe(false);
  });
  it('creates opaque maps when canonical questions become session snapshots', () => {
    const record = {
      ...legacy,
      options: legacy.pairs,
      answer: JSON.stringify(legacy.answer),
      rubric: null,
    };
    expect(dbQuestionToSnapshot(record, 100)).toHaveProperty('choiceIds');
  });
  it('contains legacy learner reads/mutations but preserves deliberate historical scoring', () => {
    const answers = {
      [id]: { type: 'matching' as const, pairs: { p1: derive('p1'), p2: derive('p2') } },
    };
    expect(() => assertSecureStudentQuestions([legacy])).toThrow('Sesi menjodohkan lama');
    expect(() => sanitizeQuestionForStudent(legacy)).toThrow('Sesi menjodohkan lama');
    expect(() => validateAnswersForSnapshot(answers, [legacy])).toThrow('Sesi menjodohkan lama');
    expect(() => validateAnswersForSnapshot(answers, [legacy], true)).not.toThrow();
    expect(scoreAnswers(answers, [legacy]).score).toBe(100);
  });
});

describe('F01 live monitor score semantics', () => {
  it.each([
    [100, null],
    [null, null],
    [0, null],
    [95, 75],
  ])('matches results for scores %j', async (first, second) => {
    const rows = [first, second].map((score, index) => ({
      id: String(index),
      score,
      submittedAt: new Date(),
      startedAt: new Date(),
      timeSpentSec: 0,
      itemScores: [{ status: score === null ? 'manual_pending' : 'manual_scored' }],
      lateSubmissionStatus: null,
      lastHeartbeatAt: null,
      integrityEvents: [],
      _count: { integrityEvents: 0 },
      student: { user: { fullName: `Siswa QA ${index}` } },
    }));
    const session = { id, classId: 'class', status: 'active', purpose: 'regular', questions: [] };
    const db = {
      assessmentSession: { findUnique: async () => session },
      assessmentResponse: { findMany: async () => rows },
      student: { count: async () => 2 },
    };
    const service = new AssessmentService(
      db as unknown as PrismaService,
      {} as EventEmitter2,
      {} as AcademicPeriodService,
    );
    const user = { roles: ['KEPALA_SEKOLAH'] } as AuthUser;
    const normal = await service.getResults(id, user);
    const event = await firstValueFrom(service.streamResults(id, user));
    expect(event.data).toMatchObject({
      rata: normal.avgScore,
      finalCount: normal.finalCount,
      pendingManualCount: normal.pendingManualCount,
    });
    expect((event.data as { roster: { nilai: number | null }[] }).roster[0]?.nilai).toBe(first);
  });
});
