import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ClassSessionController } from '../class-sessions/class-session.controller';
import { ClassSessionService } from '../class-sessions/class-session.service';
import { ClassSessionDueService } from '../class-sessions/class-session-due.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../permissions/permissions.guard';
import { PermissionsService } from '../permissions/permissions.service';

describe('manual session HTTP role/permission and confirmation boundary', () => {
  let app: NestFastifyApplication;
  const materialize = jest.fn().mockResolvedValue({ date: '2026-10-20', newCount: 1 });
  const activationStatus = jest.fn().mockResolvedValue({ enabled: false });
  const disableActivation = jest.fn().mockResolvedValue({ enabled: false, revision: 2 });
  const actors: Record<string, { primary: string; positions: string[]; permission: boolean }> = {
    admin: { primary: 'SUPER_ADMIN', positions: [], permission: true },
    tu: { primary: 'TATA_USAHA', positions: [], permission: true },
    waka: { primary: 'GURU', positions: ['WAKA_KURIKULUM'], permission: true },
    principal: { primary: 'GURU', positions: ['KEPALA_SEKOLAH'], permission: true },
    guru: { primary: 'GURU', positions: [], permission: true },
    siswa: { primary: 'SISWA', positions: [], permission: true },
    parent: { primary: 'ORANG_TUA', positions: [], permission: true },
    industry: { primary: 'INDUSTRI', positions: [], permission: true },
    denied: { primary: 'TATA_USAHA', positions: [], permission: false },
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ClassSessionController],
      providers: [
        {
          provide: ClassSessionService,
          useValue: { materialize, activationStatus, disableActivation },
        },
        { provide: ClassSessionDueService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    const permissions = {
      getAuthoritativePrimaryRole: async (id: string) => actors[id]?.primary ?? null,
      getActivePositionCodes: async (id: string) => new Set(actors[id]?.positions ?? []),
      hasPermission: async (id: string) => actors[id]?.permission ?? false,
    } as unknown as PermissionsService;
    const reflector = new Reflector();
    app.useGlobalGuards(
      {
        canActivate(context: ExecutionContext) {
          const req = context
            .switchToHttp()
            .getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
          const key = req.headers['x-fixture'];
          if (key) req.user = { keycloakId: key, roles: ['SUPER_ADMIN'] } as AuthUser;
          return true;
        },
      },
      new RolesGuard(reflector, permissions),
      new PermissionGuard(reflector, permissions),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => materialize.mockClear());
  it.each(Object.keys(actors))(
    'activation routes enforce %s role and schedule permission',
    async (actor) => {
      const allowed = ['admin', 'tu', 'waka'].includes(actor);
      for (const route of [
        { method: 'GET' as const, url: '/class-sessions/activation' },
        { method: 'GET' as const, url: '/class-sessions/activation/preparation?date=2026-10-20' },
        {
          method: 'POST' as const,
          url: '/class-sessions/activation/enable',
          payload: { date: '2026-10-20', planHash: 'a'.repeat(64) },
        },
        {
          method: 'POST' as const,
          url: '/class-sessions/activation/disable',
          payload: { semesterId: '10000000-0000-4000-8000-000000000001', revision: 1 },
        },
      ]) {
        const result = await app.inject({ ...route, headers: { 'x-fixture': actor } });
        expect(result.statusCode).toBe(allowed ? (route.method === 'GET' ? 200 : 201) : 403);
      }
    },
  );
  it.each([
    { revision: 0 },
    { revision: 1, force: true },
    { revision: 1.5 },
    { revision: 2147483647 },
  ])('rejects invalid opt-out CAS %#', async (value) => {
    const response = await app.inject({
      method: 'POST',
      url: '/class-sessions/activation/disable',
      headers: { 'x-fixture': 'admin' },
      payload: { semesterId: '10000000-0000-4000-8000-000000000001', ...value },
    });
    expect(response.statusCode).toBe(400);
  });
  it.each(Object.keys(actors))(
    'uses authoritative %s role/appointment, never the fixture claimed role',
    async (actor) => {
      const allowed = ['admin', 'tu', 'waka'].includes(actor);
      for (const method of ['GET', 'POST'] as const) {
        const result = await app.inject({
          method,
          url:
            method === 'GET'
              ? '/class-sessions/preparation?date=2026-10-20'
              : '/class-sessions/materialize',
          headers: { 'x-fixture': actor },
          ...(method === 'POST'
            ? { payload: { date: '2026-10-20', planHash: 'a'.repeat(64) } }
            : {}),
        });
        expect(result.statusCode).toBe(allowed ? (method === 'POST' ? 201 : 200) : 403);
      }
      expect(materialize).toHaveBeenCalledTimes(allowed ? 2 : 0);
    },
  );
  it('rejects missing identity, impossible date, unbound commit and unknown force option', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/class-sessions/preparation?date=2026-10-20' }))
        .statusCode,
    ).toBe(403);
    for (const url of [
      '/class-sessions/preparation?date=2026-02-30',
      '/class-sessions/preparation?date=2026-10-20&force=true',
    ]) {
      expect(
        (await app.inject({ method: 'GET', url, headers: { 'x-fixture': 'admin' } })).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/class-sessions/materialize',
          payload: { date: '2026-10-20' },
          headers: { 'x-fixture': 'admin' },
        })
      ).statusCode,
    ).toBe(400);
    expect(materialize).not.toHaveBeenCalled();
  });
});
