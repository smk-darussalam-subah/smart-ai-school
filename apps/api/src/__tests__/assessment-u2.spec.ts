// =============================================================================
// U2 Assessment Comprehensive — Unit tests for Waves 1-4.
// Wave 1: Timer enforcement logic (expired session rejects submit)
// Wave 2: Weighted score calculation (80*0.3 + 70*0.3 + 90*0.4 = 81)
// Wave 3: Difficulty index + discrimination index calculation
// Wave 4: CSV export + import flow
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { AssessmentService } from '../assessment/assessment.service';
import { QuestionBankService } from '../question-bank/question-bank.service';
import { PrismaService } from '../prisma/prisma.service';

const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;

// =============================================================================
// Wave 1: Timer Enforcement
// =============================================================================
describe('U2 Wave 1 — Timer Enforcement', () => {
  let service: AssessmentService;
  const studentFindFirst = jest.fn();
  const sessionFindUnique = jest.fn();
  const responseFindUnique = jest.fn();
  const responseUpdate = jest.fn();
  const responseCreate = jest.fn();

  beforeEach(async () => {
    [studentFindFirst, sessionFindUnique, responseFindUnique, responseUpdate, responseCreate]
      .forEach((m) => m.mockReset());

    studentFindFirst.mockResolvedValue({ id: 's-1', classId: 'c-1' });
    responseFindUnique.mockResolvedValue(null);
    responseUpdate.mockResolvedValue({ id: 'r-1', sessionId: 's-1', score: 0, submittedAt: new Date() });
    responseCreate.mockResolvedValue({ id: 'r-1', sessionId: 's-1', score: 0, submittedAt: new Date(), startedAt: new Date(), timeSpentSec: 0 });

    const prisma = {
      student: { findFirst: studentFindFirst },
      assessmentSession: { findUnique: sessionFindUnique },
      assessmentResponse: { findUnique: responseFindUnique, update: responseUpdate, create: responseCreate },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AssessmentService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AssessmentService);
  });

  it('expired session (> durationMinutes + 1min grace) → ConflictException', async () => {
    // Session with 30 min duration
    sessionFindUnique.mockResolvedValue({
      id: 's-1', status: 'active', classId: 'c-1',
      questions: [], durationMinutes: 30,
    });
    // startedAt = 35 minutes ago (> 30 + 1 grace)
    const startedAt = new Date(Date.now() - 35 * 60 * 1000);

    await expect(
      service.submitResponse('s-1', { answers: {}, startedAt: startedAt.toISOString() }, SISWA),
    ).rejects.toThrow(ConflictException);
  });

  it('within grace period (durationMinutes + 1min) → accepted', async () => {
    // Session with 30 min duration
    sessionFindUnique.mockResolvedValue({
      id: 's-1', status: 'active', classId: 'c-1',
      questions: [], durationMinutes: 30,
    });
    // startedAt = 30.5 minutes ago (< 30 + 1 grace)
    const startedAt = new Date(Date.now() - 30.5 * 60 * 1000);

    await service.submitResponse('s-1', { answers: {}, startedAt: startedAt.toISOString() }, SISWA);
    expect(responseUpdate).not.toHaveBeenCalled(); // existing was null, so create path
    expect(responseCreate).toHaveBeenCalled(); // submit succeeded via create
  });

  it('no durationMinutes set → timer not enforced (backward compat)', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 's-1', status: 'active', classId: 'c-1',
      questions: [], durationMinutes: null,
    });
    // startedAt = 120 minutes ago — should still pass since no timer
    const startedAt = new Date(Date.now() - 120 * 60 * 1000);

    await service.submitResponse('s-1', { answers: {}, startedAt: startedAt.toISOString() }, SISWA);
    expect(responseCreate).toHaveBeenCalled(); // submit succeeded
  });
});

