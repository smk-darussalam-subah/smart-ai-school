import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { isClassSessionAlertDue } from '../class-sessions/class-session-due.service';
import {
  CLASS_SESSION_ALERT_OFFSETS,
  classSessionAlertDueAt,
  ClassSessionService,
} from '../class-sessions/class-session.service';
import { PrismaService } from '../prisma/prisma.service';

const SESSION_ID = '50000000-0000-4000-8000-000000000001';
const START = new Date('2026-08-24T07:30:00.000+07:00');

function auth(keycloakId = 'teacher-kc'): AuthUser {
  return { keycloakId, roles: ['GURU'], email: 'synthetic@example.invalid', username: 'synthetic', fullName: 'Synthetic' } as AuthUser;
}

function session() {
  return {
    id: SESSION_ID,
    scheduleId: '51000000-0000-4000-8000-000000000001',
    serviceDate: new Date('2026-08-24T00:00:00.000Z'),
    academicYearId: '52000000-0000-4000-8000-000000000001',
    semesterId: '53000000-0000-4000-8000-000000000001',
    bellScheduleProfileId: '54000000-0000-4000-8000-000000000001',
    classId: '55000000-0000-4000-8000-000000000001',
    teachingAssignmentId: '56000000-0000-4000-8000-000000000001',
    scheduledTeacherId: '57000000-0000-4000-8000-000000000001',
    assignedTeacherId: '57000000-0000-4000-8000-000000000001',
    classNameSnapshot: 'X TJKT 1',
    subjectSnapshot: 'Dasar Jaringan',
    scheduledTeacherName: 'Guru Synthetic',
    assignedTeacherName: 'Guru Synthetic',
    roomSnapshot: 'Lab 1',
    scheduledStartAt: START,
    scheduledEndAt: new Date('2026-08-24T08:10:00.000+07:00'),
    status: 'SCHEDULED',
    version: 1,
    startedAt: null,
    startedBy: null,
    completedAt: null,
    completedBy: null,
    missedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    reassignedAt: null,
    reassignedBy: null,
    reassignmentReason: null,
    supersededAt: null,
    supersededBy: null,
    supersedeReason: null,
    lateByMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignedTeacher: { user: { keycloakId: 'teacher-kc' } },
    academicYear: { code: '2026/2027' },
  };
}

function buildStartService(updateCount = 1, owner = 'teacher-kc') {
  const current = { ...session(), assignedTeacher: { user: { keycloakId: owner } } };
  const eventCreate = jest.fn().mockResolvedValue({});
  const alertCancel = jest.fn().mockResolvedValue({ count: 3 });
  const deliveryCancel = jest.fn().mockResolvedValue({ count: 0 });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: SESSION_ID }]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    classSessionEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: eventCreate,
    },
    classSession: {
      findUnique: jest.fn().mockResolvedValue(current),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...current, status: 'STARTED', lateByMinutes: 5 }),
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
    },
    classSessionAlert: { updateMany: alertCancel },
    classSessionAlertDelivery: { updateMany: deliveryCancel },
  };
  const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
  const service = new ClassSessionService(prisma as unknown as PrismaService, {} as BellScheduleService);
  return { service, tx, eventCreate, alertCancel };
}

function buildReassignService(alerts: Array<{
  id: string;
  stage: 'PRIVATE_T5' | 'ROOM_T10' | 'ESCALATION_T15';
  status: 'PENDING' | 'CLAIMED' | 'DISPATCHED' | 'CANCELLED';
  dueAt: Date;
}>) {
  const current = session();
  const alertUpdate = jest.fn().mockResolvedValue({});
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: SESSION_ID }]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    classSessionEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    classSession: {
      findUnique: jest.fn().mockResolvedValue(current),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        ...current,
        status: 'REASSIGNED',
        assignedTeacherId: '57000000-0000-4000-8000-000000000099',
        assignedTeacherName: 'Guru Pengganti',
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    teacher: {
      findFirst: jest.fn().mockResolvedValue({
        id: '57000000-0000-4000-8000-000000000099',
        user: { fullName: 'Guru Pengganti' },
      }),
    },
    classSessionAlert: {
      findMany: jest.fn().mockResolvedValue(alerts),
      update: alertUpdate,
    },
    classSessionAlertDelivery: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    notificationLog: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
  return {
    service: new ClassSessionService(prisma as unknown as PrismaService, {} as BellScheduleService),
    tx,
    alertUpdate,
  };
}

