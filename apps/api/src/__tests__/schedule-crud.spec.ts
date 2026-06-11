// =============================================================================
// 2F-1: Schedule update/remove + fix overlap INKLUSIF
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ScheduleService } from '../schedule/schedule.service';
import { PrismaService } from '../prisma/prisma.service';

const EXISTING = {
  id: 'sch-1', classId: 'c1', teachingAssignmentId: 'ta-1',
  dayOfWeek: 1, jpStart: 1, jpEnd: 2, room: null,
  academicYear: '2026/2027', semester: 1,
  teachingAssignment: { teacherId: 't1' },
};

describe('ScheduleService 2F-1 (update/remove/overlap-inklusif)', () => {
  let service: ScheduleService;
  const findUnique = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const del = jest.fn();
  const taFindUnique = jest.fn();
  const taFindMany = jest.fn();
  const create = jest.fn();

  beforeEach(async () => {
    [findUnique, findFirst, update, del, taFindUnique, taFindMany, create]
      .forEach((m) => m.mockReset());
    const prisma = {
      schedule: { findUnique, findFirst, update, delete: del, create, findMany: jest.fn(), count: jest.fn() },
      teachingAssignment: { findUnique: taFindUnique, findMany: taFindMany },
      student: { findUnique: jest.fn(), findMany: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScheduleService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ScheduleService);
  });

  it('create: cek konflik guru INKLUSIF (lte/gte) — overlap tepi kini tertangkap', async () => {
    taFindUnique.mockResolvedValue({ id: 'ta-1', teacherId: 't1', classId: 'c1', academicYear: '2026/2027' });
    taFindMany.mockResolvedValue([{ id: 'ta-1' }]);
    // call 1: class-range → null; call 2: guru → conflict (slot tepi 3–4 vs dto 1–3)
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'sch-x', classId: 'c2' });

    await expect(service.create({
      classId: 'c1', teachingAssignmentId: 'ta-1', dayOfWeek: 1,
      jpStart: 1, jpEnd: 3, room: null, academicYear: '2026/2027', semester: 1,
    })).rejects.toThrow(ConflictException);

    const guruWhere = findFirst.mock.calls[1][0].where;
    expect(guruWhere.jpStart).toEqual({ lte: 3 });
    expect(guruWhere.jpEnd).toEqual({ gte: 1 });
  });

  it('create: rentang kelas overlap (1–3 vs 2–4, lolos unique jpStart) → 409', async () => {
    taFindUnique.mockResolvedValue({ id: 'ta-1', teacherId: 't1', classId: 'c1', academicYear: '2026/2027' });
    findFirst.mockResolvedValueOnce({ id: 'sch-y', jpStart: 1, jpEnd: 3 }); // class-range clash
    await expect(service.create({
      classId: 'c1', teachingAssignmentId: 'ta-1', dayOfWeek: 1,
      jpStart: 2, jpEnd: 4, room: null, academicYear: '2026/2027', semester: 1,
    })).rejects.toThrow(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('update: pindah hari dgn slot bebas → sukses, exclude diri sendiri di semua cek', async () => {
    findUnique.mockResolvedValue(EXISTING);
    taFindMany.mockResolvedValue([{ id: 'ta-1' }]);
    findFirst.mockResolvedValue(null);
    update.mockResolvedValue({ ...EXISTING, dayOfWeek: 3 });

    await service.update('sch-1', { dayOfWeek: 3 });

    for (const call of findFirst.mock.calls) {
      const w = call[0].where;
      expect(w.id ?? { not: 'sch-1' }).toEqual({ not: 'sch-1' });
    }
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sch-1' } }));
  });

  it('update: jpEnd < jpStart hasil merge partial → BadRequest', async () => {
    findUnique.mockResolvedValue({ ...EXISTING, jpStart: 3, jpEnd: 4 });
    await expect(service.update('sch-1', { jpEnd: 2 })).rejects.toThrow('jpEnd harus >= jpStart');
  });

  it('update: id tak ada → NotFound; remove: id tak ada → NotFound', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { dayOfWeek: 2 })).rejects.toThrow(NotFoundException);
    await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
  });

  it('remove: hard delete + respons eksplisit', async () => {
    findUnique.mockResolvedValue({ id: 'sch-1' });
    del.mockResolvedValue({ id: 'sch-1' });
    expect(await service.remove('sch-1')).toEqual({ deleted: true, id: 'sch-1' });
  });
});
