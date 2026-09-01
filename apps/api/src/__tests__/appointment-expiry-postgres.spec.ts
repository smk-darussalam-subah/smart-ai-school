import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { getSchoolDate } from '../common/helpers/school-date.helper';
import { AppointmentsService } from '../appointments/appointments.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

const databaseUrl = process.env.APPOINTMENT_EXPIRY_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const DISPOSABLE_CONFIRMATION = 'CONFIRM_DISPOSABLE_APPOINTMENT_EXPIRY';
const DISPOSABLE_MARKER = 'APPOINTMENT_EXPIRY_DISPOSABLE_V1';

export function assertDisposableAppointmentDatabase(input: {
  databaseUrl: string;
  confirmation: string | undefined;
  currentDatabase: string;
  marker: string | null;
}): void {
  const parsed = new URL(input.databaseUrl);
  const requestedDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const allowedHost = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  const allowedName = /^(diis_dryrun_|diis_test_)[a-z0-9_]+$/i.test(input.currentDatabase);
  if (
    input.confirmation !== DISPOSABLE_CONFIRMATION
    || input.marker !== DISPOSABLE_MARKER
    || !allowedHost
    || !allowedName
    || requestedDatabase !== input.currentDatabase
  ) {
    throw new Error('Appointment expiry proof requires an explicitly marked local disposable database.');
  }
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

describePostgres('Appointment expiry PostgreSQL proof', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const permissions = {
    invalidateUser: jest.fn(),
  } as unknown as PermissionsService;
  const serviceA = new AppointmentsService(prisma as unknown as PrismaService, permissions);
  const serviceB = new AppointmentsService(prisma as unknown as PrismaService, permissions);
  const createdUserIds: string[] = [];
  const createdPositionIds: string[] = [];
  let previousActiveYearIds: string[] = [];
  let academicYearId: string | undefined;

  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    const markerTable = await prisma.$queryRaw<Array<{ markerTable: string | null }>>`
      SELECT to_regclass('public.diis_disposable_test_marker')::text AS "markerTable"
    `;
    const marker = markerTable[0]?.markerTable
      ? await prisma.$queryRaw<Array<{ marker: string }>>`
          SELECT "marker" FROM "public"."diis_disposable_test_marker" LIMIT 1
        `
      : [];
    assertDisposableAppointmentDatabase({
      databaseUrl: databaseUrl!,
      confirmation: process.env.APPOINTMENT_EXPIRY_DATABASE_CONFIRMATION,
      currentDatabase: identity!.currentDatabase,
      marker: marker[0]?.marker ?? null,
    });
  });

  async function createStaff(label: string) {
    const keycloakId = randomUUID();
    const user = await prisma.user.create({
      data: {
        keycloakId,
        email: `appointment-expiry-${label}-${randomUUID()}@example.invalid`,
        fullName: `Appointment Expiry ${label}`,
        role: 'GURU',
      },
    });
    createdUserIds.push(user.id);
    const staff = await prisma.staff.create({
      data: { userId: user.id, employmentStatus: 'GTY' },
    });
    return { staffId: staff.id, keycloakId };
  }

  async function createPosition(label: string) {
    const position = await prisma.position.create({
      data: {
        code: `EXP_${label}_${randomUUID().slice(0, 8)}`,
        name: `Expiry Proof ${label}`,
        category: 'STRUKTURAL',
        scopeType: 'NONE',
        maxActiveHolders: 1,
      },
    });
    createdPositionIds.push(position.id);
    return position.id;
  }

  afterAll(async () => {
    try {
      if (academicYearId) {
        await prisma.appointment.deleteMany({ where: { academicYearId } });
        await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
      }
      if (createdPositionIds.length > 0) {
        await prisma.position.deleteMany({ where: { id: { in: createdPositionIds } } });
      }
      if (createdUserIds.length > 0) {
        await prisma.staff.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } finally {
      if (previousActiveYearIds.length > 0) {
        await prisma.academicYear.updateMany({
          where: { id: { in: previousActiveYearIds } },
          data: { isActive: true },
        });
      }
      await prisma.$disconnect();
    }
  });

  it('serializes two schedulers, reconciles expiry, and releases capacity exactly once', async () => {
    const schoolDate = getSchoolDate();
    const yesterday = addDays(schoolDate, -1);
    const tomorrow = addDays(schoolDate, 1);
    previousActiveYearIds = (await prisma.academicYear.findMany({
      where: { isActive: true },
      select: { id: true },
    })).map((year) => year.id);
    await prisma.academicYear.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    const year = await prisma.academicYear.create({
      data: {
        code: `EXP${randomUUID().slice(0, 6)}`,
        startDate: addDays(schoolDate, -30),
        endDate: addDays(schoolDate, 365),
        isActive: true,
      },
    });
    academicYearId = year.id;

    const capacityPosition = await createPosition('CAPACITY');
    const capacityHolder = await createStaff('capacity-holder');
    const expiredCapacity = await prisma.appointment.create({
      data: {
        staffId: capacityHolder.staffId,
        positionId: capacityPosition,
        academicYearId: year.id,
        status: 'ACTIVE',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -20),
        effectiveUntil: yesterday,
        activatedAt: addDays(schoolDate, -20),
      },
    });
    const blockedCandidate = await createStaff('blocked-candidate');
    await expect(prisma.appointment.create({
      data: {
        staffId: blockedCandidate.staffId,
        positionId: capacityPosition,
        academicYearId: year.id,
        status: 'PENDING_APPROVAL',
        effectiveFrom: tomorrow,
      },
    })).rejects.toThrow();

    const pltPosition = await createPosition('PLT');
    const definitiveStaff = await createStaff('definitive');
    const pltStaff = await createStaff('plt');
    const expiredDefinitive = await prisma.appointment.create({
      data: {
        staffId: definitiveStaff.staffId,
        positionId: pltPosition,
        academicYearId: year.id,
        status: 'SUSPENDED',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -20),
        effectiveUntil: yesterday,
        activatedAt: addDays(schoolDate, -20),
        suspendedAt: addDays(schoolDate, -5),
        suspensionReason: 'Synthetic expiry proof',
      },
    });
    const linkedPlt = await prisma.appointment.create({
      data: {
        staffId: pltStaff.staffId,
        positionId: pltPosition,
        academicYearId: year.id,
        status: 'ACTIVE',
        kind: 'PLT',
        effectiveFrom: addDays(schoolDate, -4),
        effectiveUntil: tomorrow,
        replacesAppointmentId: expiredDefinitive.id,
        activatedAt: addDays(schoolDate, -4),
        reason: 'Synthetic PLT expiry proof',
      },
    });

    const preparedPosition = await createPosition('PREPARED');
    const preparedStaff = await createStaff('prepared');
    const expiredPrepared = await prisma.appointment.create({
      data: {
        staffId: preparedStaff.staffId,
        positionId: preparedPosition,
        academicYearId: year.id,
        status: 'APPROVED',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: yesterday,
        approvedAt: addDays(schoolDate, -10),
      },
    });

    const successorPosition = await createPosition('SUCCESSOR');
    const incumbentStaff = await createStaff('incumbent');
    const successorStaff = await createStaff('successor');
    const expiredIncumbent = await prisma.appointment.create({
      data: {
        staffId: incumbentStaff.staffId,
        positionId: successorPosition,
        academicYearId: year.id,
        status: 'ACTIVE',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -20),
        effectiveUntil: yesterday,
        activatedAt: addDays(schoolDate, -20),
      },
    });
    const dueSuccessor = await prisma.appointment.create({
      data: {
        staffId: successorStaff.staffId,
        positionId: successorPosition,
        academicYearId: year.id,
        status: 'APPROVED',
        kind: 'DEFINITIVE',
        effectiveFrom: schoolDate,
        effectiveUntil: tomorrow,
        replacesAppointmentId: expiredIncumbent.id,
        approvedAt: addDays(schoolDate, -1),
      },
    });

    const expiredSuccessorPosition = await createPosition('EXPIRED_SUCCESSOR');
    const expiredSuccessorIncumbentStaff = await createStaff('expired-successor-incumbent');
    const expiredSuccessorStaff = await createStaff('expired-successor');
    const expiredSuccessorIncumbent = await prisma.appointment.create({
      data: {
        staffId: expiredSuccessorIncumbentStaff.staffId,
        positionId: expiredSuccessorPosition,
        academicYearId: year.id,
        status: 'ACTIVE',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -30),
        effectiveUntil: yesterday,
        activatedAt: addDays(schoolDate, -30),
      },
    });
    const expiredSuccessor = await prisma.appointment.create({
      data: {
        staffId: expiredSuccessorStaff.staffId,
        positionId: expiredSuccessorPosition,
        academicYearId: year.id,
        status: 'APPROVED',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: yesterday,
        replacesAppointmentId: expiredSuccessorIncumbent.id,
        approvedAt: addDays(schoolDate, -10),
      },
    });

    const boundaryPosition = await createPosition('BOUNDARY');
    const boundaryStaff = await createStaff('boundary');
    const boundaryActive = await prisma.appointment.create({
      data: {
        staffId: boundaryStaff.staffId,
        positionId: boundaryPosition,
        academicYearId: year.id,
        status: 'ACTIVE',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: schoolDate,
        activatedAt: addDays(schoolDate, -10),
      },
    });

    const raced = await Promise.all([
      serviceA.activateDueAppointments(),
      serviceB.activateDueAppointments(),
    ]);
    expect(raced).toEqual(expect.arrayContaining([
      { endedCount: 5, cancelledCount: 2, activatedCount: 1, affectedUserCount: 8 },
      { endedCount: 0, cancelledCount: 0, activatedCount: 0, affectedUserCount: 0 },
    ]));

    await expect(serviceA.activateDueAppointments()).resolves.toEqual({
      endedCount: 0,
      cancelledCount: 0,
      activatedCount: 0,
      affectedUserCount: 0,
    });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredCapacity.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredDefinitive.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: linkedPlt.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredPrepared.id } }))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredIncumbent.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: dueSuccessor.id } }))
      .resolves.toMatchObject({ status: 'ACTIVE' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredSuccessorIncumbent.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredSuccessor.id } }))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: boundaryActive.id } }))
      .resolves.toMatchObject({ status: 'ACTIVE' });

    const releasedCandidate = await prisma.appointment.create({
      data: {
        staffId: blockedCandidate.staffId,
        positionId: capacityPosition,
        academicYearId: year.id,
        status: 'PENDING_APPROVAL',
        effectiveFrom: tomorrow,
      },
    });
    expect(releasedCandidate.status).toBe('PENDING_APPROVAL');
  });

  it('serializes scheduler against resume, suspend, and approve without reviving expired state', async () => {
    const schoolDate = getSchoolDate();
    const yesterday = addDays(schoolDate, -1);
    const yearId = academicYearId!;
    const operator = await createStaff('race-operator');
    const actor: AuthUser = {
      keycloakId: operator.keycloakId,
      email: 'appointment-race-operator@example.invalid',
      username: 'appointment-race-operator',
      fullName: 'Appointment Race Operator',
      roles: ['SUPER_ADMIN'],
    };

    const suspendedPosition = await createPosition('RACE_RESUME');
    const suspendedStaff = await createStaff('race-resume');
    const expiredSuspended = await prisma.appointment.create({
      data: {
        staffId: suspendedStaff.staffId,
        positionId: suspendedPosition,
        academicYearId: yearId,
        status: 'SUSPENDED',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: yesterday,
        activatedAt: addDays(schoolDate, -10),
        suspendedAt: addDays(schoolDate, -2),
        suspensionReason: 'Synthetic scheduler race',
      },
    });

    const activePosition = await createPosition('RACE_SUSPEND');
    const activeStaff = await createStaff('race-suspend');
    const expiredActive = await prisma.appointment.create({
      data: {
        staffId: activeStaff.staffId,
        positionId: activePosition,
        academicYearId: yearId,
        status: 'ACTIVE',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: yesterday,
        activatedAt: addDays(schoolDate, -10),
      },
    });

    const approvalPosition = await createPosition('RACE_APPROVE');
    const approvalStaff = await createStaff('race-approve');
    const expiredPending = await prisma.appointment.create({
      data: {
        staffId: approvalStaff.staffId,
        positionId: approvalPosition,
        academicYearId: yearId,
        status: 'PENDING_APPROVAL',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: yesterday,
      },
    });
    const draftPosition = await createPosition('RACE_DRAFT');
    const draftStaff = await createStaff('race-draft');
    const expiredDraft = await prisma.appointment.create({
      data: {
        staffId: draftStaff.staffId,
        positionId: draftPosition,
        academicYearId: yearId,
        status: 'DRAFT',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: yesterday,
      },
    });

    (permissions.invalidateUser as jest.Mock).mockClear();
    const raced = await Promise.allSettled([
      serviceA.activateDueAppointments(),
      serviceB.resume(expiredSuspended.id, actor),
      serviceB.suspend(expiredActive.id, {
        reason: 'Synthetic concurrent suspend',
        expectedReturnDate: schoolDate,
      }, actor),
      serviceB.approve(expiredPending.id, {}, actor),
    ]);

    expect(raced[0]).toMatchObject({
      status: 'fulfilled',
      value: { endedCount: 2, cancelledCount: 2, activatedCount: 0, affectedUserCount: 4 },
    });
    expect(raced.slice(1).every((result) => result.status === 'rejected')).toBe(true);
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredSuspended.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredActive.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredPending.id } }))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: expiredDraft.id } }))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(prisma.appointmentApproval.count({
      where: { appointmentId: expiredPending.id },
    })).resolves.toBe(0);
    expect(permissions.invalidateUser).toHaveBeenCalledTimes(4);
    expect(permissions.invalidateUser).toHaveBeenCalledWith(suspendedStaff.keycloakId);
    expect(permissions.invalidateUser).toHaveBeenCalledWith(activeStaff.keycloakId);
    expect(permissions.invalidateUser).toHaveBeenCalledWith(approvalStaff.keycloakId);
    expect(permissions.invalidateUser).toHaveBeenCalledWith(draftStaff.keycloakId);

    await expect(serviceB.resume(expiredSuspended.id, actor)).rejects.toThrow();
    await expect(serviceB.suspend(expiredActive.id, {
      reason: 'Retry after scheduler',
      expectedReturnDate: schoolDate,
    }, actor)).rejects.toThrow();
    await expect(serviceB.approve(expiredPending.id, {}, actor)).rejects.toThrow();
    await expect(serviceA.activateDueAppointments()).resolves.toEqual({
      endedCount: 0,
      cancelledCount: 0,
      activatedCount: 0,
      affectedUserCount: 0,
    });
    expect(permissions.invalidateUser).toHaveBeenCalledTimes(4);
  });

  it('ends linked PLT atomically, activates a valid successor, and recovers stale terminal parents', async () => {
    const schoolDate = getSchoolDate();
    const tomorrow = addDays(schoolDate, 1);
    const yearId = academicYearId!;
    const actor: AuthUser = {
      keycloakId: randomUUID(),
      email: 'appointment-end-operator@example.invalid',
      username: 'appointment-end-operator',
      fullName: 'Appointment End Operator',
      roles: ['SUPER_ADMIN'],
    };

    const noSuccessorPosition = await createPosition('END_PLT_ONLY');
    const noSuccessorParentStaff = await createStaff('end-parent-no-successor');
    const activePltStaff = await createStaff('end-active-plt');
    const noSuccessorParent = await prisma.appointment.create({
      data: {
        staffId: noSuccessorParentStaff.staffId,
        positionId: noSuccessorPosition,
        academicYearId: yearId,
        status: 'SUSPENDED',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: tomorrow,
        activatedAt: addDays(schoolDate, -10),
        suspendedAt: addDays(schoolDate, -2),
        suspensionReason: 'Synthetic manual end',
      },
    });
    const activePlt = await prisma.appointment.create({
      data: {
        staffId: activePltStaff.staffId,
        positionId: noSuccessorPosition,
        academicYearId: yearId,
        status: 'ACTIVE',
        kind: 'PLT',
        effectiveFrom: addDays(schoolDate, -1),
        effectiveUntil: tomorrow,
        replacesAppointmentId: noSuccessorParent.id,
        activatedAt: addDays(schoolDate, -1),
        reason: 'Synthetic active PLT',
      },
    });

    await expect(serviceA.end(noSuccessorParent.id, { reason: 'Manual definitive end' }, actor))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: noSuccessorParent.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: activePlt.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(serviceA.end(noSuccessorParent.id, { reason: 'Duplicate manual end' }, actor))
      .rejects.toThrow();

    const successorPosition = await createPosition('END_WITH_SUCCESSOR');
    const successorParentStaff = await createStaff('end-parent-successor');
    const draftPltStaff = await createStaff('end-draft-plt');
    const successorStaff = await createStaff('end-successor');
    const successorParent = await prisma.appointment.create({
      data: {
        staffId: successorParentStaff.staffId,
        positionId: successorPosition,
        academicYearId: yearId,
        status: 'SUSPENDED',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: tomorrow,
        activatedAt: addDays(schoolDate, -10),
        suspendedAt: addDays(schoolDate, -2),
        suspensionReason: 'Synthetic successor handoff',
      },
    });
    const draftPlt = await prisma.appointment.create({
      data: {
        staffId: draftPltStaff.staffId,
        positionId: successorPosition,
        academicYearId: yearId,
        status: 'DRAFT',
        kind: 'PLT',
        effectiveFrom: schoolDate,
        effectiveUntil: tomorrow,
        replacesAppointmentId: successorParent.id,
        reason: 'Synthetic draft PLT',
      },
    });
    const successor = await prisma.appointment.create({
      data: {
        staffId: successorStaff.staffId,
        positionId: successorPosition,
        academicYearId: yearId,
        status: 'APPROVED',
        kind: 'DEFINITIVE',
        effectiveFrom: schoolDate,
        effectiveUntil: tomorrow,
        replacesAppointmentId: successorParent.id,
        approvedAt: addDays(schoolDate, -1),
      },
    });

    await expect(serviceA.end(successorParent.id, { reason: 'Activate successor' }, actor))
      .resolves.toMatchObject({ status: 'ENDED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: draftPlt.id } }))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: successor.id } }))
      .resolves.toMatchObject({ status: 'ACTIVE' });

    const stalePosition = await createPosition('STALE_PARENT');
    const staleParentStaff = await createStaff('stale-parent');
    const stalePltStaff = await createStaff('stale-plt');
    const staleParent = await prisma.appointment.create({
      data: {
        staffId: staleParentStaff.staffId,
        positionId: stalePosition,
        academicYearId: yearId,
        status: 'SUSPENDED',
        kind: 'DEFINITIVE',
        effectiveFrom: addDays(schoolDate, -10),
        effectiveUntil: tomorrow,
        activatedAt: addDays(schoolDate, -10),
        suspendedAt: addDays(schoolDate, -2),
        suspensionReason: 'Synthetic stale parent',
      },
    });
    const stalePlt = await prisma.appointment.create({
      data: {
        staffId: stalePltStaff.staffId,
        positionId: stalePosition,
        academicYearId: yearId,
        status: 'ACTIVE',
        kind: 'PLT',
        effectiveFrom: addDays(schoolDate, -1),
        effectiveUntil: tomorrow,
        replacesAppointmentId: staleParent.id,
        activatedAt: addDays(schoolDate, -1),
        reason: 'Synthetic stale PLT',
      },
    });
    await prisma.appointment.update({
      where: { id: staleParent.id },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    await expect(serviceA.activateDueAppointments()).resolves.toMatchObject({ endedCount: 1 });
    await expect(prisma.appointment.findUniqueOrThrow({ where: { id: stalePlt.id } }))
      .resolves.toMatchObject({ status: 'ENDED' });
  });
});

describe('Appointment expiry PostgreSQL proof preflight', () => {
  const safeUrl = 'postgresql://proof:secret@127.0.0.1:5432/diis_test_appointment_expiry';

  it.each([
    ['missing confirmation', undefined, 'diis_test_appointment_expiry', DISPOSABLE_MARKER, safeUrl],
    ['canonical database', DISPOSABLE_CONFIRMATION, 'diis_db', DISPOSABLE_MARKER,
      'postgresql://proof:secret@127.0.0.1:5432/diis_db'],
    ['missing marker', DISPOSABLE_CONFIRMATION, 'diis_test_appointment_expiry', null, safeUrl],
    ['remote host', DISPOSABLE_CONFIRMATION, 'diis_test_appointment_expiry', DISPOSABLE_MARKER,
      'postgresql://proof:secret@staging.example.invalid:5432/diis_test_appointment_expiry'],
  ])('rejects %s before any mutation', (_label, confirmation, currentDatabase, marker, url) => {
    expect(() => assertDisposableAppointmentDatabase({
      databaseUrl: url!,
      confirmation,
      currentDatabase: currentDatabase!,
      marker,
    })).toThrow('explicitly marked local disposable database');
  });
});
