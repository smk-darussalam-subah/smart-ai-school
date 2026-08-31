import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { PositionsController } from '../positions/positions.controller';
import { PositionsService } from '../positions/positions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';

function mockPrisma() {
  return {
    user: { findUnique: jest.fn() },
    position: { findMany: jest.fn() },
    academicYear: { findFirst: jest.fn(), findUnique: jest.fn() },
    appointment: {
      findMany: jest.fn(),
    },
    staffPosition: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    userPermissionOverride: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    permission: { findMany: jest.fn() },
  };
}

async function build(
  prisma: ReturnType<typeof mockPrisma>,
  permissions = {
    invalidateUser: jest.fn(),
    getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()),
  },
  keycloak = {
    assignRealmRole: jest.fn(),
    removeRealmRole: jest.fn(),
    getUserRealmRoles: jest.fn(),
  },
) {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      PositionsService,
      { provide: PrismaService, useValue: prisma },
      { provide: PermissionsService, useValue: permissions },
      { provide: KeycloakAdminService, useValue: keycloak },
    ],
  }).compile();
  return { service: mod.get(PositionsService), permissions, keycloak };
}

describe('PositionsService legacy mutation containment', () => {
  it('catalog route is limited to SUPER_ADMIN or active Kepala Sekolah authority', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PositionsController.prototype.catalog))
      .toEqual(['SUPER_ADMIN', 'KEPALA_SEKOLAH']);
  });

  it('assign fails closed and never creates effective position permission overrides', async () => {
    const prisma = mockPrisma();
    const { service, permissions, keycloak } = await build(prisma);

    await expect(
      service.assign({
        userId: 'user-1',
        positionId: 'position-1',
        academicYearId: 'ay-1',
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.staffPosition.create).not.toHaveBeenCalled();
    expect(prisma.userPermissionOverride.upsert).not.toHaveBeenCalled();
    expect(permissions.invalidateUser).not.toHaveBeenCalled();
    expect(keycloak.assignRealmRole).not.toHaveBeenCalled();
  });

  it('unassign fails closed and never removes effective position permission overrides', async () => {
    const prisma = mockPrisma();
    const { service, permissions, keycloak } = await build(prisma);

    await expect(service.unassign('staff-position-1')).rejects.toThrow(ConflictException);

    expect(prisma.staffPosition.delete).not.toHaveBeenCalled();
    expect(prisma.userPermissionOverride.deleteMany).not.toHaveBeenCalled();
    expect(permissions.invalidateUser).not.toHaveBeenCalled();
    expect(keycloak.removeRealmRole).not.toHaveBeenCalled();
  });

  it('syncKeycloakRoles remains a permanent no-op for position codes', async () => {
    const prisma = mockPrisma();
    const { service } = await build(prisma);

    await expect(service.syncKeycloakRoles()).resolves.toMatchObject({
      status: 'disabled',
      operationRef: 'appointment-governance-permanent-skip',
    });
  });
});

