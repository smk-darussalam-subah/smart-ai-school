jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UserStatusService } from '../auth/user-status.service';
import { PermissionsService } from '../permissions/permissions.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { UsersController } from '../users/users.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '@smk/auth';
import { GroupedUsersQuerySchema, ListUsersQuerySchema } from '../users/dto/list-users.dto';

const SA_USER: AuthUser = {
  keycloakId: 'kc-sa',
  email: 'sa@test.com',
  username: 'sa',
  roles: ['SUPER_ADMIN'],
  fullName: 'Super Admin',
};

const NOW = new Date('2026-06-10T12:00:00Z');

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-001',
    keycloakId: 'kc-001',
    email: 'guru1@smk.sch.id',
    fullName: 'Guru Satu',
    phone: null,
    role: 'GURU',
    isActive: true,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// UsersService
// ════════════════════════════════════════════════════════════════════════════

describe('UsersService', () => {
  let service: UsersService;
  const mockFindMany = jest.fn();
  const mockCount = jest.fn();
  const mockFindUnique = jest.fn();
  const mockFindFirst = jest.fn();
  const mockUpdate = jest.fn();
  const mockUpdateMany = jest.fn();
  const mockExecuteRaw = jest.fn();
  const mockTransaction = jest.fn();
  const mockKc = {
    assignRealmRole: jest.fn(),
    removeRealmRole: jest.fn(),
    setEnabled: jest.fn(),
    logoutUser: jest.fn(),
    getUserRealmRoles: jest.fn(),
  };
  const mockPerms = {
    invalidateUser: jest.fn(),
    invalidateAll: jest.fn(),
    getEffectivePermissions: jest.fn(),
  };
  const mockUserStatus = {
    isBlocked: jest.fn().mockResolvedValue(false),
    invalidate: jest.fn(),
    invalidateAll: jest.fn(),
  };

  beforeEach(async () => {
    [
      mockFindMany,
      mockCount,
      mockFindUnique,
      mockFindFirst,
      mockUpdate,
      mockUpdateMany,
      mockExecuteRaw,
      mockTransaction,
    ].forEach((m) => m.mockReset());
    mockFindFirst.mockResolvedValue({ id: 'actor-sa', role: 'SUPER_ADMIN' });
    mockKc.assignRealmRole.mockReset();
    mockKc.removeRealmRole.mockReset();
    mockKc.setEnabled.mockReset();
    mockKc.logoutUser.mockReset();
    mockKc.getUserRealmRoles.mockReset();
    mockPerms.invalidateUser.mockReset();
    mockPerms.invalidateAll.mockReset();
    mockPerms.getEffectivePermissions.mockReset();
    mockUserStatus.invalidate.mockReset();

    const prisma = {
      user: {
        findMany: mockFindMany,
        count: mockCount,
        findUnique: mockFindUnique,
        findFirst: mockFindFirst,
        update: mockUpdate,
        updateMany: mockUpdateMany,
      },
      $executeRaw: mockExecuteRaw,
      $transaction: mockTransaction,
    };
    mockExecuteRaw.mockResolvedValue(1);
    mockTransaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: UserStatusService, useValue: mockUserStatus },
        { provide: KeycloakAdminService, useValue: mockKc },
        { provide: PermissionsService, useValue: mockPerms },
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('mengembalikan list user dengan pagination', async () => {
      const users = [
        makeUser(),
        makeUser({
          id: 'u-002',
          email: 'siswa1@smk.sch.id',
          fullName: 'Siswa Satu',
          role: 'SISWA',
        }),
      ];
      mockFindMany.mockResolvedValue(users);
      mockCount.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20, status: 'active' });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null, isActive: true }),
        }),
      );
    });

    it('filter by role — hanya GURU', async () => {
      mockFindMany.mockResolvedValue([makeUser()]);
      mockCount.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20, role: 'GURU', status: 'active' });

      expect(result.data).toHaveLength(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'GURU' }),
        }),
      );
    });

    it('filter by isActive=false', async () => {
      mockFindMany.mockResolvedValue([makeUser({ isActive: false })]);
      mockCount.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        isActive: false,
        status: 'inactive',
      });

      expect(result.data[0]?.isActive).toBe(false);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('arsip hanya dapat dibaca Super Admin dan memakai deletedAt sebagai scope', async () => {
      mockFindMany.mockResolvedValue([makeUser({ isActive: false, deletedAt: NOW })]);
      mockCount.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20, status: 'archived' }, 'kc-sa');

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: { not: null } }),
        }),
      );
      mockFindFirst.mockResolvedValue({ id: 'actor-tu', role: 'TATA_USAHA' });
      await expect(
        service.findAll({ page: 1, limit: 20, status: 'archived' }, 'kc-tu'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('search by name atau email', async () => {
      mockFindMany.mockResolvedValue([makeUser({ fullName: 'Guru Satu' })]);
      mockCount.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20, search: 'Guru', status: 'active' });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { fullName: { contains: 'Guru', mode: 'insensitive' } },
              { email: { contains: 'Guru', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('pagination — halaman ke-2', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(25);

      await service.findAll({ page: 2, limit: 20, status: 'active' });

      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    });

    it('cursor-based pagination — mengembalikan nextCursor', async () => {
      const users = Array.from({ length: 20 }, (_, i) =>
        makeUser({ id: `u-${String(i + 1).padStart(3, '0')}` }),
      );
      mockFindMany.mockResolvedValue(users);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        cursor: 'u-050',
        status: 'active',
      });

      expect(result.data).toHaveLength(20);
      expect(result.nextCursor).toBe('u-020');
      expect(result.total).toBe(-1); // cursor mode tidak menghitung total
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { lt: 'u-050' } }),
          orderBy: { id: 'desc' },
        }),
      );
    });

    it('cursor-based pagination — data kurang dari limit → nextCursor null', async () => {
      const users = [makeUser({ id: 'u-010' }), makeUser({ id: 'u-009' })];
      mockFindMany.mockResolvedValue(users);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        cursor: 'u-015',
        status: 'active',
      });

      expect(result.nextCursor).toBeNull();
    });

    it('kombinasi filter role + search + page', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10, role: 'SISWA', search: 'SMK', status: 'active' });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: 'SISWA',
            OR: expect.any(Array),
          }),
          skip: 0,
          take: 10,
        }),
      );
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('mengembalikan user dengan relasi student/teacher', async () => {
      mockFindUnique.mockResolvedValue({
        ...makeUser(),
        student: { id: 'st-001', nis: '12345' },
        teacher: null,
      });

      const result = await service.findById('u-001');

      expect(result.student).toEqual({ id: 'st-001', nis: '12345' });
      expect(result.teacher).toBeNull();
    });

    it('role jabatan ditolak sebelum menyentuh DB update atau Keycloak', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.findById('u-xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateRole ───────────────────────────────────────────────────────────

  describe('updateRole', () => {
    it('berhasil ubah role — DB-first + sync KC sukses', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ keycloakId: 'kc-001', role: 'GURU' }));
      mockKc.getUserRealmRoles.mockResolvedValue(['GURU']);
      mockKc.assignRealmRole.mockResolvedValue(undefined);
      mockKc.removeRealmRole.mockResolvedValue(undefined);
      mockUpdate.mockResolvedValue(makeUser({ keycloakId: 'kc-001', role: 'TATA_USAHA' }));

      const result = (await service.updateRole('u-001', 'TATA_USAHA', 'kc-sa')) as {
        role: string;
        keycloakSyncPending?: boolean;
      };

      expect(result.role).toBe('TATA_USAHA');
      expect(result.keycloakSyncPending).toBeFalsy();
      // TF-4: DB-first → DB update dipanggil sebelum KC sync.
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'u-001', deletedAt: null, updatedAt: NOW },
        data: { role: 'TATA_USAHA' },
        select: expect.any(Object),
      });
      expect(mockKc.assignRealmRole).toHaveBeenCalledWith('kc-001', 'TATA_USAHA');
      expect(mockKc.removeRealmRole).toHaveBeenCalledWith('kc-001', 'GURU');
      expect(mockPerms.invalidateUser).toHaveBeenCalledWith('kc-001');
    });

    it('role sama → early-return tanpa menyentuh KC maupun update DB', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ keycloakId: 'kc-001', role: 'GURU' }));

      const result = (await service.updateRole('u-001', 'GURU', 'kc-sa')) as { role: string };

      expect(result.role).toBe('GURU');
      expect(mockKc.getUserRealmRoles).not.toHaveBeenCalled();
      expect(mockKc.assignRealmRole).not.toHaveBeenCalled();
      expect(mockKc.removeRealmRole).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    // TF-4 P1: fail-soft untuk KC role sync.
    it('TF-4: KC sync gagal saat role change → DB tetap ter-update + keycloakSyncPending=true', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ keycloakId: 'kc-001', role: 'GURU' }));
      mockKc.getUserRealmRoles.mockResolvedValue(['GURU']);
      mockKc.assignRealmRole.mockRejectedValue(new Error('Keycloak Admin API tidak tersedia'));
      mockKc.removeRealmRole.mockResolvedValue(undefined);
      mockUpdate.mockResolvedValue(makeUser({ keycloakId: 'kc-001', role: 'TATA_USAHA' }));

      const result = (await service.updateRole('u-001', 'TATA_USAHA', 'kc-sa')) as {
        role: string;
        keycloakSyncPending?: boolean;
      };

      // DB tetap ter-update.
      expect(result.role).toBe('TATA_USAHA');
      // Flag peringatan ke frontend.
      expect(result.keycloakSyncPending).toBe(true);
      // Cache invalidation tetap dipanggil.
      expect(mockPerms.invalidateUser).toHaveBeenCalledWith('kc-001');
    });

    it('demotion Super Admin tetap mencabut authority lokal saat sinkronisasi KC gagal', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ keycloakId: 'kc-demoted', role: 'SUPER_ADMIN' }));
      mockKc.getUserRealmRoles.mockResolvedValue(['SUPER_ADMIN']);
      mockCount.mockResolvedValue(1);
      mockKc.assignRealmRole.mockRejectedValue(new Error('Keycloak unavailable'));
      mockUpdate.mockResolvedValue(makeUser({ keycloakId: 'kc-demoted', role: 'GURU' }));

      const result = (await service.updateRole('u-001', 'GURU', 'kc-sa')) as {
        role: string;
        keycloakSyncPending?: boolean;
      };

      expect(result).toMatchObject({ role: 'GURU', keycloakSyncPending: true });
      expect(mockPerms.invalidateUser).toHaveBeenCalledWith('kc-demoted');
      expect(mockUserStatus.invalidate).toHaveBeenCalledWith('kc-demoted');
    });

    // TF-4 P1: multi-role detection fail-soft.
    it('TF-4: KC getUserRealmRoles gagal → multi-role check dilewati (fail-soft)', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ keycloakId: 'kc-001', role: 'GURU' }));
      mockKc.getUserRealmRoles.mockRejectedValue(new Error('Keycloak down'));
      mockKc.assignRealmRole.mockResolvedValue(undefined);
      mockKc.removeRealmRole.mockResolvedValue(undefined);
      mockUpdate.mockResolvedValue(makeUser({ keycloakId: 'kc-001', role: 'TATA_USAHA' }));

      const result = (await service.updateRole('u-001', 'TATA_USAHA', 'kc-sa')) as {
        role: string;
        keycloakSyncPending?: boolean;
      };

      // Check tidak melempar — DB update tetap terjadi.
      expect(result.role).toBe('TATA_USAHA');
      expect(result.keycloakSyncPending).toBe(false);
    });

    it('last-SA demote → 409 ConflictException', async () => {
      mockFindUnique.mockResolvedValue(
        makeUser({ keycloakId: 'kc-sa-target', role: 'SUPER_ADMIN' }),
      );
      mockKc.getUserRealmRoles.mockResolvedValue(['SUPER_ADMIN']);
      mockCount.mockResolvedValue(0); // no other SA

      await expect(service.updateRole('u-sa', 'GURU', 'kc-sa')).rejects.toThrow(ConflictException);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('multi-role KC → 409 ConflictException', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ keycloakId: 'kc-multi', role: 'GURU' }));
      mockKc.getUserRealmRoles.mockResolvedValue(['GURU', 'TATA_USAHA']);

      await expect(service.updateRole('u-multi', 'SISWA', 'kc-sa')).rejects.toThrow(
        ConflictException,
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('role jabatan ditolak sebelum menyentuh DB update atau Keycloak', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.updateRole('u-001', 'KEPALA_SEKOLAH', 'kc-sa')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockKc.assignRealmRole).not.toHaveBeenCalled();
      expect(mockKc.removeRealmRole).not.toHaveBeenCalled();
    });

    it('oldRole jabatan historis tidak dicabut dari Keycloak saat migrasi ke role stabil', async () => {
      mockFindUnique.mockResolvedValue(
        makeUser({ keycloakId: 'kc-legacy-ks', role: 'KEPALA_SEKOLAH' }),
      );
      mockKc.getUserRealmRoles.mockResolvedValue([]);
      mockKc.assignRealmRole.mockResolvedValue(undefined);
      mockKc.removeRealmRole.mockResolvedValue(undefined);
      mockUpdate.mockResolvedValue(makeUser({ keycloakId: 'kc-legacy-ks', role: 'GURU' }));

      const result = (await service.updateRole('u-legacy-ks', 'GURU', 'kc-sa')) as {
        role: string;
        keycloakSyncPending?: boolean;
      };

      expect(result.role).toBe('GURU');
      expect(mockKc.assignRealmRole).toHaveBeenCalledWith('kc-legacy-ks', 'GURU');
      expect(mockKc.removeRealmRole).not.toHaveBeenCalled();
    });

    it('user tidak ditemukan -> NotFoundException', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.updateRole('u-xxx', 'GURU', 'kc-sa')).rejects.toThrow(NotFoundException);
    });

    it('menolak perubahan role oleh TATA_USAHA dan perubahan role sendiri', async () => {
      mockFindFirst.mockResolvedValue({ id: 'actor-tu', role: 'TATA_USAHA' });
      await expect(service.updateRole('u-001', 'SUPER_ADMIN', 'kc-tu')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockFindUnique).not.toHaveBeenCalled();

      mockFindFirst.mockResolvedValue({ id: 'u-001', role: 'SUPER_ADMIN' });
      await expect(service.updateRole('u-001', 'GURU', 'kc-sa')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('role change yang kalah race archive berhenti sebelum sinkronisasi Keycloak', async () => {
      mockFindUnique.mockResolvedValue(makeUser());
      mockKc.getUserRealmRoles.mockResolvedValue(['GURU']);
      mockUpdate.mockRejectedValue({ code: 'P2025' });

      await expect(service.updateRole('u-001', 'TATA_USAHA', 'kc-sa')).rejects.toThrow(
        ConflictException,
      );
      expect(mockKc.assignRealmRole).not.toHaveBeenCalled();
      expect(mockPerms.invalidateUser).not.toHaveBeenCalled();
    });
  });

  // ── updateActive ─────────────────────────────────────────────────────────

  describe('updateActive', () => {
    it('berhasil nonaktifkan — DB-first + sync KC sukses', async () => {
      mockFindUnique.mockResolvedValue(
        makeUser({ keycloakId: 'kc-001', isActive: true, role: 'GURU' }),
      );
      mockKc.setEnabled.mockResolvedValue(undefined);
      mockCount.mockResolvedValue(1); // ada SA lain
      mockUpdate.mockResolvedValue(makeUser({ keycloakId: 'kc-001', isActive: false }));

      const result = (await service.updateActive('u-001', false, 'kc-sa')) as {
        isActive: boolean;
        keycloakSyncPending?: boolean;
      };

      expect(result.isActive).toBe(false);
      expect(result.keycloakSyncPending).toBeFalsy();
      // TF-4: DB-first → DB update dipanggil sebelum KC sync.
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockKc.setEnabled).toHaveBeenCalledWith('kc-001', false);
    });

    // TF-4 P1: core bug fix — fail-soft untuk KC enabled sync.
    it('TF-4: KC sync gagal saat nonaktifkan → DB tetap ter-update + keycloakSyncPending=true', async () => {
      mockFindUnique.mockResolvedValue(
        makeUser({ keycloakId: 'kc-001', isActive: true, role: 'GURU' }),
      );
      mockKc.setEnabled.mockRejectedValue(
        new Error('Keycloak Admin API tidak tersedia — operasi dibatalkan'),
      );
      mockCount.mockResolvedValue(1);
      mockUpdate.mockResolvedValue(makeUser({ keycloakId: 'kc-001', isActive: false }));

      const result = (await service.updateActive('u-001', false, 'kc-sa')) as {
        isActive: boolean;
        keycloakSyncPending?: boolean;
      };

      // DB tetap ter-update — user nonaktif di DB, token lama akan ditolak di refresh.
      expect(result.isActive).toBe(false);
      // Flag peringatan ke frontend.
      expect(result.keycloakSyncPending).toBe(true);
      // Cache invalidation tetap dipanggil.
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('last-SA deactivate → 409 ConflictException', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ keycloakId: 'kc-sa-last', role: 'SUPER_ADMIN' }));
      mockKc.setEnabled.mockResolvedValue(undefined);
      mockCount.mockResolvedValue(0);

      await expect(service.updateActive('u-sa-last', false, 'kc-sa')).rejects.toThrow(
        ConflictException,
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('berhasil aktifkan user yang nonaktif', async () => {
      mockFindUnique.mockResolvedValue(
        makeUser({ keycloakId: 'kc-001', isActive: false, role: 'GURU' }),
      );
      mockKc.setEnabled.mockResolvedValue(undefined);
      mockCount.mockResolvedValue(1);
      mockUpdate.mockResolvedValue(makeUser({ keycloakId: 'kc-001', isActive: true }));

      const result = (await service.updateActive('u-001', true, 'kc-sa')) as {
        isActive: boolean;
        keycloakSyncPending?: boolean;
      };

      expect(result.isActive).toBe(true);
      expect(result.keycloakSyncPending).toBeFalsy();
      expect(mockKc.setEnabled).toHaveBeenCalledWith('kc-001', true);
    });

    it('user tidak ditemukan → NotFoundException', async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(service.updateActive('u-xxx', true, 'kc-sa')).rejects.toThrow(NotFoundException);
    });

    it('TATA_USAHA tidak dapat menonaktifkan akun istimewa atau dirinya sendiri', async () => {
      mockFindFirst.mockResolvedValue({ id: 'actor-tu', role: 'TATA_USAHA' });
      mockFindUnique.mockResolvedValue(makeUser({ id: 'target-sa', role: 'SUPER_ADMIN' }));
      await expect(service.updateActive('target-sa', false, 'kc-tu')).rejects.toThrow(
        ForbiddenException,
      );

      mockFindFirst.mockResolvedValue({ id: 'actor-tu', role: 'TATA_USAHA' });
      await expect(service.updateActive('actor-tu', false, 'kc-tu')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('akun diarsipkan tidak dapat diaktifkan melalui endpoint status biasa', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ isActive: false, deletedAt: NOW }));
      await expect(service.updateActive('u-001', true, 'kc-sa')).rejects.toThrow(ConflictException);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('status change yang kalah race archive berhenti sebelum sinkronisasi Keycloak', async () => {
      mockFindUnique.mockResolvedValue(makeUser());
      mockUpdate.mockRejectedValue({ code: 'P2025' });

      await expect(service.updateActive('u-001', false, 'kc-sa')).rejects.toThrow(
        ConflictException,
      );
      expect(mockKc.setEnabled).not.toHaveBeenCalled();
      expect(mockUserStatus.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('archiveUser / restoreUser', () => {
    const lifecycle = {
      reason: 'Rekonsiliasi akun duplikat',
      expectedUpdatedAt: NOW.toISOString(),
    };

    it('archive memakai CAS, menutup akses, mengakhiri sesi, dan mempertahankan hasil sync jujur', async () => {
      mockFindUnique
        .mockResolvedValueOnce(makeUser())
        .mockResolvedValueOnce(makeUser({ isActive: false, deletedAt: NOW }));
      mockUpdateMany.mockResolvedValue({ count: 1 });
      mockKc.setEnabled.mockResolvedValue(undefined);
      mockKc.logoutUser.mockRejectedValue(new Error('temporary failure'));

      const result = await service.archiveUser('u-001', lifecycle, 'kc-sa');

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-001', deletedAt: null, updatedAt: NOW },
          data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
        }),
      );
      expect(mockKc.setEnabled).toHaveBeenCalledWith('kc-001', false);
      expect(mockKc.logoutUser).toHaveBeenCalledWith('kc-001');
      expect(mockUserStatus.invalidate).toHaveBeenCalledWith('kc-001');
      expect(mockPerms.invalidateUser).toHaveBeenCalledWith('kc-001');
      expect(result).toMatchObject({ keycloakSyncPending: false, sessionTerminationPending: true });
    });

    it('menolak self archive, seluruh akun Super Admin, request stale, dan race berulang', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 'u-001', role: 'SUPER_ADMIN' });
      await expect(service.archiveUser('u-001', lifecycle, 'kc-sa')).rejects.toThrow(
        ForbiddenException,
      );

      mockFindFirst.mockResolvedValue({ id: 'actor-sa', role: 'SUPER_ADMIN' });
      mockFindUnique.mockResolvedValueOnce(makeUser({ role: 'SUPER_ADMIN' }));
      await expect(service.archiveUser('u-001', lifecycle, 'kc-sa')).rejects.toThrow(
        ForbiddenException,
      );

      mockFindUnique.mockResolvedValueOnce(makeUser({ updatedAt: new Date(NOW.getTime() + 1000) }));
      await expect(service.archiveUser('u-001', lifecycle, 'kc-sa')).rejects.toThrow(
        ConflictException,
      );

      mockFindUnique.mockResolvedValueOnce(makeUser());
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.archiveUser('u-001', lifecycle, 'kc-sa')).rejects.toThrow(
        ConflictException,
      );
    });

    it('Tata Usaha tidak dapat archive atau restore meski memanggil service langsung', async () => {
      mockFindFirst.mockResolvedValue({ id: 'actor-tu', role: 'TATA_USAHA' });
      await expect(service.archiveUser('u-001', lifecycle, 'kc-tu')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.restoreUser('u-001', lifecycle, 'kc-tu')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('restore mengaktifkan Keycloak lebih dulu lalu membuka DB dengan CAS', async () => {
      mockFindUnique
        .mockResolvedValueOnce(makeUser({ isActive: false, deletedAt: NOW }))
        .mockResolvedValueOnce(makeUser({ isActive: true, deletedAt: null }));
      mockKc.setEnabled.mockResolvedValue(undefined);
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const result = await service.restoreUser('u-001', lifecycle, 'kc-sa');

      expect(mockKc.setEnabled).toHaveBeenCalledWith('kc-001', true);
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-001', deletedAt: { not: null }, updatedAt: NOW },
          data: expect.objectContaining({ isActive: true, deletedAt: null }),
        }),
      );
      expect(result).toMatchObject({ isActive: true, deletedAt: null, keycloakSyncPending: false });
    });

    it('restore tetap archived bila Keycloak gagal dan mengompensasi CAS stale', async () => {
      mockFindUnique.mockResolvedValueOnce(makeUser({ isActive: false, deletedAt: NOW }));
      mockKc.setEnabled.mockRejectedValueOnce(new Error('KC down'));
      await expect(service.restoreUser('u-001', lifecycle, 'kc-sa')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockUpdateMany).not.toHaveBeenCalled();

      mockFindUnique
        .mockResolvedValueOnce(makeUser({ isActive: false, deletedAt: NOW }))
        .mockResolvedValueOnce({ deletedAt: NOW });
      mockKc.setEnabled.mockResolvedValue(undefined);
      mockUpdateMany.mockResolvedValue({ count: 0 });
      await expect(service.restoreUser('u-001', lifecycle, 'kc-sa')).rejects.toThrow(
        ConflictException,
      );
      expect(mockKc.setEnabled).toHaveBeenLastCalledWith('kc-001', false);
    });
  });

  // ── findGrouped ────────────────────────────────────────────────────────────

  describe('findGrouped', () => {
    it('mengembalikan 6 grup role identitas stabil dengan user dan count', async () => {
      mockFindMany.mockResolvedValue([makeUser()]);
      mockCount.mockResolvedValue(1);

      const result = await service.findGrouped({ limit: 50 });

      expect(result.groups).toHaveLength(6);
      expect(result.groups[0]).toMatchObject({
        role: 'SUPER_ADMIN',
        label: 'Super Admin',
        count: 1,
      });
      expect(result.groups.map((group) => group.role)).not.toContain('KEPALA_SEKOLAH');
      expect(mockFindMany).toHaveBeenCalledTimes(6); // satu per role stabil
    });

    it('filter search diterapkan ke semua grup', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await service.findGrouped({ search: 'Agus', limit: 50 });

      // Setiap pemanggilan findMany harus menyertakan filter OR
      for (let i = 0; i < 6; i++) {
        expect(mockFindMany).toHaveBeenNthCalledWith(
          i + 1,
          expect.objectContaining({
            where: expect.objectContaining({
              OR: [
                { fullName: { contains: 'Agus', mode: 'insensitive' } },
                { email: { contains: 'Agus', mode: 'insensitive' } },
              ],
            }),
          }),
        );
      }
    });

    it('limit per grup membatasi hasil', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await service.findGrouped({ limit: 10 });

      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });
  });

  // ── getEffectivePermissions ────────────────────────────────────────────────

  describe('getEffectivePermissions', () => {
    it('mengembalikan daftar permission efektif user', async () => {
      mockFindUnique.mockResolvedValue({ keycloakId: 'kc-001', role: 'GURU', deletedAt: null });
      mockPerms.getEffectivePermissions.mockResolvedValue(
        new Set(['student.read', 'academic.grade.read']),
      );

      const result = await service.getEffectivePermissions('u-001');

      expect(result).toEqual(['academic.grade.read', 'student.read']);
      expect(mockPerms.getEffectivePermissions).toHaveBeenCalledWith('kc-001', ['GURU']);
    });

    it('user tidak ditemukan → NotFoundException', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.getEffectivePermissions('u-xxx')).rejects.toThrow(NotFoundException);
    });

    it('akun arsip tidak membocorkan panel izin melalui service langsung', async () => {
      mockFindUnique.mockResolvedValue({
        keycloakId: 'kc-001',
        role: 'GURU',
        deletedAt: new Date('2026-09-03T00:00:00.000Z'),
      });

      await expect(service.getEffectivePermissions('u-001')).rejects.toThrow(ConflictException);
      expect(mockPerms.getEffectivePermissions).not.toHaveBeenCalled();
    });
  });
});

