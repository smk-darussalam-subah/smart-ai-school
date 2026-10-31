import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { ClassSessionService } from '../class-sessions/class-session.service';
import {
  MaterializeClassSessionsSchema,
  PrepareClassSessionsQuerySchema,
} from '../class-sessions/class-session.dto';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { PrismaService } from '../prisma/prisma.service';
import { OperationalMonitoringService } from '../operational-monitoring/operational-monitoring.service';
import type { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { DisplayDeviceService } from '../display-devices/display-device.service';
import { DisplayPlaybackLeaseService } from '../operational-monitoring/display-playback-lease.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';

const date = '2026-10-20';
const now = new Date(`${date}T01:00:00Z`);
function setup() {
  const schedules = [1, 2].map((jp) => ({
    id: `schedule-${jp}`,
    classId: 'class',
    teachingAssignmentId: 'assignment',
    jpStart: jp,
    jpEnd: jp,
    room: null,
    concurrencyGroup: null,
    class: { name: 'Synthetic class' },
    teachingAssignment: {
      classId: 'class',
      academicYear: '2026/2027',
      teacherId: 'teacher',
      subject: 'Synthetic subject',
      teacher: {
        deletedAt: null,
        user: {
          fullName: 'Synthetic teacher',
          keycloakId: 'mine',
          isActive: true,
          deletedAt: null,
          role: 'GURU',
          staff: { deletedAt: null },
        },
      },
    },
  }));
  const tx = {
    user: { findFirst: jest.fn().mockResolvedValue({ role: 'GURU' }) },
    $queryRaw: jest
      .fn()
      .mockImplementation(async (query: { strings: string[] }) =>
        query.strings.join('').includes('class_session_activations')
          ? [{ enabled: true, revision: 1 }]
          : [{ id: 'teacher' }],
      ),
    $executeRaw: jest.fn().mockResolvedValue(0),
    academicYear: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'year',
          code: '2026/2027',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2027-06-30'),
        },
      ]),
    },
    semester: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'semester',
          academicYearId: 'year',
          number: 1,
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-12-31'),
        },
      ]),
    },
    academicCalendar: { findFirst: jest.fn().mockResolvedValue(null) },
    schedule: { findMany: jest.fn().mockResolvedValue(schedules) },
    classSession: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    },
    classSessionEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'binding' }),
      findMany: jest
        .fn()
        .mockResolvedValue(
          ['owned', 'foreign'].map((id) => ({ eventKey: `class-session:activation:${id}:1` })),
        ),
    },
    classSessionAlert: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
  };
  const prisma = { ...tx, $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)) };
  const bells = {
    resolveForDate: jest.fn().mockResolvedValue({ id: 'bell', segments: [] }),
    resolveInstructionWindow: jest.fn((ymd: string, _bell: unknown, jp: number) => ({
      startAt: new Date(`${ymd}T0${jp === 1 ? 0 : 2}:00:00Z`),
      endAt: new Date(`${ymd}T0${jp === 1 ? 1 : 3}:00:00Z`),
    })),
  };
  const permissions = {
    getActivePositionCodes: jest.fn().mockResolvedValue(new Set(['KEPALA_SEKOLAH'])),
    getAuthoritativePrimaryRole: jest.fn().mockResolvedValue('SUPER_ADMIN'),
    hasFreshPermission: jest.fn().mockResolvedValue(true),
  };
  const period = {
    acquireCutoverLock: jest.fn().mockResolvedValue(undefined),
    assertWritableSemesterId: jest.fn().mockResolvedValue(undefined),
  };
  return {
    schedules,
    period,
    tx,
    bells,
    permissions,
    service: new ClassSessionService(
      prisma as unknown as PrismaService,
      bells as unknown as BellScheduleService,
      permissions as unknown as PermissionsService,
      period as unknown as AcademicPeriodService,
    ),
  };
}
describe('manual session preparation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => jest.useRealTimers());
  it('previews authoritative schedules and bells with no session/event/alert writes', async () => {
    const { service, tx, bells } = setup();
    const plan = await service.materialize(date, 'system', { preview: true });
    expect(plan).toMatchObject({
      scheduledCount: 2,
      eligibleCount: 1,
      newCount: 1,
      skippedStartedCount: 1,
      planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(tx.classSession.createMany).not.toHaveBeenCalled();
    expect(tx.classSessionEvent.createMany).not.toHaveBeenCalled();
    expect(tx.classSessionAlert.createMany).not.toHaveBeenCalled();
    expect(bells.resolveInstructionWindow).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.schedule.findMany.mock.invocationCallOrder[0]!,
    );
  });
  it('commits only future blocks after exact preview without retroactive alerts', async () => {
    const { service, tx } = setup();
    const plan = await service.materialize(date, 'system', { preview: true });
    if (!('planHash' in plan)) throw new Error('Expected preview');
    tx.classSession.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'session',
        scheduleId: 'schedule-2',
        status: 'SCHEDULED',
        assignedTeacherId: 'teacher',
        classId: 'class',
        teachingAssignmentId: 'assignment',
        semesterId: 'semester',
        academicYearId: 'year',
        bellScheduleProfileId: 'bell',
        scheduledStartAt: new Date(`${date}T02:00:00Z`),
        scheduledEndAt: new Date(`${date}T03:00:00Z`),
      },
    ]);
    await expect(
      service.materialize(date, 'operator', { expectedPlanHash: plan.planHash }),
    ).resolves.toMatchObject({ createdCount: 1 });
    expect(tx.classSession.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ scheduleId: 'schedule-2' })] }),
    );
    expect(tx.classSessionEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ actorType: 'USER', actorId: 'operator' })],
      }),
    );
    expect(
      tx.classSessionAlert.createMany.mock.calls[0]![0].data.every(
        (alert: { dueAt: Date }) => alert.dueAt > now,
      ),
    ).toBe(true);
  });
  it.each(['schedule', 'existing', 'clock'] as const)(
    'rejects %s drift before writes',
    async (drift) => {
      const { service, tx, bells } = setup();
      const plan = await service.materialize(date, 'system', { preview: true });
      if (!('planHash' in plan)) throw new Error('Expected preview');
      if (drift === 'schedule')
        bells.resolveInstructionWindow.mockImplementation((ymd) => ({
          startAt: new Date(`${ymd}T04:00:00Z`),
          endAt: new Date(`${ymd}T05:00:00Z`),
        }));
      if (drift === 'existing')
        tx.classSession.findMany.mockResolvedValue([
          { scheduleId: 'schedule-2', status: 'SCHEDULED', version: 1 },
        ]);
      if (drift === 'clock') jest.setSystemTime(new Date(`${date}T02:00:00.001Z`));
      await expect(
        service.materialize(date, 'operator', { expectedPlanHash: plan.planHash }),
      ).rejects.toThrow(ConflictException);
      expect(tx.classSession.createMany).not.toHaveBeenCalled();
      expect(tx.classSessionAlert.createMany).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid/out-of-range dates, holiday and missing binding', async () => {
    const { service, tx } = setup();
    for (const value of ['2026-10-19', '2026-11-04', '2026-02-30'])
      await expect(service.materialize(value, 'system', { preview: true })).rejects.toThrow(
        BadRequestException,
      );
    tx.academicCalendar.findFirst.mockResolvedValue({ id: 'holiday' });
    await expect(service.materialize(date, 'system', { preview: true })).rejects.toThrow(
      ConflictException,
    );
    expect(MaterializeClassSessionsSchema.safeParse({ date }).success).toBe(false);
    expect(PrepareClassSessionsQuerySchema.safeParse({ date, force: true }).success).toBe(false);
    expect(tx.classSession.createMany).not.toHaveBeenCalled();
  });
  it('exposes ownership capability without leaking the joined identity', async () => {
    const { service, tx, permissions } = setup();
    tx.classSession.findMany.mockResolvedValue([
      ...['mine', 'other'].map((keycloakId, index) => ({
        id: index ? 'foreign' : 'owned',
        semesterId: 'semester',
        serviceDate: new Date(date),
        assignedTeacher: {
          deletedAt: null,
          user: {
            keycloakId,
            isActive: true,
            deletedAt: null,
            role: 'GURU',
            staff: { deletedAt: null },
          },
        },
      })),
    ]);
    const query = { date, page: 1, limit: 100 };
    const user = { keycloakId: 'mine', roles: ['SUPER_ADMIN', 'GURU'] } as AuthUser;
    expect((await service.list(query, user)).data).toEqual([
      {
        id: 'owned',
        semesterId: 'semester',
        serviceDate: new Date(date),
        canOperate: true,
        operationBlockedReason: null,
      },
      {
        id: 'foreign',
        semesterId: 'semester',
        serviceDate: new Date(date),
        canOperate: false,
        operationBlockedReason: null,
      },
    ]);
    tx.user.findFirst.mockResolvedValue({ role: 'SUPER_ADMIN' });
    permissions.getActivePositionCodes.mockResolvedValue(new Set());
    expect(
      (await service.list(query, { ...user, roles: ['SUPER_ADMIN'] })).data.every(
        (item) => !item.canOperate,
      ),
    ).toBe(true);
  });
  it('rejects revoked authority after domain locks before privileged writes', async () => {
    const { service, tx, permissions } = setup();
    const plan = await service.materialize(date, 'system', { preview: true });
    if (!('planHash' in plan)) throw new Error('Expected preview');
    permissions.hasFreshPermission.mockResolvedValue(false);
    await expect(
      service.materialize(date, 'operator', { expectedPlanHash: plan.planHash }),
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.classSession.createMany).not.toHaveBeenCalled();
    expect(tx.classSessionAlert.createMany).not.toHaveBeenCalled();
  });
  it.each(['inactive', 'role', 'archivedUser', 'archivedTeacher', 'missingStaff', 'archivedStaff'])(
    'rejects teacher %s drift between preview and commit with no writes',
    async (drift) => {
      const { service, tx, schedules } = setup();
      const plan = await service.materialize(date, 'system', { preview: true });
      if (!('planHash' in plan)) throw new Error('Expected preview');
      const teacher = schedules[1]!.teachingAssignment.teacher;
      // Model Prisma's nullable fields without weakening the production predicate.
      const changed = { ...teacher, user: { ...teacher.user } };
      if (drift === 'inactive') changed.user.isActive = false;
      if (drift === 'role') changed.user.role = 'TATA_USAHA';
      tx.schedule.findMany.mockResolvedValue(
        schedules.map((slot, i) =>
          i
            ? {
                ...slot,
                teachingAssignment: {
                  ...slot.teachingAssignment,
                  teacher: {
                    ...changed,
                    deletedAt: drift === 'archivedTeacher' ? now : null,
                    user: {
                      ...changed.user,
                      deletedAt: drift === 'archivedUser' ? now : null,
                      staff:
                        drift === 'missingStaff'
                          ? null
                          : { deletedAt: drift === 'archivedStaff' ? now : null },
                    },
                  },
                },
              }
            : slot,
        ),
      );
      await expect(
        service.materialize(date, 'operator', { expectedPlanHash: plan.planHash }),
      ).rejects.toThrow(ConflictException);
      expect(tx.classSession.createMany).not.toHaveBeenCalled();
      expect(tx.classSessionEvent.createMany).not.toHaveBeenCalled();
      expect(tx.classSessionAlert.createMany).not.toHaveBeenCalled();
    },
  );
  it('locks period cutover before authority/time reads and refuses a closed semester', async () => {
    const { service, tx, period, permissions } = setup();
    const plan = await service.materialize(date, 'system', { preview: true });
    if (!('planHash' in plan)) throw new Error('Expected preview');
    period.assertWritableSemesterId.mockRejectedValue(
      new ConflictException('Periode semester sudah ditutup'),
    );
    await expect(
      service.materialize(date, 'operator', { expectedPlanHash: plan.planHash }),
    ).rejects.toThrow(ConflictException);
    expect(period.acquireCutoverLock.mock.invocationCallOrder[1]).toBeLessThan(
      permissions.hasFreshPermission.mock.invocationCallOrder[0]!,
    );
    expect(tx.classSession.createMany).not.toHaveBeenCalled();
  });
});
describe('monitoring segment without materialized sessions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => jest.useRealTimers());
  function setupMonitoring() {
    const prisma = {
      classSession: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      displayDevice: { findMany: jest.fn().mockResolvedValue([]) },
      classSessionAlert: { count: jest.fn().mockResolvedValue(0) },
      academicCalendar: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const bells = {
      resolveForDate: jest.fn().mockResolvedValue({
        segments: [
          {
            type: 'INSTRUCTION',
            jpNumber: 2,
            label: 'Belajar',
            startMinute: 480,
            endMinute: 520,
          },
        ],
      }),
    };
    return {
      prisma,
      bells,
      service: new OperationalMonitoringService(
        prisma as unknown as PrismaService,
        {} as DisplayDeviceService,
        bells as unknown as BellScheduleService,
        {} as DisplayPlaybackLeaseService,
        {} as StaffAttendanceService,
      ),
    };
  }
  it('shows the canonical JP at its WIB boundary with zero sessions', async () => {
    const { service } = setupMonitoring();
    expect(await service.privateSnapshot({ date })).toMatchObject({
      currentSegment: 'JP 2 · Belajar',
      schoolDay: { state: 'INSTRUCTION' },
      sessions: [],
    });
    jest.setSystemTime(new Date(`${date}T01:40:00Z`));
    expect(await service.privateSnapshot({ date })).toMatchObject({
      schoolDay: { state: 'OUTSIDE' },
    });
  });
  it('does not mislabel failed bell reads as outside-hours', async () => {
    const { service, bells } = setupMonitoring();
    bells.resolveForDate.mockRejectedValue(new Error('Synthetic unavailable bell'));
    expect(await service.privateSnapshot({ date })).toMatchObject({
      currentSegment: null,
      schoolDay: { state: 'UNAVAILABLE' },
    });
  });
  it('distinguishes historical date, holiday and break', async () => {
    const { service, bells, prisma } = setupMonitoring();
    expect(await service.privateSnapshot({ date: '2026-10-19' })).toMatchObject({
      schoolDay: { state: 'NOT_TODAY' },
    });
    expect(bells.resolveForDate).not.toHaveBeenCalled();
    prisma.academicCalendar.findFirst.mockResolvedValue({ id: 'holiday' });
    expect(await service.privateSnapshot({ date })).toMatchObject({
      schoolDay: { state: 'HOLIDAY' },
    });
    prisma.academicCalendar.findFirst.mockResolvedValue(null);
    bells.resolveForDate.mockResolvedValue({
      segments: [
        { type: 'BREAK', jpNumber: 0, label: 'Istirahat', startMinute: 480, endMinute: 520 },
      ],
    });
    expect(await service.privateSnapshot({ date })).toMatchObject({
      currentSegment: 'Istirahat',
      schoolDay: { state: 'BREAK' },
    });
  });
});
