jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { AssessmentService } from '../assessment/assessment.service';
import { RemedialController } from '../assessment/remedial.controller';
import {
  CreateAssessmentSessionSchema,
  CreateRemedialSessionSchema,
  FamilyRemedialQuerySchema,
  FinalizeRemedialParticipantSchema,
  ListAssessmentSessionSchema,
  RetryRemedialParticipantSchema,
  SubmitResponseSchema,
} from '../assessment/dto/assessment.dto';
import { QuestionPayloadSchema } from '../assessment/assessment-contract';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';

const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SUPER_ADMIN: AuthUser = { keycloakId: 'kc-sa', username: 'sa', roles: ['SUPER_ADMIN'] } as AuthUser;
const ORANG_TUA: AuthUser = { keycloakId: 'kc-ortu', username: 'ortu1', roles: ['ORANG_TUA'] } as AuthUser;

const MC_ID = '11111111-1111-4111-8111-111111111111';
const TF_ID = '22222222-2222-4222-8222-222222222222';
const MATCH_ID = '33333333-3333-4333-8333-333333333333';
const ESSAY_ID = '44444444-4444-4444-8444-444444444444';
const ESSAY_TWO_ID = '55555555-5555-4555-8555-555555555555';

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

const secondEssayQuestion = {
  ...essayQuestion,
  id: ESSAY_TWO_ID,
  body: 'Jelaskan fungsi JavaScript.',
  rubric: [
    { id: 'd1', name: 'Konsep', weight: 50, maxScore: 100 },
    { id: 'd2', name: 'Contoh', weight: 50, maxScore: 100 },
  ],
};

async function buildService(
  prisma: Record<string, unknown>,
  emit = jest.fn(),
  emitAsync = jest.fn().mockResolvedValue([]),
  notificationService?: { enqueueCommittedPendingLogs: jest.Mock },
) {
  const prismaWithTransaction = prisma as Record<string, unknown> & { $transaction?: (callback: (tx: Record<string, unknown>) => unknown) => unknown };
  prismaWithTransaction.$transaction ??= jest.fn((callback: (tx: Record<string, unknown>) => unknown) => callback(prismaWithTransaction));
  prismaWithTransaction.assessmentEventOutbox ??= {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn(),
  };
  prismaWithTransaction.academicYear ??= {
    findMany: jest.fn().mockResolvedValue([{ code: '2026/2027' }]),
  };
  prismaWithTransaction.teachingAssignment ??= {
    findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
  };
  prismaWithTransaction.notificationLog = {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    ...(prismaWithTransaction.notificationLog as Record<string, unknown> | undefined),
  };
  prismaWithTransaction.remedialParticipant = {
    findMany: jest.fn().mockResolvedValue([]),
    ...(prismaWithTransaction.remedialParticipant as Record<string, unknown> | undefined),
  };
  prismaWithTransaction.$queryRaw ??= jest.fn().mockResolvedValue([]);
  prismaWithTransaction.$executeRaw ??= jest.fn().mockResolvedValue(0);
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      AssessmentService,
      { provide: PrismaService, useValue: prismaWithTransaction },
      { provide: EventEmitter2, useValue: { emit, emitAsync } },
      {
        provide: AcademicPeriodService,
        useValue: {
          assertWritablePeriodWithCutoverLock: jest.fn().mockResolvedValue(undefined),
        },
      },
      ...(notificationService ? [{ provide: NotificationService, useValue: notificationService }] : []),
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

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
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

  it('uses strict remedial DTO boundaries', () => {
    expect(CreateRemedialSessionSchema.safeParse({
      title: 'Remedial HTML',
      sourceGradeIds: ['66666666-6666-4666-8666-666666666666'],
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
      dueAt: '2026-08-13T09:00:00+07:00',
      clientGradeOverride: 100,
    }).success).toBe(false);

    expect(FinalizeRemedialParticipantSchema.safeParse({
      participantId: '77777777-7777-4777-8777-777777777777',
      score: 100,
    }).success).toBe(false);

    expect(RetryRemedialParticipantSchema.safeParse({
      participantId: '77777777-7777-4777-8777-777777777777',
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
      reuseResponse: true,
    }).success).toBe(false);

    expect(ListAssessmentSessionSchema.safeParse({
      purpose: 'remedial',
      studentId: '11111111-1111-4111-8111-111111111111',
    }).success).toBe(false);

    expect(FamilyRemedialQuerySchema.safeParse({
      studentId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      page: '1',
      limit: '5',
    }).success).toBe(true);

    expect(FamilyRemedialQuerySchema.safeParse({
      studentId: '11111111-1111-4111-8111-111111111111',
      questions: true,
    }).success).toBe(false);

    expect(FamilyRemedialQuerySchema.safeParse({
      studentId: '11111111-1111-4111-8111-111111111111',
      status: 'cancelled',
    }).success).toBe(false);
  });
});

