// =============================================================================
// auth-me.spec.ts — Integration tests SMA-35 (3 wajib)
//   Test 1: GET /auth/me tanpa token → 401
//   Test 2: GET /auth/me dengan token valid → 200 profil
//   Test 3: endpoint @Roles('SUPER_ADMIN') diakses GURU → 403
// =============================================================================

jest.mock('@smk/auth', () => ({
  verifyKeycloakToken: jest.fn(),
  extractAuthUser: jest.fn(),
}));

import { SseTokenService } from '../auth/sse-token.service';

jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { KeycloakGuard } from '../auth/guards/keycloak.guard';
import { UserStatusService } from '../auth/user-status.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
// ── Helpers ──────────────────────────────────────────────────────────────────

function buildKeycloakContext(options: {
  reflector: Reflector;
  authHeader?: string;
  isPublic?: boolean;
}): ExecutionContext {
  const { reflector, authHeader, isPublic = false } = options;

  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === IS_PUBLIC_KEY) return isPublic;
    return undefined;
  });

  const mockRequest = { headers: { authorization: authHeader }, url: '/api/v1/auth/me' };

  return {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

function buildRolesContext(options: {
  reflector: Reflector;
  requiredRoles?: string[];
  userRoles: string[];
}): ExecutionContext {
  const { reflector, requiredRoles, userRoles } = options;

  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === IS_PUBLIC_KEY) return false;
    if (key === ROLES_KEY) return requiredRoles;
    return undefined;
  });

  const mockRequest = { user: { roles: userRoles }, url: '/test' };

  return {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

// ── Test 1: GET /auth/me tanpa token → 401 ───────────────────────────────────

describe('Test 1 — GET /auth/me tanpa token → 401', () => {
  let keycloakGuard: KeycloakGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KeycloakGuard, Reflector, { provide: UserStatusService, useValue: { isBlocked: jest.fn().mockResolvedValue(false), invalidate: jest.fn(), invalidateAll: jest.fn() } }],
    }).compile();

    keycloakGuard = module.get(KeycloakGuard);
    reflector = module.get(Reflector);
    jest.clearAllMocks();
  });

  it('tidak ada Authorization header → throws UnauthorizedException (401)', async () => {
    const ctx = buildKeycloakContext({ reflector, isPublic: false });
    await expect(keycloakGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});

// ── Test 2: GET /auth/me dengan token valid → 200 profil ─────────────────────

describe('Test 2 — GET /auth/me dengan token valid → 200 profil', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    keycloakId: 'kc-uuid-1234',
    email: 'guru1@smkdarussalamsubah.sch.id',
    username: 'guru1',
    roles: ['GURU' as const],
    fullName: 'Agus Setiawan, S.Kom',
  };

  const mockProfile = {
    id: 'db-uuid-abcd',
    keycloakId: mockUser.keycloakId,
    email: mockUser.email,
    fullName: mockUser.fullName,
    role: 'GURU',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            getMe: jest.fn().mockResolvedValue(mockProfile),
            updateMe: jest.fn(),
          },
        },
        {
          provide: SseTokenService,
          useValue: { generateToken: jest.fn(), validateToken: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('controller.getMe() dengan user valid → mengembalikan profil {id, email, fullName, role, keycloakId, permissions}', async () => {
    const result = await controller.getMe(mockUser);

    expect(authService.getMe).toHaveBeenCalledWith(mockUser.keycloakId, mockUser.roles);
    expect(result).toEqual(mockProfile);
    expect(result).toMatchObject({
      id: expect.any(String),
      keycloakId: expect.any(String),
      email: expect.any(String),
      fullName: expect.any(String),
      role: expect.any(String),
    });
  });

  it('AuthService.getMe throws NotFoundException jika user tidak ada di DB', async () => {
    authService.getMe.mockRejectedValue(new NotFoundException('User tidak ditemukan di database'));

    await expect(controller.getMe(mockUser)).rejects.toThrow(NotFoundException);
  });
});

// ── Test 3: endpoint @Roles('SUPER_ADMIN') diakses GURU → 403 ────────────────