// =============================================================================
// Wave 2: Weighted Score Calculation
// =============================================================================
describe('U2 Wave 2 — Weighted Score Calculation', () => {
  let service: AssessmentService;
  const teacherFindFirst = jest.fn();
  const sessionFindUnique = jest.fn();
  const responseFindFirst = jest.fn();
  const questionFindUnique = jest.fn();
  const responseUpdate = jest.fn();

  beforeEach(async () => {
    [teacherFindFirst, sessionFindUnique, responseFindFirst, questionFindUnique, responseUpdate]
      .forEach((m) => m.mockReset());

    teacherFindFirst.mockResolvedValue({ id: 't-1' });
    sessionFindUnique.mockResolvedValue({ id: 's-1', teacherId: 't-1' });
    responseFindFirst.mockResolvedValue({ id: 'r-1', answers: {}, score: null });
    responseUpdate.mockImplementation((args: { data: { score: number } }) =>
      Promise.resolve({ id: 'r-1', sessionId: 's-1', score: args.data.score, submittedAt: new Date() }));

    const prisma = {
      teacher: { findFirst: teacherFindFirst },
      assessmentSession: { findUnique: sessionFindUnique },
      assessmentResponse: { findFirst: responseFindFirst, update: responseUpdate },
      question: { findUnique: questionFindUnique },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AssessmentService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AssessmentService);
  });

  it('80*0.3 + 70*0.3 + 90*0.4 = 81 (weighted rubric score)', async () => {
    questionFindUnique.mockResolvedValue({
      id: 'q-1',
      rubric: [
        { id: 'c1', name: 'Konsep', weight: 0.3, maxScore: 100, description: '' },
        { id: 'c2', name: 'Contoh', weight: 0.3, maxScore: 100, description: '' },
        { id: 'c3', name: 'Kesimpulan', weight: 0.4, maxScore: 100, description: '' },
      ],
    });

    const result = await service.gradeEssayResponse('s-1', 'r-1', {
      questionId: 'q-1',
      criteriaScores: { c1: 80, c2: 70, c3: 90 },
    }, GURU);

    // (80*0.3 + 70*0.3 + 90*0.4) / (100*0.3 + 100*0.3 + 100*0.4) * 100
    // = (24 + 21 + 36) / (30 + 30 + 40) * 100
    // = 81 / 100 * 100 = 81
    expect(result.score).toBe(81);
  });

  it('all zeros → score 0', async () => {
    questionFindUnique.mockResolvedValue({
      id: 'q-1',
      rubric: [
        { id: 'c1', name: 'A', weight: 0.5, maxScore: 100, description: '' },
        { id: 'c2', name: 'B', weight: 0.5, maxScore: 100, description: '' },
      ],
    });

    const result = await service.gradeEssayResponse('s-1', 'r-1', {
      questionId: 'q-1',
      criteriaScores: { c1: 0, c2: 0 },
    }, GURU);

    expect(result.score).toBe(0);
  });

  it('perfect scores → 100', async () => {
    questionFindUnique.mockResolvedValue({
      id: 'q-1',
      rubric: [
        { id: 'c1', name: 'A', weight: 0.3, maxScore: 80, description: '' },
        { id: 'c2', name: 'B', weight: 0.7, maxScore: 90, description: '' },
      ],
    });

    const result = await service.gradeEssayResponse('s-1', 'r-1', {
      questionId: 'q-1',
      criteriaScores: { c1: 80, c2: 90 },
    }, GURU);

    // (80*0.3 + 90*0.7) / (80*0.3 + 90*0.7) * 100 = 100
    expect(result.score).toBe(100);
  });
});

