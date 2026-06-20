// =============================================================================
// 2P-1: LmsService — ownership di query, visibilitas siswa, progres (upsert).
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { LmsService } from '../lms/lms.service';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;

const baseCreate = {
  subject: 'Pemrograman Web', title: 'Struktur HTML', kktp: 75, orderIndex: 0,
  academicYear: '2025/2026', semester: 1,
};

describe('LmsService', () => {
  let service: LmsService;
  const teacherFindFirst = jest.fn();
  const studentFindFirst = jest.fn();
  const findFirst = jest.fn();
  const findUnique = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const del = jest.fn();
  const progressUpsert = jest.fn();
  const progressFindMany = jest.fn();
  const studentCount = jest.fn();

  beforeEach(async () => {
    [teacherFindFirst, studentFindFirst, findFirst, findUnique, findMany, count, create, update, del, progressUpsert, progressFindMany, studentCount]
      .forEach((m) => m.mockReset());
    teacherFindFirst.mockResolvedValue({ id: 'teacher-1' });
    studentFindFirst.mockResolvedValue({ id: 'student-1', classId: 'class-1' });
    create.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: 'lms-1', ...a.data }));
    update.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: 'lms-1', ...a.data }));
    progressUpsert.mockImplementation((a: { create: Record<string, unknown> }) => Promise.resolve({ id: 'prog-1', ...a.create }));
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);
    progressFindMany.mockResolvedValue([]);
    studentCount.mockResolvedValue(0);

    const prisma = {
      teacher: { findFirst: teacherFindFirst },
      student: { findFirst: studentFindFirst, count: studentCount },
      lmsModule: { findFirst, findUnique, findMany, count, create, update, delete: del },
      lmsModuleProgress: { upsert: progressUpsert, findMany: progressFindMany },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [LmsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(LmsService);
  });

  it('create publish=true → status published', async () => {
    await service.create({ ...baseCreate, publish: true }, GURU);
    expect(create.mock.calls[0][0].data.status).toBe('published');
  });

  it('create publish=false → status draft', async () => {
    await service.create({ ...baseCreate, publish: false }, GURU);
    expect(create.mock.calls[0][0].data.status).toBe('draft');
  });

  it('findAll GURU → di-scope ke teacherId sendiri', async () => {
    await service.findAll({ page: 1, limit: 50 } as never, GURU);
    expect(findMany.mock.calls[0][0].where.teacherId).toBe('teacher-1');
  });

  it('findAll SISWA → hanya published + visibilitas kelas, ratakan myProgress', async () => {
    findMany.mockResolvedValueOnce([
      { id: 'lms-1', subject: 'X', progress: [{ progress: 50, status: 'active', startedAt: null, completedAt: null }] },
    ]);
    const res = await service.findAll({ page: 1, limit: 50 } as never, SISWA);
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe('published');
    const first = res.data[0] as { myProgress: { progress: number } };
    expect(first.myProgress.progress).toBe(50);
  });

  it('updateProgress modul belum published → Forbidden', async () => {
    findUnique.mockResolvedValue({ id: 'lms-1', status: 'draft', classId: 'class-1' });
    await expect(service.updateProgress('lms-1', { progress: 30 }, SISWA)).rejects.toThrow(ForbiddenException);
  });

  it('updateProgress progress=100 → status completed + completedAt', async () => {
    findUnique.mockResolvedValue({ id: 'lms-1', status: 'published', classId: null });
    await service.updateProgress('lms-1', { progress: 100 }, SISWA);
    const arg = progressUpsert.mock.calls[0][0];
    expect(arg.create.status).toBe('completed');
    expect(arg.create.completedAt).toBeInstanceOf(Date);
    expect(arg.update.status).toBe('completed');
  });

  it('update modul bukan milik sendiri → NotFound', async () => {
    findFirst.mockResolvedValue(null); // ensureOwned gagal
    await expect(service.update('lms-x', { title: 'baru' }, GURU)).rejects.toThrow(NotFoundException);
  });

  it('setStatus publish modul milik sendiri', async () => {
    findFirst.mockResolvedValue({ id: 'lms-1' });
    await service.setStatus('lms-1', 'published', GURU);
    expect(update.mock.calls[0][0].data.status).toBe('published');
  });

  it('getProgress milik sendiri → progres siswa + classStudentCount', async () => {
    findUnique.mockResolvedValue({ id: 'lms-1', title: 'M', subject: 'X', classId: 'class-1', teacherId: 'teacher-1' });
    progressFindMany.mockResolvedValue([
      { progress: 100, status: 'completed', startedAt: new Date(), completedAt: new Date(), student: { nis: '101', user: { fullName: 'Ani' } } },
    ]);
    studentCount.mockResolvedValue(30);
    const res = await service.getProgress('lms-1', GURU);
    expect(res.progress[0]).toMatchObject({ name: 'Ani', nis: '101', progress: 100, status: 'completed' });
    expect(res.classStudentCount).toBe(30);
  });

  it('getProgress modul bukan milik sendiri → Forbidden', async () => {
    findUnique.mockResolvedValue({ id: 'lms-1', title: 'M', subject: 'X', classId: null, teacherId: 'teacher-LAIN' });
    await expect(service.getProgress('lms-1', GURU)).rejects.toThrow(ForbiddenException);
  });
});
