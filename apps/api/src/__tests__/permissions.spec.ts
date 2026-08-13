jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionGuard } from '../permissions/permissions.guard';
import { PermissionsController } from '../permissions/permissions.controller';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRED_PERMISSION_KEY } from '../permissions/decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { Prisma } from '@prisma/client';

const PERM_CODE = { id: 'p1', code: 'student.create', description: 'Buat siswa', module: 'student', createdAt: new Date() };
const PERM_READ = { id: 'p2', code: 'student.read', description: 'Lihat siswa', module: 'student', createdAt: new Date() };

function buildCtx(user: Record<string, unknown> | null = { keycloakId: 'kc-uuid', roles: ['GURU'] }): ExecutionContext {
  return {
    getHandler: () => function h() { return; },
    getClass: () => class C {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

// ════════════════════════════════════════════════════════════════════════════
// PermissionsService
// ════════════════════════════════════════════════════════════════════════════

describe('PermissionsService', () => {
  let service: PermissionsService;
  const mockRpFindMany = jest.fn();
  const mockUpoFindMany = jest.fn();
  const mockUserFindUnique = jest.fn();
  const mockPermFindMany = jest.fn();
  const mockPermCreate = jest.fn();
  const mockPermDelete = jest.fn();
  const mockTransaction = jest.fn();
  // TF2-P1-1: Mocks untuk zombie permissions filter.
  const mockAyFindMany = jest.fn();
  const mockUpoFindFirst = jest.fn();
  const mockUpoUpdate = jest.fn();
  const mockUpoCreate = jest.fn();
  const mockAppointmentFindMany = jest.fn();

  beforeEach(async () => {
    [mockRpFindMany, mockUpoFindMany, mockUserFindUnique, mockPermFindMany,
      mockPermCreate, mockPermDelete, mockTransaction,
      mockAyFindMany, mockUpoFindFirst, mockUpoUpdate, mockUpoCreate,
      mockAppointmentFindMany,
    ].forEach(m => m.mockReset());
    // Exactly one active year is required for scoped overrides and appointments.
    mockAyFindMany.mockResolvedValue([{ id: 'ay-2026' }]);
    mockAppointmentFindMany.mockResolvedValue([]);

    const prisma = {
      permission: { findMany: mockPermFindMany, findUnique: jest.fn(), create: mockPermCreate, delete: mockPermDelete },
      rolePermission: { findMany: mockRpFindMany, deleteMany: jest.fn(), createMany: jest.fn() },
      userPermissionOverride: {
        findMany: mockUpoFindMany,
        findFirst: mockUpoFindFirst,   // TF2-P1-1: grant/revoke pattern
        update: mockUpoUpdate,          // TF2-P1-1: grant/revoke pattern
        create: mockUpoCreate,          // TF2-P1-1: grant/revoke pattern
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: { findUnique: mockUserFindUnique },
      academicYear: { findMany: mockAyFindMany },
      appointment: { findMany: mockAppointmentFindMany },
      $transaction: mockTransaction,
    };
    mockTransaction.mockImplementation(async (input: unknown) => {
      if (typeof input === 'function') {
        return (input as (tx: typeof prisma) => Promise<unknown> | unknown)(prisma);
      }
      return input;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(PermissionsService);
  });

  describe('hasPermission', () => {
    it('SUPER_ADMIN selalu true tanpa query DB', async () => {
      const result = await service.hasPermission('kc-sa', ['SUPER_ADMIN'], 'any.permission');
      expect(result).toBe(true);
      expect(mockRpFindMany).not.toHaveBeenCalled();
    });

    it('GURU punya permission student.read → true', async () => {
      mockRpFindMany.mockResolvedValue([
        { permission: { code: 'student.read' } },
      ]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue(null);

      const result = await service.hasPermission('kc-guru', ['GURU'], 'student.read');
      expect(result).toBe(true);
    });

    it('GURU tanpa permission student.delete → false', async () => {
      mockRpFindMany.mockResolvedValue([{ permission: { code: 'student.read' } }]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue(null);

      const result = await service.hasPermission('kc-guru', ['GURU'], 'student.delete');
      expect(result).toBe(false);
    });

    it('User override grant → menambah permission di luar role', async () => {
      mockRpFindMany.mockResolvedValue([{ permission: { code: 'student.read' } }]);
      mockUpoFindMany.mockResolvedValue([
        { grant: true, permission: { code: 'finance.approve' } },
      ]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });

      const result = await service.hasPermission('kc-guru', ['GURU'], 'finance.approve');
      expect(result).toBe(true);
      // Filter override WAJIB di level query (bukan scan seluruh tabel di JS)
      expect(mockUpoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'auth-1',
            status: 'ACTIVE',
            source: 'MANUAL',
            OR: [{ academicYearId: 'ay-2026' }, { academicYearId: null }],
          },
        }),
      );
    });

    it('Override scoped tahun aktif berlaku', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([
        { grant: true, permission: { code: 'finance.approve' } },
      ]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });

      const result = await service.hasPermission('kc-guru', ['GURU'], 'finance.approve');

      expect(result).toBe(true);
      expect(mockUpoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            OR: [{ academicYearId: 'ay-2026' }, { academicYearId: null }],
          }),
        }),
      );
    });

    it('Override scoped tahun lama tidak ikut query sehingga akses fail-closed', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });

      const result = await service.hasPermission('kc-guru', ['GURU'], 'finance.approve');

      expect(result).toBe(false);
      expect(mockUpoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ academicYearId: 'ay-2026' }, { academicYearId: null }],
          }),
        }),
      );
    });

    it('Override global intentional tetap berlaku lintas tahun', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([
        { grant: true, permission: { code: 'permissions.read' } },
      ]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });

      const result = await service.hasPermission('kc-guru', ['GURU'], 'permissions.read');

      expect(result).toBe(true);
      expect(mockUpoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            OR: [{ academicYearId: 'ay-2026' }, { academicYearId: null }],
          }),
        }),
      );
    });

    it('Override quarantined tidak pernah diminta oleh resolver', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });

      await service.hasPermission('kc-guru', ['GURU'], 'finance.approve');

      expect(mockUpoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE', source: 'MANUAL' }),
        }),
      );
    });

    it('POSITION_ASSIGNMENT override historis tidak menjadi authority jabatan', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });

      expect(await service.hasPermission('kc-guru', ['GURU'], 'finance.approve')).toBe(false);
      expect(mockUpoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: 'MANUAL' }),
        }),
      );
    });

    it('User override revoke (grant=false) → MENARIK permission yang diberikan role', async () => {
      mockRpFindMany.mockResolvedValue([
        { permission: { code: 'student.read' } },
        { permission: { code: 'student.delete' } },
      ]);
      mockUpoFindMany.mockResolvedValue([
        { grant: false, permission: { code: 'student.delete' } },
      ]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });

      expect(await service.hasPermission('kc-guru', ['GURU'], 'student.delete')).toBe(false);
      service.invalidateUser('kc-guru');
      expect(await service.hasPermission('kc-guru', ['GURU'], 'student.read')).toBe(true);
    });

    it('Global revoke menang atas scoped grant bila keduanya aktif', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([
        { grant: false, permission: { code: 'finance.approve' } },
        { grant: true, permission: { code: 'finance.approve' } },
      ]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });

      expect(await service.hasPermission('kc-guru', ['GURU'], 'finance.approve')).toBe(false);
    });

    it('appointment ACTIVE menambah permission jabatan secara dinamis', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });
      mockAppointmentFindMany.mockResolvedValue([
        { position: { permissions: [{ permissionId: 'perm-review' }] } },
      ]);
      mockPermFindMany.mockResolvedValue([{ code: 'report.review' }]);

      expect(await service.hasPermission('kc-ks', ['TATA_USAHA'], 'report.review')).toBe(true);
      expect(mockAppointmentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            staff: expect.objectContaining({ userId: 'auth-1', deletedAt: null }),
            academicYearId: 'ay-2026',
            position: { isActive: true },
          }),
        }),
      );
    });

    it('appointment SUSPENDED tidak menambah permission jabatan', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });
      mockAppointmentFindMany.mockResolvedValue([]);

      expect(await service.hasPermission('kc-ks', ['TATA_USAHA'], 'report.review')).toBe(false);
      expect(mockAppointmentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            staff: expect.objectContaining({ userId: 'auth-1', deletedAt: null }),
            academicYearId: 'ay-2026',
            position: { isActive: true },
          }),
        }),
      );
    });

    it('override grant=false menarik permission dari appointment aktif', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([
        { grant: false, permission: { code: 'report.review' } },
      ]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });
      mockAppointmentFindMany.mockResolvedValue([
        { position: { permissions: [{ permissionId: 'perm-review' }] } },
      ]);
      mockPermFindMany.mockResolvedValue([{ code: 'report.review' }]);

      expect(await service.hasPermission('kc-ks', ['TATA_USAHA'], 'report.review')).toBe(false);
    });

    it('invalidateAll memaksa permission appointment hangat dinilai ulang setelah scope berubah', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });
      mockAppointmentFindMany
        .mockResolvedValueOnce([
          { position: { permissions: [{ permissionId: 'perm-review' }] } },
        ])
        .mockResolvedValueOnce([]);
      mockPermFindMany.mockResolvedValue([{ code: 'report.review' }]);

      await expect(service.hasPermission('kc-kaprog', ['GURU'], 'report.review')).resolves.toBe(true);
      await expect(service.hasPermission('kc-kaprog', ['GURU'], 'report.review')).resolves.toBe(true);
      expect(mockAppointmentFindMany).toHaveBeenCalledTimes(1);

      service.invalidateAll();

      await expect(service.hasPermission('kc-kaprog', ['GURU'], 'report.review')).resolves.toBe(false);
      expect(mockAppointmentFindMany).toHaveBeenCalledTimes(2);
    });

    it('role position historis tidak membaca role_permissions langsung', async () => {
      mockRpFindMany.mockImplementation(({ where }) =>
        Promise.resolve(
          where.role.in.includes('KEPALA_SEKOLAH')
            ? [{ permission: { code: 'report.review' } }]
            : [],
        ),
      );
      mockUserFindUnique.mockResolvedValue(null);

      expect(await service.hasPermission('kc-legacy', ['KEPALA_SEKOLAH'], 'report.review')).toBe(false);
      expect(mockRpFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: { in: [] } } }),
      );
    });

    it('User tanpa baris auth.users → override TIDAK di-query, role tetap berlaku', async () => {
      mockRpFindMany.mockResolvedValue([{ permission: { code: 'student.read' } }]);
      mockUserFindUnique.mockResolvedValue(null);

      expect(await service.hasPermission('kc-baru', ['GURU'], 'student.read')).toBe(true);
      expect(mockUpoFindMany).not.toHaveBeenCalled();
    });

    it('Cache hit → tidak query DB ulang', async () => {
      mockRpFindMany.mockResolvedValue([{ permission: { code: 'student.read' } }]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue(null);

      await service.hasPermission('kc-guru', ['GURU'], 'student.read');
      await service.hasPermission('kc-guru', ['GURU'], 'student.read');
      expect(mockRpFindMany).toHaveBeenCalledTimes(1);
    });

    it('setRolePermissions → seluruh cache dibersihkan (perubahan role berdampak semua user)', async () => {
      mockRpFindMany.mockResolvedValue([{ permission: { code: 'student.read' } }]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue(null);
      mockTransaction.mockResolvedValue([]);

      await service.hasPermission('kc-guru', ['GURU'], 'student.read');
      await service.setRolePermissions('GURU', ['p1']);
      await service.hasPermission('kc-guru', ['GURU'], 'student.read');

      expect(mockRpFindMany).toHaveBeenCalledTimes(2); // cache miss setelah invalidateAll
    });

    it('invalidateUser → clear cache user tertentu', async () => {
      mockRpFindMany.mockResolvedValue([{ permission: { code: 'student.read' } }]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue(null);

      await service.hasPermission('kc-guru', ['GURU'], 'student.read');
      service.invalidateUser('kc-guru');
      await service.hasPermission('kc-guru', ['GURU'], 'student.read');

      expect(mockRpFindMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('active position resolver', () => {
    it('mengembalikan kode jabatan dari appointment ACTIVE saja', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });
      mockAppointmentFindMany.mockResolvedValue([
        { position: { code: 'KEPALA_SEKOLAH' } },
        { position: { code: 'WAKA_KURIKULUM' } },
      ]);

      await expect(service.getActivePositionCodes('kc-user')).resolves.toEqual(
        new Set(['KEPALA_SEKOLAH', 'WAKA_KURIKULUM']),
      );
      expect(mockAppointmentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            staff: expect.objectContaining({
              userId: 'auth-1',
              deletedAt: null,
              user: { isActive: true, deletedAt: null },
            }),
            academicYearId: 'ay-2026',
            position: { isActive: true },
            effectiveFrom: { lte: expect.any(Date) },
            OR: [
              { effectiveUntil: null },
              { effectiveUntil: { gte: expect.any(Date) } },
            ],
            AND: [{
              OR: [
                { position: { scopeType: 'NONE' }, majorId: null },
                { position: { scopeType: 'MAJOR' }, major: { isActive: true } },
              ],
            }],
          }),
        }),
      );
    });

    it('fails closed when no academic year is active', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });
      mockAyFindMany.mockResolvedValue([]);

      await expect(service.getActivePositionCodes('kc-user')).resolves.toEqual(new Set());
      expect(mockAppointmentFindMany).not.toHaveBeenCalled();
    });

    it('fails closed when more than one academic year is active', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });
      mockAyFindMany.mockResolvedValue([{ id: 'ay-a' }, { id: 'ay-b' }]);

      await expect(service.getActivePositionCodes('kc-user')).resolves.toEqual(new Set());
      expect(mockAyFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
      expect(mockAppointmentFindMany).not.toHaveBeenCalled();
    });

    it('does not grant appointment permissions when active-year configuration is ambiguous', async () => {
      mockRpFindMany.mockResolvedValue([]);
      mockUpoFindMany.mockResolvedValue([]);
      mockUserFindUnique.mockResolvedValue({ id: 'auth-1' });
      mockAyFindMany.mockResolvedValue([{ id: 'ay-a' }, { id: 'ay-b' }]);

      await expect(service.hasPermission('kc-user', ['GURU'], 'report.review')).resolves.toBe(false);
      expect(mockAppointmentFindMany).not.toHaveBeenCalled();
      expect(mockUpoFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ OR: [{ academicYearId: null }] }),
      }));
    });
  });

  describe('CRUD permissions', () => {
    it('getAllPermissions → findMany', async () => {
      mockPermFindMany.mockResolvedValue([PERM_CODE, PERM_READ]);
      const result = await service.getAllPermissions();
      expect(result).toHaveLength(2);
    });

    it('createPermission → insert baru', async () => {
      mockPermCreate.mockResolvedValue(PERM_CODE);
      const result = await service.createPermission('student.create', 'desc', 'student');
      expect(result.code).toBe('student.create');
    });
  });

  describe('Role permissions', () => {
    it('getRolePermissions → include permission', async () => {
      mockRpFindMany.mockResolvedValue([{ permission: PERM_CODE }]);
      const result = await service.getRolePermissions('GURU');
      expect(result).toHaveLength(1);
      expect(mockRpFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: 'GURU' } }),
      );
    });

    it('setRolePermissions → transaction', async () => {
      mockTransaction.mockResolvedValue(undefined);
      await service.setRolePermissions('GURU', ['p1', 'p2']);
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('User overrides', () => {
    it('getUserEffectivePermissions -> include flag grant untuk override ACTIVE saja', async () => {
      mockUpoFindMany.mockResolvedValue([
        { permission: PERM_CODE, grant: true },
        { permission: PERM_READ, grant: false },
      ]);
      const result = await service.getUserEffectivePermissions('auth-1');
      expect(result).toHaveLength(2);
      expect(result[0]?.grant).toBe(true);
      expect(result[1]?.grant).toBe(false);
      expect(mockUpoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'auth-1',
            status: 'ACTIVE',
            source: 'MANUAL',
            OR: [{ academicYearId: 'ay-2026' }, { academicYearId: null }],
          },
        }),
      );
    });

    it('grantUserPermission membuat global override ACTIVE MANUAL', async () => {
      mockUpoFindFirst.mockResolvedValue(null);
      mockUpoCreate.mockResolvedValue({ id: 'o1', grant: true });

      const result = await service.grantUserPermission('auth-1', 'p1');

      expect(result).toEqual({ id: 'o1', grant: true });
      expect(mockUpoCreate).toHaveBeenCalledWith({
        data: {
          userId: 'auth-1',
          permissionId: 'p1',
          grant: true,
          academicYearId: null,
          staffPositionId: null,
          source: 'MANUAL',
          status: 'ACTIVE',
          reason: 'Manual global grant via Users UI',
        },
      });
    });

    it('revokeUserPermission membuat global revoke ACTIVE MANUAL', async () => {
      mockUpoFindFirst.mockResolvedValue(null);
      mockUpoCreate.mockResolvedValue({ id: 'o1', grant: false });

      const result = await service.revokeUserPermission('auth-1', 'p1');

      expect(result).toEqual({ id: 'o1', grant: false });
      expect(mockUpoCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'auth-1',
          permissionId: 'p1',
          grant: false,
          source: 'MANUAL',
          status: 'ACTIVE',
          reason: 'Manual global revoke via Users UI',
        }),
      });
    });

    it('concurrent global grant/revoke P2002 di-retry sebagai update bersih', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockTransaction.mockRejectedValueOnce(p2002);
      mockUpoFindFirst.mockResolvedValue({ id: 'o-existing' });
      mockUpoUpdate.mockResolvedValue({ id: 'o-existing', grant: true });

      const result = await service.grantUserPermission('auth-1', 'p1');

      expect(result).toEqual({ id: 'o-existing', grant: true });
      expect(mockUpoUpdate).toHaveBeenCalledWith({
        where: { id: 'o-existing' },
        data: expect.objectContaining({
          grant: true,
          source: 'MANUAL',
          status: 'ACTIVE',
        }),
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PermissionGuard
// ════════════════════════════════════════════════════════════════════════════

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;
  const mockHasPermission = jest.fn();

  beforeEach(async () => {
    mockHasPermission.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        Reflector,
        { provide: PermissionsService, useValue: { hasPermission: mockHasPermission } },
      ],
    }).compile();
    guard = module.get(PermissionGuard);
    reflector = module.get(Reflector);
  });

  it('@Public() → bypass, return true', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return true;
      return undefined;
    });
    expect(await guard.canActivate(buildCtx())).toBe(true);
  });

  it('tanpa @RequirePermission → return true (pass-through ke RolesGuard)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(await guard.canActivate(buildCtx())).toBe(true);
  });

  it('user tidak ada di request → ForbiddenException (FAIL-CLOSED)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRED_PERMISSION_KEY) return 'student.create';
      return undefined;
    });
    await expect(guard.canActivate(buildCtx(null))).rejects.toThrow(ForbiddenException);
  });

  it('punya permission → return true', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRED_PERMISSION_KEY) return 'student.read';
      return undefined;
    });
    mockHasPermission.mockResolvedValue(true);
    expect(await guard.canActivate(buildCtx())).toBe(true);
  });

  it('punya salah satu permission alternatif → return true', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRED_PERMISSION_KEY) return ['finance.read', 'finance.child.read'];
      return undefined;
    });
    mockHasPermission
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    expect(await guard.canActivate(buildCtx({ keycloakId: 'kc-ortu', roles: ['ORANG_TUA'] }))).toBe(true);
    expect(mockHasPermission).toHaveBeenCalledWith('kc-ortu', ['ORANG_TUA'], 'finance.read');
    expect(mockHasPermission).toHaveBeenCalledWith('kc-ortu', ['ORANG_TUA'], 'finance.child.read');
  });

  it('TIDAK punya permission → ForbiddenException', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRED_PERMISSION_KEY) return 'permissions.manage';
      return undefined;
    });
    mockHasPermission.mockResolvedValue(false);
    await expect(guard.canActivate(buildCtx({ keycloakId: 'kc-guru', roles: ['GURU'] })))
      .rejects.toThrow(ForbiddenException);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PermissionsController
