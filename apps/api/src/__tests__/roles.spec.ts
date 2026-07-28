// =============================================================================
// roles.spec.ts - Unit tests RolesGuard
// Stable identity roles come from JWT; position codes come from active
// Appointment DIIS resolver.
// =============================================================================

jest.mock('@smk/auth', () => {
  const actual = jest.requireActual('@smk/auth');
  return {
    ...actual,
    verifyKeycloakToken: jest.fn(),
    extractAuthUser: jest.fn(),
  };
});

jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '@smk/auth';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { PermissionsService } from '../permissions/permissions.service';

function buildContext(options: {
  reflector: Reflector;
  isPublic?: boolean;
  requiredRoles?: string[];
  userRoles?: string[];
}): ExecutionContext {
  return buildContextWithRequest(options).context;
}

function buildContextWithRequest(options: {
  reflector: Reflector;
  isPublic?: boolean;
  requiredRoles?: string[];
  userRoles?: string[];
}) {
  const { reflector, isPublic = false, requiredRoles, userRoles = [] } = options;

  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === IS_PUBLIC_KEY) return isPublic;
    if (key === ROLES_KEY) return requiredRoles;
    return undefined;
  });

  const user: Partial<AuthUser> | undefined =
    userRoles.length > 0
      ? { keycloakId: 'kc-user', roles: userRoles as AuthUser['roles'] }
      : undefined;
  const request = { user, url: '/test' };

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  const mockGetActivePositionCodes = jest.fn();

  beforeEach(async () => {
    mockGetActivePositionCodes.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        Reflector,
        { provide: PermissionsService, useValue: { getActivePositionCodes: mockGetActivePositionCodes } },
      ],
    }).compile();

    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
    jest.clearAllMocks();
  });

  it('@Public() endpoint returns true', async () => {
    const ctx = buildContext({ reflector, isPublic: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('endpoint tanpa @Roles() returns true', async () => {
    const ctx = buildContext({ reflector, requiredRoles: undefined, userRoles: ['GURU'] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('@Roles("SUPER_ADMIN") + user SUPER_ADMIN returns true', async () => {
    const ctx = buildContext({
      reflector,
      requiredRoles: ['SUPER_ADMIN'],
      userRoles: ['SUPER_ADMIN'],
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockGetActivePositionCodes).not.toHaveBeenCalled();
  });

  it('@Roles("SUPER_ADMIN") + user GURU rejects', async () => {
    const ctx = buildContext({
      reflector,
      requiredRoles: ['SUPER_ADMIN'],
      userRoles: ['GURU'],
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('@Roles("GURU", "TATA_USAHA") + user TATA_USAHA returns true', async () => {
    const ctx = buildContext({
      reflector,
      requiredRoles: ['GURU', 'TATA_USAHA'],
      userRoles: ['TATA_USAHA'],
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('@Roles("KEPALA_SEKOLAH") + active appointment returns true', async () => {
    mockGetActivePositionCodes.mockResolvedValue(new Set(['KEPALA_SEKOLAH']));
    const ctx = buildContext({
      reflector,
      requiredRoles: ['KEPALA_SEKOLAH'],
      userRoles: ['TATA_USAHA'],
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockGetActivePositionCodes).toHaveBeenCalledWith('kc-user');
  });

  it('adds matching active position code to request user roles for downstream service checks', async () => {
    mockGetActivePositionCodes.mockResolvedValue(new Set(['KEPALA_SEKOLAH']));
    const { context, request } = buildContextWithRequest({
      reflector,
      requiredRoles: ['GURU', 'KEPALA_SEKOLAH'],
      userRoles: ['GURU'],
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user?.roles).toEqual(expect.arrayContaining(['GURU', 'KEPALA_SEKOLAH']));
    expect(mockGetActivePositionCodes).toHaveBeenCalledWith('kc-user');
  });

  it('@Roles("WAKA_KURIKULUM") without active appointment rejects', async () => {
    mockGetActivePositionCodes.mockResolvedValue(new Set());
    const ctx = buildContext({
      reflector,
      requiredRoles: ['WAKA_KURIKULUM'],
      userRoles: ['GURU'],
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('@Roles() set + request.user undefined rejects', async () => {
    const ctx = buildContext({
      reflector,
      requiredRoles: ['SUPER_ADMIN'],
      userRoles: [],
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
