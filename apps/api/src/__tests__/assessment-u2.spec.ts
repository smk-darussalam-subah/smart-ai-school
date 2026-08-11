jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { AssessmentService } from '../assessment/assessment.service';
import { CreateAssessmentSessionSchema, SubmitResponseSchema } from '../assessment/dto/assessment.dto';
import { QuestionPayloadSchema } from '../assessment/assessment-contract';
import { PrismaService } from '../prisma/prisma.service';

const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SUPER_ADMIN: AuthUser = { keycloakId: 'kc-sa', username: 'sa', roles: ['SUPER_ADMIN'] } as AuthUser;

const MC_ID = '11111111-1111-4111-8111-111111111111';
const TF_ID = '22222222-2222-4222-8222-222222222222';
const MATCH_ID = '33333333-3333-4333-8333-333333333333';
const ESSAY_ID = '44444444-4444-4444-8444-444444444444';

const mcQuestion = {
  id: MC_ID,
  subject: 'Pemrograman Web',
  type: 'multiple_choice' as const,
  body: 'Apa kepanjangan HTML?',
  options: [
    { id: 'a', text: 'HyperText Markup Language' },
    { id: 'b', text: 'Hyper Transfer Model' },
  ],
  answer: 'a',
  difficulty: 'easy' as const,
  tags: ['html'],
  points: 50,
};

const trueFalseQuestion = {
  id: TF_ID,
  subject: 'Pemrograman Web',
  type: 'true_false' as const,
  body: 'CSS mengatur tampilan halaman.',
  answer: true,
  difficulty: 'easy' as const,
  tags: ['css'],
  points: 50,
};

const matchingQuestion = {
  id: MATCH_ID,
  subject: 'Pemrograman Web',
  type: 'matching' as const,
  body: 'Pasangkan tag HTML.',
  pairs: [
    { id: 'p1', prompt: '<a>', match: 'Tautan' },
    { id: 'p2', prompt: '<img>', match: 'Gambar' },
  ],
  answer: { p1: 'p1', p2: 'p2' },
  difficulty: 'medium' as const,
  tags: ['html'],
  points: 40,
};

const essayQuestion = {
  id: ESSAY_ID,
  subject: 'Pemrograman Web',
  type: 'essay' as const,
  body: 'Jelaskan fungsi CSS.',
  guideAnswer: 'CSS mengatur presentasi halaman.',
  rubric: [
    { id: 'c1', name: 'Konsep', weight: 60, maxScore: 100 },
    { id: 'c2', name: 'Contoh', weight: 40, maxScore: 100 },
  ],
  difficulty: 'medium' as const,
  tags: ['css'],
  points: 50,
};

async function buildService(
  prisma: Record<string, unknown>,
  emit = jest.fn(),
  emitAsync = jest.fn().mockResolvedValue([]),
) {
  const prismaWithTransaction = prisma as Record<string, unknown> & { $transaction?: (callback: (tx: Record<string, unknown>) => unknown) => unknown };
  prismaWithTransaction.$transaction ??= jest.fn((callback: (tx: Record<string, unknown>) => unknown) => callback(prismaWithTransaction));
  prismaWithTransaction.assessmentEventOutbox ??= {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn(),
  };
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      AssessmentService,
      { provide: PrismaService, useValue: prismaWithTransaction },
      { provide: EventEmitter2, useValue: { emit, emitAsync } },
    ],
  }).compile();
  return moduleRef.get(AssessmentService);
}

function studentPrisma(overrides: Record<string, unknown> = {}) {
  return {
    student: { findFirst: jest.fn().mockResolvedValue({ id: 'student-1', classId: 'class-1' }) },
    ...overrides,
  };
}

