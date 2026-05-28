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
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KeycloakGuard, Reflector],
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
});
