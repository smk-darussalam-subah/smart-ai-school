// =============================================================================
// 2H: ReportCards (M12) + ClassActivities (M9) — pipeline, snapshot, ownership
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException, ConflictException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { ReportCardsService } from '../report-cards/report-cards.service';
import { ClassActivitiesService } from '../class-activities/class-activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTS } from '../events/events.types';

const SA: AuthUser = { keycloakId: 'kc-sa', username: 'admin', roles: ['SUPER_ADMIN'] } as AuthUser;
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 's1', roles: ['SISWA'] } as AuthUser;
const ORTU: AuthUser = { keycloakId: 'kc-ortu', username: 'o1', roles: ['ORANG_TUA'] } as AuthUser;

describe('ReportCardsService', () => {
  let service: ReportCardsService;
  const emit = jest.fn();
  const rcFindMany = jest.fn();
  const rcFindUnique = jest.fn();
  const rcCount = jest.fn();
  const rcCreate = jest.fn();
  const rcUpdate = jest.fn();
  const classFindUnique = jest.fn();
  const gradeFindMany = jest.fn();
  const attGroupBy = jest.fn();
  const teacherFindFirst = jest.fn();
  const studentFindFirst = jest.fn();
  const userFindUnique = jest.fn();

  beforeEach(async () => {
    [emit, rcFindMany, rcFindUnique, rcCount, rcCreate, rcUpdate, classFindUnique,
      gradeFindMany, attGroupBy, teacherFindFirst, studentFindFirst, userFindUnique]
      .forEach((m) => m.mockReset());
    rcUpdate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'rc-1', ...a.data }));

    const prisma = {
      reportCard: {
        findMany: rcFindMany, findUnique: rcFindUnique, count: rcCount,
        create: rcCreate, update: rcUpdate,
      },
      class: { findUnique: classFindUnique },
      grade: { findMany: gradeFindMany },
      attendance: { groupBy: attGroupBy },
      teacher: { findFirst: teacherFindFirst },
      student: { findFirst: studentFindFirst },
      user: { findUnique: userFindUnique },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit } },
      ],
    }).compile();
    service = module.get(ReportCardsService);
  });

  it('generate: snapshot per mapel (count/average/byType) + idempoten skip existing', async () => {
    classFindUnique.mockResolvedValue({ id: 'c1', students: [{ id: 's1' }, { id: 's2' }] });
    rcFindMany.mockResolvedValue([{ studentId: 's2' }]); // s2 sudah punya rapor
    gradeFindMany.mockResolvedValue([
      { score: '80', type: 'uh', assignment: { subject: 'Matematika' } },
      { score: '90', type: 'uts', assignment: { subject: 'Matematika' } },
      { score: '70', type: 'uh', assignment: { subject: 'Fisika' } },
    ]);
    attGroupBy.mockResolvedValue([
      { status: 'hadir', _count: { _all: 90 } },
      { status: 'sakit', _count: { _all: 2 } },
    ]);
    rcCreate.mockResolvedValue({ id: 'rc-new' });

    const res = await service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 });

    expect(res).toEqual({ generated: 1, skipped: 1, totalStudents: 2 });
    const data = rcCreate.mock.calls[0][0].data;
    const mtk = (data.grades as { subject: string; average: number; byType: Record<string, number> }[])
      .find((g) => g.subject === 'Matematika')!;
    expect(mtk.average).toBe(85);
    expect(mtk.byType).toEqual({ uh: 80, uts: 90 });
    expect(data.attendance).toEqual({ hadir: 90, izin: 0, sakit: 2, alpha: 0 });
  });

  it('generate: kelas tanpa siswa aktif → BadRequest; kelas tak ada → NotFound', async () => {
    classFindUnique.mockResolvedValue({ id: 'c1', students: [] });
    await expect(service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 }))
      .rejects.toThrow(BadRequestException);
    classFindUnique.mockResolvedValue(null);
    await expect(service.generate({ classId: 'cX', academicYear: '2026/2027', semester: 1 }))
      .rejects.toThrow(NotFoundException);
  });

  it('pipeline: check draft→checked; publish butuh checked (draft → 409)', async () => {
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'draft', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    await service.transition('rc-1', { action: 'check' }, SA);
    expect(rcUpdate.mock.calls[0][0].data.status).toBe('checked');
    expect(rcUpdate.mock.calls[0][0].data.checkedAt).toBeInstanceOf(Date);

    await expect(service.transition('rc-1', { action: 'publish' }, SA))
      .rejects.toThrow(ConflictException); // masih draft di mock
  });

  it('distribute: published→distributed + emit report.distributed', async () => {
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'published', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    await service.transition('rc-1', { action: 'distribute' }, SA);
    expect(emit).toHaveBeenCalledWith(EVENTS.REPORT_DISTRIBUTED, expect.objectContaining({
      reportCardId: 'rc-1', studentId: 's1',
    }));
  });

  it('return: checked→draft tanpa stempel baru', async () => {
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'checked', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    await service.transition('rc-1', { action: 'return' }, SA);
    expect(rcUpdate.mock.calls[0][0].data.status).toBe('draft');
    expect(emit).not.toHaveBeenCalled();
  });

  it('ownership: SISWA hanya rapor sendiri + status distributed DI QUERY', async () => {
    studentFindFirst.mockResolvedValue({ id: 'stu-1' });
    rcFindMany.mockResolvedValue([]);
    rcCount.mockResolvedValue(0);
    await service.findAll({ page: 1, limit: 100 }, SISWA);
    const where = rcFindMany.mock.calls[0][0].where;
    expect(where.studentId).toBe('stu-1');
    expect(where.status).toBe('distributed');
  });

  it('ownership: ORTU → anak-anaknya + distributed; GURU → kelas ampuannya', async () => {
    userFindUnique.mockResolvedValue({ parent: [{ id: 'anak-1' }, { id: 'anak-2' }] });
    rcFindMany.mockResolvedValue([]);
    rcCount.mockResolvedValue(0);
    await service.findAll({ page: 1, limit: 100 }, ORTU);
    let where = rcFindMany.mock.calls[0][0].where;
    expect(where.studentId).toEqual({ in: ['anak-1', 'anak-2'] });
    expect(where.status).toBe('distributed');

    teacherFindFirst.mockResolvedValue({ assignments: [{ classId: 'c1' }, { classId: 'c1' }, { classId: 'c2' }] });
    await service.findAll({ page: 1, limit: 100 }, GURU);
    where = rcFindMany.mock.calls[1][0].where;
    expect(where.classId).toEqual({ in: ['c1', 'c2'] });
  });

  it('notes: hanya draft (checked → 409)', async () => {
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'checked' });
    await expect(service.updateNotes('rc-1', { notes: 'x' })).rejects.toThrow(ConflictException);
  });
});

