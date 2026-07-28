import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import {
  classifyStaffPositionForAppointment,
  type StaffPositionMigrationInput,
} from '../appointments/appointment-migration.classifier';
import {
  AppointmentAutomationGuard,
  APPOINTMENT_AUTOMATION_HEADER,
} from '../appointments/appointment-automation.guard';
import { AppointmentsService } from '../appointments/appointments.service';
import {
  CreateAppointmentSchema,
  type CreateAppointmentDto,
} from '../appointments/dto/appointment.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function buildPrismaMock() {
  const prisma = {
    user: { findUnique: jest.fn() },
    staff: { findUnique: jest.fn() },
    position: { findUnique: jest.fn() },
    academicYear: { findFirst: jest.fn(), findUnique: jest.fn() },
    major: { findUnique: jest.fn() },
    appointment: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    appointmentApproval: { create: jest.fn(), findMany: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma));
  return prisma;
}

async function buildService(
  prisma: ReturnType<typeof buildPrismaMock>,
  permissions = {
    getActivePositionCodes: jest.fn().mockResolvedValue(new Set<string>()),
    invalidateUser: jest.fn(),
  },
) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AppointmentsService,
      { provide: PrismaService, useValue: prisma },
      { provide: PermissionsService, useValue: permissions },
    ],
  }).compile();
  return { service: module.get(AppointmentsService), permissions };
}

function buildAutomationContext(token?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token ? { [APPOINTMENT_AUTOMATION_HEADER]: token } : {},
      }),
    }),
  } as unknown as import('@nestjs/common').ExecutionContext;
}

const superAdminActor: AuthUser = {
  keycloakId: 'kc-super-admin',
  email: 'sa@smk.sch.id',
  username: 'sa',
  fullName: 'Super Admin',
  roles: ['SUPER_ADMIN'],
};

const ksActor: AuthUser = {
  keycloakId: 'kc-active-ks',
  email: 'ks@smk.sch.id',
  username: 'ks',
  fullName: 'Kepala Sekolah',
  roles: ['TATA_USAHA'],
};

function baseDto(overrides: Partial<CreateAppointmentDto> = {}): CreateAppointmentDto {
  return {
    staffId: '11111111-1111-1111-1111-111111111111',
    positionId: '22222222-2222-2222-2222-222222222222',
    academicYearId: '33333333-3333-3333-3333-333333333333',
    kind: 'DEFINITIVE',
    effectiveFrom: date('2026-07-01'),
    ...overrides,
  };
}

function primeValidContext(
  prisma: ReturnType<typeof buildPrismaMock>,
  options: { positionCode?: string; maxActiveHolders?: number } = {},
) {
  prisma.user.findUnique.mockResolvedValue({ id: 'auth-actor' });
  prisma.staff.findUnique.mockResolvedValue({
    id: 'staff-1',
    deletedAt: null,
    user: {
      id: 'auth-target',
      role: 'GURU',
      keycloakId: 'kc-target',
      isActive: true,
      deletedAt: null,
    },
  });
  prisma.position.findUnique.mockResolvedValue({
    id: 'pos-1',
    code: options.positionCode ?? 'WAKA_KURIKULUM',
    scopeType: 'NONE',
    maxActiveHolders: options.maxActiveHolders ?? 1,
  });
  prisma.academicYear.findUnique.mockResolvedValue({
    id: 'ay-1',
    startDate: date('2026-07-01'),
    endDate: date('2027-06-30'),
  });
}

function transitionTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    status: 'APPROVED',
    kind: 'DEFINITIVE',
    academicYearId: '33333333-3333-3333-3333-333333333333',
    majorId: null,
    effectiveFrom: date('2026-07-01'),
    effectiveUntil: null,
    reason: null,
    replacesAppointmentId: null,
    position: {
      id: '22222222-2222-2222-2222-222222222222',
      code: 'WAKA_KURIKULUM',
      scopeType: 'NONE',
      maxActiveHolders: 1,
    },
    staff: { id: 'staff-1', userId: 'auth-target', user: { keycloakId: 'kc-target' } },
    ...overrides,
  };
}

