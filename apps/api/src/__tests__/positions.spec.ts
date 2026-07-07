// =============================================================================
// positions.spec.ts — Unit tests PositionsService (2J-5)
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PositionsService } from '../positions/positions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';

function mockPrisma() {
  return {
    position: { findUnique: jest.fn(), findMany: jest.fn() },
    staff: { findUnique: jest.fn() },
    academicYear: { findFirst: jest.fn(), findUnique: jest.fn() },
    staffPosition: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    userPermissionOverride: { upsert: jest.fn(), deleteMany: jest.fn() },
    permission: { findMany: jest.fn() },
  };
}

async function build(prisma: ReturnType<typeof mockPrisma>, perms = { invalidateUser: jest.fn() }) {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      PositionsService,
      { provide: PrismaService, useValue: prisma },
      { provide: PermissionsService, useValue: perms },
      { provide: KeycloakAdminService, useValue: { assignRealmRole: jest.fn(), removeRealmRole: jest.fn() } },
    ],
  }).compile();
  return mod.get(PositionsService);
}

const STAFF = { id: 'staff-1', user: { keycloakId: 'kc-1' } };

describe('PositionsService', () => {
  describe('assign', () => {
    it('jabatan NONE → buat staff_position + terapkan override izin + invalidate', async () => {
      const prisma = mockPrisma();
      const perms = { invalidateUser: jest.fn() };
      prisma.staff.findUnique.mockResolvedValue(STAFF);
      prisma.position.findUnique.mockResolvedValue({
        id: 'pos-waka', code: 'WAKA_KURIKULUM', scopeType: 'NONE',
        permissions: [{ permissionId: 'perm-a' }, { permissionId: 'perm-b' }],
      });
      prisma.staffPosition.create.mockResolvedValue({ id: 'sp-1' });
      // R-26: cross-schema integrity check — semua permission exist di DB
      prisma.permission.findMany.mockResolvedValue([{ id: 'perm-a' }, { id: 'perm-b' }]);

      const svc = await build(prisma, perms);
      const res = await svc.assign({ userId: 'u-1', positionId: 'pos-waka', academicYearId: 'ay-1' });

      expect(res.id).toBe('sp-1');
      expect(prisma.userPermissionOverride.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.userPermissionOverride.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ userId: 'u-1', permissionId: 'perm-a', grant: true }) }),
      );
      expect(perms.invalidateUser).toHaveBeenCalledWith('kc-1');
    });

    it('jabatan MAJOR tanpa majorId → 400', async () => {
      const prisma = mockPrisma();
      prisma.staff.findUnique.mockResolvedValue(STAFF);
      prisma.position.findUnique.mockResolvedValue({ id: 'pos-kaprog', scopeType: 'MAJOR', permissions: [] });
      const svc = await build(prisma);
      await expect(svc.assign({ userId: 'u-1', positionId: 'pos-kaprog', academicYearId: 'ay-1' }))
        .rejects.toThrow(BadRequestException);
      expect(prisma.staffPosition.create).not.toHaveBeenCalled();
    });

    it('jabatan NONE diberi majorId → 400', async () => {
      const prisma = mockPrisma();
      prisma.staff.findUnique.mockResolvedValue(STAFF);
      prisma.position.findUnique.mockResolvedValue({ id: 'pos-waka', scopeType: 'NONE', permissions: [] });
      const svc = await build(prisma);
      await expect(svc.assign({ userId: 'u-1', positionId: 'pos-waka', academicYearId: 'ay-1', majorId: 'mj-1' }))
        .rejects.toThrow(BadRequestException);
    });

    it('user bukan pegawai → 400', async () => {
      const prisma = mockPrisma();
      prisma.staff.findUnique.mockResolvedValue(null);
      const svc = await build(prisma);
      await expect(svc.assign({ userId: 'u-x', positionId: 'pos-waka', academicYearId: 'ay-1' }))
        .rejects.toThrow(BadRequestException);
    });

    it('penugasan duplikat (P2002) → 409', async () => {
      const prisma = mockPrisma();
      prisma.staff.findUnique.mockResolvedValue(STAFF);
      prisma.position.findUnique.mockResolvedValue({ id: 'pos-waka', scopeType: 'NONE', permissions: [] });
      prisma.staffPosition.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }),
      );
      const svc = await build(prisma);
      await expect(svc.assign({ userId: 'u-1', positionId: 'pos-waka', academicYearId: 'ay-1' }))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('unassign', () => {
    it('hapus penugasan + cabut override yg tak didukung jabatan lain', async () => {
      const prisma = mockPrisma();
      const perms = { invalidateUser: jest.fn() };
      prisma.staffPosition.findUnique.mockResolvedValue({
        id: 'sp-1', positionId: 'pos-waka',
        position: { permissions: [{ permissionId: 'perm-a' }, { permissionId: 'perm-b' }] },
        staff: { userId: 'u-1', user: { keycloakId: 'kc-1' } },
      });
      prisma.staffPosition.delete.mockResolvedValue({});
      // penugasan tersisa masih memberi perm-b (tidak perm-a)
      prisma.staffPosition.findMany.mockResolvedValue([
        { position: { permissions: [{ permissionId: 'perm-b' }] } },
      ]);

      const svc = await build(prisma, perms);
      await svc.unassign('sp-1');

      // hanya perm-a yang dicabut (perm-b masih didukung jabatan lain)
      expect(prisma.userPermissionOverride.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u-1', permissionId: { in: ['perm-a'] }, grant: true },
      });
      expect(perms.invalidateUser).toHaveBeenCalledWith('kc-1');
    });

    it('penugasan tak ada → 404', async () => {
      const prisma = mockPrisma();
      prisma.staffPosition.findUnique.mockResolvedValue(null);
      const svc = await build(prisma);
      await expect(svc.unassign('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