describe('ClassActivitiesService', () => {
  let service: ClassActivitiesService;
  const teacherFindFirst = jest.fn();
  const actFindUnique = jest.fn();
  const actCreate = jest.fn();
  const actUpdate = jest.fn();
  const actDelete = jest.fn();
  const classFindUnique = jest.fn();

  beforeEach(async () => {
    [teacherFindFirst, actFindUnique, actCreate, actUpdate, actDelete, classFindUnique]
      .forEach((m) => m.mockReset());
    teacherFindFirst.mockResolvedValue({ id: 'teacher-1' });
    classFindUnique.mockResolvedValue({ id: 'c1' });
    actCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'act-1', ...a.data }));

    const prisma = {
      teacher: { findFirst: teacherFindFirst },
      class: { findUnique: classFindUnique },
      classActivity: {
        findUnique: actFindUnique, findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0), create: actCreate,
        update: actUpdate, delete: actDelete,
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassActivitiesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ClassActivitiesService);
  });

  it('create: teacherId dari TOKEN (bukan body) + kelas divalidasi', async () => {
    await service.create({
      classId: 'c1', date: '2026-06-12', title: 'Praktikum jaringan', category: 'praktikum',
    }, GURU);
    expect(actCreate.mock.calls[0][0].data.teacherId).toBe('teacher-1');
  });

  it('update guru lain → Forbidden; SA bebas', async () => {
    actFindUnique.mockResolvedValue({ teacherId: 'teacher-LAIN' });
    await expect(service.update('act-1', { title: 'X' }, GURU)).rejects.toThrow(ForbiddenException);

    actUpdate.mockResolvedValue({ id: 'act-1' });
    await service.update('act-1', { title: 'X' }, SA); // SUPER_ADMIN bypass ownership
    expect(actUpdate).toHaveBeenCalled();
  });

  it('delete pemilik → sukses dgn respons eksplisit', async () => {
    actFindUnique.mockResolvedValue({ teacherId: 'teacher-1' });
    actDelete.mockResolvedValue({});
    expect(await service.remove('act-1', GURU)).toEqual({ deleted: true, id: 'act-1' });
  });
});