describe('AppointmentsService appointment authority', () => {
  it('rejects effectiveUntil earlier than effectiveFrom at DTO boundary', () => {
    const parsed = CreateAppointmentSchema.safeParse(
      baseDto({
        effectiveFrom: date('2026-07-10'),
        effectiveUntil: date('2026-07-09'),
      }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]!.path).toEqual(['effectiveUntil']);
    }
  });

  it('rejects PLT without reason and end date', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    const { service } = await buildService(prisma);

    await expect(service.createDraft(baseDto({ kind: 'PLT' }), superAdminActor))
      .rejects.toThrow(BadRequestException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects non-employee stable identities even if a staff anomaly exists', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.staff.findUnique.mockResolvedValue({
      id: 'staff-siswa',
      deletedAt: null,
      user: {
        id: 'auth-siswa',
        role: 'SISWA',
        keycloakId: 'kc-siswa',
        isActive: true,
        deletedAt: null,
      },
    });
    const { service } = await buildService(prisma);

    await expect(service.createDraft(baseDto(), superAdminActor))
      .rejects.toThrow(BadRequestException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('blocks new no-replacement draft when active holders already fill capacity', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.appointment.count.mockResolvedValueOnce(1);
    prisma.appointment.findFirst.mockResolvedValueOnce({ id: 'active-ks', status: 'ACTIVE' });
    const { service } = await buildService(prisma);

    await expect(service.createDraft(baseDto(), superAdminActor))
      .rejects.toThrow(ConflictException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('allows a second deputy draft when configured capacity has room', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma, { positionCode: 'WAKIL_KOOR_BKK', maxActiveHolders: 2 });
    prisma.appointment.count.mockResolvedValueOnce(1);
    prisma.appointment.findFirst
      .mockResolvedValueOnce({ id: 'active-deputy', status: 'ACTIVE' })
      .mockResolvedValueOnce(null);
    prisma.appointment.create.mockResolvedValue({ id: 'deputy-2', status: 'DRAFT' });
    const { service } = await buildService(prisma);

    await expect(service.createDraft(baseDto(), superAdminActor))
      .resolves.toEqual({ id: 'deputy-2', status: 'DRAFT' });
  });

  it('future approved appointment grants no authority before activation', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.appointment.create.mockResolvedValue({ id: 'future', status: 'DRAFT' });
    const { service } = await buildService(prisma);

    const result = await service.createDraft(baseDto(), superAdminActor);

    expect(result.status).toBe('DRAFT');
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT' }),
      }),
    );
  });

  it('rejects same-person same-year reappointment but allows cross-year continuation', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.appointment.findUnique.mockResolvedValueOnce({
      id: 'incumbent',
      status: 'ACTIVE',
      staffId: '11111111-1111-1111-1111-111111111111',
      academicYearId: '33333333-3333-3333-3333-333333333333',
      positionId: '22222222-2222-2222-2222-222222222222',
      majorId: null,
    });
    prisma.appointment.findFirst.mockResolvedValue({ id: 'incumbent', status: 'ACTIVE' });
    const { service } = await buildService(prisma);

    await expect(
      service.createDraft(baseDto({ replacesAppointmentId: 'incumbent' }), superAdminActor),
    ).rejects.toThrow(BadRequestException);

    prisma.appointment.findUnique.mockResolvedValueOnce({
      id: 'old-year-incumbent',
      status: 'ACTIVE',
      staffId: '11111111-1111-1111-1111-111111111111',
      academicYearId: 'old-year',
      positionId: '22222222-2222-2222-2222-222222222222',
      majorId: null,
    });
    prisma.appointment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.appointment.create.mockResolvedValue({ id: 'next-year', status: 'DRAFT' });

    await expect(
      service.createDraft(baseDto({ replacesAppointmentId: 'old-year-incumbent' }), superAdminActor),
    ).resolves.toEqual({ id: 'next-year', status: 'DRAFT' });
  });

  it('active KEPALA_SEKOLAH can approve non-KS appointment as APPROVED, not ACTIVE', async () => {
    const prisma = buildPrismaMock();
    prisma.user.findUnique.mockResolvedValue({ id: 'auth-approver' });
    prisma.appointment.findUnique.mockResolvedValue(
      transitionTarget({ id: 'app-waka', status: 'PENDING_APPROVAL' }),
    );
    prisma.appointment.update.mockResolvedValue({
      id: 'app-waka',
      status: 'APPROVED',
      approvedAt: date('2026-07-24'),
    });
    const permissions = {
      getActivePositionCodes: jest.fn().mockResolvedValue(new Set(['KEPALA_SEKOLAH'])),
      invalidateUser: jest.fn(),
    };
    const { service } = await buildService(prisma, permissions);

    const result = await service.approve('app-waka', {}, ksActor);

    expect(result.status).toBe('APPROVED');
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(permissions.invalidateUser).toHaveBeenCalledWith('kc-target');
  });

  it('non-SUPER_ADMIN cannot approve KEPALA_SEKOLAH appointment', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue(
      transitionTarget({
        id: 'app-ks',
        status: 'PENDING_APPROVAL',
        position: { id: 'pos-ks', code: 'KEPALA_SEKOLAH', scopeType: 'NONE', maxActiveHolders: 1 },
      }),
    );
    const permissions = {
      getActivePositionCodes: jest.fn().mockResolvedValue(new Set(['KEPALA_SEKOLAH'])),
      invalidateUser: jest.fn(),
    };
    const { service } = await buildService(prisma, permissions);

    await expect(service.approve('app-ks', {}, ksActor)).rejects.toThrow(ForbiddenException);
    expect(prisma.appointmentApproval.create).not.toHaveBeenCalled();
  });

  it('submit translates database capacity race into ConflictException', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue(
      transitionTarget({ id: 'draft-a', status: 'DRAFT' }),
    );
    prisma.appointment.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique violation', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const { service } = await buildService(prisma);

    await expect(service.submit('draft-a', superAdminActor)).rejects.toThrow(ConflictException);
  });

  it('suspend removes appointment-derived authority by status and invalidates cache only', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue(
      transitionTarget({ id: 'active-app', status: 'ACTIVE' }),
    );
    prisma.appointment.update.mockResolvedValue({ id: 'active-app', status: 'SUSPENDED' });
    const { service, permissions } = await buildService(prisma);

    await expect(
      service.suspend(
        'active-app',
        { reason: 'Cuti resmi', expectedReturnDate: date('2026-08-01') },
        superAdminActor,
      ),
    ).resolves.toMatchObject({ status: 'SUSPENDED' });
    expect(permissions.invalidateUser).toHaveBeenCalledWith('kc-target');
  });

  it('resume blocks while a linked active PLT still replaces the suspended definitive holder', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue(
      transitionTarget({ id: 'definitive-1', status: 'SUSPENDED', kind: 'DEFINITIVE' }),
    );
    prisma.appointment.findFirst.mockResolvedValue({ id: 'plt-active' });
    const { service } = await buildService(prisma);

    await expect(service.resume('definitive-1', superAdminActor)).rejects.toThrow(ConflictException);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('resume allows independent deputy holder when capacity still has room', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue(
      transitionTarget({
        id: 'deputy-1',
        status: 'SUSPENDED',
        kind: 'DEFINITIVE',
        position: {
          id: 'pos-bkk',
          code: 'WAKIL_KOOR_BKK',
          scopeType: 'NONE',
          maxActiveHolders: 2,
        },
      }),
    );
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.count.mockResolvedValue(1);
    prisma.appointment.update.mockResolvedValue({ id: 'deputy-1', status: 'ACTIVE' });
    const { service } = await buildService(prisma);

    await expect(service.resume('deputy-1', superAdminActor)).resolves.toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('supersedes definitive successor atomically by ending old appointment first', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique
      .mockResolvedValueOnce(
        transitionTarget({
          id: 'successor-approved',
          status: 'APPROVED',
          replacesAppointmentId: 'old-active',
        }),
      )
      .mockResolvedValueOnce(transitionTarget({ id: 'old-active', status: 'ACTIVE' }));
    prisma.appointment.update
      .mockResolvedValueOnce({ id: 'old-active', status: 'SUPERSEDED' })
      .mockResolvedValueOnce({ id: 'successor-approved', status: 'ACTIVE' });
    const { service, permissions } = await buildService(prisma);

    await expect(
      service.supersede('successor-approved', { reason: 'Rotasi jabatan' }, superAdminActor),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
    expect(prisma.appointment.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'old-active' },
        data: expect.objectContaining({ status: 'SUPERSEDED' }),
      }),
    );
    expect(permissions.invalidateUser).toHaveBeenCalledWith('kc-target');
  });
});

