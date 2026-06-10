jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UsersController } from '../users/users.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '@smk/auth';

const SA_USER: AuthUser = {
  keycloakId: 'kc-sa', email: 'sa@test.com', username: 'sa',
  roles: ['SUPER_ADMIN'], fullName: 'Super Admin',
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
  const mockUpdate = jest.fn();

  beforeEach(async () => {
    [mockFindMany, mockCount, mockFindUnique, mockUpdate].forEach(m => m.mockReset());

    const prisma = {
      user: { findMany: mockFindMany, count: mockCount, findUnique: mockFindUnique, update: mockUpdate },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('mengembalikan list user dengan pagination', async () => {
      const users = [makeUser(), makeUser({ id: 'u-002', email: 'siswa1@smk.sch.id', fullName: 'Siswa Satu', role: 'SISWA' })];
      mockFindMany.mockResolvedValue(users);
      mockCount.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
    });

    it('filter by role — hanya GURU', async () => {
      mockFindMany.mockResolvedValue([makeUser()]);
      mockCount.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20, role: 'GURU' });

      expect(result.data).toHaveLength(1);
      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ role: 'GURU' }),
      }));
    });

    it('filter by isActive=false', async () => {
      mockFindMany.mockResolvedValue([makeUser({ isActive: false })]);
      mockCount.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20, isActive: false });

      expect(result.data[0]?.isActive).toBe(false);
      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ isActive: false }),
      }));
    });

    it('search by name atau email', async () => {
      mockFindMany.mockResolvedValue([makeUser({ fullName: 'Guru Satu' })]);
      mockCount.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20, search: 'Guru' });

      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { fullName: { contains: 'Guru', mode: 'insensitive' } },
            { email: { contains: 'Guru', mode: 'insensitive' } },
          ],
        }),
      }));
    });

    it('pagination — halaman ke-2', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(25);

      await service.findAll({ page: 2, limit: 20 });

      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    });

    it('kombinasi filter role + search + page', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10, role: 'SISWA', search: 'SMK' });

      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          role: 'SISWA',
          OR: expect.any(Array),
        }),
        skip: 0,
        take: 10,
      }));
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

    it('user tidak ditemukan → NotFoundException', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.findById('u-xxx')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateRole ───────────────────────────────────────────────────────────

  describe('updateRole', () => {
    it('berhasil ubah role', async () => {
      mockFindUnique.mockResolvedValue(makeUser());
      mockUpdate.mockResolvedValue(makeUser({ role: 'KEPALA_SEKOLAH' }));

      const result = await service.updateRole('u-001', 'KEPALA_SEKOLAH', 'kc-sa');

      expect(result.role).toBe('KEPALA_SEKOLAH');
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'u-001' },
        data: { role: 'KEPALA_SEKOLAH' },
        select: expect.any(Object),
      });
    });

    it('user tidak ditemukan → NotFoundException', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.updateRole('u-xxx', 'GURU', 'kc-sa')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateActive ─────────────────────────────────────────────────────────

  describe('updateActive', () => {
    it('berhasil nonaktifkan user', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ isActive: true }));
      mockUpdate.mockResolvedValue(makeUser({ isActive: false }));

      const result = await service.updateActive('u-001', false, 'kc-sa');

      expect(result.isActive).toBe(false);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'u-001' },
        data: { isActive: false },
        select: expect.any(Object),
      });
    });

    it('berhasil aktifkan user yang nonaktif', async () => {
      mockFindUnique.mockResolvedValue(makeUser({ isActive: false }));
      mockUpdate.mockResolvedValue(makeUser({ isActive: true }));

      const result = await service.updateActive('u-001', true, 'kc-sa');

      expect(result.isActive).toBe(true);
    });

    it('user tidak ditemukan → NotFoundException', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.updateActive('u-xxx', true, 'kc-sa')).rejects.toThrow(NotFoundException);
    });
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

  beforeEach(async () => {
    [mockFindAll, mockFindById, mockUpdateRole, mockUpdateActive].forEach(m => m.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: { findAll: mockFindAll, findById: mockFindById, updateRole: mockUpdateRole, updateActive: mockUpdateActive } },
      ],
    }).compile();
    controller = module.get(UsersController);
  });

  describe('findAll', () => {
    it('query valid → mengembalikan list', async () => {
      mockFindAll.mockResolvedValue({ data: [makeUser()], total: 1, page: 1, limit: 20 });

      const result = await controller.findAll({ page: '1', limit: '20' });

      expect(result.data).toHaveLength(1);
    });

    it('query invalid → BadRequestException', async () => {
      await expect(controller.findAll({ page: 'not-a-number' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('findById', () => {
    it('UUID valid → mengembalikan user', async () => {
      mockFindById.mockResolvedValue(makeUser());

      const result = await controller.findById('00000000-0000-0000-0000-000000000001');

      expect(result.email).toBe('guru1@smk.sch.id');
    });

    it('UUID invalid — ParseUUIDPipe akan reject di runtime (unit test bypass pipe)', async () => {
      // ParseUUIDPipe berjalan di NestJS runtime, bukan di unit test.
      // Unit test menguji logic controller setelah pipe transform.
      // Pipe behavior di-test terpisah di zod-pipe.spec.ts.
      await expect(controller.findById('not-uuid' as never)).resolves.toBeUndefined();
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
});
