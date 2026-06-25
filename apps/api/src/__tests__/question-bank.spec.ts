// =============================================================================
// P14 W3-2: QuestionBankService — ownership, CRUD, question sets.
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { QuestionBankService } from '../question-bank/question-bank.service';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const KS: AuthUser = { keycloakId: 'kc-ks', username: 'ks1', roles: ['KEPALA_SEKOLAH'] } as AuthUser;

const baseCreate = {
  subject: 'Pemrograman Web',
  type: 'multiple_choice' as const,
  body: 'Apa kepanjangan dari HTML?',
  difficulty: 'easy' as const,
  tags: ['html', 'dasar'],
};

describe('QuestionBankService', () => {
  let service: QuestionBankService;
  const userFindUnique = jest.fn();
  const teacherFindUnique = jest.fn();
  const questionFindMany = jest.fn();
  const questionCount = jest.fn();
  const questionFindFirst = jest.fn();
  const questionFindUnique = jest.fn();
  const questionCreate = jest.fn();
  const questionUpdate = jest.fn();
  const questionDelete = jest.fn();
  const questionSetFindMany = jest.fn();
  const questionSetCount = jest.fn();
  const questionSetCreate = jest.fn();

  beforeEach(async () => {
    [userFindUnique, teacherFindUnique, questionFindMany, questionCount, questionFindFirst,
     questionFindUnique, questionCreate, questionUpdate, questionDelete,
     questionSetFindMany, questionSetCount, questionSetCreate]
      .forEach((m) => m.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    questionFindMany.mockResolvedValue([]);
    questionCount.mockResolvedValue(0);
    questionSetFindMany.mockResolvedValue([]);
    questionSetCount.mockResolvedValue(0);
    questionCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'q-1', ...a.data, teacher: { user: { fullName: 'guru1' } } }));
    questionUpdate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'q-1', ...a.data, teacher: { user: { fullName: 'guru1' } } }));
    questionFindFirst.mockResolvedValue({ id: 'q-1' });

    const prisma = {
      user: { findUnique: userFindUnique },
      teacher: { findUnique: teacherFindUnique },
      question: {
        findMany: questionFindMany, count: questionCount, findFirst: questionFindFirst,
        findUnique: questionFindUnique, create: questionCreate, update: questionUpdate,
        delete: questionDelete,
      },
      questionSet: {
        findMany: questionSetFindMany, count: questionSetCount, create: questionSetCreate,
      },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [QuestionBankService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(QuestionBankService);
  });

  // ── Questions ───────────────────────────────────────────────────────────────

  it('create → set teacherId from resolved user', async () => {
    await service.create(baseCreate, GURU);
    expect(questionCreate.mock.calls[0][0].data.teacherId).toBe('teacher-1');
    expect(questionCreate.mock.calls[0][0].data.subject).toBe('Pemrograman Web');
  });

  it('findAll GURU → scoped to own teacherId', async () => {
    await service.findAll({ page: 1, limit: 20 } as never, GURU);
    expect(questionFindMany.mock.calls[0][0].where.teacherId).toBe('teacher-1');
  });

  it('findAll KS → no teacherId filter (sees all)', async () => {
    await service.findAll({ page: 1, limit: 20 } as never, KS);
    expect(questionFindMany.mock.calls[0][0].where.teacherId).toBeUndefined();
  });

  it('findAll with tags filter → hasSome query', async () => {
    await service.findAll({ page: 1, limit: 20, tags: 'html,dasar' } as never, GURU);
    expect(questionFindMany.mock.calls[0][0].where.tags).toEqual({ hasSome: ['html', 'dasar'] });
  });

  it('findOne GURU own → returns question', async () => {
    questionFindUnique.mockResolvedValue({ id: 'q-1', teacherId: 'teacher-1' });
    const res = await service.findOne('q-1', GURU);
    expect(res.id).toBe('q-1');
  });

  it('findOne GURU not own → Forbidden', async () => {
    questionFindUnique.mockResolvedValue({ id: 'q-1', teacherId: 'teacher-LAIN' });
    await expect(service.findOne('q-1', GURU)).rejects.toThrow(ForbiddenException);
  });

  it('update → only own question', async () => {
    await service.update('q-1', { body: 'Updated' }, GURU);
    expect(questionUpdate.mock.calls[0][0].data.body).toBe('Updated');
  });

  it('update not own → NotFound', async () => {
    questionFindFirst.mockResolvedValue(null);
    await expect(service.update('q-x', { body: 'X' }, GURU)).rejects.toThrow(NotFoundException);
  });

  it('remove → deletes own question', async () => {
    await service.remove('q-1', GURU);
    expect(questionDelete).toHaveBeenCalledWith({ where: { id: 'q-1' } });
  });

  // ── Question Sets ───────────────────────────────────────────────────────────

  it('createSet → connects questions to set', async () => {
    questionFindMany.mockResolvedValue([
      { id: 'q-1', teacherId: 'teacher-1' },
      { id: 'q-2', teacherId: 'teacher-1' },
    ]);
    questionSetCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'qs-1', ...a.data, teacher: { user: { fullName: 'guru1' } }, _count: { questions: 2 } }));
    await service.createSet({ name: 'Set HTML Dasar', questionIds: ['q-1', 'q-2'] }, GURU);
    expect(questionSetCreate.mock.calls[0][0].data.questions.connect).toEqual([
      { id: 'q-1' }, { id: 'q-2' },
    ]);
  });

  it('createSet with not-owned questions → Forbidden', async () => {
    questionFindMany.mockResolvedValue([
      { id: 'q-1', teacherId: 'teacher-1' },
      { id: 'q-2', teacherId: 'teacher-LAIN' },
    ]);
    await expect(service.createSet({ name: 'Set', questionIds: ['q-1', 'q-2'] }, GURU))
      .rejects.toThrow(ForbiddenException);
  });

  it('createSet with missing questions → NotFound', async () => {
    questionFindMany.mockResolvedValue([{ id: 'q-1', teacherId: 'teacher-1' }]);
    await expect(service.createSet({ name: 'Set', questionIds: ['q-1', 'q-missing'] }, GURU))
      .rejects.toThrow(NotFoundException);
  });

  it('findSets GURU → scoped to own teacherId', async () => {
    await service.findSets({ page: 1, limit: 20 } as never, GURU);
    expect(questionSetFindMany.mock.calls[0][0].where.teacherId).toBe('teacher-1');
  });

  it('findSets KS → no teacherId filter', async () => {
    await service.findSets({ page: 1, limit: 20 } as never, KS);
    expect(questionSetFindMany.mock.calls[0][0].where.teacherId).toBeUndefined();
  });
});