describe('AppointmentsService cutover and history', () => {
  it('ends old-year appointments and activates due new-year appointments in one transaction helper', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findMany
      .mockResolvedValueOnce([
        { id: 'old-1', staff: { user: { keycloakId: 'kc-old' } } },
        { id: 'old-suspended', staff: { user: { keycloakId: 'kc-suspended' } } },
      ])
      .mockResolvedValueOnce([
        { id: 'old-draft', staff: { user: { keycloakId: 'kc-draft' } } },
      ])
      .mockResolvedValueOnce([
        {
          id: 'new-1',
          academicYearId: 'ay-2027',
          replacesAppointmentId: 'old-1',
          staff: { user: { keycloakId: 'kc-new' } },
        },
      ]);
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'old-1',
      status: 'ENDED',
      academicYearId: 'ay-2026',
      staff: { user: { keycloakId: 'kc-old' } },
    });
    const { service } = await buildService(prisma);

    const summary = await service.applyAcademicYearActivation(prisma as unknown as Prisma.TransactionClient, {
      yearId: 'ay-2027',
      oldYearId: 'ay-2026',
    });

    expect(summary).toMatchObject({ endedCount: 2, cancelledCount: 1, activatedCount: 1 });
    expect(summary.affectedKeycloakIds.sort()).toEqual(['kc-draft', 'kc-new', 'kc-old', 'kc-suspended']);
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old-1' },
        data: expect.objectContaining({ status: 'ENDED' }),
      }),
    );
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old-draft' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'new-1' },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('automation guard fails closed and accepts only the configured internal token', () => {
    const previousToken = process.env.APPOINTMENT_AUTOMATION_TOKEN;
    const guard = new AppointmentAutomationGuard();
    const token = 'a'.repeat(32);

    try {
      delete process.env.APPOINTMENT_AUTOMATION_TOKEN;
      expect(() => guard.canActivate(buildAutomationContext(token))).toThrow(ForbiddenException);

      process.env.APPOINTMENT_AUTOMATION_TOKEN = 'short';
      expect(() => guard.canActivate(buildAutomationContext(token))).toThrow(ForbiddenException);

      process.env.APPOINTMENT_AUTOMATION_TOKEN = token;
      expect(() => guard.canActivate(buildAutomationContext('b'.repeat(32)))).toThrow(ForbiddenException);
      expect(guard.canActivate(buildAutomationContext(token))).toBe(true);
    } finally {
      if (previousToken === undefined) {
        delete process.env.APPOINTMENT_AUTOMATION_TOKEN;
      } else {
        process.env.APPOINTMENT_AUTOMATION_TOKEN = previousToken;
      }
    }
  });

  it('due activator uses only active academic year, hides identifiers, and invalidates affected users after commit', async () => {
    const prisma = buildPrismaMock();
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-active' });
    prisma.appointment.findMany.mockResolvedValueOnce([
      {
        id: 'due-1',
        academicYearId: 'ay-active',
        replacesAppointmentId: null,
        staff: { user: { keycloakId: 'kc-due' } },
      },
    ]);
    const permissions = {
      getActivePositionCodes: jest.fn().mockResolvedValue(new Set<string>()),
      invalidateUser: jest.fn(),
    };
    const { service } = await buildService(prisma, permissions);

    const result = await (
      service.activateDueAppointments as unknown as (ignoredAcademicYearId?: string) => Promise<Record<string, unknown>>
    )('ay-non-active-or-future');

    expect(result).toEqual({
      endedCount: 0,
      cancelledCount: 0,
      activatedCount: 1,
      affectedUserCount: 1,
    });
    expect(result).not.toHaveProperty('affectedKeycloakIds');
    expect(result).not.toHaveProperty('staffId');
    expect(result).not.toHaveProperty('fullName');
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.academicYear.findFirst).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true },
    });
    expect(prisma.academicYear.findUnique).not.toHaveBeenCalled();
    expect(permissions.invalidateUser).toHaveBeenCalledWith('kc-due');
  });

  it('history returns business appointment state and approvals without technical retry payload', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      status: 'APPROVED',
      effectiveFrom: date('2026-07-01'),
      effectiveUntil: null,
      approvedAt: new Date(),
      activatedAt: null,
      suspendedAt: null,
      endedAt: null,
      reason: null,
      position: { code: 'WAKA_KURIKULUM', name: 'Waka Kurikulum' },
      academicYear: { code: '2026/2027' },
    });
    prisma.appointmentApproval.findMany.mockResolvedValue([
      { decision: 'APPROVED', note: null, createdAt: new Date() },
    ]);
    const { service } = await buildService(prisma);

    const result = await service.getHistory('appt-1');

    expect(result.appointmentId).toBe('appt-1');
    expect(result).not.toHaveProperty('outboxEvents');
    expect(result.approvals[0]).not.toHaveProperty('approverUserId');
  });
});

