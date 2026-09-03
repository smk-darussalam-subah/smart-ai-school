// =============================================================================
// auth-guard.spec.ts — Integration tests untuk KeycloakGuard sebagai APP_GUARD
// FIX-T02: Verifikasi semua endpoint protected by default, @Public() opt-out bekerja
// =============================================================================

// Mock @smk/auth sebelum import apapun yang membutuhkannya
jest.mock('@smk/auth', () => ({
  verifyKeycloakToken: jest.fn(),
  extractAuthUser: jest.fn(),
}));

// Mock @smk/logger agar Winston tidak diinisialisasi saat test
jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { KeycloakGuard } from '../auth/guards/keycloak.guard';
import { UserStatusService } from '../auth/user-status.service';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { verifyKeycloakToken, extractAuthUser } from '@smk/auth';

function buildMockContext(options: {
  reflector: Reflector;
  authHeader?: string;
  isPublic?: boolean;
}): ExecutionContext {
  const { reflector, authHeader, isPublic = false } = options;

  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === IS_PUBLIC_KEY) return isPublic;
    return undefined;
  });

  const mockRequest = {
    headers: { authorization: authHeader },
    url: '/test',
  };

  return {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('KeycloakGuard — APP_GUARD Global Protection (FIX-T02)', () => {
  let guard: KeycloakGuard;
  let reflector: Reflector;
  const userStatus = {
    isBlocked: jest.fn(),
    getAuthorizationState: jest.fn(),
    invalidate: jest.fn(),
    invalidateAll: jest.fn(),
  };

  beforeEach(async () => {
    userStatus.isBlocked.mockReset().mockResolvedValue(false);
    userStatus.getAuthorizationState.mockReset().mockResolvedValue({
      blocked: false,
      primaryRole: 'GURU',
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [KeycloakGuard, Reflector, { provide: UserStatusService, useValue: userStatus }],
    }).compile();

    guard = module.get<KeycloakGuard>(KeycloakGuard);
    reflector = module.get<Reflector>(Reflector);
    jest.clearAllMocks();
  });

  it('protected endpoint tanpa Authorization header → throws UnauthorizedException (401)', async () => {
    const ctx = buildMockContext({ reflector, isPublic: false });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('@Public() endpoint tanpa Authorization header → returns true (200 diizinkan)', async () => {
    const ctx = buildMockContext({ reflector, isPublic: true });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('protected endpoint dengan Authorization header invalid → throws UnauthorizedException (401)', async () => {
    const ctx = buildMockContext({
      reflector,
      isPublic: false,
      authHeader: 'Bearer token-palsu',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('header Authorization tanpa prefix Bearer → throws UnauthorizedException (401)', async () => {
    const ctx = buildMockContext({
      reflector,
      isPublic: false,
      authHeader: 'Basic dXNlcjpwYXNz',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('token valid → user di-inject ke request, returns true (success path)', async () => {
    const mockPayload = {
      sub: 'kc-uuid-001',
      email: 'guru@smk.sch.id',
      preferred_username: 'guru1',
      realm_access: { roles: ['GURU'] },
      iat: 0,
      exp: 9_999_999_999,
      iss: 'http://localhost:8080/realms/diis',
    };
    const mockUser = {
      keycloakId: 'kc-uuid-001',
      email: 'guru@smk.sch.id',
      username: 'guru1',
      roles: ['GURU'],
      fullName: 'Guru Test',
    };

    (verifyKeycloakToken as jest.Mock).mockResolvedValue(mockPayload);
    (extractAuthUser as jest.Mock).mockReturnValue(mockUser);

    const ctx = buildMockContext({
      reflector,
      isPublic: false,
      authHeader: 'Bearer valid-token-abc',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    const request = ctx.switchToHttp().getRequest() as { user?: { roles: string[] } };
    expect(request.user?.roles).toEqual(['GURU']);
  });

  it('token valid tetap ditolak saat record aplikasi tidak tersedia', async () => {
    (verifyKeycloakToken as jest.Mock).mockResolvedValue({ sub: 'kc-orphan' });
    (extractAuthUser as jest.Mock).mockReturnValue({
      keycloakId: 'kc-orphan',
      username: 'orphan',
      roles: ['GURU'],
    });
    userStatus.getAuthorizationState.mockResolvedValue({ blocked: true, primaryRole: null });

    const ctx = buildMockContext({
      reflector,
      authHeader: 'Bearer valid-but-unmatched',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(userStatus.getAuthorizationState).toHaveBeenCalledWith('kc-orphan');
  });

  it('token SUPER_ADMIN lama dinormalisasi ke role database terkini', async () => {
    (verifyKeycloakToken as jest.Mock).mockResolvedValue({ sub: 'kc-demoted' });
    (extractAuthUser as jest.Mock).mockReturnValue({
      keycloakId: 'kc-demoted',
      username: 'demoted',
      roles: ['SUPER_ADMIN'],
    });
    userStatus.getAuthorizationState.mockResolvedValue({
      blocked: false,
      primaryRole: 'GURU',
    });
    const context = buildMockContext({
      reflector,
      authHeader: 'Bearer stale-super-admin-token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest() as { user?: { roles: string[] } };
    expect(request.user?.roles).toEqual(['GURU']);
  });
});
