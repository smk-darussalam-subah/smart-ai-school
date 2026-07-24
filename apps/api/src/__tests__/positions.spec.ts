// =============================================================================
// positions.spec.ts - Unit tests PositionsService (Appointment Wave A)
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PositionsService } from '../positions/positions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';

function mockPrisma() {
  const prisma = {
    position: { findUnique: jest.fn(), findMany: jest.fn() },
    staff: { findUnique: jest.fn() },
    academicYear: { findFirst: jest.fn(), findUnique: jest.fn() },
    staffPosition: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    userPermissionOverride: { upsert: jest.fn(), deleteMany: jest.fn() },
    permission: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

function mockKeycloakAdmin() {
  return {
    assignRealmRole: jest.fn(),
    removeRealmRole: jest.fn(),
    createRealmRoleIfNotExists: jest.fn(),
    getUserRealmRoles: jest.fn(),
  };
}

async function build(
  prisma: ReturnType<typeof mockPrisma>,
  perms = { invalidateUser: jest.fn(), getEffectivePermissions: jest.fn() },
  kc = mockKeycloakAdmin(),
) {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      PositionsService,
      { provide: PrismaService, useValue: prisma },
      { provide: PermissionsService, useValue: perms },
      { provide: KeycloakAdminService, useValue: kc },
    ],
  }).compile();
  return mod.get(PositionsService);
}

describe('PositionsService', () => {
  describe('assign', () => {
    it('fail-closed selama transisi appointment dan tidak menyentuh DB/Keycloak', async () => {
      const prisma = mockPrisma();
      const perms = { invalidateUser: jest.fn(), getEffectivePermissions: jest.fn() };
      const kc = mockKeycloakAdmin();
      const svc = await build(prisma, perms, kc);

      await expect(
        svc.assign({ userId: 'u-1', positionId: 'pos-waka', academicYearId: 'ay-1' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        svc.assign({ userId: 'u-1', positionId: 'pos-waka', academicYearId: 'ay-1' }),
      ).rejects.toThrow('Transisi appointment sedang berlangsung');

      expect(prisma.staff.findUnique).not.toHaveBeenCalled();
      expect(prisma.position.findUnique).not.toHaveBeenCalled();
      expect(prisma.staffPosition.create).not.toHaveBeenCalled();
      expect(prisma.userPermissionOverride.upsert).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(perms.invalidateUser).not.toHaveBeenCalled();
      expect(kc.assignRealmRole).not.toHaveBeenCalled();
    });
  });

  describe('unassign', () => {
    it('fail-closed selama transisi appointment dan tidak mencabut assignment/override', async () => {
      const prisma = mockPrisma();
      const perms = { invalidateUser: jest.fn(), getEffectivePermissions: jest.fn() };
      const kc = mockKeycloakAdmin();
      const svc = await build(prisma, perms, kc);

      await expect(svc.unassign('sp-1')).rejects.toThrow(ConflictException);
      await expect(svc.unassign('sp-1')).rejects.toThrow('Transisi appointment sedang berlangsung');

      expect(prisma.staffPosition.findUnique).not.toHaveBeenCalled();
      expect(prisma.staffPosition.delete).not.toHaveBeenCalled();
      expect(prisma.userPermissionOverride.deleteMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(perms.invalidateUser).not.toHaveBeenCalled();
      expect(kc.removeRealmRole).not.toHaveBeenCalled();
    });
  });

  describe('syncKeycloakRoles', () => {
    it('mengembalikan notice disabled tanpa membuat role jabatan di Keycloak', async () => {
      const prisma = mockPrisma();
      const kc = mockKeycloakAdmin();
      const svc = await build(prisma, { invalidateUser: jest.fn(), getEffectivePermissions: jest.fn() }, kc);

      const res = await svc.syncKeycloakRoles();

      expect(res.status).toBe('disabled');
      expect(res.stableRoles).toEqual([
        'SUPER_ADMIN',
        'TATA_USAHA',
        'GURU',
        'SISWA',
        'ORANG_TUA',
        'INDUSTRI',
      ]);
      expect(res.blockedPositionCodes).toContain('KEPALA_SEKOLAH');
      expect(res.blockedPositionCodes).toContain('WAKA_KURIKULUM');
      expect(kc.createRealmRoleIfNotExists).not.toHaveBeenCalled();
      expect(prisma.position.findMany).not.toHaveBeenCalled();
    });
  });
});