// ════════════════════════════════════════════════════════════════════════════

describe('PermissionsController', () => {
  let controller: PermissionsController;
  const mockSvc = {
    getAllPermissions: jest.fn(),
    getPermissionByCode: jest.fn(),
    createPermission: jest.fn(),
    deletePermission: jest.fn(),
    getRolePermissions: jest.fn(),
    setRolePermissions: jest.fn(),
    getUserEffectivePermissions: jest.fn(),
    grantUserPermission: jest.fn(),
    revokeUserPermission: jest.fn(),
  };

  beforeEach(async () => {
    Object.values(mockSvc).forEach(m => m.mockReset());
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [{ provide: PermissionsService, useValue: mockSvc }],
    }).compile();
    controller = module.get(PermissionsController);
  });

  it('getAllPermissions → data dari service', async () => {
    mockSvc.getAllPermissions.mockResolvedValue([PERM_CODE]);
    const result = await controller.getAllPermissions();
    expect(result).toHaveLength(1);
  });

  it('createPermission duplikat → BadRequestException', async () => {
    mockSvc.getPermissionByCode.mockResolvedValue(PERM_CODE);
    await expect(controller.createPermission({
      code: 'student.create', description: 'desc', module: 'student',
    })).rejects.toThrow(BadRequestException);
  });

  it('setRolePermissions → service dipanggil dengan benar', async () => {
    await controller.setRolePermissions('GURU', { permissionIds: ['p1', 'p2'] });
    expect(mockSvc.setRolePermissions).toHaveBeenCalledWith('GURU', ['p1', 'p2']);
  });

  it('grantUserPermission → service grant dipanggil', async () => {
    mockSvc.grantUserPermission.mockResolvedValue({ id: 'o1', userId: 'u1', permissionId: 'p1', grant: true, createdAt: new Date() });
    await controller.grantUserPermission('u1', { permissionId: 'p1', grant: true });
    expect(mockSvc.grantUserPermission).toHaveBeenCalledWith('u1', 'p1');
  });

  it('grantUserPermission grant=false → service revoke dipanggil', async () => {
    mockSvc.revokeUserPermission.mockResolvedValue({ id: 'o1', userId: 'u1', permissionId: 'p1', grant: false, createdAt: new Date() });
    await controller.grantUserPermission('u1', { permissionId: 'p1', grant: false });
    expect(mockSvc.revokeUserPermission).toHaveBeenCalledWith('u1', 'p1');
    expect(mockSvc.grantUserPermission).not.toHaveBeenCalled();
  });
});
