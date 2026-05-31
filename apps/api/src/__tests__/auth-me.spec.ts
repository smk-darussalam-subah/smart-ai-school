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
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
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
      providers: [KeycloakGuard, Reflector],
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
      ],
    }).compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('controller.getMe() dengan user valid → mengembalikan profil {id, email, fullName, role, keycloakId}', async () => {
    const result = await controller.getMe(mockUser);

    expect(authService.getMe).toHaveBeenCalledWith(mockUser.keycloakId);
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
