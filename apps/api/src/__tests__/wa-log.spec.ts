// =============================================================================
// P15 W3-4: WaLogService — findAll, findMy, findStudent, logWaNotification.
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { WaLogService } from '../wa-log/wa-log.service';
import { PrismaService } from '../prisma/prisma.service';

const KS: AuthUser = { keycloakId: 'kc-ks', username: 'ks1', roles: ['KEPALA_SEKOLAH'] } as AuthUser;
const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;
const ORTU: AuthUser = { keycloakId: 'kc-ortu', username: 'ortu1', roles: ['ORANG_TUA'] } as AuthUser;
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;

describe('WaLogService', () => {
  let service: WaLogService;
  const userFindUnique = jest.fn();
  const studentFindUnique = jest.fn();
  const studentFindFirst = jest.fn();
  const waLogFindMany = jest.fn();
  const waLogCount = jest.fn();
  const waLogCreate = jest.fn();

  beforeEach(async () => {
    [userFindUnique, studentFindUnique, studentFindFirst, waLogFindMany, waLogCount, waLogCreate]
      .forEach((m) => m.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1' });
    studentFindUnique.mockResolvedValue({ id: 'student-1' });
    waLogFindMany.mockResolvedValue([]);
    waLogCount.mockResolvedValue(0);

    const prisma = {
      user: { findUnique: userFindUnique },
      student: { findUnique: studentFindUnique, findFirst: studentFindFirst },
      waLog: { findMany: waLogFindMany, count: waLogCount, create: waLogCreate },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [WaLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(WaLogService);
  });

  it('findAll KS → returns all WA logs', async () => {
    waLogFindMany.mockResolvedValue([{ id: 'wl-1', recipient: '628123', message: 'test', status: 'sent' }]);
    waLogCount.mockResolvedValue(1);
    const res = await service.findAll({ page: 1, limit: 20 } as never, KS);
    expect(res.data).toHaveLength(1);
    expect(res.total).toBe(1);
  });

  it('findAll GURU → Forbidden (only KS/SA)', async () => {
    await expect(service.findAll({ page: 1, limit: 20 } as never, GURU))
      .rejects.toThrow(ForbiddenException);
  });

  it('findAll with eventType filter → passes filter to Prisma', async () => {
    await service.findAll({ page: 1, limit: 20, eventType: 'alpha' } as never, KS);
    expect(waLogFindMany.mock.calls[0][0].where.eventType).toBe('alpha');
  });

  it('findMyLogs SISWA → scoped to own studentId', async () => {
    await service.findMyLogs(SISWA);
    expect(waLogFindMany.mock.calls[0][0].where.studentId).toBe('student-1');
  });

  it('findStudentLogs ORTU child → returns logs', async () => {
    studentFindFirst.mockResolvedValue({ id: 'student-1' });
    await service.findStudentLogs('student-1', ORTU);
    expect(studentFindFirst.mock.calls[0][0].where.parentId).toBe('user-1');
  });

  it('findStudentLogs ORTU not child → Forbidden', async () => {
    studentFindFirst.mockResolvedValue(null);
    await expect(service.findStudentLogs('student-LAIN', ORTU))
      .rejects.toThrow(ForbiddenException);
  });

  it('logWaNotification → creates WaLog entry', async () => {
    await service.logWaNotification({
      studentId: 'student-1',
      recipient: '628123456',
      message: 'Test notification',
      eventType: 'alpha',
    });
    expect(waLogCreate).toHaveBeenCalled();
    expect(waLogCreate.mock.calls[0][0].data.recipient).toBe('628123456');
  });

  it('logWaNotification fail-soft → does not throw on Prisma error', async () => {
    waLogCreate.mockRejectedValue(new Error('DB connection failed'));
    await expect(service.logWaNotification({
      recipient: '628123',
      message: 'test',
    })).resolves.toBeUndefined();
  });
});
