import 'reflect-metadata';
import { Controller, ExecutionContext, Get, Post } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { extractAuthUser, verifyKeycloakToken, UserRole } from '@smk/auth';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { SseTokenService } from '../auth/sse-token.service';
import { KeycloakGuard } from '../auth/guards/keycloak.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserStatusService } from '../auth/user-status.service';
import { Public } from '../auth/decorators/public.decorator';
import { BellScheduleController } from '../bell-schedule/bell-schedule.controller';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { PositionsController } from '../positions/positions.controller';
import { PositionsService } from '../positions/positions.service';
import { SchoolConfigController } from '../school-config/school-config.controller';
import { SchoolConfigService } from '../school-config/school-config.service';
import { StudentDashboardController } from '../student-dashboard/student-dashboard.controller';
import { PermissionGuard } from '../permissions/permissions.guard';
import { PermissionsService } from '../permissions/permissions.service';
import {
  AuthenticatedThrottlerGuard,
  PreAuthThrottlerGuard,
  SharedReadBudget,
} from '../common/guards/api-throttler.guard';

// Only signature verification/extraction and persistence are synthetic. Actual
// global guard order, controllers, metadata, DTO validation and HTTP adapter run.
jest.mock('@smk/auth', () => ({
  ...jest.requireActual('@smk/auth'),
  verifyKeycloakToken: jest.fn(),
  extractAuthUser: jest.fn(),
}));
jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

@Controller('budget-proof')
class ProbeController {
  @Get('ordinary') ordinary() {
    return true;
  }
  @SharedReadBudget() @Get('read') read() {
    return true;
  }
  @SharedReadBudget() @Post('mutation') mutation() {
    return true;
  }
  @Public() @SharedReadBudget() @Get('public') publicRead() {
    return true;
  }
}

function context(handler: () => unknown, method = 'GET'): ExecutionContext {
  return {
    getClass: () => ProbeController,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        ip: 'shared-web-peer',
        headers: { 'x-shared-read-budget': '6000', 'x-forwarded-for': 'spoofed' },
      }),
      getResponse: () => ({ header: jest.fn() }),
    }),
  } as unknown as ExecutionContext;
}

describe('explicit shared bootstrap budgets', () => {
  it.each([
    {
      name: 'ordinary read',
      handler: ProbeController.prototype.ordinary,
      method: 'GET',
      limit: 1200,
    },
    {
      name: 'selected authenticated GET',
      handler: ProbeController.prototype.read,
      method: 'GET',
      limit: 6000,
    },
    {
      name: 'mutation incorrectly marked as read',
      handler: ProbeController.prototype.mutation,
      method: 'POST',
      limit: 1200,
    },
    {
      name: 'public catalog incorrectly marked as read',
      handler: ProbeController.prototype.publicRead,
      method: 'GET',
      limit: 1200,
    },
  ])(
    '$name retains a bounded and metadata-selected ceiling',
    async ({ handler, method, limit }) => {
      const storage = new ThrottlerStorageService();
      const guard = new PreAuthThrottlerGuard(
        [{ name: 'default', ttl: 60000, limit: 240 }],
        storage,
        new Reflector(),
      );
      await guard.onModuleInit();
      try {
        for (let i = 0; i < limit; i++) await guard.canActivate(context(handler, method));
        await expect(guard.canActivate(context(handler, method))).rejects.toMatchObject({
          status: 429,
        });
      } finally {
        await storage.onApplicationShutdown();
      }
    },
  );

  it('applies only to the reviewed bootstrap handlers and leaves public active semester unchanged', () => {
    const handlers = [
      AuthController.prototype.getMe,
      PositionsController.prototype.myPositions,
      SchoolConfigController.prototype.getSemesters,
      BellScheduleController.prototype.catalog,
      BellScheduleController.prototype.resolve,
      StudentDashboardController.prototype.getSpp,
      StudentDashboardController.prototype.getAssignments,
      StudentDashboardController.prototype.getCpProgress,
      StudentDashboardController.prototype.getLeaderboard,
    ];
    const key = 'diis:shared-read-budget';
    for (const handler of handlers) expect(Reflect.getMetadata(key, handler)).toBe(true);
    for (const handler of [
      AuthController.prototype.updateMe,
      AuthController.prototype.recordConsent,
      SchoolConfigController.prototype.getActiveSemester,
      BellScheduleController.prototype.list,
    ])
      expect(Reflect.getMetadata(key, handler)).toBeUndefined();
  });
});