describe('Wave 8.5 class session CAS, ownership, and boundaries', () => {
  it('uses exact T+5/T+10/T+15 offsets and never fires one millisecond early', () => {
    expect(CLASS_SESSION_ALERT_OFFSETS).toEqual({ PRIVATE_T5: 5, ROOM_T10: 10, ESCALATION_T15: 15 });
    for (const stage of Object.keys(CLASS_SESSION_ALERT_OFFSETS) as (keyof typeof CLASS_SESSION_ALERT_OFFSETS)[]) {
      const due = classSessionAlertDueAt(START, stage);
      expect(isClassSessionAlertDue(due, new Date(due.getTime() - 1))).toBe(false);
      expect(isClassSessionAlertDue(due, due)).toBe(true);
    }
  });

  it('starts an owned session with row lock, version CAS, lateness, and alert suppression', async () => {
    const { service, tx, eventCreate, alertCancel } = buildStartService();
    const now = new Date(START.getTime() + 5 * 60_000);
    const result = await service.start(SESSION_ID, { idempotencyKey: '58000000-0000-4000-8000-000000000001' }, auth(), now);
    expect(result).toMatchObject({ status: 'STARTED', lateByMinutes: 5 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.classSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: SESSION_ID, version: 1 }),
      data: expect.objectContaining({ status: 'STARTED', lateByMinutes: 5 }),
    }));
    expect(eventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: 'STARTED',
        metadata: expect.objectContaining({ lateByMinutes: 5, requestFingerprint: expect.any(String) }),
      }),
    }));
    expect(alertCancel).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CANCELLED', cancellationReason: 'SESSION_STARTED' }),
    }));
  });

  it('fails closed for another teacher and for a lost concurrent CAS', async () => {
    const foreign = buildStartService(1, 'other-teacher');
    await expect(foreign.service.start(
      SESSION_ID,
      { idempotencyKey: '58000000-0000-4000-8000-000000000002' },
      auth(),
      START,
    )).rejects.toThrow(ForbiddenException);

    const race = buildStartService(0);
    await expect(race.service.start(
      SESSION_ID,
      { idempotencyKey: '58000000-0000-4000-8000-000000000003' },
      auth(),
      START,
    )).rejects.toThrow(ConflictException);
    expect(race.eventCreate).not.toHaveBeenCalled();
  });

  it('returns the prior state for an exact idempotency replay without mutating again', async () => {
    const { service, tx } = buildStartService();
    const dto = { idempotencyKey: '58000000-0000-4000-8000-000000000004' };
    const identity = (service as unknown as {
      transitionIdentity(action: string, sessionId: string, actorId: string, payload: typeof dto): {
        requestFingerprint: string;
      };
    }).transitionIdentity('start', SESSION_ID, 'teacher-kc', dto);
    tx.classSessionEvent.findUnique.mockResolvedValue({
      sessionId: SESSION_ID,
      actorId: 'teacher-kc',
      metadata: { requestFingerprint: identity.requestFingerprint },
    });
    const result = await service.start(
      SESSION_ID,
      dto,
      auth(),
      START,
    );
    expect(result).toMatchObject({ status: 'STARTED' });
    expect(tx.classSession.updateMany).not.toHaveBeenCalled();
  });

  it('rejects key reuse for a different route session, actor ownership, or payload', async () => {
    const dto = {
      idempotencyKey: '58000000-0000-4000-8000-000000000014',
      reason: 'Alasan pembatalan pertama',
    };
    const reused = buildStartService();
    const oldIdentity = (reused.service as unknown as {
      transitionIdentity(action: string, sessionId: string, actorId: string, payload: typeof dto): {
        requestFingerprint: string;
      };
    }).transitionIdentity('cancel', SESSION_ID, 'teacher-kc', dto);
    reused.tx.classSessionEvent.findUnique.mockResolvedValue({
      sessionId: '50000000-0000-4000-8000-000000000099',
      actorId: 'teacher-kc',
      metadata: { requestFingerprint: oldIdentity.requestFingerprint },
    });
    await expect(reused.service.cancel(SESSION_ID, dto, auth(), START)).rejects.toThrow(
      'Idempotency key sudah digunakan untuk permintaan lain',
    );

    const changedPayload = buildStartService();
    changedPayload.tx.classSessionEvent.findUnique.mockResolvedValue({
      sessionId: SESSION_ID,
      actorId: 'teacher-kc',
      metadata: { requestFingerprint: oldIdentity.requestFingerprint },
    });
    await expect(changedPayload.service.cancel(
      SESSION_ID,
      { ...dto, reason: 'Alasan pembatalan yang berbeda' },
      auth(),
      START,
    )).rejects.toThrow('Idempotency key sudah digunakan untuk permintaan lain');

    const foreign = buildStartService(1, 'other-teacher');
    foreign.tx.classSessionEvent.findUnique.mockResolvedValue({
      sessionId: SESSION_ID,
      actorId: 'teacher-kc',
      metadata: { requestFingerprint: oldIdentity.requestFingerprint },
    });
    await expect(foreign.service.start(
      SESSION_ID,
      { idempotencyKey: dto.idempotencyKey },
      auth(),
      START,
    )).rejects.toThrow(ForbiddenException);
    expect(foreign.tx.classSessionEvent.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an early start before the authoritative ten-minute window', async () => {
    const { service, tx } = buildStartService();
    await expect(service.start(
      SESSION_ID,
      { idempotencyKey: '58000000-0000-4000-8000-000000000005' },
      auth(),
      new Date(START.getTime() - 10 * 60_000 - 1),
    )).rejects.toThrow(ConflictException);
    expect(tx.classSession.updateMany).not.toHaveBeenCalled();
  });

  it('materializes the three alert stages with database dedupe enabled', async () => {
    const alertCreateMany = jest.fn().mockResolvedValue({ count: 3 });
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      academicYear: { findMany: jest.fn().mockResolvedValue([{ id: 'ay', code: '2026/2027', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30') }]) },
      semester: { findMany: jest.fn().mockResolvedValue([{ id: 'sem', academicYearId: 'ay', number: 1, startDate: new Date('2026-07-01'), endDate: new Date('2026-12-31') }]) },
      academicCalendar: { findFirst: jest.fn().mockResolvedValue(null) },
      schedule: { findMany: jest.fn().mockResolvedValue([{
        id: '51000000-0000-4000-8000-000000000001', classId: '55000000-0000-4000-8000-000000000001',
        teachingAssignmentId: '56000000-0000-4000-8000-000000000001', jpStart: 1, jpEnd: 1, room: 'Lab 1',
        class: { name: 'X TJKT 1' },
        teachingAssignment: {
          teacherId: '57000000-0000-4000-8000-000000000001', subject: 'Dasar Jaringan',
          academicYear: '2026/2027', classId: '55000000-0000-4000-8000-000000000001',
          teacher: { user: { fullName: 'Guru Synthetic' } },
        },
      }]) },
      classSession: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: SESSION_ID, scheduledStartAt: START }]),
      },
      classSessionEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      classSessionAlert: { createMany: alertCreateMany },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const bells = {
      resolveForDate: jest.fn().mockResolvedValue({ id: 'bell', segments: [] }),
      resolveInstructionWindow: jest.fn().mockReturnValue({ startAt: START, endAt: new Date(START.getTime() + 40 * 60_000) }),
    };
    const service = new ClassSessionService(prisma as unknown as PrismaService, bells as unknown as BellScheduleService);

    await service.materialize('2026-08-24');

    const call = alertCreateMany.mock.calls[0]?.[0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data.map((row: { stage: string }) => row.stage)).toEqual([
      'PRIVATE_T5', 'ROOM_T10', 'ESCALATION_T15',
    ]);
    expect(new Set(call.data.map((row: { stage: string }) => row.stage)).size).toBe(3);
  });

  it.each([
    {
      label: 'sebelum T+5',
      now: new Date(START.getTime() + 4 * 60_000),
      statuses: ['PENDING', 'PENDING', 'PENDING'] as const,
      reset: ['private', 'room', 'escalation'],
    },
    {
      label: 'di antara T+5 dan T+10',
      now: new Date(START.getTime() + 7 * 60_000),
      statuses: ['DISPATCHED', 'PENDING', 'PENDING'] as const,
      reset: ['private', 'room', 'escalation'],
    },
    {
      label: 'di antara T+10 dan T+15',
      now: new Date(START.getTime() + 12 * 60_000),
      statuses: ['DISPATCHED', 'DISPATCHED', 'PENDING'] as const,
      reset: ['private', 'escalation'],
    },
    {
      label: 'setelah T+15',
      now: new Date(START.getTime() + 16 * 60_000),
      statuses: ['DISPATCHED', 'DISPATCHED', 'DISPATCHED'] as const,
      reset: ['private'],
    },
  ])('reassign $label rebases only teacher-bound and not-yet-dispatched stages', async ({ now, statuses, reset }) => {
    const alerts = [
      { id: 'private', stage: 'PRIVATE_T5' as const, status: statuses[0], dueAt: classSessionAlertDueAt(START, 'PRIVATE_T5') },
      { id: 'room', stage: 'ROOM_T10' as const, status: statuses[1], dueAt: classSessionAlertDueAt(START, 'ROOM_T10') },
      { id: 'escalation', stage: 'ESCALATION_T15' as const, status: statuses[2], dueAt: classSessionAlertDueAt(START, 'ESCALATION_T15') },
    ];
    const { service, tx, alertUpdate } = buildReassignService(alerts);
    await service.reassign(
      SESSION_ID,
      {
        idempotencyKey: '58000000-0000-4000-8000-000000000090',
        teacherId: '57000000-0000-4000-8000-000000000099',
        reason: 'Guru utama berhalangan hadir',
      },
      auth('operator-kc'),
      now,
    );

    expect(alertUpdate.mock.calls.map((call) => call[0].where.id)).toEqual(reset);
    expect(tx.notificationLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'failed', error: 'SESSION_REASSIGNED' },
    }));
    expect(tx.classSessionAlertDelivery.deleteMany).toHaveBeenCalledTimes(1);
    const privateReset = alertUpdate.mock.calls.find((call) => call[0].where.id === 'private');
    expect(privateReset?.[0].data.dueAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });
});