describe('Assessment strict DTO contracts', () => {
  it('rejects client startedAt and extra submit fields', () => {
    expect(SubmitResponseSchema.safeParse({
      answers: { [MC_ID]: { type: 'multiple_choice', optionId: 'a' } },
      startedAt: '2026-08-06T01:00:00.000Z',
    }).success).toBe(false);
  });

  it('rejects raw session questions in favor of questionSelections', () => {
    expect(CreateAssessmentSessionSchema.safeParse({
      moduleId: '55555555-5555-4555-8555-555555555555',
      title: 'Formatif HTML',
      type: 'formatif',
      questions: [mcQuestion],
      academicYear: '2026/2027',
      semester: 1,
    }).success).toBe(false);
  });

  it('requires sumatif grade target and validates question payload structure', () => {
    expect(CreateAssessmentSessionSchema.safeParse({
      moduleId: '55555555-5555-4555-8555-555555555555',
      title: 'Sumatif Tengah Semester',
      type: 'sumatif',
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
      academicYear: '2026/2027',
      semester: 1,
    }).success).toBe(false);

    expect(QuestionPayloadSchema.safeParse({
      ...mcQuestion,
      id: undefined,
      points: undefined,
      options: [
        { id: 'a', text: 'Sama' },
        { id: 'a', text: 'Sama' },
      ],
      answer: 'missing',
    }).success).toBe(false);
  });
});

describe('AssessmentService runtime attempt contract', () => {
  it('uses server-side startedAt and rejects expired attempts', async () => {
    const updateMany = jest.fn();
    const service = await buildService(studentPrisma({
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          classId: 'class-1',
          questions: [mcQuestion],
          durationMinutes: 30,
        }),
      },
      assessmentResponse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'response-1',
          startedAt: new Date(Date.now() - 35 * 60 * 1000),
          submittedAt: null,
          itemScores: [],
        }),
        updateMany,
      },
    }));

    await expect(
      service.submitResponse('session-1', {
        answers: { [MC_ID]: { type: 'multiple_choice', optionId: 'a' } },
      }, SISWA),
    ).rejects.toThrow(ConflictException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('updates an in-progress attempt and never creates submit records from client time', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'response-1',
      sessionId: 'session-1',
      score: 100,
      submittedAt: new Date(),
      startedAt: new Date(),
      timeSpentSec: 10,
      itemScores: [],
    });
    const service = await buildService(studentPrisma({
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          classId: 'class-1',
          questions: [mcQuestion, trueFalseQuestion],
          durationMinutes: 30,
        }),
      },
      assessmentResponse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'response-1',
          startedAt: new Date(),
          submittedAt: null,
          itemScores: [],
        }),
        updateMany,
        findUniqueOrThrow,
      },
    }));

    await service.submitResponse('session-1', {
      answers: {
        [MC_ID]: { type: 'multiple_choice', optionId: 'a' },
        [TF_ID]: { type: 'true_false', value: true },
      },
    }, SISWA);

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'response-1', submittedAt: null },
      data: expect.objectContaining({ score: 100 }),
    }));
    expect(findUniqueOrThrow).toHaveBeenCalled();
  });

  it('resumes the persisted question order and hides answer keys from students', async () => {
    const service = await buildService(studentPrisma({
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          classId: 'class-1',
          questions: [mcQuestion, trueFalseQuestion],
          durationMinutes: null,
          randomizeOrder: true,
        }),
      },
      assessmentResponse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'response-1',
          startedAt: new Date('2026-08-06T01:00:00.000Z'),
          submittedAt: null,
          answers: { [TF_ID]: { type: 'true_false', value: true } },
          questionOrder: [TF_ID, MC_ID],
        }),
      },
    }));

    const result = await service.startResponse('session-1', SISWA);

    expect(result.questions.map((question: { id: string }) => question.id)).toEqual([TF_ID, MC_ID]);
    expect(result.answers).toEqual({ [TF_ID]: { type: 'true_false', value: true } });
    expect(result.questions[1]).not.toHaveProperty('answer');
  });

  it('handles concurrent start race by returning the existing in-progress attempt', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const responseFindUnique = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'response-raced',
        startedAt: new Date('2026-08-06T01:00:00.000Z'),
        submittedAt: null,
        answers: {},
        questionOrder: [MC_ID],
      });
    const service = await buildService(studentPrisma({
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          classId: 'class-1',
          questions: [mcQuestion],
          durationMinutes: null,
          randomizeOrder: false,
        }),
      },
      assessmentResponse: {
        findUnique: responseFindUnique,
        create: jest.fn().mockRejectedValue(p2002),
      },
    }));

    const result = await service.startResponse('session-1', SISWA);

    expect(result.responseId).toBe('response-raced');
    expect(responseFindUnique).toHaveBeenCalledTimes(2);
  });

  it('sanitizes matching questions without exposing raw pair mapping', async () => {
    const service = await buildService(studentPrisma({
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          classId: 'class-1',
          questions: [matchingQuestion],
          durationMinutes: null,
          randomizeOrder: false,
        }),
      },
      assessmentResponse: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'response-1',
          startedAt: new Date('2026-08-06T01:00:00.000Z'),
          questionOrder: [MATCH_ID],
        }),
      },
    }));

    const result = await service.startResponse('session-1', SISWA);
    const question = result.questions[0] as Record<string, unknown>;

    expect(question).toHaveProperty('prompts');
    expect(question).toHaveProperty('choices');
    expect(question).not.toHaveProperty('pairs');
    expect(question).not.toHaveProperty('answer');
  });
});

