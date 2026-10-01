// =============================================================================
// Classes (2D-4) + Attendance Heatmap — unit tests
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClassesService } from '../classes/classes.service';
import { ClassesController } from '../classes/classes.controller';
import { AttendanceService } from '../attendance/attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { CreateClassSchema, ListClassesQuerySchema } from '../classes/dto/class.dto';
import { HeatmapQuerySchema } from '../attendance/dto/heatmap.dto';

describe('ClassesService', () => {
  let service: ClassesService;
  const mockFindMany = jest.fn();
  const mockFindUnique = jest.fn();
  const mockCount = jest.fn();
  const mockCreate = jest.fn();
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();
  const mockTeacherFindFirst = jest.fn();
  const mockTeacherFindMany = jest.fn();
  const mockStudentCount = jest.fn();
  const mockQueryRaw = jest.fn();
  const mockExecuteRaw = jest.fn();

  beforeEach(async () => {
    [
      mockFindMany,
      mockFindUnique,
      mockCount,
      mockCreate,
      mockUpdate,
      mockDelete,
      mockTeacherFindFirst,
      mockTeacherFindMany,
      mockStudentCount,
      mockQueryRaw,
      mockExecuteRaw,
    ].forEach((m) => m.mockReset());
    const prisma = {
      class: {
        findMany: mockFindMany,
        findUnique: mockFindUnique,
        count: mockCount,
        create: mockCreate,
        update: mockUpdate,
        delete: mockDelete,
      },
      teacher: { findFirst: mockTeacherFindFirst, findMany: mockTeacherFindMany },
      student: { count: mockStudentCount },
      $queryRaw: mockQueryRaw,
      $executeRaw: mockExecuteRaw,
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    mockQueryRaw.mockResolvedValue([{ id: 'c1' }]);
    mockExecuteRaw.mockResolvedValue(1);
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ClassesService);
  });

  it('findAll: default hanya kelas aktif + studentCount + waliKelas dari relasi user', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'X RPL 1',
        majorCode: 'RPL',
        grade: 10,
        academicYear: '2026/2027',
        capacity: 36,
        teacherId: 't1',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        teacher: {
          id: 't1',
          deletedAt: null,
          user: { fullName: 'Bu Sari', role: 'GURU', isActive: true, deletedAt: null },
        },
        _count: { students: 30 },
      },
    ]);
    mockCount.mockResolvedValue(1);

    const res = await service.findAll({ includeInactive: false, page: 1, limit: 50 });
    expect(mockFindMany.mock.calls[0][0].where.isActive).toBe(true);
    expect(res.data[0]).toMatchObject({
      studentCount: 30,
      waliKelas: { id: 't1', fullName: 'Bu Sari' },
    });
    expect((res.data[0] as Record<string, unknown>)['_count']).toBeUndefined();
    const countWhere = mockFindMany.mock.calls[0][0].include._count.select.students.where;
    expect(countWhere).toMatchObject({
      deletedAt: null,
      status: 'active',
      user: { is: { isActive: true, deletedAt: null } },
    });
  });

  it('findAll: wali arsip ditandai perlu pengganti dan tidak diproyeksikan aktif', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'c1',
        teacherId: 't-old',
        teacher: {
          id: 't-old',
          deletedAt: new Date(),
          user: { fullName: 'Guru Lama', role: 'GURU', isActive: false, deletedAt: new Date() },
        },
        _count: { students: 0 },
      },
    ]);
    mockCount.mockResolvedValue(1);

    const result = await service.findAll({ includeInactive: true, page: 1, limit: 50 });
    expect(result.data[0]).toMatchObject({
      teacherId: 't-old',
      waliKelas: null,
      homeroomStatus: 'needs_replacement',
      studentCount: 0,
    });
  });

  it('findHomeroomCandidates: returns Teacher.id rather than User.id', async () => {
    mockTeacherFindMany.mockResolvedValue([
      { id: 'teacher-id', userId: 'user-id', user: { fullName: 'Bu Sari', email: 'sari@x.id' } },
    ]);
    await expect(service.findHomeroomCandidates()).resolves.toEqual([
      { id: 'teacher-id', fullName: 'Bu Sari' },
    ]);
    expect(mockTeacherFindMany.mock.calls[0][0].select).toEqual({
      id: true,
      user: { select: { fullName: true } },
    });
    expect(mockTeacherFindMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: null,
      user: { is: { role: 'GURU', isActive: true, deletedAt: null } },
    });
  });

  it('create: rejects a User.id or archived teacher with a domain error before FK write', async () => {
    mockTeacherFindFirst.mockResolvedValue(null);
    await expect(
      service.create({
        name: 'X TJKT 1',
        majorCode: 'TJKT',
        grade: 10,
        academicYear: '2026/2027',
        capacity: 36,
        teacherId: 'user-id',
      }),
    ).rejects.toThrow('Guru wali kelas tidak valid');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('update: capacity cannot be lowered below operational occupancy', async () => {
    mockStudentCount.mockResolvedValue(10);
    await expect(service.update('c1', { capacity: 9 })).rejects.toThrow(BadRequestException);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('assertOperationalSeatAvailable: serializes on class row and rejects a full class', async () => {
    mockFindUnique.mockResolvedValue({ name: 'X TJKT 1', capacity: 1, isActive: true });
    mockStudentCount.mockResolvedValue(1);
    const tx = {
      $queryRaw: mockQueryRaw,
      class: { findUnique: mockFindUnique },
      student: { count: mockStudentCount },
    };
    await expect(service.assertOperationalSeatAvailable(tx as never, 'c1')).rejects.toThrow(
      'sudah penuh (1/1)',
    );
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('remove: kelas berelasi → 409 Conflict dengan petunjuk nonaktifkan', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'c1',
      _count: { students: 12, attendanceRecords: 100, schedules: 4, teachingAssignments: 2 },
    });
    await expect(service.remove('c1')).rejects.toThrow(ConflictException);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('remove: kelas kosong → hard delete sukses', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'c2',
      _count: { students: 0, attendanceRecords: 0, schedules: 0, teachingAssignments: 0 },
    });
    mockDelete.mockResolvedValue({ id: 'c2' });
    expect(await service.remove('c2')).toEqual({ deleted: true, id: 'c2' });
  });

  it('update: id tak ada → NotFound', async () => {
    mockQueryRaw.mockResolvedValue([]);
    await expect(service.update('nope', { name: 'XI' })).rejects.toThrow(NotFoundException);
  });
});

