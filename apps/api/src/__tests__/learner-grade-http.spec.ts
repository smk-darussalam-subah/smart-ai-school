import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AuthUser, UserRole } from '@smk/auth';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../permissions/permissions.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { GradeController } from '../grade/grade.controller';
import { GradeService } from '../grade/grade.service';
import { KktpConfigController } from '../kktp-config/kktp-config.controller';
import { KktpConfigService } from '../kktp-config/kktp-config.service';

describe('R08 grade HTTP permission is bound to authoritative persona', () => {
  let app: NestFastifyApplication;
  let actor: AuthUser | undefined;
  let primary: UserRole | null;
  let grants: Set<string>;
  let positions: Set<string>;
  const kktp = {
    remove: jest.fn(async (subject: string, academicYear: string, semester: number) => ({
      subject,
      academicYear,
      semester,
    })),
  };
  const service = {
    findAll: jest.fn(async () => ({ data: [], total: 0, page: 1, limit: 20 })),
    create: jest.fn(),
    update: jest.fn(),
  };
  const permissions = {
    getAuthoritativePrimaryRole: jest.fn(async () => primary),
    getActivePositionCodes: jest.fn(async () => positions),
    hasPermission: jest.fn(
      async (_id: string, _roles: UserRole[], permission: string) =>
        grants.has('*') || grants.has(permission),
    ),
  };
  function login(role: UserRole, values: string[]) {
    actor = {
      keycloakId: 'synthetic-' + role,
      username: 'synthetic',
      email: 'qa@fixtures.invalid',
      fullName: 'Synthetic',
      roles: [role],
    };
    primary = role === 'KEPALA_SEKOLAH' ? 'GURU' : role;
    positions = new Set(role === 'KEPALA_SEKOLAH' ? ['KEPALA_SEKOLAH'] : []);
    grants = new Set(values);
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GradeController, KktpConfigController],
      providers: [
        { provide: GradeService, useValue: service },
        { provide: PermissionsService, useValue: permissions },
        { provide: KktpConfigService, useValue: kktp },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    const reflector = app.get(Reflector);
    app.useGlobalGuards(
      {
        canActivate(context) {
          context.switchToHttp().getRequest<{ user?: AuthUser }>().user = actor;
          return true;
        },
      },
      new PermissionGuard(reflector, permissions as unknown as PermissionsService),
      new RolesGuard(reflector, permissions as unknown as PermissionsService),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    login('SISWA', ['grade.own.read']);
  });
  const request = (method: 'GET' | 'POST' | 'PATCH' = 'GET') =>
    app.inject({
      method,
      url: method === 'PATCH' ? '/grades/11111111-1111-4111-8111-111111111111' : '/grades',
    });
  it('R10 actual Fastify route decodes the once-encoded year for the real KKTP DTO', async () => {
    login('SUPER_ADMIN', ['academic.grade.manage']);
    const response = await app.inject({
      method: 'DELETE',
      url: '/kktp-config/Bahasa%20Jawa/2026%2F2027/1',
    });
    expect(response.statusCode).toBe(200);
    expect(kktp.remove).toHaveBeenCalledWith('Bahasa Jawa', '2026/2027', 1);
  });
  it('R10 double-encoded literal percent is not mistaken for a valid academic year', async () => {
    login('SUPER_ADMIN', ['academic.grade.manage']);
    expect(
      (await app.inject({ method: 'DELETE', url: '/kktp-config/Matematika/2026%252F2027/1' }))
        .statusCode,
    ).toBe(400);
    expect(kktp.remove).not.toHaveBeenCalled();
  });
  it('R10 learner read permission still cannot delete KKTP through the encoded path', async () => {
    expect(
      (await app.inject({ method: 'DELETE', url: '/kktp-config/Matematika/2026%2F2027/1' }))
        .statusCode,
    ).toBe(403);
    expect(kktp.remove).not.toHaveBeenCalled();
  });
  it.each([
    ['SISWA', 'grade.own.read'],
    ['ORANG_TUA', 'grade.child.read'],
    ['GURU', 'academic.grade.read'],
    ['KEPALA_SEKOLAH', 'academic.grade.read'],
    ['TATA_USAHA', 'academic.grade.read'],
    ['SUPER_ADMIN', '*'],
  ] as const)('%s keeps legitimate read access', async (role, permission) => {
    login(role, [permission]);
    expect((await request()).statusCode).toBe(200);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ roles: expect.arrayContaining([role]) }),
    );
  });
  it.each([
    ['SISWA', ['grade.child.read', 'academic.grade.read']],
    ['ORANG_TUA', ['grade.own.read', 'academic.grade.read']],
    ['GURU', ['grade.own.read', 'grade.child.read']],
    ['KEPALA_SEKOLAH', ['grade.own.read', 'grade.child.read']],
    ['TATA_USAHA', ['grade.own.read', 'grade.child.read']],
  ] as const)('%s cannot substitute another persona permission', async (role, values) => {
    login(role, [...values]);
    expect((await request()).statusCode).toBe(403);
    expect(service.findAll).not.toHaveBeenCalled();
  });
  it.each(['SISWA', 'ORANG_TUA', 'GURU', 'TATA_USAHA'] as const)(
    '%s denied when required permission is absent',
    async (role) => {
      login(role, []);
      expect((await request()).statusCode).toBe(403);
      expect(service.findAll).not.toHaveBeenCalled();
    },
  );
  it('stale token learner persona does not bypass staff permission', async () => {
    login('GURU', ['grade.own.read']);
    if (actor) actor.roles = ['SISWA'];
    expect((await request()).statusCode).toBe(403);
    expect(service.findAll).not.toHaveBeenCalled();
  });
  it('inactive account is denied', async () => {
    primary = null;
    expect((await request()).statusCode).toBe(403);
    expect(service.findAll).not.toHaveBeenCalled();
  });
  it('missing actor is denied', async () => {
    actor = undefined;
    expect((await request()).statusCode).toBe(403);
    expect(service.findAll).not.toHaveBeenCalled();
  });
  it('industry is denied even with learner grants', async () => {
    login('INDUSTRI', ['grade.own.read']);
    expect((await request()).statusCode).toBe(403);
    expect(service.findAll).not.toHaveBeenCalled();
  });
  it.each(['SISWA', 'ORANG_TUA'] as const)('%s read does not authorize writes', async (role) => {
    login(role, [role === 'SISWA' ? 'grade.own.read' : 'grade.child.read']);
    expect((await request('POST')).statusCode).toBe(403);
    expect((await request('PATCH')).statusCode).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });
});