describe('RemedialController role boundary', () => {
  it('keeps oversight roles read-only and makes remedial mutations GURU-only', () => {
    expect(Reflect.getMetadata('roles', RemedialController.prototype.findAll)).toEqual([
      'SUPER_ADMIN',
      'KEPALA_SEKOLAH',
      'WAKA_KURIKULUM',
      'GURU',
      'SISWA',
    ]);
    expect(Reflect.getMetadata('roles', RemedialController.prototype.family)).toEqual(['ORANG_TUA']);
    for (const method of ['candidates', 'create', 'update', 'activate', 'cancel', 'finalize', 'retry'] as const) {
      expect(Reflect.getMetadata('roles', RemedialController.prototype[method])).toEqual(['GURU']);
    }
  });
});

describe('AssessmentService remedial runtime contract', () => {
  const GRADE_ID = '66666666-6666-4666-8666-666666666666';
  const PARTICIPANT_ID = '77777777-7777-4777-8777-777777777777';
  const SESSION_ID = '88888888-8888-4888-8888-888888888888';
  const RETRY_SESSION_ID = '99999999-9999-4999-8999-999999999999';
  const UPDATED_AT = new Date('2026-08-13T01:00:00.000Z');
  const SUBMITTED_AT = new Date('2026-08-13T02:00:00.000Z');
  const assignment = {
    id: 'assignment-1',
    teacherId: 'teacher-1',
    classId: 'class-1',
    subject: 'Pemrograman Web',
    academicYear: '2026/2027',
  };
  const sourceGrade = {
    id: GRADE_ID,
    studentId: 'student-1',
    score: 60,
    type: 'uh',
    academicYear: '2026/2027',
    semester: 1,
    updatedAt: UPDATED_AT,
    sourceAssessmentSessionId: null,
    assignment,
  };

  function baseRemedialPrisma(overrides: Record<string, unknown> = {}) {
    return {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-guru-1' }) },
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: 'teacher-1' }) },
      question: { findMany: jest.fn().mockResolvedValue([mcQuestion]) },
      kktpConfig: { findUnique: jest.fn().mockResolvedValue({ kktp: 80 }) },
      reportCard: { findFirst: jest.fn().mockResolvedValue(null) },
      grade: {
        findMany: jest.fn().mockResolvedValue([sourceGrade]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      assessmentResponse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'response-1',
          score: 80,
          submittedAt: SUBMITTED_AT,
          itemScores: [{ questionId: MC_ID, status: 'auto' }],
        }),
      },
      assessmentSession: {
        create: jest.fn().mockResolvedValue({ id: SESSION_ID }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: SESSION_ID, purpose: 'remedial' }),
      },
      remedialParticipant: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: PARTICIPANT_ID }),
        findFirst: jest.fn().mockResolvedValue({
          id: PARTICIPANT_ID,
          status: 'submitted',
          sourceGradeUpdatedAt: UPDATED_AT,
          kktpValue: 80,
          session: {
            id: SESSION_ID,
            title: 'Remedial HTML',
            status: 'active',
            teacherId: 'teacher-1',
            type: 'formatif',
            academicYear: '2026/2027',
            semester: 1,
            teachingAssignment: assignment,
          },
          sourceGrade,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: PARTICIPANT_ID,
          status: 'passed',
          sourceGrade,
          student: { nis: '2026001', user: { fullName: 'Siswa Remedial' } },
        }),
      },
      ...overrides,
    };
  }

  it('rejects duplicate source Grade ids before touching persistence', async () => {
    const prisma = baseRemedialPrisma();
    const service = await buildService(prisma);

    await expect(service.createRemedialSession({
      title: 'Remedial HTML',
      sourceGradeIds: [GRADE_ID, GRADE_ID],
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
    }, GURU)).rejects.toThrow(BadRequestException);
    expect((prisma.grade as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
  });

  it('creates a remedial draft with exact TeachingAssignment and moduleId null', async () => {
    const prisma = baseRemedialPrisma({
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const service = await buildService(prisma);

    await service.createRemedialSession({
      title: 'Remedial HTML',
      sourceGradeIds: [GRADE_ID],
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
      dueAt: '2026-08-13T09:00:00+07:00',
      instructions: 'Kerjakan ulang soal dasar HTML.',
    }, GURU);

    const sessionCreate = (prisma.assessmentSession as { create: jest.Mock }).create.mock.calls[0][0];
    expect(sessionCreate.data).toEqual(expect.objectContaining({
      purpose: 'remedial',
      moduleId: null,
      teachingAssignmentId: 'assignment-1',
      teacherId: 'teacher-1',
      classId: 'class-1',
      gradeTarget: null,
    }));
    expect((prisma.remedialParticipant as { createMany: jest.Mock }).createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        sessionId: SESSION_ID,
        sourceGradeId: GRADE_ID,
        sourceScore: 60,
        sourceGradeUpdatedAt: UPDATED_AT,
        kktpValue: 80,
        kktpProvenance: 'config',
      })],
    }));
    const rawPrisma = prisma as unknown as { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
    expect(rawPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect((rawPrisma.$executeRaw.mock.calls[0][0] as Prisma.Sql).values.join(' ')).toContain('appointment_due_activation');
    expect((rawPrisma.$executeRaw.mock.calls[1][0] as Prisma.Sql).values.join(' ')).toContain('report-grade');
    expect(rawPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('uses explicit system-default KKTP when grade context is complete and no config exists', async () => {
    const prisma = baseRemedialPrisma({
      kktpConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const service = await buildService(prisma);

    await service.createRemedialSession({
      title: 'Remedial HTML',
      sourceGradeIds: [GRADE_ID],
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
    }, GURU);

    expect((prisma.remedialParticipant as { createMany: jest.Mock }).createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        kktpValue: 75,
        kktpProvenance: 'system_default',
      })],
    }));
  });

  it('rejects remedial creation when grade context cannot resolve KKTP', async () => {
    const incompleteGrade = {
      ...sourceGrade,
      assignment: { ...assignment, subject: '' },
    };
    const prisma = baseRemedialPrisma({
      grade: {
        findMany: jest.fn().mockResolvedValue([incompleteGrade]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const service = await buildService(prisma);

    await expect(service.createRemedialSession({
      title: 'Remedial HTML',
      sourceGradeIds: [GRADE_ID],
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
    }, GURU)).rejects.toThrow(ConflictException);
  });

  it('rejects remedial creation from historical TeachingAssignment', async () => {
    const historicalGrade = {
      ...sourceGrade,
      academicYear: '2025/2026',
      assignment: { ...assignment, academicYear: '2025/2026' },
    };
    const prisma = baseRemedialPrisma({
      grade: {
        findMany: jest.fn().mockResolvedValue([historicalGrade]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const service = await buildService(prisma);

    await expect(service.createRemedialSession({
      title: 'Remedial HTML',
      sourceGradeIds: [GRADE_ID],
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
    }, GURU)).rejects.toThrow(ConflictException);
    expect((prisma.assessmentSession as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it('updates remedial drafts with owner and updatedAt CAS under the cutover lock', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const current = {
      id: SESSION_ID,
      status: 'draft',
      purpose: 'remedial',
      updatedAt: UPDATED_AT,
      teacherId: 'teacher-1',
      teachingAssignment: assignment,
    };
    const prisma = baseRemedialPrisma({
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue(current),
        updateMany,
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: SESSION_ID, purpose: 'remedial' }),
      },
    });
    const service = await buildService(prisma);

    await service.updateRemedialSession(SESSION_ID, { title: 'Remedial HTML Revisi' }, GURU);

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: SESSION_ID,
        status: 'draft',
        purpose: 'remedial',
        teacherId: 'teacher-1',
        updatedAt: UPDATED_AT,
      }),
    }));
    const rawPrisma = prisma as unknown as { $executeRaw: jest.Mock };
    expect((rawPrisma.$executeRaw.mock.calls[0][0] as Prisma.Sql).values.join(' ')).toContain('appointment_due_activation');
  });

  it('rejects stale remedial draft updates after another request changes the row', async () => {
    const updateMany = jest.fn();
    const stale = {
      id: SESSION_ID,
      status: 'draft',
      purpose: 'remedial',
      updatedAt: UPDATED_AT,
      teacherId: 'teacher-1',
      teachingAssignment: assignment,
    };
    const current = {
      ...stale,
      updatedAt: new Date(UPDATED_AT.getTime() + 1_000),
    };
    const assessmentFindUnique = jest
      .fn()
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(current);
    const prisma = baseRemedialPrisma({
      assessmentSession: {
        findUnique: assessmentFindUnique,
        updateMany,
      },
    });
    const service = await buildService(prisma);

    await expect(service.updateRemedialSession(SESSION_ID, { title: 'Late stale update' }, GURU)).rejects.toThrow(ConflictException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('requires ORANG_TUA to select an owned child before reading family remedials', async () => {
    const childOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const childTwo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const prisma = baseRemedialPrisma({
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'parent-user-1' }) },
      student: { findMany: jest.fn().mockResolvedValue([{ id: childOne }, { id: childTwo }]) },
      assessmentSession: {
        ...(baseRemedialPrisma().assessmentSession as Record<string, unknown>),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    });
    const service = await buildService(prisma);

    await expect(service.listRemedials({ page: 1, limit: 20 }, ORANG_TUA)).rejects.toThrow(ForbiddenException);
    await expect(service.listFamilyRemedials({ page: 1, limit: 5, studentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }, ORANG_TUA)).rejects.toThrow(ForbiddenException);

    await service.listFamilyRemedials({ page: 1, limit: 5, studentId: childOne }, ORANG_TUA);
    expect((prisma.assessmentSession as unknown as { findMany: jest.Mock }).findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        remedialParticipants: { some: { studentId: childOne, status: { not: 'cancelled' } } },
      }),
    }));
  });

  it('returns a privacy-safe family remedial projection without questions or answer material', async () => {
    const childOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const participantId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const assessmentFindMany = jest.fn().mockResolvedValue([{
      id: SESSION_ID,
      title: 'Remedial HTML',
      type: 'formatif',
      status: 'active',
      dueAt: new Date('2026-08-20T02:00:00.000Z'),
      academicYear: '2026/2027',
      semester: 1,
      createdAt: new Date('2026-08-13T02:00:00.000Z'),
      teachingAssignment: { subject: 'Pemrograman Web' },
      remedialParticipants: [{
        id: participantId,
        status: 'needs_retry',
        assignedAt: new Date('2026-08-13T02:00:00.000Z'),
        startedAt: null,
        submittedAt: new Date('2026-08-14T02:00:00.000Z'),
        finalizedAt: new Date('2026-08-14T03:00:00.000Z'),
        retryOfParticipantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        retryRootParticipantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        sourceGradeId: GRADE_ID,
      }],
    }]);
    const prisma = baseRemedialPrisma({
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'parent-user-1' }) },
      student: { findMany: jest.fn().mockResolvedValue([{ id: childOne }]) },
      assessmentSession: {
        ...(baseRemedialPrisma().assessmentSession as Record<string, unknown>),
        findMany: assessmentFindMany,
        count: jest.fn().mockResolvedValue(1),
      },
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findMany: jest.fn().mockResolvedValue([
          { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', sourceGradeId: GRADE_ID },
          { id: participantId, sourceGradeId: GRADE_ID },
        ]),
      },
    });
    const service = await buildService(prisma);

    const result = await service.listFamilyRemedials({ page: 1, limit: 5, studentId: childOne }, ORANG_TUA);
    const select = assessmentFindMany.mock.calls[0][0].select;

    expect(select).not.toEqual(expect.objectContaining({ questions: true, class: expect.anything(), teacher: expect.anything() }));
    expect(result.data[0]).toEqual(expect.objectContaining({
      title: 'Remedial HTML',
      subject: 'Pemrograman Web',
      participant: expect.objectContaining({
        status: 'needs_retry',
        attemptNumber: 2,
        outcome: 'needs_retry',
      }),
    }));
    const keys = collectKeys(result);
    for (const forbidden of [
      'id',
      'questions',
      'options',
      'answer',
      'rubric',
      'guideAnswer',
      'sourceScore',
      'rawScore',
      'effectiveScore',
      'assignedAt',
      'startedAt',
      'submittedAt',
      'finalizedAt',
      'retryOfParticipantId',
      'retryRootParticipantId',
      'sourceGradeId',
      'createdAt',
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it('rejects creating a new remedial when the source Grade already needs retry', async () => {
    const prisma = baseRemedialPrisma({
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findFirst: jest.fn().mockResolvedValue({ id: PARTICIPANT_ID, status: 'needs_retry' }),
      },
    });
    const service = await buildService(prisma);

    await expect(service.createRemedialSession({
      title: 'Remedial HTML',
      sourceGradeIds: [GRADE_ID],
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
    }, GURU)).rejects.toThrow(ConflictException);
    expect((prisma.assessmentSession as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it('activation creates participant-bound assignment notifications', async () => {
    const notificationCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = baseRemedialPrisma({
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          status: 'draft',
          purpose: 'remedial',
          teachingAssignment: assignment,
          _count: { remedialParticipants: 1 },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: SESSION_ID, title: 'Remedial HTML', purpose: 'remedial' }),
      },
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findMany: jest.fn().mockResolvedValue([{
          id: PARTICIPANT_ID,
          student: {
            user: { phone: '081444444444' },
            parent: { phone: '081444444444' },
          },
        }]),
      },
      notificationLog: {
        createMany: notificationCreateMany,
        findMany: jest.fn().mockResolvedValue([{ id: 'existing-assignment-log' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const notificationService = { enqueueCommittedPendingLogs: jest.fn().mockResolvedValue({ queuedCount: 1 }) };
    const service = await buildService(prisma, undefined, undefined, notificationService);

    const result = await service.activateRemedialSession(SESSION_ID, GURU);

    expect(notificationCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        recipient: '+6281444444444',
        refType: 'remedial_assignment',
        refId: `${SESSION_ID}:${PARTICIPANT_ID}:assigned:+6281444444444`,
      })],
      skipDuplicates: true,
    }));
    expect(notificationService.enqueueCommittedPendingLogs).toHaveBeenCalledWith(['existing-assignment-log']);
    expect(result.notificationHandoff).toEqual({ status: 'queued', requestedCount: 1, queuedCount: 1 });
  });

  it('due reminder scanner writes idempotent pending reminder logs', async () => {
    const notificationCreateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = baseRemedialPrisma({
      assessmentSession: {
        ...(baseRemedialPrisma().assessmentSession as Record<string, unknown>),
        findMany: jest.fn().mockResolvedValue([{ id: SESSION_ID, title: 'Remedial HTML', dueAt: new Date(Date.now() + 60_000) }]),
      },
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findMany: jest.fn().mockResolvedValue([{
          id: PARTICIPANT_ID,
          student: {
            user: { phone: '081555555555' },
            parent: { phone: null },
          },
        }]),
      },
      notificationLog: {
        createMany: notificationCreateMany,
        findMany: jest.fn().mockResolvedValue([{ id: 'existing-due-log' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const notificationService = { enqueueCommittedPendingLogs: jest.fn().mockResolvedValue({ queuedCount: 1 }) };
    const service = await buildService(prisma, undefined, undefined, notificationService);

    const result = await service.scanRemedialDueReminders(10);

    expect(result).toEqual({
      sessionCount: 1,
      notificationCount: 1,
      notificationHandoff: { status: 'queued', requestedCount: 1, queuedCount: 1, pendingRecoveryCount: 0 },
    });
    expect(notificationCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        recipient: '+6281555555555',
        refType: 'remedial_due_reminder',
        refId: `${SESSION_ID}:${PARTICIPANT_ID}:due:+6281555555555`,
      })],
      skipDuplicates: true,
    }));
    expect(notificationService.enqueueCommittedPendingLogs).toHaveBeenCalledWith(['existing-due-log']);
  });

  it('reports pending recovery when immediate remedial notification handoff fails after commit', async () => {
    const notificationCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = baseRemedialPrisma({
      assessmentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          status: 'draft',
          purpose: 'remedial',
          teachingAssignment: assignment,
          _count: { remedialParticipants: 1 },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: SESSION_ID, title: 'Remedial HTML', purpose: 'remedial' }),
      },
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findMany: jest.fn().mockResolvedValue([{
          id: PARTICIPANT_ID,
          student: { user: { phone: '081444444444' }, parent: { phone: null } },
        }]),
      },
      notificationLog: {
        createMany: notificationCreateMany,
        findMany: jest.fn().mockResolvedValue([{ id: 'existing-assignment-log' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const notificationService = { enqueueCommittedPendingLogs: jest.fn().mockRejectedValue(new Error('redis down')) };
    const service = await buildService(prisma, undefined, undefined, notificationService);

    const result = await service.activateRemedialSession(SESSION_ID, GURU);

    expect(notificationCreateMany).toHaveBeenCalled();
    expect(result.notificationHandoff).toEqual({ status: 'pending_recovery', requestedCount: 1, queuedCount: 0 });
  });

  it('finalizes a passing remedial by raising source Grade to exact KKTP', async () => {
    const gradeUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = baseRemedialPrisma({
      grade: { findMany: jest.fn(), updateMany: gradeUpdateMany },
    });
    const notificationService = { enqueueCommittedPendingLogs: jest.fn().mockResolvedValue({ queuedCount: 2 }) };
    const service = await buildService(prisma, undefined, undefined, notificationService);

    await service.finalizeRemedialParticipant(SESSION_ID, { participantId: PARTICIPANT_ID }, GURU);

    expect((prisma.remedialParticipant as { updateMany: jest.Mock }).updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'passed', rawScore: 80, effectiveScore: 80 }),
    }));
    expect(gradeUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: GRADE_ID, updatedAt: UPDATED_AT },
      data: expect.objectContaining({ score: 80, submittedBy: 'user-guru-1' }),
    }));
  });

  it('finalization notification is participant-bound and does not include raw scores', async () => {
    const notificationCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = baseRemedialPrisma({
      notificationLog: {
        createMany: notificationCreateMany,
        findMany: jest.fn().mockResolvedValue([{ id: 'existing-result-1' }, { id: 'existing-result-2' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findMany: jest.fn().mockResolvedValue([{
          id: PARTICIPANT_ID,
          student: {
            user: { phone: '081333333333' },
            parent: { phone: '6281333333334' },
          },
        }]),
      },
    });
    const notificationService = { enqueueCommittedPendingLogs: jest.fn().mockResolvedValue({ queuedCount: 2 }) };
    const service = await buildService(prisma, undefined, undefined, notificationService);

    await service.finalizeRemedialParticipant(SESSION_ID, { participantId: PARTICIPANT_ID }, GURU);

    const data = notificationCreateMany.mock.calls[0][0].data;
    expect(data).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipient: '+6281333333333', refType: 'remedial_result' }),
      expect.objectContaining({ recipient: '+6281333333334', refType: 'remedial_result' }),
    ]));
    const messageBodies = data.map((row: { body: string }) => row.body).join('\n');
    expect(messageBodies).not.toContain('80');
    expect(messageBodies).not.toContain('60');
    expect(notificationService.enqueueCommittedPendingLogs).toHaveBeenCalledWith(['existing-result-1', 'existing-result-2']);
  });

  it('does not update source Grade when remedial score is still below KKTP', async () => {
    const gradeUpdateMany = jest.fn();
    const prisma = baseRemedialPrisma({
      grade: { findMany: jest.fn(), updateMany: gradeUpdateMany },
      assessmentResponse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'response-1',
          score: 70,
          submittedAt: SUBMITTED_AT,
          itemScores: [{ questionId: MC_ID, status: 'auto' }],
        }),
      },
    });
    const service = await buildService(prisma);

    await service.finalizeRemedialParticipant(SESSION_ID, { participantId: PARTICIPANT_ID }, GURU);

    expect((prisma.remedialParticipant as { updateMany: jest.Mock }).updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'needs_retry', rawScore: 70, effectiveScore: 70 }),
    }));
    expect(gradeUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects finalization when the source Grade changed after assignment', async () => {
    const prisma = baseRemedialPrisma({
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        findFirst: jest.fn().mockResolvedValue({
          id: PARTICIPANT_ID,
          status: 'submitted',
          sourceGradeUpdatedAt: UPDATED_AT,
          kktpValue: 80,
          session: {
            id: SESSION_ID,
            title: 'Remedial HTML',
            status: 'active',
            teacherId: 'teacher-1',
            type: 'formatif',
            academicYear: '2026/2027',
            semester: 1,
            teachingAssignment: assignment,
          },
          sourceGrade: { ...sourceGrade, updatedAt: new Date('2026-08-13T01:10:00.000Z') },
        }),
      },
    });
    const service = await buildService(prisma);

    await expect(service.finalizeRemedialParticipant(SESSION_ID, { participantId: PARTICIPANT_ID }, GURU))
      .rejects.toThrow(ConflictException);
    expect((prisma.assessmentResponse as { findUnique: jest.Mock }).findUnique).not.toHaveBeenCalled();
  });

  it('retry creates a successor remedial session and participant atomically', async () => {
    const sessionCreate = jest.fn().mockResolvedValue({ id: RETRY_SESSION_ID });
    const participantCreate = jest.fn().mockResolvedValue({ id: 'retry-participant' });
    const prisma = baseRemedialPrisma({
      assessmentSession: {
        create: sessionCreate,
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: RETRY_SESSION_ID, purpose: 'remedial' }),
      },
      remedialParticipant: {
        ...(baseRemedialPrisma().remedialParticipant as Record<string, unknown>),
        create: participantCreate,
        findFirst: jest.fn().mockResolvedValue({
          id: PARTICIPANT_ID,
          retryRootParticipantId: null,
          sourceGradeUpdatedAt: UPDATED_AT,
          status: 'needs_retry',
          sourceGrade,
        }),
      },
    });
    const service = await buildService(prisma);

    await service.retryRemedialParticipant(SESSION_ID, {
      participantId: PARTICIPANT_ID,
      title: 'Retry Remedial HTML',
      questionSelections: [{ questionId: MC_ID, points: 10, order: 0 }],
    }, GURU);

    expect(sessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        purpose: 'remedial',
        moduleId: null,
        teachingAssignmentId: 'assignment-1',
        status: 'draft',
      }),
    }));
    expect(participantCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sessionId: RETRY_SESSION_ID,
        sourceGradeId: GRADE_ID,
        retryOfParticipantId: PARTICIPANT_ID,
        retryRootParticipantId: PARTICIPANT_ID,
      }),
    }));
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
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'response-1' }]);
    const responseUpdate = jest.fn().mockImplementation((args: { data: { score: number | null; itemScores: unknown } }) =>
      Promise.resolve({ id: 'response-1', sessionId: 'session-1', score: args.data.score, itemScores: args.data.itemScores, submittedAt: new Date() }));
    const service = await buildService({
      $queryRaw: queryRaw,
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
        findUnique: jest.fn().mockResolvedValue({
          id: 'response-1',
          sessionId: 'session-1',
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
    const lockSql = queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(lockSql.strings.join(' ')).toContain('FROM "academic"."assessment_responses"');
    expect(lockSql.strings.join(' ')).toContain('FOR UPDATE');
  });

  it('preserves both manual scores when two essay grades arrive concurrently', async () => {
    const submittedAt = new Date();
    const storedResponse: {
      id: string; sessionId: string; answers: Record<string, unknown>;
      itemScores: unknown[]; score: number | null; submittedAt: Date;
    } = {
      id: 'response-1', sessionId: 'session-1', submittedAt, score: null, itemScores: [],
      answers: {
        [ESSAY_ID]: { type: 'essay', text: 'CSS mengatur tampilan.' },
        [ESSAY_TWO_ID]: { type: 'essay', text: 'JavaScript mengatur interaksi.' },
      },
    };
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'response-1' }]);
    const responseFindUnique = jest.fn().mockImplementation(() => Promise.resolve({
      ...storedResponse, itemScores: [...storedResponse.itemScores],
    }));
    const responseUpdate = jest.fn().mockImplementation((args: { data: { score: number | null; itemScores: unknown } }) => {
      storedResponse.score = args.data.score;
      storedResponse.itemScores = args.data.itemScores as unknown[];
      return Promise.resolve({ ...storedResponse });
    });
    const prisma: Record<string, unknown> = {
      $queryRaw: queryRaw,
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: 'teacher-1' }) },
      teachingAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1' }) },
      assessmentSession: { findUnique: jest.fn().mockResolvedValue({
        id: 'session-1', status: 'active', teacherId: 'teacher-1',
        questions: [essayQuestion, secondEssayQuestion], title: 'Dua Esai',
        type: 'formatif', moduleId: 'module-1', classId: 'class-1',
        academicYear: '2026/2027', semester: 1, gradeTarget: 'uh',
        module: { subject: 'Pemrograman Web', teacherId: 'teacher-1' },
      }) },
      assessmentResponse: { findUnique: responseFindUnique, update: responseUpdate },
    };
    let transactionTail: Promise<void> = Promise.resolve();
    const transaction = jest.fn((callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const result = transactionTail.then(() => callback(prisma));
      transactionTail = result.then(() => undefined, () => undefined);
      return result;
    });
    prisma.$transaction = transaction;
    const service = await buildService(prisma);

    await Promise.all([
      service.gradeEssayResponse('session-1', 'response-1', {
        questionId: ESSAY_ID, criteriaScores: { c1: 80, c2: 70 },
      }, GURU),
      service.gradeEssayResponse('session-1', 'response-1', {
        questionId: ESSAY_TWO_ID, criteriaScores: { d1: 90, d2: 80 },
      }, GURU),
    ]);

    expect(storedResponse.itemScores).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: ESSAY_ID, status: 'manual_scored', scorePct: 76 }),
      expect.objectContaining({ questionId: ESSAY_TWO_ID, status: 'manual_scored', scorePct: 85 }),
    ]));
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(queryRaw).toHaveBeenCalledTimes(2);
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