describe('Classes DTO', () => {
  it('create: tahun ajaran salah format → ditolak; majorCode di-uppercase', () => {
    expect(
      CreateClassSchema.safeParse({
        name: 'X RPL 1',
        majorCode: 'rpl',
        grade: '10',
        academicYear: '2026-2027',
      }).success,
    ).toBe(false);
    const ok = CreateClassSchema.parse({
      name: 'X RPL 1',
      majorCode: 'rpl',
      grade: '10',
      academicYear: '2026/2027',
    });
    expect(ok.majorCode).toBe('RPL');
    expect(ok.grade).toBe(10);
    expect(ok.capacity).toBe(36);
  });

  it('list query: limit cap 200', () => {
    expect(ListClassesQuerySchema.safeParse({ limit: '201' }).success).toBe(false);
  });
});

describe('ClassesController RBAC wiring', () => {
  it('DELETE → SUPER_ADMIN saja; POST → SA+TU+KS; GET → staf+guru', () => {
    expect(Reflect.getMetadata('roles', ClassesController.prototype.remove)).toEqual([
      'SUPER_ADMIN',
    ]);
    expect(Reflect.getMetadata('roles', ClassesController.prototype.create)).toEqual([
      'SUPER_ADMIN',
      'TATA_USAHA',
    ]);
    expect(Reflect.getMetadata('roles', ClassesController.prototype.update)).toEqual([
      'SUPER_ADMIN',
      'TATA_USAHA',
    ]);
    expect(Reflect.getMetadata('roles', ClassesController.prototype.findAll)).toEqual([
      'SUPER_ADMIN',
      'KEPALA_SEKOLAH',
      'TATA_USAHA',
      'GURU',
      'WAKA_KURIKULUM',
      'WAKA_KESISWAAN',
    ]);
    expect(
      Reflect.getMetadata('roles', ClassesController.prototype.findHomeroomCandidates),
    ).toEqual(['SUPER_ADMIN', 'TATA_USAHA']);
  });
});

describe('AttendanceService.heatmap', () => {
  let service: AttendanceService;
  const mockClassFindMany = jest.fn();
  const mockGroupBy = jest.fn();

  beforeEach(async () => {
    mockClassFindMany.mockReset();
    mockGroupBy.mockReset();
    const prisma = {
      class: { findMany: mockClassFindMany, findUnique: jest.fn() },
      attendance: { groupBy: mockGroupBy, findMany: jest.fn(), count: jest.fn() },
      student: { findMany: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: AcademicPeriodService,
          useValue: {
            getActivePeriod: jest.fn().mockResolvedValue(null),
            assertWritableDateWithCutoverLock: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();
    service = module.get(AttendanceService);
  });

  function utcDate(offsetDays: number): Date {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d;
  }

  it('grid N hari × kelas: pct benar, sel kosong = pct null, agregasi via groupBy DB', async () => {
    const today = utcDate(0);
    mockClassFindMany.mockResolvedValue([{ id: 'c1', name: 'X RPL 1', grade: 10 }]);
    mockGroupBy.mockResolvedValue([
      { classId: 'c1', date: today, status: 'hadir', _count: { _all: 27 } },
      { classId: 'c1', date: today, status: 'sakit', _count: { _all: 2 } },
      { classId: 'c1', date: today, status: 'alpha', _count: { _all: 1 } },
    ]);

    const res = await service.heatmap(10);

    expect(res.dates).toHaveLength(10);
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['classId', 'date', 'status'] }),
    );

    const row = res.classes[0]!;
    const todayCell = row.cells[row.cells.length - 1]!;
    expect(todayCell.total).toBe(30);
    expect(todayCell.hadir).toBe(27);
    expect(todayCell.pct).toBe(90);
    // hari tanpa data → null (bukan 0% yang menyesatkan)
    expect(row.cells[0]!.pct).toBeNull();
  });

  it('overall today vs yesterday untuk delta dashboard', async () => {
    const today = utcDate(0);
    const yesterday = utcDate(-1);
    mockClassFindMany.mockResolvedValue([{ id: 'c1', name: 'X RPL 1', grade: 10 }]);
    mockGroupBy.mockResolvedValue([
      { classId: 'c1', date: today, status: 'hadir', _count: { _all: 9 } },
      { classId: 'c1', date: today, status: 'alpha', _count: { _all: 1 } },
      { classId: 'c1', date: yesterday, status: 'hadir', _count: { _all: 8 } },
      { classId: 'c1', date: yesterday, status: 'izin', _count: { _all: 2 } },
    ]);

    const res = await service.heatmap(10);
    expect(res.overall.today.pct).toBe(90);
    expect(res.overall.yesterday?.pct).toBe(80);
  });

  it('HeatmapQuerySchema: days di-coerce, cap 31, default 10', () => {
    expect(HeatmapQuerySchema.parse({}).days).toBe(10);
    expect(HeatmapQuerySchema.parse({ days: '14' }).days).toBe(14);
    expect(HeatmapQuerySchema.safeParse({ days: '60' }).success).toBe(false);
  });
});
