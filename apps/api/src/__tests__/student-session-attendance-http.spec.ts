import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { type CanActivate, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '@smk/auth';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../permissions/permissions.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { StudentSessionAttendanceController } from '../attendance/student-session-attendance.controller';
import { StudentSessionAttendanceService } from '../attendance/student-session-attendance.service';
import { StudentSessionAttendanceReadService } from '../attendance/student-session-attendance-read.service';
import type { NotificationService } from '../notification/notification.service';

/** Real Nest/Fastify query pipeline + production service/role/permission guards.
 * Identity and the DB adapter are deterministic local fixtures, not Keycloak/PostgreSQL acceptance. */
describe('student JP HTTP period parsing and ownership', () => {
  const a = '10000000-0000-4000-8000-000000000001';
  const b = '10000000-0000-4000-8000-000000000002';
  const foreign = '10000000-0000-4000-8000-000000000003';
  const actors = {
    studentA: { id: 'u-a', role: 'SISWA' },
    studentB: { id: 'u-b', role: 'SISWA' },
    parent: { id: 'u-p', role: 'ORANG_TUA' },
    stranger: { id: 'u-f', role: 'ORANG_TUA' },
    teacher: { id: 'u-t', role: 'GURU' },
  };
  type ActorKey = keyof typeof actors;
  let permitted = true;
  const permission = {
    hasPermission: jest.fn(async () => permitted),
    hasFreshPermission: jest.fn(async () => permitted),
    getAuthoritativePrimaryRole: async (key: ActorKey) => actors[key]?.role ?? null,
    getActivePositionCodes: async () => new Set<string>(),
  };
  const studentFind = jest.fn(
    async ({ where }: { where: { id?: string; userId?: string; parentId?: string } }) => {
      const students = [
        { id: a, userId: 'u-a', parentId: 'u-p' },
        { id: b, userId: 'u-b', parentId: 'u-p' },
      ];
      const row = students.find(
        (s) =>
          (!where.id || where.id === s.id) &&
          (!where.userId || where.userId === s.userId) &&
          (!where.parentId || where.parentId === s.parentId),
      );
      return row
        ? { ...row, classId: 'class', joinedAt: new Date('2026-07-01'), status: 'active' }
        : null;
    },
  );
  const semesterLookup = jest.fn(async (year: string, number: number) => {
    if (typeof number !== 'number') throw Error('Prisma integer filter received a string');
    return {
      academicYear: year,
      semester: number,
      semesterId: 'semester',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
    };
  });
  const tx = {
    user: {
      findFirst: jest.fn(
        async ({ where }: { where: { keycloakId: ActorKey } }) => actors[where.keycloakId] ?? null,
      ),
    },
    student: { findFirst: studentFind },
    classSession: { findMany: jest.fn(async () => []) },
    subject: { findMany: jest.fn(async () => []) },
    academicCalendar: { findMany: jest.fn(async () => []) },
  };
  const prisma = {
    $transaction: async (run: (db: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaService;
  const periods = {
    findPeriodByCodeAndSemester: semesterLookup,
    getActivePeriod: async () => semesterLookup('2026/2027', 1),
  } as unknown as AcademicPeriodService;
  const service = new StudentSessionAttendanceService(
    prisma,
    permission as unknown as PermissionsService,
    periods,
    {} as NotificationService,
  );
  const reader = { read: jest.fn(async () => ({ ok: true })) };
  const roster = jest.spyOn(service, 'roster').mockResolvedValue({ ok: true } as never);
  const identify: CanActivate = {
    canActivate(context: ExecutionContext) {
      const req = context
        .switchToHttp()
        .getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
      const key = req.headers['x-synthetic-actor'] as ActorKey;
      if (!actors[key]) throw new UnauthorizedException();
      req.user = { keycloakId: key, roles: [actors[key].role], username: 'synthetic' } as AuthUser;
      return true;
    },
  };
  let app: NestFastifyApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StudentSessionAttendanceController],
      providers: [
        { provide: StudentSessionAttendanceService, useValue: service },
        { provide: StudentSessionAttendanceReadService, useValue: reader },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    const reflector = new Reflector();
    app.useGlobalGuards(
      identify,
      new RolesGuard(reflector, permission as unknown as PermissionsService),
      new PermissionGuard(reflector, permission as unknown as PermissionsService),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    permitted = true;
    jest.clearAllMocks();
  });
  const query = (extra = '') =>
    'from=2026-10-19&to=2026-10-21&academicYear=2026%2F2027&semester=1' + extra;
  const get = (actor: ActorKey, suffix: string) =>
    app.inject({
      method: 'GET',
      url: '/attendance/student-sessions/' + suffix,
      headers: { 'x-synthetic-actor': actor },
    });
  it.each([
    ['studentA', a],
    ['studentB', b],
    ['parent', a],
    ['parent', b],
  ] as const)('parses real HTTP semester for %s', async (actor, id) => {
    const response = await get(actor, 'summary?' + query('&studentId=' + id));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      studentId: id,
      academicYear: '2026/2027',
      semester: 1,
    });
    expect(semesterLookup).toHaveBeenCalledWith('2026/2027', 1, expect.anything());
  });
  it.each([
    'semester=abc',
    'semester=0',
    'semester=3',
    'semester=1.5',
    'semester=1&semester=2',
    'academicYear=bad&semester=1',
    'academicYear=2026%2F2027',
    'semester=1',
    'from=2026-10-22&to=2026-10-21',
    'from=no&to=2026-10-21',
    'from=2026-07-01&to=2026-10-21',
    'from=2026-10-19&to=2026-10-21&unexpected=1',
  ])('rejects invalid HTTP query %s before period lookup', async (suffix) => {
    const prefix = suffix.startsWith('from=') ? '' : 'from=2026-10-19&to=2026-10-21&';
    const response = await get('studentA', 'summary?' + prefix + suffix);
    expect(response.statusCode).toBe(400);
    expect(semesterLookup).not.toHaveBeenCalled();
  });
  it.each([
    ['studentA', b],
    ['parent', foreign],
    ['stranger', a],
  ] as const)('rejects foreign student for %s', async (actor, id) => {
    expect((await get(actor, 'summary?' + query('&studentId=' + id))).statusCode).toBe(403);
    expect(semesterLookup).not.toHaveBeenCalled();
  });
  it('requires selected child and preserves permission revocation', async () => {
    expect((await get('parent', 'summary?' + query())).statusCode).toBe(403);
    permitted = false;
    expect((await get('parent', 'summary?' + query('&studentId=' + a))).statusCode).toBe(403);
  });
  it('keeps the no-period active-period compatibility path', async () => {
    expect((await get('studentA', 'summary?from=2026-10-19&to=2026-10-21')).statusCode).toBe(200);
  });
  it('rejects wrong role and missing authenticated identity', async () => {
    expect((await get('teacher', 'summary?' + query())).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/attendance/student-sessions/summary?' + query() }))
        .statusCode,
    ).toBe(401);
  });
  it('also validates the two adjacent query routes before their services', async () => {
    expect((await get('teacher', 'sessions/' + a + '?scope=all')).statusCode).toBe(400);
    expect(reader.read).not.toHaveBeenCalled();
    expect((await get('teacher', 'roster?sessionId=invalid')).statusCode).toBe(400);
    expect(roster).not.toHaveBeenCalled();
    expect((await get('teacher', 'sessions/' + a + '?scope=own')).statusCode).toBe(200);
    expect((await get('teacher', 'roster?sessionId=' + a)).statusCode).toBe(200);
  });
});