describe('Test 3 — @Roles("SUPER_ADMIN") diakses GURU → ForbiddenException (403)', () => {
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    rolesGuard = module.get(RolesGuard);
    reflector = module.get(Reflector);
    jest.clearAllMocks();
  });

  it('GURU mengakses endpoint @Roles("SUPER_ADMIN") → throws ForbiddenException (403)', () => {
    const ctx = buildRolesContext({
      reflector,
      requiredRoles: ['SUPER_ADMIN'],
      userRoles: ['GURU'],
    });
    expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('SUPER_ADMIN mengakses endpoint @Roles("SUPER_ADMIN") → lolos', () => {
    const ctx = buildRolesContext({
      reflector,
      requiredRoles: ['SUPER_ADMIN'],
      userRoles: ['SUPER_ADMIN'],
    });
    expect(rolesGuard.canActivate(ctx)).toBe(true);
  });

  it('ORANG_TUA mengakses endpoint @Roles("GURU", "TATA_USAHA") → throws ForbiddenException (403)', () => {
    const ctx = buildRolesContext({
      reflector,
      requiredRoles: ['GURU', 'TATA_USAHA'],
      userRoles: ['ORANG_TUA'],
    });
    expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ── AuthService unit tests (coverage SMA-35 auth.service.ts) ─────────────────

describe('AuthService — getMe + updateMe', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
  };
  let permissionsService: {
    getEffectivePermissions: jest.Mock;
  };

  const mockProfile = {
    id: 'db-uuid-abcd',
    keycloakId: 'kc-uuid-1234',
    email: 'guru@smk.sch.id',
    fullName: 'Agus Setiawan',
    role: 'GURU',
    phone: null,
    isActive: true,
  };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    permissionsService = { getEffectivePermissions: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsService, useValue: permissionsService },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('getMe', () => {
    it("SUPER_ADMIN → permissions = ['*'] (wildcard, tak bergantung kelengkapan seed)", async () => {
      prisma.user.findUnique.mockResolvedValue(mockProfile);
      const res = await service.getMe('kc-uuid-1234', ['SUPER_ADMIN']);
      expect(res.permissions).toEqual(['*']);
      expect(permissionsService.getEffectivePermissions).not.toHaveBeenCalled();
    });

    it('user ditemukan → mengembalikan profil + permissions', async () => {
      prisma.user.findUnique.mockResolvedValue(mockProfile);
      permissionsService.getEffectivePermissions.mockResolvedValue(new Set(['student.read', 'academic.grade.read']));

      const result = await service.getMe('kc-uuid-1234', ['GURU']);

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { keycloakId: 'kc-uuid-1234' } }),
      );
      expect(result.permissions).toEqual(['academic.grade.read', 'student.read']);
      expect(result.id).toBe('db-uuid-abcd');
    });

    it('user tidak ada di DB → fallback profil minimal + izin dari role (tidak 404)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      permissionsService.getEffectivePermissions.mockResolvedValue(new Set(['announcement.read']));

      const res = await service.getMe('kc-no-db', ['GURU']);

      expect(res.keycloakId).toBe('kc-no-db');
      expect(res.id).toBe('');
      expect(res.role).toBe('GURU');
      expect(res.isActive).toBe(true);
      expect(res.permissions).toEqual(['announcement.read']);
    });

    it('user tidak ada di DB + SUPER_ADMIN → wildcard (tidak 404)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await service.getMe('kc-inspector', ['SUPER_ADMIN']);

      expect(res.permissions).toEqual(['*']);
      expect(permissionsService.getEffectivePermissions).not.toHaveBeenCalled();
    });

    it('SUPER_ADMIN → semua permission dikembalikan', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockProfile, role: 'SUPER_ADMIN' });
      permissionsService.getEffectivePermissions.mockResolvedValue(new Set(['student.read', 'permissions.manage', 'user.provision']));

      const result = await service.getMe('kc-sa', ['SUPER_ADMIN']);

      expect(result.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('updateMe', () => {
    it('update berhasil → mengembalikan profil terupdate', async () => {
      const updated = { ...mockProfile, phone: '08123456789' };
      prisma.user.findUnique.mockResolvedValue({ id: 'db-uuid-abcd' });
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.updateMe('kc-uuid-1234', { phone: '08123456789' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { keycloakId: 'kc-uuid-1234' },
          data: { phone: '08123456789' },
        }),
      );
      expect(result).toEqual(updated);
    });

    it('user tidak ditemukan → NotFoundException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateMe('tidak-ada', { phone: '08123456789' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ── AuthController.updateMe ──────────────────────────────────────────────────

describe('AuthController — PATCH /auth/me (updateMe)', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    keycloakId: 'kc-uuid-1234',
    email: 'guru@smk.sch.id',
    username: 'guru1',
    roles: ['GURU' as const],
    fullName: 'Agus Setiawan',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            getMe: jest.fn(),
            updateMe: jest.fn().mockResolvedValue({ id: 'x', phone: '08123456789' }),
          },
        },
        {
          provide: SseTokenService,
          useValue: { generateToken: jest.fn(), validateToken: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('PATCH /me → delegasi ke authService.updateMe dengan keycloakId + dto', async () => {
    const dto = { phone: '08123456789' };
    await controller.updateMe(mockUser, dto);

    expect(authService.updateMe).toHaveBeenCalledWith(mockUser.keycloakId, dto);
  });
});
