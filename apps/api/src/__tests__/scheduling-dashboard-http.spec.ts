import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AuthUser, UserRole } from '@smk/auth';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../permissions/permissions.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { AnalyticsController } from '../analytics/analytics.controller';
import { AnalyticsService, StudentAnalyticsService } from '../analytics/analytics.service';
describe('real monitoring controller and authorization guards, in-process HTTP only', () => {
  let app: NestFastifyApplication, actor: AuthUser | undefined, primary: UserRole | null;
  let positions: Set<string>, grants: Set<string>;
  const service = {
    monitoringKbm: jest.fn(async () => ({ state: 'ready', data: [] })),
    teacherCompliance: jest.fn(async () => ({})),
    cpProgress: jest.fn(async () => ({ mapelProgress: [], cpBreakdown: [] })),
  };
  const studentService = {
    attendanceStats: jest.fn(async () => ({ data: [] })),
    studentGrades: jest.fn(async () => ({ data: [] })),
  };
  const permissions = {
    getAuthoritativePrimaryRole: jest.fn(async () => primary),
    getActivePositionCodes: jest.fn(async () => positions),
    hasPermission: jest.fn(async (_id: string, _roles: UserRole[], p: string) => grants.has(p)),
    getEffectivePermissions: jest.fn(async () => grants),
  };
  const login = (role: UserRole, codes: string[] = []) => {
    primary = role;
    actor = {
      keycloakId: 'synthetic',
      username: 'QA',
      fullName: 'QA Synth',
      email: 'qa@fixtures.invalid',
      roles: [role],
    };
    positions = new Set(codes);
    grants = new Set(['academic.grade.read']);
  };
  const get = (url = '/analytics/monitoring-kbm?academicYear=2026%2F2027&semester=1') =>
    app.getHttpAdapter().getInstance().inject({ method: 'GET', url });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: service },
        { provide: StudentAnalyticsService, useValue: studentService },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    const reflector = app.get(Reflector),
      ps = permissions as unknown as PermissionsService;
    app.useGlobalGuards(
      {
        canActivate(context) {
          context.switchToHttp().getRequest<{ user?: AuthUser }>().user = actor;
          return true;
        },
      },
      new PermissionGuard(reflector, ps),
      new RolesGuard(reflector, ps),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    login('SUPER_ADMIN');
  });
  it.each(['SUPER_ADMIN', 'GURU'] as const)(
    '%s needs existing scope; KS appointment grants role but not unrelated domains',
    async (role) => {
      login(role, role === 'GURU' ? ['KEPALA_SEKOLAH'] : []);
      expect((await get()).statusCode).toBe(200);
      expect(service.monitoringKbm).toHaveBeenCalledWith(
        expect.objectContaining({ academicYear: '2026/2027', semester: 1 }),
        expect.any(Date),
        {
          assignments: false,
          attendance: false,
          journal: false,
          schedules: false,
          sessions: false,
          lms: false,
        },
      );
    },
  );
  it.each(['TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI'] as const)(
    '%s without KS appointment cannot open school-wide analytics even with grade permission',
    async (role) => {
      login(role);
      expect((await get()).statusCode).toBe(403);
      expect(service.monitoringKbm).not.toHaveBeenCalled();
    },
  );
  it.each(['WAKA_KURIKULUM', 'KAPROG'])(
    '%s does not gain a new school-wide analytics grant',
    async (code) => {
      login('GURU', [code]);
      expect((await get()).statusCode).toBe(403);
      expect(service.monitoringKbm).not.toHaveBeenCalled();
    },
  );
  it('revoked KS appointment and missing primary identity fail closed', async () => {
    login('GURU');
    actor = { ...actor!, roles: ['GURU', 'KEPALA_SEKOLAH'] };
    expect((await get()).statusCode).toBe(403);
    primary = null;
    expect((await get()).statusCode).toBe(403);
    expect(service.monitoringKbm).not.toHaveBeenCalled();
  });
  it('revoked grade permission denies before controller or database work', async () => {
    grants.clear();
    expect((await get()).statusCode).toBe(403);
    expect(service.monitoringKbm).not.toHaveBeenCalled();
  });
  it('permission service failure does not return data', async () => {
    permissions.getEffectivePermissions.mockRejectedValueOnce(new Error('synthetic outage'));
    expect((await get()).statusCode).toBe(500);
    expect(service.monitoringKbm).not.toHaveBeenCalled();
  });
  it('each domain capability uses its own existing grant', async () => {
    grants = new Set([
      'academic.grade.read',
      'academic.teaching.read',
      'academic.schedule.read',
      'activity.read',
    ]);
    expect((await get()).statusCode).toBe(200);
    expect(service.monitoringKbm).toHaveBeenLastCalledWith(expect.any(Object), expect.any(Date), {
      assignments: true,
      attendance: false,
      journal: true,
      schedules: true,
      sessions: false,
      lms: false,
    });
  });
  it.each(['SISWA', 'ORANG_TUA'] as const)(
    '%s cannot bypass a revoked own/child grant using the global grant of another role',
    async (role) => {
      login(role);
      grants = new Set(['academic.grade.read', 'academic.attendance.read']);
      expect((await get('/analytics/grades/student')).statusCode).toBe(403);
      expect((await get('/analytics/attendance/stats')).statusCode).toBe(403);
      expect(studentService.studentGrades).not.toHaveBeenCalled();
      expect(studentService.attendanceStats).not.toHaveBeenCalled();
      if (role === 'SISWA') {
        expect(
          (await get('/analytics/cp-progress?academicYear=2026%2F2027&semester=1')).statusCode,
        ).toBe(403);
        expect(service.cpProgress).not.toHaveBeenCalled();
      }
    },
  );
  it.each(['SISWA', 'ORANG_TUA'] as const)(
    '%s keeps legitimate scoped analytics access',
    async (role) => {
      login(role);
      const kind = role === 'SISWA' ? 'own' : 'child';
      grants = new Set([`grade.${kind}.read`, `attendance.${kind}.read`]);
      expect((await get('/analytics/grades/student')).statusCode).toBe(200);
      expect((await get('/analytics/attendance/stats')).statusCode).toBe(200);
    },
  );
});