describe('PositionsService appointment projections', () => {
  it('getAssignments reads Appointment lifecycle rows, not legacy StaffPosition rows', async () => {
    const prisma = mockPrisma();
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-active', code: '2026/2027' });
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-active',
        positionId: 'pos-ks',
        majorId: null,
        kind: 'DEFINITIVE',
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
        effectiveUntil: null,
        position: { code: 'KEPALA_SEKOLAH', name: 'Kepala Sekolah', category: 'STRUKTURAL' },
        major: null,
        staff: {
          niy: 'NIY-1',
          user: { id: 'user-ks', fullName: 'Kepala Aktif', email: 'ks@example.test' },
        },
      },
    ]);
    const { service } = await build(prisma);

    const result = await service.getAssignments();

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          academicYearId: 'ay-active',
          status: { in: ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUSPENDED'] },
        },
      }),
    );
    expect(prisma.staffPosition.findMany).not.toHaveBeenCalled();
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]!).toMatchObject({
      id: 'appt-active',
      status: 'ACTIVE',
      isEffectiveNow: true,
    });
  });

  it('getMyPositions returns only active effective appointments for the sidebar', async () => {
    const prisma = mockPrisma();
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-active', code: '2026/2027' });
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-waka',
        kind: 'DEFINITIVE',
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
        effectiveUntil: null,
        position: { code: 'WAKA_KURIKULUM', name: 'Waka Kurikulum', category: 'STRUKTURAL' },
        major: null,
      },
    ]);
    const { service } = await build(prisma);

    const result = await service.getMyPositions('kc-user');

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          staff: { user: { keycloakId: 'kc-user' } },
          academicYear: { isActive: true },
          status: 'ACTIVE',
        }),
      }),
    );
    expect(result.positions[0]!.position.code).toBe('WAKA_KURIKULUM');
  });

  it('uses the Jakarta school date for sidebar and position projection at 00:15 WIB', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T17:15:00.000Z'));
    const prisma = mockPrisma();
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-active', code: '2026/2027' });
    prisma.appointment.findMany.mockResolvedValue([]);
    const { service } = await build(prisma);

    try {
      await service.getMyPositions('kc-user');
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          effectiveFrom: { lte: new Date('2026-08-31T00:00:00.000Z') },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: new Date('2026-08-31T00:00:00.000Z') } },
          ],
        }),
      }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps due, future, expired, and inclusive-end projections correct on the school date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T17:15:00.000Z'));
    const prisma = mockPrisma();
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-active', code: '2026/2027' });
    const baseAssignment = {
      positionId: 'pos-waka',
      majorId: null,
      kind: 'DEFINITIVE',
      status: 'ACTIVE',
      position: { code: 'WAKA_KURIKULUM', name: 'Waka Kurikulum', category: 'STRUKTURAL' },
      major: null,
      staff: {
        niy: 'NIY-1',
        user: { id: 'user-1', fullName: 'Guru', email: 'guru@example.test' },
      },
    };
    prisma.appointment.findMany.mockResolvedValue([
      { ...baseAssignment, id: 'due-today', effectiveFrom: new Date('2026-08-31T00:00:00.000Z'), effectiveUntil: null },
      { ...baseAssignment, id: 'future', effectiveFrom: new Date('2026-09-01T00:00:00.000Z'), effectiveUntil: null },
      { ...baseAssignment, id: 'expired-yesterday', effectiveFrom: new Date('2026-07-01T00:00:00.000Z'), effectiveUntil: new Date('2026-08-30T00:00:00.000Z') },
      { ...baseAssignment, id: 'ends-today', effectiveFrom: new Date('2026-07-01T00:00:00.000Z'), effectiveUntil: new Date('2026-08-31T00:00:00.000Z') },
    ]);
    const { service } = await build(prisma);

    try {
      const result = await service.getAssignments();
      expect(result.assignments.map((item) => [item.id, item.isEffectiveNow])).toEqual([
        ['due-today', true],
        ['future', false],
        ['expired-yesterday', false],
        ['ends-today', true],
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('accessCheck reports active appointments and appointment permissions', async () => {
    const prisma = mockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      keycloakId: 'kc-user',
      fullName: 'Guru Appointment',
      email: 'guru@example.test',
      role: 'GURU',
    });
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-active', code: '2026/2027' });
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-1',
        kind: 'DEFINITIVE',
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
        effectiveUntil: null,
        position: {
          code: 'KEPALA_SEKOLAH',
          name: 'Kepala Sekolah',
          permissions: [{ permissionId: 'perm-1' }],
        },
        major: null,
      },
    ]);
    prisma.permission.findMany.mockResolvedValue([{ code: 'school.manage' }]);
    const permissions = {
      invalidateUser: jest.fn(),
      getEffectivePermissions: jest.fn().mockResolvedValue(new Set(['academic.read', 'school.manage'])),
    };
    const keycloak = {
      assignRealmRole: jest.fn(),
      removeRealmRole: jest.fn(),
      getUserRealmRoles: jest.fn().mockResolvedValue(['GURU']),
    };
    const { service } = await build(prisma, permissions, keycloak);

    const result = await service.accessCheck('user-1');

    expect(result).toMatchObject({
      keycloakRoles: ['GURU'],
      activeAppointments: [
        expect.objectContaining({ id: 'appt-1', code: 'KEPALA_SEKOLAH', status: 'ACTIVE' }),
      ],
      appointmentPermissions: ['school.manage'],
      effectivePermissions: ['academic.read', 'school.manage'],
    });
    expect(result).not.toHaveProperty('activePositions');
    expect(result).not.toHaveProperty('positionPermissions');
    expect(prisma.staffPosition.findMany).not.toHaveBeenCalled();
  });
});
