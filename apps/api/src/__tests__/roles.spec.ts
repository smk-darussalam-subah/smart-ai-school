// =============================================================================
// roles.spec.ts — Unit tests RolesGuard (SMA-35)
// Verifikasi: @Public() bypass, no @Roles() pass, correct role pass, wrong role 403
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
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { AuthUser } from '@smk/auth';

function buildContext(options: {
  reflector: Reflector;
  isPublic?: boolean;
  requiredRoles?: string[];
  userRoles?: string[];
}): ExecutionContext {
  const { reflector, isPublic = false, requiredRoles, userRoles = [] } = options;

  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === IS_PUBLIC_KEY) return isPublic;
    if (key === ROLES_KEY) return requiredRoles;
    return undefined;
  });

  const user: Partial<AuthUser> | undefined =
    userRoles.length > 0 ? { roles: userRoles as AuthUser['roles'] } : undefined;

  const mockRequest = { user, url: '/test' };

  return {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (SMA-35)', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
    jest.clearAllMocks();
  });

  it('@Public() endpoint → returns true (bypass roles check)', () => {
    const ctx = buildContext({ reflector, isPublic: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('endpoint tanpa @Roles() → returns true (any authenticated user OK)', () => {
    const ctx = buildContext({ reflector, isPublic: false, requiredRoles: undefined, userRoles: ['GURU'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('@Roles("SUPER_ADMIN") + user is SUPER_ADMIN → returns true', () => {
    const ctx = buildContext({
      reflector,
      requiredRoles: ['SUPER_ADMIN'],
      userRoles: ['SUPER_ADMIN'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('@Roles("SUPER_ADMIN") + user is GURU → throws ForbiddenException (403)', () => {
    const ctx = buildContext({
      reflector,
      requiredRoles: ['SUPER_ADMIN'],
      userRoles: ['GURU'],
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('@Roles("GURU", "TATA_USAHA") + user is TATA_USAHA → returns true (any listed role OK)', () => {
    const ctx = buildContext({
      reflector,
      requiredRoles: ['GURU', 'TATA_USAHA'],
      userRoles: ['TATA_USAHA'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('@Roles("SUPER_ADMIN") + user is SISWA → throws ForbiddenException (403)', () => {
    const ctx = buildContext({
      reflector,
      requiredRoles: ['SUPER_ADMIN'],
      userRoles: ['SISWA'],
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('@Roles() set + request.user undefined → ForbiddenException (edge case: token bypass)', () => {
    // userRoles: [] → buildContext sets user = undefined
    const ctx = buildContext({
      reflector,
      requiredRoles: ['SUPER_ADMIN'],
      userRoles: [],
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