describe('ListUsersQuerySchema lifecycle scope', () => {
  it('default daftar adalah aktif dan kompatibel dengan isActive legacy', () => {
    expect(ListUsersQuerySchema.parse({}).status).toBe('active');
    expect(ListUsersQuerySchema.parse({ isActive: 'false' }).status).toBe('inactive');
    expect(ListUsersQuerySchema.parse({ status: 'archived', isActive: 'false' }).status).toBe(
      'archived',
    );
  });

  it('menolak status lifecycle yang bertentangan dan field tambahan', () => {
    expect(ListUsersQuerySchema.safeParse({ status: 'active', isActive: 'false' }).success).toBe(
      false,
    );
    expect(ListUsersQuerySchema.safeParse({ status: 'archived', isActive: 'true' }).success).toBe(
      false,
    );
    expect(
      ListUsersQuerySchema.safeParse({ status: 'active', includeDeleted: 'true' }).success,
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// UsersController
// ════════════════════════════════════════════════════════════════════════════

describe('UsersController', () => {
  let controller: UsersController;
  const mockFindAll = jest.fn();
  const mockFindById = jest.fn();
  const mockUpdateRole = jest.fn();
  const mockUpdateActive = jest.fn();
  const mockArchiveUser = jest.fn();
  const mockRestoreUser = jest.fn();
  const mockFindGrouped = jest.fn();
  const mockGetEffectivePermissions = jest.fn();

  beforeEach(async () => {
    [
      mockFindAll,
      mockFindById,
      mockUpdateRole,
      mockUpdateActive,
      mockArchiveUser,
      mockRestoreUser,
      mockFindGrouped,
      mockGetEffectivePermissions,
    ].forEach((m) => m.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UserStatusService,
          useValue: {
            isBlocked: jest.fn().mockResolvedValue(false),
            invalidate: jest.fn(),
            invalidateAll: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findAll: mockFindAll,
            findById: mockFindById,
            updateRole: mockUpdateRole,
            updateActive: mockUpdateActive,
            archiveUser: mockArchiveUser,
            restoreUser: mockRestoreUser,
            findGrouped: mockFindGrouped,
            getEffectivePermissions: mockGetEffectivePermissions,
          },
        },
      ],
    }).compile();
    controller = module.get(UsersController);
  });

  describe('findAll', () => {
    it('query valid → mengembalikan list', async () => {
      mockFindAll.mockResolvedValue({ data: [makeUser()], total: 1, page: 1, limit: 20 });

      const result = await controller.findAll({ page: '1', limit: '20' }, SA_USER);

      expect(result.data).toHaveLength(1);
    });

    it('query invalid → BadRequestException', async () => {
      await expect(controller.findAll({ page: 'not-a-number' }, SA_USER)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findById', () => {
    it('UUID valid → mengembalikan user', async () => {
      mockFindById.mockResolvedValue(makeUser());

      const result = await controller.findById('00000000-0000-0000-0000-000000000001', SA_USER);

      expect(result.email).toBe('guru1@smk.sch.id');
    });

    it('UUID invalid — ParseUUIDPipe akan reject di runtime (unit test bypass pipe)', async () => {
      // ParseUUIDPipe berjalan di NestJS runtime, bukan di unit test.
      // Unit test menguji logic controller setelah pipe transform.
      // Pipe behavior di-test terpisah di zod-pipe.spec.ts.
      await expect(controller.findById('not-uuid' as never, SA_USER)).resolves.toBeUndefined();
    });
  });

  describe('updateRole', () => {
    it('role valid → berhasil update', async () => {
      mockUpdateRole.mockResolvedValue(makeUser({ role: 'TATA_USAHA' }));

      const result = await controller.updateRole('u-001', { role: 'TATA_USAHA' }, SA_USER);

      expect(result.role).toBe('TATA_USAHA');
      expect(mockUpdateRole).toHaveBeenCalledWith('u-001', 'TATA_USAHA', 'kc-sa');
    });

    it('role invalid — ZodPipe akan reject di runtime (unit test bypass pipe)', async () => {
      // ZodPipe berjalan di NestJS runtime. Unit test menguji logic controller.
      // Validasi Zod di-test terpisah di zod-pipe.spec.ts.
      await expect(
        controller.updateRole('u-001', { role: 'INVALID_ROLE' as never }, SA_USER),
      ).resolves.toBeUndefined();
    });
  });

  describe('updateActive', () => {
    it('berhasil nonaktifkan', async () => {
      mockUpdateActive.mockResolvedValue(makeUser({ isActive: false }));

      const result = await controller.updateActive('u-001', { isActive: false }, SA_USER);

      expect(result.isActive).toBe(false);
    });

    it('isActive bukan boolean — ZodPipe akan reject di runtime (unit test bypass pipe)', async () => {
      await expect(
        controller.updateActive('u-001', { isActive: 'yes' as never }, SA_USER),
      ).resolves.toBeUndefined();
    });
  });

  describe('archive / restore', () => {
    const lifecycle = {
      reason: 'Rekonsiliasi akun duplikat',
      expectedUpdatedAt: NOW.toISOString(),
    };

    it('meneruskan actor dan stale token ke service', async () => {
      mockArchiveUser.mockResolvedValue(makeUser({ deletedAt: NOW, isActive: false }));
      mockRestoreUser.mockResolvedValue(makeUser());

      await controller.archiveUser('u-001', lifecycle, SA_USER);
      await controller.restoreUser('u-001', lifecycle, SA_USER);

      expect(mockArchiveUser).toHaveBeenCalledWith('u-001', lifecycle, 'kc-sa');
      expect(mockRestoreUser).toHaveBeenCalledWith('u-001', lifecycle, 'kc-sa');
    });
  });

  // ── findGrouped controller ──────────────────────────────────────────────────

  describe('findGrouped', () => {
    it('query valid → mengembalikan data tergrup', async () => {
      mockFindGrouped.mockResolvedValue({ groups: [] });

      const result = await controller.findGrouped({});

      expect(result.groups).toEqual([]);
    });

    it('query search valid → delegasi ke service', async () => {
      mockFindGrouped.mockResolvedValue({ groups: [] });

      await controller.findGrouped({ search: 'Agus' });

      expect(mockFindGrouped).toHaveBeenCalledWith(expect.objectContaining({ search: 'Agus' }));
    });

    // TF-1-FU-4: Contract regression test — frontend pernah kirim limit=200 yang
    // ditolak Zod max(100) → HTTP 400 → dropdown kosong silent. Test ini memastikan
    // kontrak DTO tidak berubah tanpa disadari.
    it('TF-1-FU-4: GroupedUsersQuerySchema rejects limit > 100 (contract guard)', () => {
      const overLimit = GroupedUsersQuerySchema.safeParse({ limit: 200 });
      expect(overLimit.success).toBe(false);

      const atLimit = GroupedUsersQuerySchema.safeParse({ limit: 100 });
      expect(atLimit.success).toBe(true);
    });
  });

  // ── getEffectivePermissions controller ───────────────────────────────────────

  describe('getEffectivePermissions', () => {
    it('UUID valid → mengembalikan { permissions }', async () => {
      mockGetEffectivePermissions.mockResolvedValue(['student.read', 'user.read']);

      const result = await controller.getEffectivePermissions(
        '00000000-0000-0000-0000-000000000001',
      );

      expect(result.permissions).toEqual(['student.read', 'user.read']);
    });
  });
});