// =============================================================================
// Wave 3: Difficulty Index + Discrimination Index
// =============================================================================
describe('U2 Wave 3 — Item Analysis (Difficulty + Discrimination)', () => {
  let service: AssessmentService;
  const teacherFindFirst = jest.fn();
  const sessionFindUnique = jest.fn();
  const responseFindMany = jest.fn();

  beforeEach(async () => {
    [teacherFindFirst, sessionFindUnique, responseFindMany]
      .forEach((m) => m.mockReset());

    teacherFindFirst.mockResolvedValue({ id: 't-1' });

    const prisma = {
      teacher: { findFirst: teacherFindFirst },
      assessmentSession: { findUnique: sessionFindUnique },
      assessmentResponse: { findMany: responseFindMany },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AssessmentService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AssessmentService);
  });

  it('computes difficultyIndex and discriminationIndex for MC questions', async () => {
    // 2 MC questions: Q1 answer="A", Q2 answer="B"
    sessionFindUnique.mockResolvedValue({
      id: 's-1', title: 'Test', type: 'formatif', status: 'completed',
      teacherId: 't-1', classId: 'c-1',
      questions: [
        { id: 'q1', type: 'multiple_choice', body: 'Q1', answer: 'A' },
        { id: 'q2', type: 'multiple_choice', body: 'Q2', answer: 'B' },
      ],
    });

    // 4 responses:
    // S1: Q1=A(correct), Q2=B(correct), score=100
    // S2: Q1=A(correct), Q2=C(wrong),  score=50
    // S3: Q1=C(wrong),   Q2=B(correct), score=50
    // S4: Q1=C(wrong),   Q2=C(wrong),   score=0
    responseFindMany.mockResolvedValue([
      { id: 'r1', score: 100, answers: { q1: 'A', q2: 'B' } },
      { id: 'r2', score: 50,  answers: { q1: 'A', q2: 'C' } },
      { id: 'r3', score: 50,  answers: { q1: 'C', q2: 'B' } },
      { id: 'r4', score: 0,   answers: { q1: 'C', q2: 'C' } },
    ]);

    const result = await service.getSessionAnalysis('s-1', GURU);

    // Summary
    expect(result.summary.totalStudents).toBe(4);
    expect(result.summary.avgScore).toBe(50); // (100+50+50+0)/4 = 50
    expect(result.summary.minScore).toBe(0);
    expect(result.summary.maxScore).toBe(100);
    expect(result.summary.ketuntasanPct).toBe(25); // 1 out of 4 >= 75 (only score=100)

    // Item analysis — Q1
    const q1 = result.itemAnalysis[0]!;
    expect(q1.correctCount).toBe(2); // S1, S2
    expect(q1.wrongCount).toBe(2);   // S3, S4
    expect(q1.blankCount).toBe(0);
    expect(q1.difficultyIndex).toBe(0.5); // 2/4

    // Discrimination: point-biserial
    // M1 (correct scores: 100, 50) = 75
    // M0 (wrong scores: 50, 0) = 25
    // meanY = 50, variance = 1250, sy = sqrt(1250) ≈ 35.355
    // r_pb = (75-25)/35.355 * sqrt(0.5*0.5) = 50/35.355 * 0.5 ≈ 0.71
    expect(q1.discriminationIndex).toBeGreaterThan(0.6);
    expect(q1.discriminationIndex).toBeLessThan(0.8);

    // Item analysis — Q2
    const q2 = result.itemAnalysis[1]!;
    expect(q2.correctCount).toBe(2); // S1, S3
    expect(q2.wrongCount).toBe(2);   // S2, S4
    expect(q2.difficultyIndex).toBe(0.5);
  });

  it('all correct → discrimination 0 (no variance in correct/wrong groups)', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 's-1', title: 'Test', type: 'formatif', status: 'completed',
      teacherId: 't-1', classId: null,
      questions: [
        { id: 'q1', type: 'multiple_choice', body: 'Q1', answer: 'A' },
      ],
    });

    responseFindMany.mockResolvedValue([
      { id: 'r1', score: 100, answers: { q1: 'A' } },
      { id: 'r2', score: 100, answers: { q1: 'A' } },
      { id: 'r3', score: 100, answers: { q1: 'A' } },
    ]);

    const result = await service.getSessionAnalysis('s-1', GURU);
    const q1 = result.itemAnalysis[0]!;
    expect(q1.difficultyIndex).toBe(1); // all correct
    expect(q1.discriminationIndex).toBe(0); // p=1, can't discriminate
  });

  it('empty responses → zero stats, empty item analysis', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 's-1', title: 'Test', type: 'formatif', status: 'completed',
      teacherId: 't-1', classId: null,
      questions: [{ id: 'q1', type: 'multiple_choice', body: 'Q1', answer: 'A' }],
    });
    responseFindMany.mockResolvedValue([]);

    const result = await service.getSessionAnalysis('s-1', GURU);
    expect(result.summary.totalStudents).toBe(0);
    expect(result.summary.avgScore).toBe(0);
    expect(result.itemAnalysis).toHaveLength(1);
    expect(result.itemAnalysis[0]!.difficultyIndex).toBe(0);
  });
});