describe('AssessmentService grading and analysis', () => {
  it('rejects starting a draft session when the owner no longer has the teaching assignment', async () => {
    const updateMany = jest.fn();
    const service = await buildService({
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: 'teacher-1' }) },
      teachingAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      assessmentSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'draft',
          classId: 'class-1',
          academicYear: '2026/2027',
          semester: 1,
          module: { subject: 'Pemrograman Web', classId: 'class-1' },
        }),
        updateMany,
      },
    });

    await expect(service.startSession('session-1', GURU)).rejects.toThrow(ForbiddenException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('keeps mixed auto/manual submissions pending until essay is graded', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = await buildService(studentPrisma({
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          classId: 'class-1',
          questions: [mcQuestion, essayQuestion],
          durationMinutes: null,
        }),
      },
      assessmentResponse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'response-1',
          startedAt: new Date(),
          submittedAt: null,
          itemScores: [],
        }),
        updateMany,
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'response-1',
          sessionId: 'session-1',
          score: null,
          itemScores: [],
          submittedAt: new Date(),
          startedAt: new Date(),
          timeSpentSec: 1,
        }),
      },
    }));

    await service.submitResponse('session-1', {
      answers: {
        [MC_ID]: { type: 'multiple_choice', optionId: 'a' },
        [ESSAY_ID]: { type: 'essay', text: 'CSS mengatur tampilan.' },
      },
    }, SISWA);

    const updateData = updateMany.mock.calls[0][0].data;
    expect(updateData.score).toBeNull();
    expect(updateData.itemScores).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: MC_ID, status: 'auto' }),
      expect.objectContaining({ questionId: ESSAY_ID, status: 'manual_pending' }),
    ]));
  });

  it('grades essay from immutable session snapshot rubric', async () => {
    const responseUpdate = jest.fn().mockImplementation((args: { data: { score: number | null; itemScores: unknown } }) =>
      Promise.resolve({ id: 'response-1', sessionId: 'session-1', score: args.data.score, itemScores: args.data.itemScores, submittedAt: new Date() }));
    const service = await buildService({
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: 'teacher-1' }) },
      teachingAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1' }) },
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          teacherId: 'teacher-1',
          questions: [essayQuestion],
          title: 'Esai CSS',
          type: 'formatif',
          moduleId: 'module-1',
          classId: 'class-1',
          academicYear: '2026/2027',
          semester: 1,
          gradeTarget: 'uh',
          module: { subject: 'Pemrograman Web', teacherId: 'teacher-1' },
        }),
      },
      assessmentResponse: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'response-1',
          answers: { [ESSAY_ID]: { type: 'essay', text: 'CSS mengatur tampilan.' } },
          itemScores: [],
          submittedAt: new Date(),
        }),
        update: responseUpdate,
      },
    });

    const result = await service.gradeEssayResponse('session-1', 'response-1', {
      questionId: ESSAY_ID,
      criteriaScores: { c1: 80, c2: 70 },
    }, GURU);

    expect(result.score).toBe(76);
    expect(responseUpdate.mock.calls[0][0].data.itemScores).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: ESSAY_ID, status: 'manual_scored', scorePct: 76 }),
    ]));
  });

  it('rejects essay grading when the owner no longer has the teaching assignment', async () => {
    const responseFindFirst = jest.fn();
    const service = await buildService({
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: 'teacher-1' }) },
      teachingAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          teacherId: 'teacher-1',
          questions: [essayQuestion],
          title: 'Esai CSS',
          type: 'formatif',
          moduleId: 'module-1',
          classId: 'class-1',
          academicYear: '2026/2027',
          semester: 1,
          gradeTarget: 'uh',
          module: { subject: 'Pemrograman Web', teacherId: 'teacher-1' },
        }),
      },
      assessmentResponse: { findFirst: responseFindFirst },
    });

    await expect(service.gradeEssayResponse('session-1', 'response-1', {
      questionId: ESSAY_ID,
      criteriaScores: { c1: 80, c2: 70 },
    }, GURU)).rejects.toThrow(ForbiddenException);
    expect(responseFindFirst).not.toHaveBeenCalled();
  });

  it('creates Grade idempotently by source assessment session on completion', async () => {
    const emit = jest.fn();
    const gradeUpsert = jest.fn().mockResolvedValue({ id: 'grade-1', studentId: 'student-1', type: 'uh' });
    const outboxCreateMany = jest.fn().mockResolvedValue({ count: 2 });
    const service = await buildService({
      teacher: {
        findFirst: jest.fn().mockResolvedValue({ id: 'teacher-1' }),
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-teacher-1' }),
      },
      assessmentSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          title: 'Formatif HTML',
          type: 'formatif',
          moduleId: 'module-1',
          classId: 'class-1',
          academicYear: '2026/2027',
          semester: 1,
          questions: [mcQuestion],
          gradeTarget: 'uh',
          module: { subject: 'Pemrograman Web', teacherId: 'teacher-1' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'session-1', status: 'completed' }),
      },
      assessmentResponse: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'response-1', studentId: 'student-1', score: 88, itemScores: [{ questionId: MC_ID, status: 'auto' }] },
        ]),
      },
      teachingAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1', academicYear: '2026/2027' }) },
      grade: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: gradeUpsert,
      },
      assessmentEventOutbox: {
        createMany: outboxCreateMany,
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    }, emit);

    const result = await service.completeSession('session-1', GURU);

    expect(result.gradingSummary).toEqual({ gradedCount: 1, pendingManualCount: 0, skippedCount: 0, gradeTarget: 'uh' });
    expect(gradeUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ sourceAssessmentSessionId: 'session-1', type: 'uh' }),
    }));
    expect(outboxCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ eventType: 'grade.submitted', dedupeKey: 'grade.submitted:grade-1' }),
        expect.objectContaining({ eventType: 'assessment.completed', dedupeKey: 'assessment.completed:session-1' }),
      ]),
      skipDuplicates: true,
    }));
    expect(emit).not.toHaveBeenCalled();
  });

  it('marks outbox events emitted only after async listeners complete', async () => {
    const emitAsync = jest.fn().mockResolvedValue(['ok']);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue({});
    const service = await buildService({
      assessmentEventOutbox: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-1',
            eventType: 'grade.submitted',
            payload: { gradeId: 'grade-1', deliveryMode: 'outbox' },
            attempts: 0,
          },
        ]),
        updateMany,
        update,
      },
    }, jest.fn(), emitAsync);

    await (service as unknown as { dispatchAssessmentEventOutbox: () => Promise<void> }).dispatchAssessmentEventOutbox();

    expect(emitAsync).toHaveBeenCalledWith('grade.submitted', { gradeId: 'grade-1', deliveryMode: 'outbox' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event-1' },
      data: expect.objectContaining({ status: 'emitted', lastError: null }),
    }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'event-1' }),
      data: expect.objectContaining({ status: 'emitting' }),
    }));
  });

  it('keeps outbox events retryable when async listeners fail', async () => {
    const emitAsync = jest.fn().mockRejectedValue(new Error('listener failed'));
    const update = jest.fn().mockResolvedValue({});
    const service = await buildService({
      assessmentEventOutbox: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-1',
            eventType: 'assessment.completed',
            payload: { sessionId: 'session-1', deliveryMode: 'outbox' },
            attempts: 0,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update,
      },
    }, jest.fn(), emitAsync);

    await (service as unknown as { dispatchAssessmentEventOutbox: () => Promise<void> }).dispatchAssessmentEventOutbox();

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event-1' },
      data: expect.objectContaining({
        status: 'failed',
        lastError: 'listener failed',
        nextAttemptAt: expect.any(Date),
      }),
    }));
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'emitted' }),
    }));
  });

  it('dead-letters outbox events after the retry limit', async () => {
    const emitAsync = jest.fn().mockRejectedValue(new Error('listener failed'));
    const update = jest.fn().mockResolvedValue({});
    const service = await buildService({
      assessmentEventOutbox: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-1',
            eventType: 'assessment.completed',
            payload: { sessionId: 'session-1', deliveryMode: 'outbox' },
            attempts: 4,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update,
      },
    }, jest.fn(), emitAsync);

    await (service as unknown as { dispatchAssessmentEventOutbox: () => Promise<void> }).dispatchAssessmentEventOutbox();

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event-1' },
      data: expect.objectContaining({
        status: 'dead_letter',
        lastError: 'listener failed',
        deadLetterAt: expect.any(Date),
      }),
    }));
  });

  it('exposes PII-safe outbox health for reviewers', async () => {
    const service = await buildService({
      assessmentEventOutbox: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'pending', _count: { _all: 2 } },
          { status: 'dead_letter', _count: { _all: 1 } },
          { status: 'emitted', _count: { _all: 7 } },
        ]),
        findFirst: jest.fn().mockResolvedValue({ createdAt: new Date('2026-08-10T01:00:00.000Z') }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-dead',
            eventType: 'grade.submitted',
            attempts: 5,
            lastError: 'listener failed',
            deadLetterAt: new Date('2026-08-10T02:00:00.000Z'),
            updatedAt: new Date('2026-08-10T02:00:00.000Z'),
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    });

    await expect(service.getOutboxHealth(SUPER_ADMIN)).resolves.toEqual({
      counts: { pending: 2, emitting: 0, failed: 0, emitted: 7, deadLetter: 1 },
      oldestRetryableAt: new Date('2026-08-10T01:00:00.000Z'),
      recentDeadLetters: [
        {
          id: 'event-dead',
          eventType: 'grade.submitted',
          attempts: 5,
          lastError: 'listener failed',
          deadLetterAt: new Date('2026-08-10T02:00:00.000Z'),
          updatedAt: new Date('2026-08-10T02:00:00.000Z'),
        },
      ],
    });
  });

  it('does not create Grade for diagnostic sessions', async () => {
    const gradeUpsert = jest.fn();
    const service = await buildService({
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: 'teacher-1' }) },
      assessmentSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          title: 'Diagnostik awal',
          type: 'diagnostik',
          moduleId: 'module-1',
          classId: 'class-1',
          academicYear: '2026/2027',
          semester: 1,
          questions: [mcQuestion],
          gradeTarget: null,
          module: { subject: 'Pemrograman Web', teacherId: 'teacher-1' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'session-1', status: 'completed' }),
      },
      assessmentResponse: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'response-1', studentId: 'student-1', score: 88, itemScores: [{ questionId: MC_ID, status: 'auto' }] },
        ]),
      },
      grade: { upsert: gradeUpsert },
    });

    const result = await service.completeSession('session-1', GURU);

    expect(result.gradingSummary.gradeTarget).toBeNull();
    expect(gradeUpsert).not.toHaveBeenCalled();
  });

  it('computes item analysis from typed answers and item scores', async () => {
    const service = await buildService({
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: 'teacher-1' }) },
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          title: 'Analisis',
          type: 'formatif',
          status: 'completed',
          teacherId: 'teacher-1',
          classId: 'class-1',
          questions: [mcQuestion, trueFalseQuestion],
        }),
      },
      assessmentResponse: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            score: 100,
            itemScores: [],
            answers: {
              [MC_ID]: { type: 'multiple_choice', optionId: 'a' },
              [TF_ID]: { type: 'true_false', value: true },
            },
          },
          {
            id: 'r2',
            score: 0,
            itemScores: [],
            answers: {
              [MC_ID]: { type: 'multiple_choice', optionId: 'b' },
              [TF_ID]: { type: 'true_false', value: false },
            },
          },
        ]),
      },
    });

    const result = await service.getSessionAnalysis('session-1', GURU);

    expect(result.summary.totalStudents).toBe(2);
    expect(result.itemAnalysis[0]).toEqual(expect.objectContaining({ questionId: MC_ID, correctCount: 1, wrongCount: 1 }));
    expect(result.itemAnalysis[1]).toEqual(expect.objectContaining({ questionId: TF_ID, correctCount: 1, wrongCount: 1 }));
  });
});
