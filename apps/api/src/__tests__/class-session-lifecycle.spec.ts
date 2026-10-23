import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { ClassSessionService } from '../class-sessions/class-session.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PermissionsService } from '../permissions/permissions.service';
import { sessionActivationFixture } from './fixtures/session-activation.fixture';

type Action = 'start' | 'complete' | 'cancel' | 'reassign' | 'recover';
const now = new Date('2026-10-20T00:30:00Z');
const actor = { keycloakId: 'owner', roles: ['GURU'] } as AuthUser;
const dto = { idempotencyKey: '10000000-0000-4000-8000-000000000001' };
function fixture(action: Action) {
  const teacher = {
    deletedAt: null as Date | null,
    user: {
      keycloakId: 'owner',
      fullName: 'Synthetic',
      isActive: true,
      deletedAt: null as Date | null,
      role: 'GURU',
      staff: { deletedAt: null as Date | null } as { deletedAt: Date | null } | null,
    },
  };
  const row = {
    id: 'session',
    semesterId: 'semester',
    academicYearId: 'year',
    bellScheduleProfileId: 'bell',
    assignedTeacher: teacher,
    assignedTeacherId: 'teacher',
    status: action === 'complete' ? 'STARTED' : action === 'recover' ? 'CANCELLED' : 'SCHEDULED',
    startedAt: action === 'complete' ? now : null,
    version: 1,
    classId: 'class',
    subjectSnapshot: 'Synthetic',
    academicYear: { code: '2026/2027' },
    serviceDate: new Date('2026-10-20'),
    scheduledStartAt: now,
    scheduledEndAt: new Date(now.getTime() + 40 * 60_000),
  };
  const activation = sessionActivationFixture(row);
  const tx = {
    ...activation.domain,
    $queryRaw: jest.fn().mockImplementation(activation.queryRaw),
    $executeRaw: jest.fn().mockResolvedValue(0),
    classSession: {
      findUnique: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row),
    },
    classSessionEvent: {
      findUnique: jest.fn().mockImplementation(activation.binding),
      create: jest.fn(),
    },
    classSessionAlert: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    classSessionAlertDelivery: { updateMany: jest.fn() },
    teacher: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'replacement', user: { fullName: 'Synthetic replacement' } }),
    },
  };
  const permissions = {
    getAuthoritativePrimaryRole: jest
      .fn()
      .mockResolvedValue(action === 'start' || action === 'complete' ? 'GURU' : 'SUPER_ADMIN'),
    getActivePositionCodes: jest.fn().mockResolvedValue(new Set()),
    hasFreshPermission: jest.fn().mockResolvedValue(true),
  };
  const prisma = { $transaction: (run: (client: typeof tx) => unknown) => run(tx) };
  const service = new ClassSessionService(
    prisma as unknown as PrismaService,
    activation.bells,
    permissions as unknown as PermissionsService,
    activation.period,
  );
  return { service, tx, permissions, teacher, row };
}
function run(service: ClassSessionService, action: Action) {
  switch (action) {
    case 'start':
      return service.start('session', dto, actor, now);
    case 'complete':
      return service.complete('session', dto, actor, now);
    case 'cancel':
      return service.cancel('session', { ...dto, reason: 'Synthetic reason' }, actor, now);
    case 'reassign':
      return service.reassign(
        'session',
        { ...dto, teacherId: 'replacement', reason: 'Synthetic reason' },
        actor,
        now,
      );
    case 'recover':
      return service.recover(
        'session',
        { ...dto, targetStatus: 'SCHEDULED', reason: 'Synthetic reason' },
        actor,
      );
  }
}
describe('fresh class-session lifecycle authority', () => {
  it('R04: missing start time fails closed at the service boundary before any write', async () => {
    const { service, tx, row } = fixture('complete');
    row.startedAt = null;
    await expect(run(service, 'complete')).rejects.toMatchObject({ status: 409 });
    expect(tx.classSession.updateMany).not.toHaveBeenCalled();
    expect(tx.classSessionEvent.create).not.toHaveBeenCalled();
    expect(tx.classSessionAlert.updateMany).not.toHaveBeenCalled();
  });
  it('checks the current start window after waiting, rather than the request-entry clock', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const { service, tx, row } = fixture('start');
      tx.$queryRaw.mockImplementationOnce(async () => {
        jest.setSystemTime(new Date(row.scheduledEndAt.getTime() + 1));
        return [];
      });
      await expect(service.start('session', dto, actor)).rejects.toThrow(
        'Jendela mulai sesi sudah berakhir',
      );
      expect(tx.classSession.updateMany).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it.each<Action>(['start', 'complete', 'cancel', 'reassign', 'recover'])(
    '%s checks fresh authority after all domain locks and before reads/writes',
    async (action) => {
      const { service, tx, permissions } = fixture(action);
      await run(service, action);
      const rowLock = tx.$queryRaw.mock.invocationCallOrder[0]!;
      const locks = tx.$executeRaw.mock.invocationCallOrder;
      const idempotencyLock = locks.find((order) => order > rowLock)!;
      const authorityRead = permissions.getAuthoritativePrimaryRole.mock.invocationCallOrder[0]!;
      expect(rowLock).toBeLessThan(idempotencyLock!);
      expect(idempotencyLock!).toBeLessThan(authorityRead);
      expect(locks.filter((order) => order < authorityRead).length).toBeGreaterThanOrEqual(2);
      expect(authorityRead).toBeLessThan(tx.classSession.findUnique.mock.invocationCallOrder[0]!);
      expect(tx.classSession.updateMany).toHaveBeenCalledTimes(1);
    },
  );
  it.each<Action>(['start', 'complete', 'cancel', 'reassign', 'recover'])(
    '%s denies revoked authority even for an existing idempotency event',
    async (action) => {
      const { service, tx, permissions } = fixture(action);
      permissions.getAuthoritativePrimaryRole.mockResolvedValue(null);
      tx.classSessionEvent.findUnique.mockResolvedValue({ actorId: 'owner' });
      await expect(run(service, action)).rejects.toThrow(ForbiddenException);
      expect(tx.classSessionEvent.findUnique).not.toHaveBeenCalled();
      expect(tx.classSession.updateMany).not.toHaveBeenCalled();
      expect(tx.classSessionEvent.create).not.toHaveBeenCalled();
      expect(tx.classSessionAlert.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each<Action>(['start', 'complete', 'cancel', 'reassign', 'recover'])(
    '%s denies a fresh permission override',
    async (action) => {
      const { service, tx, permissions } = fixture(action);
      permissions.hasFreshPermission.mockResolvedValue(false);
      await expect(run(service, action)).rejects.toThrow(ForbiddenException);
      expect(tx.classSession.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each(['start', 'complete'] as const)(
    '%s requires a current live teacher/staff owner',
    async (action) => {
      for (const change of [
        'inactive',
        'archivedUser',
        'role',
        'archivedTeacher',
        'missingStaff',
        'archivedStaff',
        'foreign',
      ] as const) {
        const { service, tx, teacher } = fixture(action);
        if (change === 'inactive') teacher.user.isActive = false;
        if (change === 'archivedUser') teacher.user.deletedAt = now;
        if (change === 'role') teacher.user.role = 'TATA_USAHA';
        if (change === 'archivedTeacher') teacher.deletedAt = now;
        if (change === 'missingStaff') teacher.user.staff = null;
        if (change === 'archivedStaff') teacher.user.staff!.deletedAt = now;
        if (change === 'foreign') teacher.user.keycloakId = 'foreign';
        await expect(run(service, action)).rejects.toThrow(ForbiddenException);
        expect(tx.classSession.updateMany).not.toHaveBeenCalled();
      }
    },
  );
  it('uses the same active teacher predicate for reassignment and rejects ineligible replacement', async () => {
    const { service, tx } = fixture('reassign');
    tx.teacher.findFirst.mockResolvedValue(null);
    await expect(run(service, 'reassign')).rejects.toThrow('Guru pengganti harus aktif');
    expect(tx.teacher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          user: {
            isActive: true,
            deletedAt: null,
            role: 'GURU',
            staff: { is: { deletedAt: null } },
          },
        }),
      }),
    );
    expect(tx.classSession.updateMany).not.toHaveBeenCalled();
  });
  it('does not reopen alerts for an ineligible assigned teacher', async () => {
    const { service, tx, teacher } = fixture('recover');
    teacher.user.role = 'TATA_USAHA';
    await expect(run(service, 'recover')).rejects.toThrow('Guru yang ditugaskan tidak lagi aktif');
    expect(tx.classSession.updateMany).not.toHaveBeenCalled();
    expect(tx.classSessionAlert.updateMany).not.toHaveBeenCalled();
  });
});
