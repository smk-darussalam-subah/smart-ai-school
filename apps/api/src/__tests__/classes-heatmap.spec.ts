// =============================================================================
// Classes (2D-4) + Attendance Heatmap — unit tests
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClassesService } from '../classes/classes.service';
import { ClassesController } from '../classes/classes.controller';
import { AttendanceService } from '../attendance/attendance.service';
import { PrismaService } from '../prisma/prisma.service';
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

  beforeEach(async () => {
    [mockFindMany, mockFindUnique, mockCount, mockCreate, mockUpdate, mockDelete]
      .forEach((m) => m.mockReset());
    const prisma = {
      class: {
        findMany: mockFindMany, findUnique: mockFindUnique, count: mockCount,
        create: mockCreate, update: mockUpdate, delete: mockDelete,
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ClassesService);
  });

  it('findAll: default hanya kelas aktif + studentCount + waliKelas dari relasi user', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'c1', name: 'X RPL 1', majorCode: 'RPL', grade: 10,
        academicYear: '2026/2027', capacity: 36, teacherId: 't1', isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
        teacher: { id: 't1', user: { fullName: 'Bu Sari' } },
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
    mockFindUnique.mockResolvedValue(null);
    await expect(service.update('nope', { name: 'XI' })).rejects.toThrow(NotFoundException);
  });
});

describe('Classes DTO', () => {
  it('create: tahun ajaran salah format → ditolak; majorCode di-uppercase', () => {
    expect(CreateClassSchema.safeParse({
      name: 'X RPL 1', majorCode: 'rpl', grade: '10', academicYear: '2026-2027',
    }).success).toBe(false);
    const ok = CreateClassSchema.parse({
      name: 'X RPL 1', majorCode: 'rpl', grade: '10', academicYear: '2026/2027',
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
    expect(Reflect.getMetadata('roles', ClassesController.prototype.remove))
      .toEqual(['SUPER_ADMIN']);
    expect(Reflect.getMetadata('roles', ClassesController.prototype.create))
      .toEqual(['SUPER_ADMIN', 'TATA_USAHA']);
    expect(Reflect.getMetadata('roles', ClassesController.prototype.update))
      .toEqual(['SUPER_ADMIN', 'TATA_USAHA']);
    expect(Reflect.getMetadata('roles', ClassesController.prototype.findAll))
      .toEqual(['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU']);
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
    mockClassFindMany.mockResolvedValue([
      { id: 'c1', name: 'X RPL 1', grade: 10 },
    ]);
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
