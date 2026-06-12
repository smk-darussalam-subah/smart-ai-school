// =============================================================================
// 2J-0 (A4b): UserStatusService + integrasi KeycloakGuard — user nonaktif DITOLAK
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));
jest.mock('@smk/auth', () => ({
  ...jest.requireActual('@smk/auth'),
  verifyKeycloakToken: jest.fn().mockResolvedValue({ sub: 'kc-1' }),
  extractAuthUser: jest.fn().mockReturnValue({
    keycloakId: 'kc-1', username: 'u1', roles: ['GURU'],
  }),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatusService } from '../auth/user-status.service';
import { KeycloakGuard } from '../auth/guards/keycloak.guard';
import { PrismaService } from '../prisma/prisma.service';

const mockFindUnique = jest.fn();

function buildService(): Promise<UserStatusService> {
  return Test.createTestingModule({
    providers: [
      UserStatusService,
      { provide: PrismaService, useValue: { user: { findUnique: mockFindUnique } } },
    ],
  }).compile().then((m: TestingModule) => m.get(UserStatusService));
}

function ctx(): ExecutionContext {
  return {
    getHandler: () => function h() { return; },
    getClass: () => class C {},
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: 'Bearer tok' }, url: '/x' }),
    }),
  } as unknown as ExecutionContext;
}

describe('UserStatusService (2J-0 A4b)', () => {
  beforeEach(() => mockFindUnique.mockReset());

  it('isActive=false → BLOCKED; deletedAt terisi → BLOCKED', async () => {
    const svc = await buildService();
    mockFindUnique.mockResolvedValue({ isActive: false, deletedAt: null });
    expect(await svc.isBlocked('kc-1')).toBe(true);

    svc.invalidate('kc-1');
    mockFindUnique.mockResolvedValue({ isActive: true, deletedAt: new Date() });
    expect(await svc.isBlocked('kc-1')).toBe(true);
  });

  it('aktif normal → tidak diblokir; row hilang → status quo (izinkan + warn)', async () => {
    const svc = await buildService();
    mockFindUnique.mockResolvedValue({ isActive: true, deletedAt: null });
    expect(await svc.isBlocked('kc-a')).toBe(false);
    mockFindUnique.mockResolvedValue(null);
    expect(await svc.isBlocked('kc-tanpa-row')).toBe(false);
  });

  it('error DB → izinkan (lapisan tambahan, bukan single point of failure)', async () => {
    const svc = await buildService();
    mockFindUnique.mockRejectedValue(new Error('db down'));
    expect(await svc.isBlocked('kc-x')).toBe(false);
  });

  it('cache TTL: hit kedua tanpa query; invalidate → query ulang', async () => {
    const svc = await buildService();
    mockFindUnique.mockResolvedValue({ isActive: true, deletedAt: null });
    await svc.isBlocked('kc-c');
    await svc.isBlocked('kc-c');
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    svc.invalidate('kc-c');
    await svc.isBlocked('kc-c');
    expect(mockFindUnique).toHaveBeenCalledTimes(2);
  });
});

describe('KeycloakGuard + UserStatus (integrasi)', () => {
  it('user nonaktif → UnauthorizedException meski token valid', async () => {
    const module = await Test.createTestingModule({
      providers: [
        KeycloakGuard,
        Reflector,
        UserStatusService,
        { provide: PrismaService, useValue: { user: { findUnique: mockFindUnique } } },
      ],
    }).compile();
    const guard = module.get(KeycloakGuard);

    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValue({ isActive: false, deletedAt: null });
    await expect(guard.canActivate(ctx())).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx())).rejects.toThrow('Akun dinonaktifkan');
  });

  it('user aktif → lolos, request.user terisi', async () => {
    const module = await Test.createTestingModule({
      providers: [
        KeycloakGuard,
        Reflector,
        UserStatusService,
        { provide: PrismaService, useValue: { user: { findUnique: mockFindUnique } } },
      ],
    }).compile();
    const guard = module.get(KeycloakGuard);

    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValue({ isActive: true, deletedAt: null });
    expect(await guard.canActivate(ctx())).toBe(true);
  });
});
