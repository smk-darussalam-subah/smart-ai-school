import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AuthUser, UserRole } from '@smk/auth';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../permissions/permissions.guard';
import { REQUIRED_PERMISSION_KEY } from '../permissions/decorators/require-permission.decorator';
import { PermissionsService } from '../permissions/permissions.service';
import { ScheduleController } from '../schedule/schedule.controller';
import { ScheduleService } from '../schedule/schedule.service';

describe('learner timetable HTTP authorization and strict DTO boundary', () => {
  let app: NestFastifyApplication;
  let actor: AuthUser | undefined;
  let authoritativeRole: UserRole | null;
  let grants: Set<string>;
  const service = { findAll: jest.fn(async () => ({ data: [], total: 0, page: 1, limit: 100 })), create: jest.fn() };
  const permissions = {
    getAuthoritativePrimaryRole: jest.fn(async () => authoritativeRole),
    getActivePositionCodes: jest.fn(async () => new Set<string>()),
    hasPermission: jest.fn(async (_id: string, _roles: UserRole[], permission: string) => grants.has(permission)),
  };
  const login = (role: UserRole, permission?: string) => {
    actor = { keycloakId: 'qa-' + role, username: 'qa', email: 'qa@fixtures.invalid', fullName: 'QA', roles: [role] };
    authoritativeRole = role;
    grants = new Set(permission ? [permission] : []);
  };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ScheduleController], providers: [
      { provide: ScheduleService, useValue: service },
      { provide: PermissionsService, useValue: permissions },
    ] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    const reflector = app.get(Reflector);
    const permissionService = permissions as unknown as PermissionsService;
    app.useGlobalGuards(
      { canActivate(context) { context.switchToHttp().getRequest<{ user?: AuthUser }>().user = actor; return true; } },
      new PermissionGuard(reflector, permissionService), new RolesGuard(reflector, permissionService),
    );
    await app.init(); await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { jest.clearAllMocks(); login('SISWA', 'student.own.read'); });
  const request = (url: string, method: 'GET' | 'POST' = 'GET') => app.getHttpAdapter().getInstance().inject({ method, url });

  it.each([['SISWA', 'student.own.read'], ['ORANG_TUA', 'student.child.read'], ['GURU', 'academic.schedule.read']] as const)('%s with its existing read permission is accepted without new global grants', async (role, permission) => {
      login(role, permission);
      expect((await request('/schedules?limit=100')).statusCode).toBe(200);
      expect(permissions.hasPermission).toHaveBeenLastCalledWith(actor?.keycloakId, [role], permission);
      expect(service.findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }), expect.objectContaining({ roles: [role] }));
    });
  it.each(['SISWA', 'ORANG_TUA'] as const)('%s with permission withdrawn is denied', async (role) => {
    login(role); expect((await request('/schedules')).statusCode).toBe(403); expect(service.findAll).not.toHaveBeenCalled();
  });
  it.each([
    ['SISWA', ['student.child.read', 'academic.schedule.read']],
    ['ORANG_TUA', ['student.own.read', 'academic.schedule.read']],
    ['GURU', ['student.own.read', 'student.child.read']],
  ] as const)('%s cannot replace its revoked read permission with cross-role grants', async (role, otherPermissions) => {
    login(role);
    grants = new Set(otherPermissions);
    expect((await request('/schedules?limit=100')).statusCode).toBe(403);
    expect(service.findAll).not.toHaveBeenCalled();
  });
  it('stale token learner roles cannot change the authoritative staff permission', async () => {
    login('GURU', 'student.own.read');
    actor = actor ? { ...actor, roles: ['SISWA', 'ORANG_TUA'] } : undefined;
    expect((await request('/schedules')).statusCode).toBe(403);
    expect(permissions.hasPermission).toHaveBeenLastCalledWith(actor?.keycloakId, ['GURU'], 'academic.schedule.read');
    expect(service.findAll).not.toHaveBeenCalled();
  });
  it.each(['SISWA', 'ORANG_TUA'] as const)('%s with an active KAPROG scope cannot replace academic permission with learner grants', async (role) => {
    login(role, role === 'SISWA' ? 'student.own.read' : 'student.child.read');
    permissions.getActivePositionCodes.mockResolvedValueOnce(new Set(['KAPROG']));
    expect((await request('/schedules')).statusCode).toBe(403);
    expect(permissions.hasPermission).toHaveBeenLastCalledWith(actor?.keycloakId, [role, 'KAPROG'], 'academic.schedule.read');
    expect(service.findAll).not.toHaveBeenCalled();
  });
  it.each(['GURU', 'SISWA', 'ORANG_TUA'] as const)('%s active KAPROG scope retains its academic read permission and service persona', async (role) => {
    login(role, 'academic.schedule.read');
    permissions.getActivePositionCodes.mockResolvedValueOnce(new Set(['KAPROG']));
    expect((await request('/schedules')).statusCode).toBe(200);
    expect(permissions.hasPermission).toHaveBeenLastCalledWith(actor?.keycloakId, [role, 'KAPROG'], 'academic.schedule.read');
    expect(service.findAll).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ roles: [role, 'KAPROG'] }));
  });
  it('inactive authoritative account is denied even with stale role and read grant', async () => {
    authoritativeRole = null; expect((await request('/schedules')).statusCode).toBe(403); expect(service.findAll).not.toHaveBeenCalled();
  });
  it('missing authenticated actor is denied', async () => {
    actor = undefined; expect((await request('/schedules')).statusCode).toBe(403); expect(service.findAll).not.toHaveBeenCalled();
  });
  it('unsupported studentId remains rejected, not silently ignored', async () => {
    expect((await request('/schedules?studentId=11111111-1111-4111-8111-111111111111&limit=100')).statusCode).toBe(400);
    expect(service.findAll).not.toHaveBeenCalled();
  });
  it('negative control reproduces legacy403 without changing user grants', async () => {
    const handler = ScheduleController.prototype.findAll;
    const reviewed = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler) as unknown;
    try {
      Reflect.defineMetadata(REQUIRED_PERMISSION_KEY, 'academic.schedule.read', handler);
      expect((await request('/schedules?limit=100')).statusCode).toBe(403);
      expect(service.findAll).not.toHaveBeenCalled();
    } finally {
      Reflect.defineMetadata(REQUIRED_PERMISSION_KEY, reviewed, handler);
    }
    expect((await request('/schedules?limit=100')).statusCode).toBe(200);
  });
  it('parent class selector is accepted by strict request DTO', async () => {
    login('ORANG_TUA', 'student.child.read');
    expect((await request('/schedules?classId=11111111-1111-4111-8111-111111111111&limit=100')).statusCode).toBe(200);
    expect(service.findAll).toHaveBeenCalledWith(expect.objectContaining({ classId: '11111111-1111-4111-8111-111111111111' }), expect.any(Object));
  });
  it.each(['SISWA', 'ORANG_TUA'] as const)('%s read permission does not allow schedule writes', async (role) => {
    login(role, role === 'SISWA' ? 'student.own.read' : 'student.child.read');
    expect((await request('/schedules', 'POST')).statusCode).toBe(403); expect(service.create).not.toHaveBeenCalled();
  });
  it('industry cannot use a learner permission override to bypass role boundary', async () => {
    login('INDUSTRI', 'student.own.read'); expect((await request('/schedules')).statusCode).toBe(403);
    expect(service.findAll).not.toHaveBeenCalled();
  });
});