// =============================================================================
// Wave 4: CSV Export + Import
// =============================================================================
describe('U2 Wave 4 — CSV Export/Import', () => {
  let qbService: QuestionBankService;
  const userFindUnique = jest.fn();
  const teacherFindUnique = jest.fn();
  const questionFindMany = jest.fn();
  const questionCreate = jest.fn();

  beforeEach(async () => {
    [userFindUnique, teacherFindUnique, questionFindMany, questionCreate]
      .forEach((m) => m.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });

    const prisma = {
      user: { findUnique: userFindUnique },
      teacher: { findUnique: teacherFindUnique },
      question: { findMany: questionFindMany, create: questionCreate },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [QuestionBankService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    qbService = moduleRef.get(QuestionBankService);
  });

  it('export → CSV with header + properly escaped rows', async () => {
    questionFindMany.mockResolvedValue([
      {
        type: 'multiple_choice', body: 'Apa itu HTML?',
        options: ['HyperText', 'Hyperlink', 'HyperTransfer', 'None'],
        answer: 'HyperText', difficulty: 'easy', tags: ['html', 'dasar'],
      },
      {
        type: 'essay', body: 'Jelaskan CSS flexbox',
        options: null, answer: null, difficulty: 'medium', tags: [],
      },
    ]);

    const result = await qbService.exportQuestionsCsv('Pemrograman Web', GURU);
    expect(result.count).toBe(2);
    expect(result.csv).toContain('type,body,options,answer,difficulty,tags');
    expect(result.csv).toContain('multiple_choice');
    expect(result.csv).toContain('Apa itu HTML?');
    expect(result.csv).toContain('essay');
    // Options should be JSON-encoded in CSV
    expect(result.csv).toContain('[');
  });

  it('import → creates questions, returns count + errors', async () => {
    questionCreate.mockResolvedValue({ id: 'q-new' });

    const result = await qbService.importQuestionsCsv({
      subject: 'Pemrograman Web',
      rows: [
        { type: 'multiple_choice', body: 'Apa itu HTML?', options: '["A","B"]', answer: 'A', difficulty: 'easy' },
        { type: 'essay', body: 'Jelaskan CSS', difficulty: 'medium' },
        { type: 'true_false', body: 'HTML adalah bahasa markup', answer: 'true', difficulty: 'easy' },
      ],
    }, GURU);

    expect(result.imported).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(questionCreate).toHaveBeenCalledTimes(3);
  });

  it('import with invalid row → error reported, valid rows still imported', async () => {
    // First create succeeds, second fails
    questionCreate
      .mockResolvedValueOnce({ id: 'q-1' })
      .mockRejectedValueOnce(new Error('DB constraint violation'))
      .mockResolvedValueOnce({ id: 'q-3' });

    const result = await qbService.importQuestionsCsv({
      subject: 'Pemrograman Web',
      rows: [
        { type: 'multiple_choice', body: 'Valid Q1', difficulty: 'easy' },
        { type: 'essay', body: 'Failing Q2', difficulty: 'medium' },
        { type: 'true_false', body: 'Valid Q3', difficulty: 'easy' },
      ],
    }, GURU);

    expect(result.imported).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.row).toBe(2); // 1-indexed
  });

  it('import parses tags from comma-separated format', async () => {
    questionCreate.mockResolvedValue({ id: 'q-new' });

    const result = await qbService.importQuestionsCsv({
      subject: 'Test',
      rows: [
        { type: 'multiple_choice', body: 'Q with tags', difficulty: 'easy', tags: 'html,css,dasar' },
      ],
    }, GURU);

    expect(result.imported).toBe(1);
    // Verify tags were parsed as array
    const createCall = questionCreate.mock.calls[0][0];
    expect(createCall.data.tags).toEqual(['html', 'css', 'dasar']);
  });
});
