jest.mock('@smk/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }, auditLog: jest.fn() }));
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { TeacherAttendanceService } from '../teacher-attendance/teacher-attendance.service';
import { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { haversineMeters } from '../teacher-attendance/haversine';
import { CheckInSchema } from '../teacher-attendance/dto/teacher-attendance.dto';

const GURU = { keycloakId: 'kc-guru', roles: ['GURU'] } as AuthUser;
const SA = { keycloakId: 'kc-sa', roles: ['SUPER_ADMIN'] } as AuthUser;
describe('haversineMeters', () => {
  it('preserves geographic distance including zero coordinates', () => {
    expect(haversineMeters(0, 0, 0, 0)).toBe(0);
    expect(haversineMeters(0, 0, 1, 0)).toBeGreaterThan(110000);
    expect(haversineMeters(0, 0, 1, 0)).toBeLessThan(112000);
  });
});
describe('TeacherAttendanceService unified compatibility', () => {
  const findTeacher = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();
  const findUniqueOrThrow = jest.fn();
  const legacyPhotos = jest.fn();
  const record = jest.fn();
  const context = jest.fn();
  let service: TeacherAttendanceService;
  const row = { id: 'attendance-1', userId: 'user-1', date: new Date('2026-10-06'), checkInAt: new Date('2026-10-06T00:31Z'),
    checkOutAt: null, locationInStatus: 'UNVERIFIED', user: { fullName: 'Synthetic teacher', staff: null, teacher: { id: 'teacher-1' } } };
  beforeEach(async () => {
    jest.resetAllMocks();
    findTeacher.mockResolvedValue({ id: 'teacher-1', userId: 'user-1' });
    findMany.mockResolvedValue([]); count.mockResolvedValue(0); findUniqueOrThrow.mockResolvedValue(row); legacyPhotos.mockResolvedValue([]);
    record.mockResolvedValue({ receipt: row, replayed: false });
    context.mockResolvedValue({ date: '2026-10-06', receipt: row, arrival: {} });
    const module = await Test.createTestingModule({ providers: [
      TeacherAttendanceService,
      { provide: PrismaService, useValue: { teacher: { findFirst: findTeacher }, teacherAttendance: { findMany: legacyPhotos }, staffAttendance: { findMany, count, findUniqueOrThrow } } },
      { provide: StaffAttendanceService, useValue: { record, context } },
    ] }).compile();
    service = module.get(TeacherAttendanceService);
  });
  it('delegates check-in/out to the same durable staff service; unknown GPS is not outside', async () => {
    const first = await service.checkIn({ locationFailure: 'POLICY_BLOCKED', notes: 'Synthetic legacy note' }, GURU);
    expect(record).toHaveBeenCalledWith({ locationFailure: 'POLICY_BLOCKED' }, GURU, false, 'Synthetic legacy note');
    expect(first.outsideGeofence).toBe(false);
    expect(first.locationInStatus).toBe('UNVERIFIED');
    await service.checkOut({ locationFailure: 'POLICY_BLOCKED' }, GURU);
    expect(record).toHaveBeenLastCalledWith({ locationFailure: 'POLICY_BLOCKED' }, GURU, true);
  });
  it('replays a check-in instead of writing a second ledger row', async () => {
    record.mockResolvedValue({ receipt: row, replayed: true });
    expect((await service.checkIn({}, GURU)).id).toBe(row.id);
  });
  it('propagates checkout-without-checkin and missing identity', async () => {
    record.mockRejectedValue(new ConflictException('Belum masuk'));
    await expect(service.checkOut({}, GURU)).rejects.toThrow(ConflictException);
    findTeacher.mockResolvedValue(null);
    await expect(service.checkIn({}, GURU)).rejects.toThrow(NotFoundException);
  });
  it('forces teacher ownership in the database query, ignoring another teacher filter', async () => {
    await service.findAll({ teacherId: 'other', outsideOnly: false, page: 1, limit: 31 }, GURU);
    expect(findMany.mock.calls[0][0].where.userId).toBe('user-1');
  });
  it('elevated teacher filtering and actual outside-only remain query-scoped', async () => {
    await service.findAll({ teacherId: 'other', outsideOnly: true, page: 1, limit: 31 }, SA);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ user: { teacher: { is: { id: 'other' } } }, locationInStatus: 'OUTSIDE' });
  });
  it('denies a student, and reads today from the authoritative WIB staff context', async () => {
    await expect(service.findAll({ outsideOnly: false, page: 1, limit: 31 }, { roles: ['SISWA'] } as AuthUser)).rejects.toThrow(ForbiddenException);
    expect(await service.myToday(GURU)).toMatchObject({ date: '2026-10-06', record: { id: row.id } });
  });
  it('legacy input cannot bypass paired GPS, failure, finite accuracy, or identity/time validation', () => {
    expect(CheckInSchema.safeParse({ lat: 0 }).success).toBe(false);
    expect(CheckInSchema.safeParse({ lat: 0, lng: 0, locationFailure: 'POLICY_BLOCKED' }).success).toBe(false);
    expect(CheckInSchema.safeParse({ userId: 'someone-else' }).success).toBe(false);
  });
  it('projects exact historical photo associations in one batch, never from a foreign teacher/date', async () => {
    findMany.mockResolvedValue([
      { ...row, legacyTeacherAttendanceId: 'legacy-own' },
      { ...row, id: 'foreign', legacyTeacherAttendanceId: 'legacy-foreign' },
      { ...row, id: 'wrong-date', legacyTeacherAttendanceId: 'legacy-date' },
      { ...row, id: 'new', legacyTeacherAttendanceId: null },
    ]);
    legacyPhotos.mockResolvedValue([
      { id: 'legacy-own', teacherId: 'teacher-1', date: row.date, photoUrl: '/media/historical-own.jpg' },
      { id: 'legacy-foreign', teacherId: 'teacher-2', date: row.date, photoUrl: '/media/foreign.jpg' },
      { id: 'legacy-date', teacherId: 'teacher-1', date: new Date('2026-10-05'), photoUrl: '/media/other-date.jpg' },
    ]);
    const result = await service.findAll({ page: 1, limit: 31, outsideOnly: false }, GURU);
    expect(result.data.map((entry) => entry.photoUrl)).toEqual(['/media/historical-own.jpg', null, null, null]);
    expect(legacyPhotos).toHaveBeenCalledTimes(1);
    expect(result.data[0]?.legacyTeacherAttendanceId).toBeUndefined();
  });
});