describe('classifyStaffPositionForAppointment', () => {
  const current = date('2026-07-24');

  function row(overrides: Partial<StaffPositionMigrationInput> = {}): StaffPositionMigrationInput {
    return {
      staffPositionId: 'sp-1',
      userRole: 'GURU',
      userIsActive: true,
      userDeletedAt: null,
      staffDeletedAt: null,
      positionCode: 'WAKA_KURIKULUM',
      positionScopeType: 'NONE',
      majorId: null,
      academicYearIsActive: true,
      academicYearStartDate: date('2026-07-01'),
      academicYearEndDate: date('2027-06-30'),
      startDate: date('2026-07-01'),
      endDate: null,
      isActive: true,
      duplicateLiveScope: false,
      alreadyMigrated: false,
      ...overrides,
    };
  }

  it('migrates stable-role current StaffPosition to ACTIVE appointment', () => {
    expect(classifyStaffPositionForAppointment(row(), current)).toMatchObject({
      status: 'MIGRATED',
      appointmentStatus: 'ACTIVE',
    });
  });

  it('quarantines historical and non-employee identity roles', () => {
    expect(classifyStaffPositionForAppointment(row({ userRole: 'KEPALA_SEKOLAH' }), current))
      .toMatchObject({ status: 'QUARANTINED' });
    expect(classifyStaffPositionForAppointment(row({ userRole: 'SISWA' }), current))
      .toMatchObject({ status: 'QUARANTINED' });
  });

  it('allows KAPROG migration when major scope is explicit and not duplicated', () => {
    expect(
      classifyStaffPositionForAppointment(
        row({
          positionCode: 'KAPROG',
          positionScopeType: 'MAJOR',
          majorId: '44444444-4444-4444-4444-444444444444',
        }),
        current,
      ),
    ).toMatchObject({ status: 'MIGRATED' });
  });
});
