// =============================================================================
// 2F-2: Presensi Guru — haversine, geofence flag, check-in/out, ownership query
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { TeacherAttendanceService } from '../teacher-attendance/teacher-attendance.service';
import { haversineMeters } from '../teacher-attendance/haversine';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SA: AuthUser = { keycloakId: 'kc-sa', username: 'admin', roles: ['SUPER_ADMIN'] } as AuthUser;

// SMK Darussalam Subah (approx) sebagai titik sekolah uji
const SCHOOL = { latitude: '-6.971000', longitude: '109.834000', geofenceRadiusM: 300 };

describe('haversineMeters', () => {
  it('jarak titik sama = 0; ~111 km per derajat lintang', () => {
    expect(haversineMeters(-6.971, 109.834, -6.971, 109.834)).toBe(0);
    const d = haversineMeters(-6.971, 109.834, -5.971, 109.834);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('±0.001° (~111 m) masih presisi puluhan meter', () => {
    const d = haversineMeters(-6.971, 109.834, -6.970, 109.834);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });
});

describe('TeacherAttendanceService', () => {
  let service: TeacherAttendanceService;
  const teacherFindFirst = jest.fn();
  const profileFindFirst = jest.fn();
  const taFindUnique = jest.fn();
  const taCreate = jest.fn();
  const taUpdate = jest.fn();
  const taFindMany = jest.fn();
  const taCount = jest.fn();

  beforeEach(async () => {
    [teacherFindFirst, profileFindFirst, taFindUnique, taCreate, taUpdate, taFindMany, taCount]
      .forEach((m) => m.mockReset());
    teacherFindFirst.mockResolvedValue({ id: 'teacher-1' });
    profileFindFirst.mockResolvedValue(SCHOOL);
    taCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'att-1', ...args.data }));
    taUpdate.mockResolvedValue({ id: 'att-1' });

    const prisma = {
      teacher: { findFirst: teacherFindFirst },
      schoolProfile: { findFirst: profileFindFirst },
      teacherAttendance: {
        findUnique: taFindUnique, create: taCreate, update: taUpdate,
        findMany: taFindMany, count: taCount,
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeacherAttendanceService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TeacherAttendanceService);
  });

  it('check-in DALAM radius → outsideGeofence=false, jarak terisi', async () => {
    taFindUnique.mockResolvedValue(null);
    await service.checkIn({ lat: -6.9712, lng: 109.8342 }, GURU);
    const data = taCreate.mock.calls[0][0].data;
    expect(data.outsideGeofence).toBe(false);
    expect(data.distanceInM).toBeLessThan(300);
  });

  it('check-in LUAR radius (~1.1 km) → diflag, TIDAK ditolak', async () => {
    taFindUnique.mockResolvedValue(null);
    await service.checkIn({ lat: -6.981, lng: 109.834 }, GURU);
    const data = taCreate.mock.calls[0][0].data;
    expect(data.outsideGeofence).toBe(true);
    expect(data.distanceInM).toBeGreaterThan(1000);
    expect(taCreate).toHaveBeenCalled(); // tetap tercatat
  });

  it('geofence aktif + koordinat TIDAK dikirim → flag (tak terverifikasi)', async () => {
    taFindUnique.mockResolvedValue(null);
    await service.checkIn({}, GURU);
    expect(taCreate.mock.calls[0][0].data.outsideGeofence).toBe(true);
    expect(taCreate.mock.calls[0][0].data.distanceInM).toBeNull();
  });

  it('sekolah TANPA koordinat (geofence nonaktif) → tidak diflag', async () => {
    profileFindFirst.mockResolvedValue({ latitude: null, longitude: null, geofenceRadiusM: 300 });
    taFindUnique.mockResolvedValue(null);
    await service.checkIn({}, GURU);
    expect(taCreate.mock.calls[0][0].data.outsideGeofence).toBe(false);
  });

  it('check-in dobel di hari sama → 409', async () => {
    taFindUnique.mockResolvedValue({ id: 'att-x' });
    await expect(service.checkIn({}, GURU)).rejects.toThrow(ConflictException);
  });

  it('check-out tanpa check-in → 404; check-out dobel → 409', async () => {
    taFindUnique.mockResolvedValue(null);
    await expect(service.checkOut({}, GURU)).rejects.toThrow(NotFoundException);
    taFindUnique.mockResolvedValue({ id: 'att-1', checkOutAt: new Date() });
    await expect(service.checkOut({}, GURU)).rejects.toThrow(ConflictException);
  });

  it('user tanpa profil guru → 404 (bukan crash)', async () => {
    teacherFindFirst.mockResolvedValue(null);
    await expect(service.checkIn({}, GURU)).rejects.toThrow(NotFoundException);
  });

  it('findAll GURU → teacherId DIPAKSA milik sendiri di QUERY', async () => {
    taFindMany.mockResolvedValue([]);
    taCount.mockResolvedValue(0);
    await service.findAll({ teacherId: 'teacher-LAIN', outsideOnly: false, page: 1, limit: 31 }, GURU);
    expect(taFindMany.mock.calls[0][0].where.teacherId).toBe('teacher-1');
  });

  it('findAll SA → bebas filter teacherId + outsideOnly', async () => {
    taFindMany.mockResolvedValue([]);
    taCount.mockResolvedValue(0);
    await service.findAll({ teacherId: 't-9', outsideOnly: true, page: 1, limit: 31 }, SA);
    const where = taFindMany.mock.calls[0][0].where;
    expect(where.teacherId).toBe('t-9');
    expect(where.outsideGeofence).toBe(true);
  });

  it('findAll role tanpa hak (SISWA) → Forbidden', async () => {
    const siswa = { keycloakId: 'kc-s', username: 's', roles: ['SISWA'] } as AuthUser;
    await expect(service.findAll({ outsideOnly: false, page: 1, limit: 31 }, siswa))
      .rejects.toThrow(ForbiddenException);
  });
});
