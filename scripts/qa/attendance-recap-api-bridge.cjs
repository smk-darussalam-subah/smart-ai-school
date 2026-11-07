'use strict';
// Local QA only. Real Nest/Fastify/JWKS/guards/service + marked disposable PostgreSQL.
// Synthetic NextAuth sessions are supplied separately; this is not live SSO.
const path = require('node:path'),
  http = require('node:http'),
  crypto = require('node:crypto');
process.env.TS_NODE_PROJECT = path.resolve('apps/api/tsconfig.json');
require('ts-node/register/transpile-only');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client'),
  jwt = require('jsonwebtoken');
const { Test } = require('@nestjs/testing'),
  { Reflector } = require('@nestjs/core'),
  { FastifyAdapter } = require('@nestjs/platform-fastify');
const root = path.resolve('apps/api/src');
const { AttendanceRecapController } = require(
  path.join(root, 'attendance/attendance-recap.controller'),
);
const { ClassSessionController } = require(
  path.join(root, 'class-sessions/class-session.controller'),
);
const { ClassSessionService } = require(path.join(root, 'class-sessions/class-session.service'));
const { ClassSessionDueService } = require(
  path.join(root, 'class-sessions/class-session-due.service'),
);
const { BellScheduleService } = require(path.join(root, 'bell-schedule/bell-schedule.service'));
const { StudentSessionAttendanceController } = require(
  path.join(root, 'attendance/student-session-attendance.controller'),
);
const { StudentSessionAttendanceService } = require(
  path.join(root, 'attendance/student-session-attendance.service'),
);
const { StudentSessionAttendanceReadService } = require(
  path.join(root, 'attendance/student-session-attendance-read.service'),
);
const { AttendanceRecapService } = require(path.join(root, 'attendance/attendance-recap.service'));
const { PermissionsService } = require(path.join(root, 'permissions/permissions.service'));
const { KeycloakGuard } = require(path.join(root, 'auth/guards/keycloak.guard'));
const { RolesGuard } = require(path.join(root, 'auth/guards/roles.guard'));
const { PermissionGuard } = require(path.join(root, 'permissions/permissions.guard'));
const { UserStatusService } = require(path.join(root, 'auth/user-status.service'));
const databaseUrl =
  'postgresql://diis_fixture:diis_fixture_local_only@127.0.0.1:55473/diis_jp_recap_test';
const db = new PrismaClient({ datasourceUrl: databaseUrl }),
  key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const issuer = 'http://127.0.0.1:55881/realms/qa-recap';
