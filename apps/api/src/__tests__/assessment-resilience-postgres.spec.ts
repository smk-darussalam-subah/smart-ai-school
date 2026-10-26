import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { AssessmentService } from '../assessment/assessment.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionBankService } from '../question-bank/question-bank.service';
import { QuestionPayloadSchema, AssessmentAnswerMap } from '../assessment/assessment-contract';
import { CreateAssessmentSessionSchema } from '../assessment/dto/assessment.dto';
import { parseSnapshotQuestions } from '../assessment/assessment-runtime';
import { LmsService } from '../lms/lms.service';
import { CreateQuestionSchema } from '../question-bank/dto/question.dto';

const databaseUrl = process.env.ASSESSMENT_RESILIENCE_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

function assertDisposableDatabase(urlValue: string): void {
  const url = new URL(urlValue);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('PostgreSQL proof hanya boleh memakai host lokal');
  }
  if (!url.pathname.includes('diis_test_assessment_resilience')) {
    throw new Error('PostgreSQL proof membutuhkan database disposable yang terikat nama');
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describePostgres('Assessment resilience PostgreSQL service integration proof', () => {
  const teacherUserId = '10000000-0000-4000-8000-000000000001';
  const teacherKeycloakId = '10000000-0000-4000-8000-000000000011';
  const studentUserId = '10000000-0000-4000-8000-000000000002';
  const studentKeycloakId = '10000000-0000-4000-8000-000000000022';
  const teacherId = '20000000-0000-4000-8000-000000000001';
  const studentId = '30000000-0000-4000-8000-000000000001';
  const classId = '40000000-0000-4000-8000-000000000001';
  const assignmentId = '50000000-0000-4000-8000-000000000001';
  const moduleId = '60000000-0000-4000-8000-000000000001';
  const semesterId = '65000000-0000-4000-8000-000000000001';
  const sessionId = '70000000-0000-4000-8000-000000000001';
  const remedialSessionId = '70000000-0000-4000-8000-000000000002';
  const responseId = '80000000-0000-4000-8000-000000000001';
  const remedialParticipantId = '80000000-0000-4000-8000-000000000002';
  const sourceGradeId = '80000000-0000-4000-8000-000000000003';
  const questionId = '90000000-0000-4000-8000-000000000001';
  const lateMutationId = 'b0000000-0000-4000-8000-000000000001';
  const submitMutationId = 'b0000000-0000-4000-8000-000000000002';
  const academicYear = '2025/2026';
  const questions = [
    {
      id: questionId,
      subject: 'Pemrograman Web',
      type: 'multiple_choice',
      body: 'Apa kepanjangan HTML?',
      options: [
        { id: 'a', text: 'HyperText Markup Language' },
        { id: 'b', text: 'Hyper Transfer Model' },
      ],
      answer: 'a',
      difficulty: 'easy',
      tags: ['html'],
      points: 100,
    },
  ] satisfies Prisma.InputJsonValue;
  const correctAnswers = {
    [questionId]: { type: 'multiple_choice' as const, optionId: 'a' },
  };
  const GURU = {
    keycloakId: teacherKeycloakId,
    username: 'integration-guru',
    roles: ['GURU'],
  } as AuthUser;
  const SISWA = {
    keycloakId: studentKeycloakId,
    username: 'integration-siswa',
    roles: ['SISWA'],
  } as AuthUser;
  let prisma: PrismaClient;

  function buildActualService(): AssessmentService {
    const academicPeriodService = new AcademicPeriodService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
    );
    const service = new AssessmentService(
      prisma as unknown as PrismaService,
      { emitAsync: jest.fn().mockResolvedValue([]) } as unknown as EventEmitter2,
      academicPeriodService,
    );
    const mutable = service as unknown as { runAssessmentOutboxWorker: () => void };
    mutable.runAssessmentOutboxWorker = () => undefined;
    return service;
  }

  function pauseFirstSessionLock(service: AssessmentService): {
    firstLocked: Promise<void>;
    secondAttempted: Promise<void>;
    release: () => void;
  } {
    type SessionLock = (tx: Prisma.TransactionClient, id: string) => Promise<void>;
    const mutable = service as unknown as { lockAssessmentSession: SessionLock };
    const originalLock = mutable.lockAssessmentSession.bind(service);
    const firstLocked = deferred();
    const secondAttempted = deferred();
    const releaseFirst = deferred();
    let invocation = 0;
    mutable.lockAssessmentSession = async (tx, id) => {
      const current = ++invocation;
      if (current === 2) secondAttempted.resolve();
      await originalLock(tx, id);
      if (current === 1) {
        firstLocked.resolve();
        await releaseFirst.promise;
      }
    };
    return {
      firstLocked: firstLocked.promise,
      secondAttempted: secondAttempted.promise,
      release: releaseFirst.resolve,
    };
  }

  function pauseFirstSessionBeforeLock(service: AssessmentService): {
    firstAttempted: Promise<void>;
    release: () => void;
  } {
    type SessionLock = (tx: Prisma.TransactionClient, id: string) => Promise<void>;
    const mutable = service as unknown as { lockAssessmentSession: SessionLock };
    const originalLock = mutable.lockAssessmentSession.bind(service);
    const firstAttempted = deferred();
    const releaseFirst = deferred();
    let invocation = 0;
    mutable.lockAssessmentSession = async (tx, id) => {
      const current = ++invocation;
      if (current === 1) {
        firstAttempted.resolve();
        await releaseFirst.promise;
      }
      await originalLock(tx, id);
    };
    return { firstAttempted: firstAttempted.promise, release: releaseFirst.resolve };
  }

  async function resetForLateReview(): Promise<void> {
    await prisma.assessmentIntegrityEvent.deleteMany({ where: { responseId } });
    await prisma.assessmentEventOutbox.deleteMany();
    await prisma.grade.deleteMany({ where: { sourceAssessmentSessionId: sessionId } });
    await prisma.assessmentSession.update({
      where: { id: sessionId },
      data: { status: 'active', completedAt: null },
    });
    await prisma.assessmentResponse.update({
      where: { id: responseId },
      data: {
        answers: Prisma.JsonNull,
        score: null,
        itemScores: [],
        submittedAt: new Date(),
        clientRevision: 1,
        lastMutationId: lateMutationId,
        lateSubmissionStatus: 'pending',
        lateAnswers: correctAnswers,
        lateRevision: 1,
        lateMutationId,
        lateSubmittedAt: new Date(),
        lateReviewedAt: null,
        lateReviewedBy: null,
        lateReviewNote: null,
      },
    });
  }

  async function resetForOrdinarySubmit(): Promise<void> {
    await prisma.assessmentIntegrityEvent.deleteMany({ where: { responseId } });
    await prisma.assessmentEventOutbox.deleteMany();
    await prisma.grade.deleteMany({ where: { sourceAssessmentSessionId: sessionId } });
    await prisma.assessmentSession.update({
      where: { id: sessionId },
      data: { status: 'active', completedAt: null },
    });
    await prisma.assessmentResponse.update({
      where: { id: responseId },
      data: {
        answers: Prisma.JsonNull,
        score: null,
        itemScores: [],
        startedAt: new Date(),
        submittedAt: null,
        clientRevision: 0,
        lastMutationId: null,
        lateSubmissionStatus: null,
        lateAnswers: Prisma.JsonNull,
        lateRevision: null,
        lateMutationId: null,
        lateSubmittedAt: null,
        lateReviewedAt: null,
        lateReviewedBy: null,
        lateReviewNote: null,
      },
    });
  }

  async function resetForNewStart(): Promise<void> {
    await prisma.assessmentIntegrityEvent.deleteMany({
      where: { response: { sessionId } },
    });
    await prisma.assessmentEventOutbox.deleteMany();
    await prisma.grade.deleteMany({ where: { sourceAssessmentSessionId: sessionId } });
    await prisma.assessmentResponse.deleteMany({ where: { sessionId } });
    await prisma.assessmentSession.update({
      where: { id: sessionId },
      data: { status: 'active', completedAt: null },
    });
  }

  async function resetForRemedialStart(): Promise<void> {
    await prisma.assessmentResponse.deleteMany({ where: { sessionId: remedialSessionId } });
    await prisma.assessmentSession.update({
      where: { id: remedialSessionId },
      data: {
        status: 'active',
        completedAt: null,
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
      },
    });
    await prisma.remedialParticipant.update({
      where: { id: remedialParticipantId },
      data: {
        status: 'assigned',
        startedAt: null,
        submittedAt: null,
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
      },
    });
  }

  async function expectOneGradeAndOutbox(score: number): Promise<void> {
    const grades = await prisma.grade.findMany({
      where: { sourceAssessmentSessionId: sessionId, studentId },
      select: { score: true },
    });
    expect(grades).toHaveLength(1);
    expect(Number(grades[0]?.score)).toBe(score);
    const outbox = await prisma.assessmentEventOutbox.groupBy({
      by: ['eventType'],
      where: { eventType: { in: ['grade.submitted', 'assessment.completed'] } },
      _count: { _all: true },
    });
    expect(Object.fromEntries(outbox.map((row) => [row.eventType, row._count._all]))).toEqual({
      'assessment.completed': 1,
      'grade.submitted': 1,
    });
  }

  beforeAll(async () => {
    assertDisposableDatabase(databaseUrl!);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.user.createMany({
      data: [
        {
          id: teacherUserId,
          keycloakId: teacherKeycloakId,
          email: 'integration-guru@example.invalid',
          fullName: 'Integration Guru',
          role: 'GURU',
        },
        {
          id: studentUserId,
          keycloakId: studentKeycloakId,
          email: 'integration-siswa@example.invalid',
          fullName: 'Integration Siswa',
          role: 'SISWA',
        },
      ],
    });
    const academicYearRecord = await prisma.academicYear.findUniqueOrThrow({
      where: { code: academicYear },
      select: { id: true },
    });
    await prisma.semester.create({
      data: {
        id: semesterId,
        academicYearId: academicYearRecord.id,
        number: 1,
        startDate: new Date('2025-07-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T00:00:00.000Z'),
        isActive: true,
      },
    });
    await prisma.teacher.create({ data: { id: teacherId, userId: teacherUserId } });
    await prisma.class.create({
      data: {
        id: classId,
        name: 'INTEGRATION-X',
        majorCode: 'TJKT',
        grade: 10,
        academicYear,
      },
    });
    await prisma.student.create({
      data: {
        id: studentId,
        userId: studentUserId,
        nis: 'INTEGRATION-001',
        classId,
        joinedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    });
    await prisma.teachingAssignment.create({
      data: {
        id: assignmentId,
        teacherId,
        classId,
        subject: 'Pemrograman Web',
        academicYear,
      },
    });
    await prisma.lmsModule.create({
      data: {
        id: moduleId,
        teacherId,
        classId,
        subject: 'Pemrograman Web',
        title: 'Integration Module',
        status: 'published',
        academicYear,
        semester: 1,
      },
    });
    await prisma.assessmentSession.create({
      data: {
        id: sessionId,
        moduleId,
        teachingAssignmentId: assignmentId,
        teacherId,
        classId,
        title: 'Integration Assessment',
        type: 'formatif',
        status: 'active',
        purpose: 'regular',
        questions,
        gradeTarget: 'uh',
        academicYear,
        semester: 1,
      },
    });
    await prisma.grade.create({
      data: {
        id: sourceGradeId,
        studentId,
        assignmentId,
        semester: 1,
        academicYear,
        score: 60,
        type: 'uh',
        submittedBy: teacherUserId,
      },
    });
    await prisma.assessmentSession.create({
      data: {
        id: remedialSessionId,
        moduleId: null,
        teachingAssignmentId: assignmentId,
        teacherId,
        classId,
        title: 'Integration Remedial',
        type: 'formatif',
        status: 'active',
        purpose: 'remedial',
        questions,
        gradeTarget: 'uh',
        academicYear,
        semester: 1,
      },
    });
    await prisma.remedialParticipant.create({
      data: {
        id: remedialParticipantId,
        sessionId: remedialSessionId,
        studentId,
        sourceGradeId,
        status: 'assigned',
        sourceScore: 60,
        sourceGradeUpdatedAt: new Date(),
        kktpValue: 75,
        kktpProvenance: 'system_default',
      },
    });
    await prisma.assessmentResponse.create({
      data: {
        id: responseId,
        sessionId,
        studentId,
        startedAt: new Date(),
        submittedAt: new Date(),
        lateSubmissionStatus: 'pending',
        lateAnswers: correctAnswers,
        lateRevision: 1,
        lateMutationId,
        lateSubmittedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.assessmentIntegrityEvent.deleteMany({ where: { responseId } });
    await prisma.assessmentEventOutbox.deleteMany();
    await prisma.grade.deleteMany({ where: { sourceAssessmentSessionId: sessionId } });
    await prisma.assessmentResponse.deleteMany({
      where: { sessionId: { in: [sessionId, remedialSessionId] } },
    });
    await prisma.remedialParticipant.deleteMany({ where: { sessionId: remedialSessionId } });
    await prisma.assessmentSession.deleteMany({ where: { id: { in: [sessionId, remedialSessionId] } } });
    await prisma.grade.deleteMany({ where: { id: sourceGradeId } });
    await prisma.lmsModule.deleteMany({ where: { id: moduleId } });
    await prisma.teachingAssignment.deleteMany({ where: { id: assignmentId } });
    await prisma.student.deleteMany({ where: { id: studentId } });
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.question.deleteMany({ where: { teacherId } });
    await prisma.teacher.deleteMany({ where: { id: teacherId } });
    await prisma.user.deleteMany({ where: { id: { in: [teacherUserId, studentUserId] } } });
    await prisma.semester.deleteMany({ where: { id: semesterId } });
    await prisma.$disconnect();
  });

  it('runs manual rich questions through canonical storage, snapshot, start, autosave, resume and final submit', async () => {
    const bank = new QuestionBankService(prisma as unknown as PrismaService);
    const service = buildActualService();
    const createdQuestions: string[] = [];
    let createdSession: string | undefined;
    try {
      const common = {
        subject: 'Pemrograman Web',
        body: '<!--diis-question-html:v1--><p>Amati <strong>data</strong> berikut.</p>',
        difficulty: 'medium',
        tags: [],
      };
      const payloads = [
        {
          ...common,
          type: 'multiple_choice',
          options: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
          ],
          answer: 'a',
        },
        { ...common, type: 'true_false', answer: true },
        {
          ...common,
          type: 'matching',
          pairs: [
            { id: 'p1', prompt: 'Dua', match: '2' },
            { id: 'p2', prompt: 'Tiga', match: '3' },
          ],
          answer: { p1: 'p2', p2: 'p1' },
        },
        {
          ...common,
          type: 'essay',
          guideAnswer: 'Alasan yang tepat.',
          rubric: [{ id: 'r1', name: 'Alasan', weight: 100, maxScore: 10 }],
        },
      ];
      for (const payload of payloads) {
        const question = await bank.create(QuestionPayloadSchema.parse(payload), GURU);
        createdQuestions.push(question.id);
        await bank.update(
          question.id,
          QuestionPayloadSchema.parse({
            ...payload,
            body: common.body + '<p>Data diperbarui.</p>',
          }),
          GURU,
        );
        expect((await bank.findOne(question.id, GURU)).body).toContain('<strong>data</strong>');
      }
      const created = await service.create(
        CreateAssessmentSessionSchema.parse({
          moduleId,
          title: 'Manual four-type QA',
          type: 'formatif',
          classId,
          academicYear,
          semester: 1,
          questionSelections: createdQuestions.map((questionId, order) => ({
            questionId,
            order,
            points: 25,
          })),
        }),
        GURU,
      );
      createdSession = created.id;
      await service.startSession(created.id, GURU);
      const attempt = await service.startResponse(created.id, SISWA);
      const session = await prisma.assessmentSession.findUniqueOrThrow({
        where: { id: created.id },
      });
      const snapshots = parseSnapshotQuestions(session.questions);
      const answers: AssessmentAnswerMap = {};
      for (const question of snapshots) {
        if (question.type === 'multiple_choice')
          answers[question.id] = { type: question.type, optionId: question.answer };
        if (question.type === 'true_false')
          answers[question.id] = { type: question.type, value: question.answer };
        if (question.type === 'matching')
          answers[question.id] = {
            type: question.type,
            pairs: Object.fromEntries(
              question.pairs.map((pair) => [
                pair.id,
                question.choiceIds![question.answer[pair.id]!]!,
              ]),
            ),
          };
        if (question.type === 'essay')
          answers[question.id] = { type: question.type, text: 'Alasan siswa sintetis.' };
      }
      const mutationId = 'd0000000-0000-4000-8000-000000000001';
      await service.autosaveResponse(created.id, { answers, revision: 1, mutationId }, SISWA);
      const resumed = await service.startResponse(created.id, SISWA);
      expect(resumed.responseId).toBe(attempt.responseId);
      expect(resumed.questions).toEqual(attempt.questions);
      expect(resumed.answers).toEqual(answers);
      await service.submitResponse(created.id, { answers, revision: 1, mutationId }, SISWA);
      const results = await service.getResults(created.id, GURU);
      expect(results).toMatchObject({
        submitted: 1,
        finalCount: 0,
        pendingManualCount: 1,
        avgScore: null,
      });
      expect(results.responses[0]?.score).toBeNull();
      expect(await prisma.grade.count({ where: { sourceAssessmentSessionId: created.id } })).toBe(
        0,
      );
    } finally {
      if (createdSession) {
        await prisma.assessmentEventOutbox.deleteMany({
          where: { payload: { path: ['sessionId'], equals: createdSession } },
        });
        await prisma.grade.deleteMany({ where: { sourceAssessmentSessionId: createdSession } });
        await prisma.assessmentResponse.deleteMany({ where: { sessionId: createdSession } });
        await prisma.assessmentSession.deleteMany({ where: { id: createdSession } });
      }
      await prisma.question.deleteMany({ where: { id: { in: createdQuestions } } });
    }
  });

  it('records module opening separately from completion without regressing completed progress', async () => {
    const period = new AcademicPeriodService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
    );
    const lms = new LmsService(prisma as unknown as PrismaService, period);
    try {
      expect(await lms.updateProgress(moduleId, { progress: 0 }, SISWA)).toMatchObject({
        progress: 0,
        status: 'active',
        completedAt: null,
      });
      const completed = await lms.updateProgress(moduleId, { progress: 100 }, SISWA);
      const replay = await lms.updateProgress(moduleId, { progress: 0 }, SISWA);
      expect(replay).toMatchObject({
        progress: 100,
        status: 'completed',
        completedAt: completed.completedAt,
      });
    } finally {
      await prisma.lmsModuleProgress.deleteMany({ where: { moduleId, studentId } });
    }
  });

  it('makes manual-create retries durable, preserves later edits and never resurrects a deleted question', async () => {
    const bank = new QuestionBankService(prisma as unknown as PrismaService);
    const requestId = 'e0000000-0000-4000-8000-000000000001';
    const payload = {
      requestId,
      subject: 'Pemrograman Web',
      type: 'true_false',
      body: 'Retry manual tidak membuat soal ganda.',
      answer: true,
      difficulty: 'medium',
      tags: [],
    };
    let savedId: string | undefined;
    try {
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => bank.create(CreateQuestionSchema.parse(payload), GURU)),
      );
      savedId = responses[0]!.id;
      expect(new Set(responses.map((row) => row.id)).size).toBe(1);
      expect(await prisma.question.count({ where: { teacherId, body: payload.body } })).toBe(1);
      await expect(
        bank.create(
          CreateQuestionSchema.parse({ ...payload, body: 'Isi berbeda dengan key yang sama.' }),
          GURU,
        ),
      ).rejects.toThrow('isi soal berbeda');
      const { requestId: _requestId, ...authoringPayload } = payload;
      const edited = QuestionPayloadSchema.parse(authoringPayload);
      await bank.update(
        savedId,
        { ...edited, body: 'Edit yang lebih baru tetap dipertahankan.' },
        GURU,
      );
      expect((await bank.create(CreateQuestionSchema.parse(payload), GURU)).body).toBe(
        'Edit yang lebih baru tetap dipertahankan.',
      );
      await bank.remove(savedId, GURU);
      await expect(bank.create(CreateQuestionSchema.parse(payload), GURU)).rejects.toThrow(
        'sudah dihapus',
      );
      expect(await prisma.question.count({ where: { id: savedId } })).toBe(0);
    } finally {
      if (savedId) await prisma.question.deleteMany({ where: { id: savedId } });
      await prisma.questionImportRow.deleteMany({
        where: { teacherId, batchKey: `manual:${requestId}` },
      });
    }
  });

  it('does not resurrect a deleted CSV question on replay of its completed import receipt', async () => {
    const bank = new QuestionBankService(prisma as unknown as PrismaService);
    const batchKey = 'csv-tombstone-qa-20261026';
    const question = QuestionPayloadSchema.parse({
      subject: 'Pemrograman Web',
      type: 'true_false',
      body: 'CSV tombstone sintetis.',
      answer: true,
      difficulty: 'easy',
      tags: [],
    });
    const dto = { subject: question.subject, batchKey, rows: [{ rowKey: 'row-1', question }] };
    try {
      expect(await bank.importQuestionsCsv(dto, GURU)).toEqual({ imported: 1, errors: [] });
      const receipt = await prisma.questionImportRow.findUniqueOrThrow({
        where: { teacherId_batchKey_rowKey: { teacherId, batchKey, rowKey: 'row-1' } },
      });
      await bank.remove(receipt.questionId!, GURU);
      const replay = await bank.importQuestionsCsv(dto, GURU);
      expect(replay.imported).toBe(0);
      expect(replay.errors[0]?.message).toContain('sudah dihapus');
      expect(await prisma.question.count({ where: { teacherId, body: question.body } })).toBe(0);
    } finally {
      await prisma.questionImportRow.deleteMany({ where: { teacherId, batchKey } });
    }
  });

  it.each([true, false])(
    'serializes regular draft edit and activation without overwriting acknowledged edits (edit first=%s)',
    async (editFirst) => {
      const service = buildActualService();
      const replacement = await prisma.question.create({
        data: {
          teacherId,
          subject: 'Pemrograman Web',
          type: 'true_false',
          body: 'Snapshot terbaru harus dipertahankan.',
          answer: 'true',
          difficulty: 'easy',
          tags: [],
        },
      });
      try {
        await prisma.assessmentSession.update({
          where: { id: sessionId },
          data: { status: 'draft', questions },
        });
        const gate = pauseFirstSessionLock(service);
        const edit = () =>
          service.update(
            sessionId,
            { questionSelections: [{ questionId: replacement.id, points: 100, order: 0 }] },
            GURU,
          );
        const activate = () => service.startSession(sessionId, GURU);
        const first = editFirst ? edit() : activate();
        await gate.firstLocked;
        const second = editFirst ? activate() : edit();
        await gate.secondAttempted;
        gate.release();
        const outcomes = await Promise.allSettled([first, second]);
        expect(outcomes[0]?.status).toBe('fulfilled');
        const current = await prisma.assessmentSession.findUniqueOrThrow({
          where: { id: sessionId },
        });
        expect(current.status).toBe('active');
        if (editFirst) {
          expect(outcomes[1]?.status).toBe('fulfilled');
          expect(parseSnapshotQuestions(current.questions)[0]?.id).toBe(replacement.id);
        } else {
          expect(outcomes[1]?.status).toBe('rejected');
          expect((outcomes[1] as PromiseRejectedResult).reason.constructor.name).toBe(
            'ConflictException',
          );
          expect(parseSnapshotQuestions(current.questions)[0]?.id).toBe(questionId);
        }
      } finally {
        await prisma.assessmentSession.update({
          where: { id: sessionId },
          data: { status: 'active', questions },
        });
        await prisma.question.delete({ where: { id: replacement.id } });
      }
    },
  );

  it.each(['draft', 'active'] as const)(
    'persists secure legacy-draft upgrade or contains already-active legacy matching (%s)',
    async (status) => {
      const legacy = {
        id: questionId,
        type: 'matching',
        subject: 'Pemrograman Web',
        body: 'Pasangkan dua pernyataan.',
        difficulty: 'medium',
        tags: [],
        points: 100,
        pairs: [
          { id: 'p1', prompt: 'Dua', match: '2' },
          { id: 'p2', prompt: 'Tiga', match: '3' },
        ],
        answer: { p1: 'p1', p2: 'p2' },
      };
      const created = await prisma.assessmentSession.create({
        data: {
          teacherId,
          classId,
          moduleId,
          teachingAssignmentId: assignmentId,
          title: 'Legacy fixture QA',
          type: 'formatif',
          status,
          academicYear,
          semester: 1,
          questions: [legacy],
        },
      });
      const service = buildActualService();
      try {
        if (status === 'draft') {
          await service.startSession(created.id, GURU);
          const stored = await prisma.assessmentSession.findUniqueOrThrow({
            where: { id: created.id },
          });
          const parsed = parseSnapshotQuestions(stored.questions)[0]!;
          expect(parsed).toHaveProperty('choiceIds');
          const first = await service.startResponse(created.id, SISWA);
          const resumed = await service.startResponse(created.id, SISWA);
          expect(resumed.questions).toEqual(first.questions);
        } else {
          const response = await prisma.assessmentResponse.create({
            data: {
              sessionId: created.id,
              studentId,
              startedAt: new Date(),
              submittedAt: null,
              answers: {},
              questionOrder: [questionId],
            },
          });
          const before = await prisma.assessmentResponse.findUniqueOrThrow({
            where: { id: response.id },
          });
          await expect(service.startResponse(created.id, SISWA)).rejects.toThrow(
            'Sesi menjodohkan lama',
          );
          await expect(
            service.autosaveResponse(
              created.id,
              { answers: {}, revision: 1, mutationId: submitMutationId },
              SISWA,
            ),
          ).rejects.toThrow('Sesi menjodohkan lama');
          await expect(
            service.submitResponse(
              created.id,
              { answers: {}, revision: 1, mutationId: submitMutationId },
              SISWA,
            ),
          ).rejects.toThrow('Sesi menjodohkan lama');
          expect(
            await prisma.assessmentResponse.findUniqueOrThrow({ where: { id: response.id } }),
          ).toEqual(before);
          const visible = await service.findOne(created.id, SISWA);
          expect(visible).toMatchObject({
            questions: [],
            questionCount: 1,
            attemptBlockedReason: expect.any(String),
          });
        }
      } finally {
        await prisma.assessmentResponse.deleteMany({ where: { sessionId: created.id } });
        await prisma.assessmentSession.delete({ where: { id: created.id } });
      }
    },
  );

  it.each([true, false])(
    'uses consistent session-before-cutover locks for remedial activation/cancellation (activation first=%s)',
    async (activationFirst) => {
      await resetForRemedialStart();
      await prisma.assessmentSession.update({
        where: { id: remedialSessionId },
        data: { status: 'draft' },
      });
      const service = buildActualService();
      const gate = pauseFirstSessionLock(service);
      const activate = () => service.activateRemedialSession(remedialSessionId, GURU);
      const cancel = () =>
        service.cancelRemedialSession(
          remedialSessionId,
          { reason: 'Pengujian konkurensi sintetis' },
          GURU,
        );
      const first = activationFirst ? activate() : cancel();
      await gate.firstLocked;
      const second = activationFirst ? cancel() : activate();
      await gate.secondAttempted;
      gate.release();
      const outcomes = await Promise.allSettled([first, second]);
      expect(outcomes[0]?.status).toBe('fulfilled');
      for (const outcome of outcomes)
        if (outcome.status === 'rejected')
          expect(outcome.reason.constructor.name).toBe('ConflictException');
      expect(
        (await prisma.assessmentSession.findUniqueOrThrow({ where: { id: remedialSessionId } }))
          .status,
      ).toBe('cancelled');
    },
  );

  it('allows exactly one concurrent pending-to-final decision', async () => {
    await resetForLateReview();
    const [accepted, rejected] = await Promise.all([
      prisma.assessmentResponse.updateMany({
        where: { id: responseId, lateSubmissionStatus: 'pending' },
        data: { lateSubmissionStatus: 'accepted' },
      }),
      prisma.assessmentResponse.updateMany({
        where: { id: responseId, lateSubmissionStatus: 'pending' },
        data: { lateSubmissionStatus: 'rejected' },
      }),
    ]);

    expect([accepted.count, rejected.count].sort()).toEqual([0, 1]);
  });

  it('rejects an unknown late-submission state at the database boundary', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE academic.assessment_responses
         SET late_submission_status = 'silently_graded'
         WHERE id = $1::uuid`,
        responseId,
      ),
    ).rejects.toThrow();
  });

  it('runs actual completion before actual late review and reconciles Grade plus outbox once', async () => {
    await resetForLateReview();
    const service = buildActualService();
    const pause = pauseFirstSessionLock(service);

    const completion = service.completeSession(sessionId, GURU);
    await pause.firstLocked;
    const review = service.reviewLateSubmission(
      sessionId,
      responseId,
      { decision: 'accept', note: 'Koneksi putus dikonfirmasi setelah ujian.' },
      GURU,
    );
    await pause.secondAttempted;
    pause.release();
    await Promise.all([completion, review]);

    const response = await prisma.assessmentResponse.findUniqueOrThrow({
      where: { id: responseId },
      select: { score: true, lateSubmissionStatus: true },
    });
    expect(response).toMatchObject({ score: 100, lateSubmissionStatus: 'accepted' });
    await expectOneGradeAndOutbox(100);
  });

  it('runs actual submit before actual completion so Grade and outbox see the score', async () => {
    await resetForOrdinarySubmit();
    const service = buildActualService();
    const pause = pauseFirstSessionLock(service);

    const submit = service.submitResponse(
      sessionId,
      {
        answers: correctAnswers,
        revision: 1,
        mutationId: submitMutationId,
        signals: [],
      },
      SISWA,
    );
    await pause.firstLocked;
    const completion = service.completeSession(sessionId, GURU);
    await pause.secondAttempted;
    pause.release();
    await Promise.all([submit, completion]);

    const response = await prisma.assessmentResponse.findUniqueOrThrow({
      where: { id: responseId },
      select: { score: true, submittedAt: true, lateSubmissionStatus: true },
    });
    expect(response.score).toBe(100);
    expect(response.submittedAt).not.toBeNull();
    expect(response.lateSubmissionStatus).toBeNull();
    await expectOneGradeAndOutbox(100);
  });

  it('rejects actual new start when completion commits before the start lock', async () => {
    await resetForNewStart();
    const service = buildActualService();
    const pause = pauseFirstSessionBeforeLock(service);

    const start = service.startResponse(sessionId, SISWA);
    await pause.firstAttempted;
    await service.completeSession(sessionId, GURU);
    pause.release();

    await expect(start).rejects.toThrow('Sesi tidak aktif — tidak bisa dimulai');
    await expect(
      prisma.assessmentResponse.count({ where: { sessionId, studentId } }),
    ).resolves.toBe(0);
  });

  it('keeps the actual start resumable when it commits before completion', async () => {
    await resetForNewStart();
    const service = buildActualService();
    const pause = pauseFirstSessionLock(service);

    const start = service.startResponse(sessionId, SISWA);
    await pause.firstLocked;
    const completion = service.completeSession(sessionId, GURU);
    await pause.secondAttempted;
    pause.release();
    const [started] = await Promise.all([start, completion]);

    const resumed = await service.startResponse(sessionId, SISWA);
    expect(resumed.responseId).toBe(started.responseId);
    expect(resumed.startedAt).toEqual(started.startedAt);
    await expect(
      prisma.assessmentResponse.count({ where: { sessionId, studentId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.assessmentSession.findUnique({ where: { id: sessionId }, select: { status: true } }),
    ).resolves.toEqual({ status: 'completed' });
  });

  it('rejects actual remedial start when cancellation commits before the session lock', async () => {
    await resetForRemedialStart();
    const service = buildActualService();
    const pause = pauseFirstSessionBeforeLock(service);

    const start = service.startResponse(remedialSessionId, SISWA);
    await pause.firstAttempted;
    await service.cancelRemedialSession(
      remedialSessionId,
      { reason: 'Dibatalkan sebelum siswa mulai.' },
      GURU,
    );
    pause.release();

    await expect(start).rejects.toThrow('Sesi remedial tidak ditugaskan kepada Anda');
    await expect(
      prisma.assessmentResponse.count({ where: { sessionId: remedialSessionId, studentId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.assessmentSession.findUnique({
        where: { id: remedialSessionId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    await expect(
      prisma.remedialParticipant.findUnique({
        where: { id: remedialParticipantId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'cancelled' });
  });

  it('serializes cancellation after an actual remedial start and leaves one consistent attempt', async () => {
    await resetForRemedialStart();
    const service = buildActualService();
    const pause = pauseFirstSessionLock(service);

    const start = service.startResponse(remedialSessionId, SISWA);
    await pause.firstLocked;
    const cancellation = service.cancelRemedialSession(
      remedialSessionId,
      { reason: 'Dibatalkan setelah siswa mulai.' },
      GURU,
    );
    await pause.secondAttempted;
    pause.release();
    await Promise.all([start, cancellation]);

    await expect(
      prisma.assessmentResponse.count({ where: { sessionId: remedialSessionId, studentId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.assessmentSession.findUnique({
        where: { id: remedialSessionId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    await expect(
      prisma.remedialParticipant.findUnique({
        where: { id: remedialParticipantId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'cancelled' });
  });
});
