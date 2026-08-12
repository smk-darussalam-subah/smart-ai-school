jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { QuestionBankService } from '../question-bank/question-bank.service';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const KS: AuthUser = { keycloakId: 'kc-ks', username: 'ks1', roles: ['KEPALA_SEKOLAH'] } as AuthUser;

const baseCreate = {
  subject: 'Pemrograman Web',
  type: 'multiple_choice' as const,
  body: 'Apa kepanjangan dari HTML?',
  options: [
    { id: 'a', text: 'HyperText Markup Language' },
    { id: 'b', text: 'Hyper Transfer Model' },
  ],
  answer: 'a',
  difficulty: 'easy' as const,
  tags: ['html', 'dasar'],
};

describe('QuestionBankService', () => {
  let service: QuestionBankService;
  const userFindUnique = jest.fn();
  const teacherFindUnique = jest.fn();
  const academicYearFindFirst = jest.fn();
  const teachingAssignmentFindFirst = jest.fn();
  const questionFindMany = jest.fn();
  const questionCount = jest.fn();
  const questionFindFirst = jest.fn();
  const questionFindUnique = jest.fn();
  const questionCreate = jest.fn();
  const questionUpdate = jest.fn();
  const questionDelete = jest.fn();
  const questionImportRowUpsert = jest.fn();
  const questionImportRowUpdate = jest.fn();
  const executeRaw = jest.fn();
  const questionSetFindMany = jest.fn();
  const questionSetCount = jest.fn();
  const questionSetCreate = jest.fn();
  const transaction = jest.fn();

  beforeEach(async () => {
    [
      userFindUnique,
      teacherFindUnique,
      academicYearFindFirst,
      teachingAssignmentFindFirst,
      questionFindMany,
      questionCount,
      questionFindFirst,
      questionFindUnique,
      questionCreate,
      questionUpdate,
      questionDelete,
      questionImportRowUpsert,
      questionImportRowUpdate,
      executeRaw,
      questionSetFindMany,
      questionSetCount,
      questionSetCreate,
      transaction,
    ].forEach((mock) => mock.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    academicYearFindFirst.mockResolvedValue({ code: '2026/2027' });
    teachingAssignmentFindFirst.mockResolvedValue({ id: 'assignment-1' });
    questionFindMany.mockResolvedValue([]);
    questionCount.mockResolvedValue(0);
    questionSetFindMany.mockResolvedValue([]);
    questionSetCount.mockResolvedValue(0);
    questionFindFirst.mockResolvedValue({ id: 'q-1' });
    questionCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'q-1', ...args.data, teacher: { user: { fullName: 'guru1' } } }));
    questionUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'q-1', ...args.data, teacher: { user: { fullName: 'guru1' } } }));
    questionImportRowUpsert.mockImplementation((args: { create: { payloadFingerprint: string } }) =>
      Promise.resolve({ payloadFingerprint: args.create.payloadFingerprint, questionId: null }));
    questionImportRowUpdate.mockResolvedValue({ id: 'import-row-1' });
    executeRaw.mockResolvedValue(undefined);

    const prisma = {
      user: { findUnique: userFindUnique },
      teacher: { findUnique: teacherFindUnique },
      academicYear: { findFirst: academicYearFindFirst },
      teachingAssignment: { findFirst: teachingAssignmentFindFirst },
      question: {
        findMany: questionFindMany,
        count: questionCount,
        findFirst: questionFindFirst,
        findUnique: questionFindUnique,
        create: questionCreate,
        update: questionUpdate,
        delete: questionDelete,
      },
      questionImportRow: {
        upsert: questionImportRowUpsert,
        update: questionImportRowUpdate,
      },
      $executeRaw: executeRaw,
      questionSet: {
        findMany: questionSetFindMany,
        count: questionSetCount,
        create: questionSetCreate,
      },
      $transaction: transaction,
    };
    transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [QuestionBankService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(QuestionBankService);
  });

  it('creates typed question payload for the resolved teacher and subject', async () => {
    await service.create(baseCreate, GURU);

    expect(questionCreate.mock.calls[0][0].data).toEqual(expect.objectContaining({
      teacherId: 'teacher-1',
      subject: 'Pemrograman Web',
      type: 'multiple_choice',
      options: baseCreate.options,
      answer: 'a',
    }));
    expect(teachingAssignmentFindFirst).toHaveBeenCalledWith({
      where: { teacherId: 'teacher-1', subject: 'Pemrograman Web', academicYear: '2026/2027' },
      select: { id: true },
    });
  });

  it('requires the current active academic year for Bank Soal write authority', async () => {
    academicYearFindFirst.mockResolvedValue(null);

    await expect(service.create(baseCreate, GURU)).rejects.toThrow(BadRequestException);
    expect(teachingAssignmentFindFirst).not.toHaveBeenCalled();
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it('rejects GURU creating questions outside active teaching assignment', async () => {
    teachingAssignmentFindFirst.mockResolvedValue(null);

    await expect(service.create(baseCreate, GURU)).rejects.toThrow(ForbiddenException);
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it('findAll GURU is scoped to own teacherId', async () => {
    await service.findAll({ page: 1, limit: 20 } as never, GURU);
    expect(questionFindMany.mock.calls[0][0].where.teacherId).toBe('teacher-1');
  });

  it('findAll KS has no teacherId filter', async () => {
    await service.findAll({ page: 1, limit: 20 } as never, KS);
    expect(questionFindMany.mock.calls[0][0].where.teacherId).toBeUndefined();
  });

  it('findAll with tags and search builds server-side filters', async () => {
    await service.findAll({ page: 1, limit: 20, tags: 'html,dasar', search: 'markup' } as never, GURU);
    expect(questionFindMany.mock.calls[0][0].where.tags).toEqual({ hasSome: ['html', 'dasar'] });
    expect(questionFindMany.mock.calls[0][0].where.OR).toEqual(expect.any(Array));
  });

  it('findOne GURU own question is returned', async () => {
    questionFindUnique.mockResolvedValue({ id: 'q-1', teacherId: 'teacher-1' });
    const res = await service.findOne('q-1', GURU);
    expect(res.id).toBe('q-1');
  });

  it('findOne GURU not own question is forbidden', async () => {
    questionFindUnique.mockResolvedValue({ id: 'q-1', teacherId: 'teacher-other' });
    await expect(service.findOne('q-1', GURU)).rejects.toThrow(ForbiddenException);
  });

  it('updates only owned question with a complete typed payload', async () => {
    await service.update('q-1', {
      ...baseCreate,
      body: 'HTML dipakai untuk apa?',
    }, GURU);

    expect(questionUpdate.mock.calls[0][0].data.body).toBe('HTML dipakai untuk apa?');
    expect(questionUpdate.mock.calls[0][0].data.options).toEqual(baseCreate.options);
  });

  it('update not owned question returns not found', async () => {
    questionFindFirst.mockResolvedValue(null);
    await expect(service.update('q-x', baseCreate, GURU)).rejects.toThrow(NotFoundException);
  });

  it('removes owned question', async () => {
    await service.remove('q-1', GURU);
    expect(questionDelete).toHaveBeenCalledWith({ where: { id: 'q-1' } });
  });

  it('exports CSV with formula-protected cells', async () => {
    questionFindMany.mockResolvedValue([
      {
        id: 'q-1',
        teacherId: 'teacher-1',
        subject: 'Pemrograman Web',
        type: 'multiple_choice',
        body: '=SUM(1,1)',
        options: baseCreate.options,
        answer: 'a',
        difficulty: 'easy',
        tags: ['html'],
        rubric: null,
      },
    ]);
    questionCount.mockResolvedValue(1);

    const result = await service.exportQuestionsCsv('Pemrograman Web', GURU);

    expect(result.count).toBe(1);
    expect(result.csv).toContain('type,subject,body,options,answer,difficulty,tags,rubric');
    expect(result.csv).toContain("'=SUM(1,1)");
  });

  it('imports typed true-false, matching, and essay rows', async () => {
    questionFindFirst.mockResolvedValue(null);
    questionCreate.mockResolvedValue({ id: 'q-new' });

    const result = await service.importQuestionsCsv({
      subject: 'Pemrograman Web',
      batchKey: 'typed-import',
      rows: [
        {
          rowKey: 'row-2',
          question: {
            subject: 'Pemrograman Web',
            type: 'true_false',
            body: 'HTML adalah bahasa markup.',
            answer: true,
            difficulty: 'easy',
            tags: ['html'],
          },
        },
        {
          rowKey: 'row-3',
          question: {
            subject: 'Pemrograman Web',
            type: 'matching',
            body: 'Pasangkan tag HTML.',
            pairs: [
              { id: 'p1', prompt: '<a>', match: 'Tautan' },
              { id: 'p2', prompt: '<img>', match: 'Gambar' },
            ],
            answer: { p1: 'p1', p2: 'p2' },
            difficulty: 'medium',
            tags: ['html'],
          },
        },
        {
          rowKey: 'row-4',
          question: {
            subject: 'Pemrograman Web',
            type: 'essay',
            body: 'Jelaskan CSS.',
            guideAnswer: 'CSS mengatur tampilan.',
            rubric: [{ id: 'c1', name: 'Konsep', weight: 100, maxScore: 100 }],
            difficulty: 'medium',
            tags: ['css'],
          },
        },
      ],
    }, GURU);

    expect(result).toEqual({ imported: 3, errors: [] });
    expect(questionCreate).toHaveBeenCalledTimes(3);
    expect(questionCreate.mock.calls[0][0].data.answer).toBe('true');
    expect(questionCreate.mock.calls[1][0].data.answer).toBe(JSON.stringify({ p1: 'p1', p2: 'p2' }));
    expect(questionCreate.mock.calls[2][0].data.rubric).toEqual([{ id: 'c1', name: 'Konsep', weight: 100, maxScore: 100 }]);
  });

  it('locks each import row before ledger upsert', async () => {
    questionFindFirst.mockResolvedValue(null);
    questionCreate.mockResolvedValue({ id: 'q-new' });

    await service.importQuestionsCsv({
      subject: 'Pemrograman Web',
      batchKey: 'locked-import',
      rows: [{ rowKey: 'row-1', question: baseCreate }],
    }, GURU);

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(questionImportRowUpsert).toHaveBeenCalledTimes(1);
    const lockCallOrder = executeRaw.mock.invocationCallOrder[0] ?? 0;
    const upsertCallOrder = questionImportRowUpsert.mock.invocationCallOrder[0] ?? 0;
    expect(upsertCallOrder).toBeGreaterThan(lockCallOrder);
  });

  it('imports valid rows and reports invalid subject rows without broad failure', async () => {
    questionFindFirst.mockResolvedValue(null);
    questionCreate.mockResolvedValue({ id: 'q-new' });

    const result = await service.importQuestionsCsv({
      subject: 'Pemrograman Web',
      batchKey: 'mixed-import',
      rows: [
        { rowKey: 'row-2', question: baseCreate },
        { rowKey: 'row-3', question: { ...baseCreate, subject: 'Basis Data', body: 'Soal salah mapel' } },
      ],
    }, GURU);

    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([{ row: 2, column: 'row-3', message: 'Subject baris harus sama dengan subject import' }]);
  });

  it('replays the same batch row without creating a duplicate question', async () => {
    questionImportRowUpsert.mockImplementationOnce((args: { create: { payloadFingerprint: string } }) =>
      Promise.resolve({ payloadFingerprint: args.create.payloadFingerprint, questionId: 'q-existing' }));

    const result = await service.importQuestionsCsv({
      subject: 'Pemrograman Web',
      batchKey: 'same-batch-1',
      rows: [{ rowKey: 'row-2', question: baseCreate }],
    }, GURU);

    expect(result).toEqual({ imported: 1, errors: [] });
    expect(questionCreate).not.toHaveBeenCalled();
    expect(questionImportRowUpdate).not.toHaveBeenCalled();
  });

  it('rejects the same batch row when its payload fingerprint changes', async () => {
    questionImportRowUpsert.mockResolvedValue({
      payloadFingerprint: 'different-fingerprint',
      questionId: 'q-existing',
    });

    const result = await service.importQuestionsCsv({
      subject: 'Pemrograman Web',
      batchKey: 'same-batch-1',
      rows: [{ rowKey: 'row-2', question: { ...baseCreate, body: 'Payload berubah' } }],
    }, GURU);

    expect(result.imported).toBe(0);
    expect(result.errors).toEqual([{
      row: 1,
      column: 'row-2',
      message: 'Row import sudah dipakai untuk payload berbeda',
    }]);
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it('createSet connects owned questions to a set', async () => {
    questionFindMany.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111', teacherId: 'teacher-1' },
      { id: '22222222-2222-4222-8222-222222222222', teacherId: 'teacher-1' },
    ]);
    questionSetCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'set-1', ...args.data, teacher: { user: { fullName: 'guru1' } }, _count: { questions: 2 } }));

    await service.createSet({
      name: 'Set HTML Dasar',
      questionIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    }, GURU);

    expect(questionSetCreate.mock.calls[0][0].data.questions.connect).toEqual([
      { id: '11111111-1111-4111-8111-111111111111' },
      { id: '22222222-2222-4222-8222-222222222222' },
    ]);
  });

  it('createSet rejects not-owned questions', async () => {
    questionFindMany.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111', teacherId: 'teacher-1' },
      { id: '22222222-2222-4222-8222-222222222222', teacherId: 'teacher-other' },
    ]);

    await expect(service.createSet({
      name: 'Set',
      questionIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    }, GURU)).rejects.toThrow(ForbiddenException);
  });

  it('createSet rejects missing questions', async () => {
    questionFindMany.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111', teacherId: 'teacher-1' }]);

    await expect(service.createSet({
      name: 'Set',
      questionIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    }, GURU)).rejects.toThrow(NotFoundException);
  });

  it('findSets GURU is scoped to own teacherId', async () => {
    await service.findSets({ page: 1, limit: 20 } as never, GURU);
    expect(questionSetFindMany.mock.calls[0][0].where.teacherId).toBe('teacher-1');
  });

  it('findSets KS has no teacherId filter', async () => {
    await service.findSets({ page: 1, limit: 20 } as never, KS);
    expect(questionSetFindMany.mock.calls[0][0].where.teacherId).toBeUndefined();
  });
});