describe('mixed roles through actual bootstrap controllers and global guards', () => {
  let app: NestFastifyApplication;
  let storage: ThrottlerStorageService;
  const users = new Map<string, UserRole>();
  const permissions = {
    getAuthoritativePrimaryRole: async (id: string) => users.get(id) ?? null,
    getActivePositionCodes: async () => new Set<UserRole>(),
    hasPermission: async (id: string) => users.has(id) && id !== 'denied',
  };
  const status = {
    getAuthorizationState: async (id: string) => ({
      blocked: id === 'disabled',
      primaryRole: users.get(id) ?? null,
    }),
  };
  const services = {
    getMe: jest.fn(async (id: string, roles: UserRole[]) => ({ keycloakId: id, roles })),
    getMyPositions: jest.fn(async () => ({ positions: [] })),
    getSemesters: jest.fn(async () => []),
    timingCatalog: jest.fn(async () => ({ profiles: [], periods: [] })),
    resolveForDate: jest.fn(async () => null),
  };
  beforeEach(async () => {
    jest.clearAllMocks();
    users.clear();
    for (let i = 0; i < 730; i++)
      users.set(`account-${i}`, i < 350 ? 'SISWA' : i < 700 ? 'ORANG_TUA' : 'GURU');
    users.set('denied', 'GURU');
    users.set('disabled', 'SISWA');
    jest.mocked(verifyKeycloakToken).mockImplementation(async (token) => {
      if (!users.has(token)) throw new Error('synthetic invalid signature');
      return { sub: token } as Awaited<ReturnType<typeof verifyKeycloakToken>>;
    });
    jest.mocked(extractAuthUser).mockImplementation((payload) => ({
      keycloakId: payload.sub,
      username: 'synthetic',
      email: 'qa@example.invalid',
      fullName: 'Synthetic account',
      roles: ['SUPER_ADMIN'],
    }));
    const module = await Test.createTestingModule({
      controllers: [
        AuthController,
        PositionsController,
        SchoolConfigController,
        BellScheduleController,
      ],
      providers: [
        { provide: AuthService, useValue: services },
        { provide: SseTokenService, useValue: {} },
        { provide: PositionsService, useValue: services },
        { provide: SchoolConfigService, useValue: services },
        { provide: BellScheduleService, useValue: services },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    storage = new ThrottlerStorageService();
    const reflector = new Reflector(),
      options = [{ name: 'default', ttl: 60000, limit: 240 }];
    const pre = new PreAuthThrottlerGuard(options, storage, reflector);
    const perUser = new AuthenticatedThrottlerGuard(options, storage, reflector);
    await pre.onModuleInit();
    await perUser.onModuleInit();
    app.useGlobalGuards(
      pre,
      new KeycloakGuard(reflector, status as unknown as UserStatusService),
      perUser,
      new PermissionGuard(reflector, permissions as unknown as PermissionsService),
      new RolesGuard(reflector, permissions as unknown as PermissionsService),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterEach(async () => {
    await app.close();
    await storage.onApplicationShutdown();
  });

  it('admits730 different identities making four bootstrap reads each, without sharing their user quotas', async () => {
    const http = app.getHttpAdapter().getInstance();
    for (let round = 0; round < 4; round++) {
      const responses = await Promise.all(
        Array.from({ length: 730 }, (_, i) =>
          http.inject({
            method: 'GET',
            url: '/auth/me',
            headers: { authorization: `Bearer account-${i}` },
          }),
        ),
      );
      expect(responses.every((r) => r.statusCode === 200)).toBe(true);
      expect(responses[0]!.json()).toMatchObject({ keycloakId: 'account-0', roles: ['SISWA'] });
      expect(responses[400]!.json()).toMatchObject({
        keycloakId: 'account-400',
        roles: ['ORANG_TUA'],
      });
      expect(responses[720]!.json()).toMatchObject({ keycloakId: 'account-720', roles: ['GURU'] });
    }
    expect(services.getMe).toHaveBeenCalledTimes(2920);
  });

  it('still denies missing/invalid/disabled identity and revoked permission before service reads', async () => {
    const http = app.getHttpAdapter().getInstance();
    for (const authorization of [undefined, 'Bearer invalid', 'Bearer disabled']) {
      const response = await http.inject({
        method: 'GET',
        url: '/auth/me',
        headers: authorization ? { authorization } : { 'x-forwarded-user': 'account-0' },
      });
      expect(response.statusCode).toBe(401);
    }
    expect(services.getMe).not.toHaveBeenCalled();
    const denied = await http.inject({
      method: 'GET',
      url: '/bell-schedules/catalog',
      headers: { authorization: 'Bearer denied' },
    });
    expect(denied.statusCode).toBe(403);
    expect(services.timingCatalog).not.toHaveBeenCalled();
  });

  it('keeps per-account240 and validates a selected query before database work', async () => {
    const http = app.getHttpAdapter().getInstance();
    for (let i = 0; i < 240; i++)
      expect(
        (
          await http.inject({
            method: 'GET',
            url: '/auth/me',
            headers: { authorization: 'Bearer account-0', 'x-forwarded-for': `192.0.2.${i}` },
          })
        ).statusCode,
      ).toBe(200);
    expect(
      (
        await http.inject({
          method: 'GET',
          url: '/auth/me',
          headers: { authorization: 'Bearer account-0', 'x-forwarded-for': '203.0.113.99' },
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (
        await http.inject({
          method: 'GET',
          url: '/auth/me',
          headers: { authorization: 'Bearer account-1' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await http.inject({
          method: 'GET',
          url: '/school/semesters?academicYearId=invalid',
          headers: { authorization: 'Bearer account-1' },
        })
      ).statusCode,
    ).toBe(400);
    expect(services.getSemesters).not.toHaveBeenCalled();
    expect(
      (
        await http.inject({
          method: 'GET',
          url: '/school/semesters',
          headers: { authorization: 'Bearer account-1' },
        })
      ).statusCode,
    ).toBe(200);
    expect(services.getSemesters).toHaveBeenCalledWith(undefined);
  });
});
