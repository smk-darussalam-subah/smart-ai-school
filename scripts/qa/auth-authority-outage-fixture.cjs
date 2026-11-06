'use strict';
// Disposable loopback QA only: actual compiled guard/service/filter + PostgreSQL.
const req = require('module').createRequire('/app/apps/api/package.json');
req('reflect-metadata');
const { createServer } = require('http'),
  { generateKeyPairSync, randomUUID, createHash } = require('crypto');
const { PrismaClient } = req('@prisma/client');
(async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.LAB_DATABASE_URL } } });
  if (!new URL(process.env.LAB_DATABASE_URL).pathname.endsWith('diis_authority_test'))
    throw Error('Disposable DB required');
  const kc = randomUUID(),
    uid = randomUUID(),
    sid = randomUUID(),
    pair = generateKeyPairSync('rsa', { modulusLength: 2048 }),
    jwk = {
      ...pair.publicKey.export({ format: 'jwk' }),
      kid: 'authority-local',
      use: 'sig',
      alg: 'RS256',
    };
  const jwks = createServer((_q, r) => {
    r.setHeader('content-type', 'application/json');
    r.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((r) => jwks.listen(3902, '127.0.0.1', r));
  Object.assign(process.env, {
    KEYCLOAK_URL: 'http://127.0.0.1:3902',
    KEYCLOAK_REALM: 'qa',
    KEYCLOAK_ISSUER: 'http://127.0.0.1:3902/realms/qa',
  });
  await prisma.user.create({
    data: {
      id: uid,
      keycloakId: kc,
      email: 'authority-' + uid + '@qa.invalid',
      fullName: 'QA Guru',
      role: 'GURU',
    },
  });
  const { KeycloakGuard } = req('/app/apps/api/dist/auth/guards/keycloak.guard.js'),
    { UserStatusService } = req('/app/apps/api/dist/auth/user-status.service.js'),
    { HttpExceptionFilter } = req('/app/apps/api/dist/common/filters/http-exception.filter.js');
  const { logoutAuditId, verifiedSessionBinding } = req(
    '/app/apps/api/dist/auth/session-binding.js',
  );
  const { Test } = req('@nestjs/testing'),
    { FastifyAdapter } = req('@nestjs/platform-fastify'),
    { Reflector } = req('@nestjs/core'),
    { Controller, Get } = req('@nestjs/common');
  const claims = {
    sub: kc,
    sid,
    preferred_username: 'synthetic-teacher',
    realm_access: { roles: ['GURU'] },
  };
  const token = req('jsonwebtoken').sign(claims, pair.privateKey, {
    algorithm: 'RS256',
    keyid: jwk.kid,
    issuer: process.env.KEYCLOAK_ISSUER,
    expiresIn: 3600,
  });
  const binding = verifiedSessionBinding({ ...claims, iss: process.env.KEYCLOAK_ISSUER }, token).id,
    revocationId = logoutAuditId(binding),
    fingerprint = createHash('sha256').update(token).digest('hex');
  const permissions = [
    'academic.schedule.read',
    'academic.teaching.read',
    'academic.grade.read',
    'academic.class-session.read',
    'academic.class-session.manage',
    'academic.attendance.read',
    'academic.attendance.create',
    'staff.attendance.checkin',
    'teacher.attendance.read',
    'activity.read',
    'activity.manage',
    'rpp.read',
    'rpp.own.manage',
    'lms.read',
    'lms.own.manage',
  ];
  const identity = {
    id: uid,
    role: 'GURU',
    fullName: 'QA Guru',
    permissions,
    consentVersion: 'v1.0',
  };
  const { PermissionsService } = req('/app/apps/api/dist/permissions/permissions.service.js');
  const { PermissionGuard } = req('/app/apps/api/dist/permissions/permissions.guard.js');
  const { RolesGuard } = req('/app/apps/api/dist/auth/guards/roles.guard.js');
  const { Roles } = req('/app/apps/api/dist/auth/decorators/roles.decorator.js');
  const { RequirePermission } = req(
    '/app/apps/api/dist/permissions/decorators/require-permission.decorator.js',
  );
  let roleLookupDown = false;
  const actualRoleRead = prisma.user.findFirst.bind(prisma.user);
  prisma.user.findFirst = (args) => {
    if (roleLookupDown)
      return Promise.reject(
        Object.assign(Error('Synthetic isolated role query unavailable'), { code: 'P2024' }),
      );
    return actualRoleRead(args);
  };
  const permissionService = new PermissionsService(prisma);
  const grant = await prisma.permission.upsert({
    where: { code: 'academic.class-session.read' },
    create: {
      code: 'academic.class-session.read',
      module: 'qa',
      description: 'Disposable authority QA',
    },
    update: {},
  });
  await prisma.rolePermission.createMany({
    data: [{ role: 'GURU', permissionId: grant.id }],
    skipDuplicates: true,
  });
  class Probe {
    me() {
      return identity;
    }
    status() {
      return { active: true, binding: 'oidc' };
    }
  }
  Controller()(Probe);
  Get('api/v1/auth/me')(
    Probe.prototype,
    'me',
    Object.getOwnPropertyDescriptor(Probe.prototype, 'me'),
  );
  Roles('GURU')(Probe.prototype, 'me', Object.getOwnPropertyDescriptor(Probe.prototype, 'me'));
  RequirePermission('academic.class-session.read')(
    Probe.prototype,
    'me',
    Object.getOwnPropertyDescriptor(Probe.prototype, 'me'),
  );
  Get('api/v1/auth/session-status')(
    Probe.prototype,
    'status',
    Object.getOwnPropertyDescriptor(Probe.prototype, 'status'),
  );
  const service = new UserStatusService(prisma),
    module = await Test.createTestingModule({ controllers: [Probe] }).compile(),
    app = module.createNestApplication(new FastifyAdapter(), { logger: false });
  const fastify = app.getHttpAdapter().getInstance(),
    calls = [];
  fastify.addHook('onResponse', (q, r, done) => {
    if (q.url.startsWith('/api/v1/'))
      calls.push({
        at: new Date().toISOString(),
        path: q.url,
        status: r.statusCode,
        tokenHash: createHash('sha256')
          .update(String(q.headers.authorization ?? ''))
          .digest('hex'),
      });
    done();
  });
  fastify.get('/__proof/bootstrap', async (q, r) => {
    if (q.headers['x-proof-key'] !== process.env.LAB_KEY) return r.code(403).send({});
    return { token, identity, fingerprint };
  });
  fastify.post('/__proof/control', async (q, r) => {
    if (q.headers['x-proof-key'] !== process.env.LAB_KEY) return r.code(403).send({});
    const body = q.body ?? {};
    if (body.state === 'healthy') {
      roleLookupDown = false;
      permissionService.invalidateAll();
      await prisma.auditLog.deleteMany({ where: { id: revocationId } });
      await prisma.user.update({ where: { id: uid }, data: { isActive: true, deletedAt: null } });
      service.invalidateAll();
    }
    if (body.state === 'role-unavailable') roleLookupDown = true;
    if (body.state === 'disabled') {
      await prisma.user.update({ where: { id: uid }, data: { isActive: false } });
      service.invalidateAll();
    }
    if (body.state === 'revoked') {
      await prisma.auditLog.upsert({
        where: { id: revocationId },
        create: {
          id: revocationId,
          actorId: kc,
          actorRoles: ['GURU'],
          action: 'qa.session.logout',
          method: 'POST',
          path: '/qa/logout',
          statusCode: 200,
          outcome: 'success',
        },
        update: {},
      });
    }
    return { calls, fingerprint };
  });
  const reflector = new Reflector();
  app.useGlobalGuards(
    new KeycloakGuard(reflector, service),
    new PermissionGuard(reflector, permissionService),
    new RolesGuard(reflector, permissionService),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  await app.listen(3001, '0.0.0.0');
  console.log(
    JSON.stringify({
      event: 'authority-ready',
      persistence: 'disposable PostgreSQL',
      signedJWT: true,
      productionGuard: true,
    }),
  );
  process.once('SIGTERM', async () => {
    await app.close();
    await prisma.$disconnect();
    jwks.close(() => process.exit(0));
  });
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