Object.assign(process.env, {
  KEYCLOAK_URL: 'http://127.0.0.1:55881',
  KEYCLOAK_REALM: 'qa-recap',
  KEYCLOAK_ISSUER: issuer,
});
let app, server;
(async () => {
  const actors = {};
  for (const name of ['teacher', 'other', 'principal', 'waka', 'student', 'parent', 'tu', 'kaprog'])
    actors[name] = await db.user.findFirstOrThrow({ where: { fullName: 'QA Recap ' + name } });
  const c = await db.class.findFirstOrThrow({ where: { name: 'X QA A' } }),
    other = await db.class.findFirstOrThrow({ where: { name: 'XI QA B' } });
  const teacher = await db.teacher.findUniqueOrThrow({ where: { userId: actors.teacher.id } });
  const students = await db.student.findMany({
    where: { classId: c.id },
    include: { user: true },
    orderBy: { nis: 'asc' },
  });
  await db.semester.upsert({
    where: {
      academicYearId_number: {
        academicYearId: c.academicYear
          ? (await db.academicYear.findUniqueOrThrow({ where: { code: c.academicYear } })).id
          : '',
        number: 2,
      },
    },
    create: {
      academicYearId: (await db.academicYear.findUniqueOrThrow({ where: { code: '2026/2027' } }))
        .id,
      number: 2,
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-06-30'),
      isActive: false,
    },
    update: {},
  });
  for (const who of ['principal', 'waka', 'kaprog'])
    await db.teacher.upsert({
      where: { userId: actors[who].id },
      create: { userId: actors[who].id },
      update: {},
    });
  const profiles = { TEACHER: 'teacher', HUMAS: 'principal', ADMIN: 'waka', TU: 'tu', KAPROG: 'kaprog' };
  const tokens = Object.fromEntries(
    Object.entries(profiles).map(([p, who]) => [
      p,
      jwt.sign(
        {
          sub: actors[who].keycloakId,
          sid: 'qa-browser-' + who,
          realm_access: { roles: [actors[who].role] },
        },
        key.privateKey,
        { algorithm: 'RS256', keyid: 'qa-recap-key', issuer, expiresIn: 7200 },
      ),
    ]),
  );
  const permissions = new PermissionsService(db);
  const identities = {};
  for (const [profile, who] of Object.entries(profiles)) {
    const actor = actors[who];
    identities[profile] = {
      id: actor.id,
      role: actor.role,
      fullName: actor.fullName,
      permissions: [...(await permissions.getEffectivePermissions(actor.keycloakId, [actor.role]))],
      positions: [...(await permissions.getActivePositionCodes(actor.keycloakId))].map((code) => ({
        status: 'ACTIVE',
        position: { code, name: code },
      })),
      consentVersion: 'v1.0',
    };
  }
  const bootstrap = {
    identities,
    tokens,
    classId: c.id,
    foreignClassId: other.id,
    teacherId: teacher.id,
    students: students.map((s) => ({ id: s.id, name: s.user.fullName, nis: s.nis })),
    sessionId: (
      await db.classSession.findFirstOrThrow({ where: { assignedTeacherId: teacher.id } })
    ).id,
    subjects: await db.teachingAssignment.findMany({
      where: { classId: c.id },
      select: { subject: true },
    }),
  };
  server = http.createServer((q, r) => {
    r.setHeader('content-type', 'application/json');
    if (q.url === '/__qa/bootstrap') return r.end(JSON.stringify(bootstrap));
    r.end(
      JSON.stringify({
        keys: [
          {
            ...key.publicKey.export({ format: 'jwk' }),
            kid: 'qa-recap-key',
            alg: 'RS256',
            use: 'sig',
          },
        ],
      }),
    );
  });
  await new Promise((r) => server.listen(55881, '127.0.0.1', r));
  const service = new AttendanceRecapService(db, permissions),
    module = await Test.createTestingModule({
      controllers: [
        AttendanceRecapController,
        ClassSessionController,
        StudentSessionAttendanceController,
      ],
      providers: [
        { provide: AttendanceRecapService, useValue: service },
        {
          provide: ClassSessionService,
          useValue: new ClassSessionService(
            db,
            new BellScheduleService(db, permissions),
            permissions,
          ),
        },
        { provide: ClassSessionDueService, useValue: {} },
        { provide: StudentSessionAttendanceService, useValue: {} },
        {
          provide: StudentSessionAttendanceReadService,
          useValue: new StudentSessionAttendanceReadService(db, permissions),
        },
      ],
    }).compile();
  app = module.createNestApplication(new FastifyAdapter(), { logger: false });
  const reflector = new Reflector();
  app.useGlobalGuards(
    new KeycloakGuard(reflector, new UserStatusService(db)),
    new PermissionGuard(reflector, permissions),
    new RolesGuard(reflector, permissions),
  );
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (q, r, done) => {
      if (q.method !== 'GET') r.code(405).send({ message: 'Read-only QA bridge' });
      done();
    });
  app.setGlobalPrefix('api/v1');
  await app.listen(55882, '0.0.0.0');
  console.log(
    'QA bridge ready; disposable DB; port 55882; synthetic identity bootstrap loopback only',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  cleanup();
});
async function cleanup() {
  await app?.close();
  server?.close();
  await db.$disconnect();
}
process.on('SIGTERM', () => cleanup().then(() => process.exit()));
process.on('SIGINT', () => cleanup().then(() => process.exit()));
