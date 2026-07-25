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
import { AppointmentsService } from '../appointments/appointments.service';
import type { CreateAppointmentDto } from '../appointments/dto/appointment.dto';
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
    academicYear: { findUnique: jest.fn() },
    major: { findUnique: jest.fn() },
    appointment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    appointmentApproval: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma));
  return prisma;
}

async function buildService(
  prisma: ReturnType<typeof buildPrismaMock>,
  permissions = {
    getActivePositionCodes: jest.fn().mockResolvedValue(new Set()),
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
  return {
    service: module.get(AppointmentsService),
    permissions,
  };
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

function primeValidContext(prisma: ReturnType<typeof buildPrismaMock>, positionCode = 'WAKA_KURIKULUM') {
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
    code: positionCode,
    scopeType: 'NONE',
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
    },
    staff: { user: { keycloakId: 'kc-target' } },
    ...overrides,
  };
}

describe('AppointmentsService', () => {
  it('PLT requires reason and effectiveUntil', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    const { service } = await buildService(prisma);

    await expect(
      service.createDraft(baseDto({ kind: 'PLT' }), superAdminActor),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('quarantines historical KEPALA_SEKOLAH identity before appointment creation', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.staff.findUnique.mockResolvedValue({
      id: 'staff-ks',
      deletedAt: null,
      user: {
        id: 'auth-ks',
        role: 'KEPALA_SEKOLAH',
        keycloakId: 'kc-ks',
        isActive: true,
        deletedAt: null,
      },
    });
    const { service } = await buildService(prisma);

    await expect(service.createDraft(baseDto(), superAdminActor)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects inactive or non-employee appointment candidate before Prisma write', async () => {
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

    await expect(service.createDraft(baseDto(), superAdminActor)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects deleted staff candidate before Prisma write', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.staff.findUnique.mockResolvedValue({
      id: 'staff-deleted',
      deletedAt: date('2026-07-20'),
      user: {
        id: 'auth-target',
        role: 'GURU',
        keycloakId: 'kc-target',
        isActive: true,
        deletedAt: null,
      },
    });
    const { service } = await buildService(prisma);

    await expect(service.createDraft(baseDto(), superAdminActor)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects inactive user candidate before Prisma write', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.staff.findUnique.mockResolvedValue({
      id: 'staff-inactive',
      deletedAt: null,
      user: {
        id: 'auth-target',
        role: 'GURU',
        keycloakId: 'kc-target',
        isActive: false,
        deletedAt: null,
      },
    });
    const { service } = await buildService(prisma);

    await expect(service.createDraft(baseDto(), superAdminActor)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects effectiveUntil earlier than effectiveFrom with BadRequestException', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    const { service } = await buildService(prisma);

    await expect(
      service.createDraft(
        baseDto({ effectiveUntil: date('2026-06-30') }),
        superAdminActor,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('allows APPROVED successor while old holder remains ACTIVE when replacesAppointmentId is explicit', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.appointment.findFirst
      .mockResolvedValueOnce({ id: 'active-ks', status: 'ACTIVE' })
      .mockResolvedValueOnce(null);
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'active-ks',
      status: 'ACTIVE',
      positionId: '22222222-2222-2222-2222-222222222222',
      academicYearId: '33333333-3333-3333-3333-333333333333',
      majorId: null,
    });
    prisma.appointment.create.mockResolvedValue({ id: 'successor', status: 'DRAFT' });
    const { service } = await buildService(prisma);

    const result = await service.createDraft(
      baseDto({ replacesAppointmentId: 'active-ks' }),
      superAdminActor,
    );

    expect(result).toEqual({ id: 'successor', status: 'DRAFT' });
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ replacesAppointmentId: 'active-ks' }),
      }),
    );
  });

  it('allows PLT draft against active holder when reason/end date/replacement are explicit', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.appointment.findFirst
      .mockResolvedValueOnce({ id: 'active-ks', status: 'ACTIVE' })
      .mockResolvedValueOnce(null);
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'active-ks',
      status: 'ACTIVE',
      positionId: '22222222-2222-2222-2222-222222222222',
      academicYearId: '33333333-3333-3333-3333-333333333333',
      majorId: null,
    });
    prisma.appointment.create.mockResolvedValue({ id: 'plt-draft', status: 'DRAFT' });
    const { service } = await buildService(prisma);

    await expect(
      service.createDraft(
        baseDto({
          kind: 'PLT',
          effectiveUntil: date('2026-08-01'),
          reason: 'Cuti kesehatan',
          replacesAppointmentId: 'active-ks',
        }),
        superAdminActor,
      ),
    ).resolves.toEqual({ id: 'plt-draft', status: 'DRAFT' });
  });

  it('rejects same-scope draft without replacement when active holder exists', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.appointment.findFirst.mockResolvedValueOnce({ id: 'active-ks', status: 'ACTIVE' });
    const { service } = await buildService(prisma);

    await expect(service.createDraft(baseDto(), superAdminActor)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate pending successor for same replaced appointment', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.appointment.findFirst
      .mockResolvedValueOnce({ id: 'active-ks', status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: 'open-successor' });
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'active-ks',
      status: 'ACTIVE',
      positionId: '22222222-2222-2222-2222-222222222222',
      academicYearId: '33333333-3333-3333-3333-333333333333',
      majorId: null,
    });
    const { service } = await buildService(prisma);

    await expect(
      service.createDraft(baseDto({ replacesAppointmentId: 'active-ks' }), superAdminActor),
    ).rejects.toThrow(ConflictException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('non-SUPER_ADMIN cannot approve KEPALA_SEKOLAH appointment', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue({
      ...transitionTarget(),
      id: 'app-ks',
      status: 'PENDING_APPROVAL',
      position: { code: 'KEPALA_SEKOLAH' },
    });
    const permissions = {
      getActivePositionCodes: jest.fn().mockResolvedValue(new Set(['KEPALA_SEKOLAH'])),
      invalidateUser: jest.fn(),
    };
    const { service } = await buildService(prisma, permissions);

    await expect(service.approve('app-ks', {}, ksActor)).rejects.toThrow(ForbiddenException);
    expect(prisma.appointmentApproval.create).not.toHaveBeenCalled();
  });

  it('active KEPALA_SEKOLAH can approve non-KS appointment as APPROVED, not ACTIVE', async () => {
    const prisma = buildPrismaMock();
    prisma.user.findUnique.mockResolvedValue({ id: 'auth-approver' });
    prisma.appointment.findUnique.mockResolvedValue({
      ...transitionTarget(),
      id: 'app-waka',
      status: 'PENDING_APPROVAL',
      staff: { user: { keycloakId: 'kc-waka' } },
    });
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
    expect(permissions.invalidateUser).toHaveBeenCalledWith('kc-waka');
  });

  it('translates parallel submit race for empty-scope candidates into ConflictException', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique
      .mockResolvedValueOnce(transitionTarget({ id: 'draft-a', status: 'DRAFT' }))
      .mockResolvedValueOnce(transitionTarget({ id: 'draft-b', status: 'DRAFT' }));
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.update
      .mockResolvedValueOnce({ id: 'draft-a', status: 'PENDING_APPROVAL' })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('unique violation', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
    const { service } = await buildService(prisma);

    await expect(
      Promise.allSettled([
        service.submit('draft-a', superAdminActor),
        service.submit('draft-b', superAdminActor),
      ]),
    ).resolves.toEqual([
      expect.objectContaining({ status: 'fulfilled' }),
      expect.objectContaining({ status: 'rejected', reason: expect.any(ConflictException) }),
    ]);
  });

  it('rejects submit when another open candidate already exists for empty scope', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue(
      transitionTarget({ id: 'draft-b', status: 'DRAFT' }),
    );
    prisma.appointment.findFirst.mockResolvedValue({ id: 'draft-a' });
    const { service } = await buildService(prisma);

    await expect(service.submit('draft-b', superAdminActor)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('suspends ACTIVE definitive appointment and invalidates holder permission cache', async () => {
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
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUSPENDED',
          suspensionReason: 'Cuti resmi',
          suspensionUntil: date('2026-08-01'),
        }),
      }),
    );
    expect(permissions.invalidateUser).toHaveBeenCalledWith('kc-target');
  });

  it('resumes SUSPENDED definitive appointment only when no PLT ACTIVE conflict remains', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue(
      transitionTarget({ id: 'suspended-app', status: 'SUSPENDED' }),
    );
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.update.mockResolvedValue({ id: 'suspended-app', status: 'ACTIVE' });
    const { service } = await buildService(prisma);

    await expect(service.resume('suspended-app', superAdminActor)).resolves.toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('blocks resume while another ACTIVE appointment still consumes the scope', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique.mockResolvedValue(
      transitionTarget({ id: 'suspended-app', status: 'SUSPENDED' }),
    );
    prisma.appointment.findFirst.mockResolvedValue({ id: 'active-plt' });
    const { service } = await buildService(prisma);

    await expect(service.resume('suspended-app', superAdminActor)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('activates PLT while keeping replaced definitive appointment SUSPENDED', async () => {
    const prisma = buildPrismaMock();
    prisma.appointment.findUnique
      .mockResolvedValueOnce(
        transitionTarget({
          id: 'plt-approved',
          status: 'APPROVED',
          kind: 'PLT',
          replacesAppointmentId: 'primary-suspended',
        }),
      )
      .mockResolvedValueOnce(
        transitionTarget({ id: 'primary-suspended', status: 'SUSPENDED' }),
      );
    prisma.appointment.update.mockResolvedValue({ id: 'plt-approved', status: 'ACTIVE' });
    const { service } = await buildService(prisma);

    await expect(service.supersede('plt-approved', {}, superAdminActor)).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    expect(prisma.appointment.update).toHaveBeenCalledTimes(1);
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
      .mockResolvedValueOnce(
        transitionTarget({ id: 'old-active', status: 'ACTIVE' }),
      );
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

  it('P2002 live-scope conflict becomes ConflictException', async () => {
    const prisma = buildPrismaMock();
    primeValidContext(prisma);
    prisma.appointment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique violation', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const { service } = await buildService(prisma);

    await expect(service.createDraft(baseDto(), superAdminActor)).rejects.toThrow(
      ConflictException,
    );
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

  it('quarantines historical position-role identity mapping', () => {
    expect(
      classifyStaffPositionForAppointment(row({ userRole: 'KEPALA_SEKOLAH' }), current),
    ).toMatchObject({
      status: 'QUARANTINED',
      reason: expect.stringContaining('role stabil'),
    });
  });

  it('quarantines non-employee stable identity roles', () => {
    expect(
      classifyStaffPositionForAppointment(row({ userRole: 'SISWA' }), current),
    ).toMatchObject({
      status: 'QUARANTINED',
      reason: expect.stringContaining('bukan role pegawai'),
    });
  });

  it('quarantines inactive or deleted candidate identities', () => {
    expect(
      classifyStaffPositionForAppointment(row({ userIsActive: false }), current),
    ).toMatchObject({ status: 'QUARANTINED', reason: expect.stringContaining('tidak aktif') });
    expect(
      classifyStaffPositionForAppointment(row({ staffDeletedAt: date('2026-07-01') }), current),
    ).toMatchObject({ status: 'QUARANTINED', reason: expect.stringContaining('dihapus') });
  });

  it('quarantines duplicate live StaffPosition scope', () => {
    expect(
      classifyStaffPositionForAppointment(row({ duplicateLiveScope: true }), current),
    ).toMatchObject({
      status: 'QUARANTINED',
      reason: expect.stringContaining('duplikat'),
    });
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
