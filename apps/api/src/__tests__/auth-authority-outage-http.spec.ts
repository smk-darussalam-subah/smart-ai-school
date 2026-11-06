import { Controller, Get, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createServer, type Server } from 'node:http';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { KeycloakGuard } from '../auth/guards/keycloak.guard';
import { UserStatusService } from '../auth/user-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionGuard } from '../permissions/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';

@Controller('authority-probe')
class AuthorityProbe {
  @Get()
  read(@Req() req: { user: { roles: string[] } }) {
    return { roles: req.user.roles };
  }

  @Get('permissions')
  @Roles('GURU')
  @RequirePermission('student.read')
  permission() {
    return { allowed: true };
  }

  @Get('role')
  @Roles('GURU')
  role() {
    return { allowed: true };
  }
}

describe('signed HTTP: temporary authority outage is not session revocation', () => {
  let app: NestFastifyApplication,
    issuer: Server,
    service: UserStatusService,
    permissions: PermissionsService,
    token: string;
  const env = {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    issuer: process.env.KEYCLOAK_ISSUER,
  };
  let auditDown = false,
    userDown = false,
    revoked = false;
  let record: { isActive: boolean; deletedAt: Date | null; role: string } | null;
  let roleDown = false,
    permissionDown = false,
    granted = true;
  const db = {
    auditLog: {
      findUnique: jest.fn(async () => {
        if (auditDown)
          throw Object.assign(Error('PRIVATE synthetic DB endpoint'), { code: 'P2024' });
        return revoked ? { id: 'synthetic-revocation' } : null;
      }),
    },
    user: {
      findFirst: jest.fn(async () => {
        if (roleDown) throw Object.assign(Error('PRIVATE role DB endpoint'), { code: 'P2024' });
        return record && record.isActive && !record.deletedAt ? { role: record.role } : null;
      }),
      findUnique: jest.fn(async () => {
        if (userDown) throw Error('PRIVATE synthetic user lookup failed');
        return record;
      }),
    },
    academicYear: { findMany: jest.fn(async () => []) },
    rolePermission: {
      findMany: jest.fn(async () => {
        if (permissionDown) throw Error('PRIVATE permission SQL failure');
        return granted ? [{ permission: { code: 'student.read' } }] : [];
      }),
    },
  };
  beforeAll(async () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = {
      ...pair.publicKey.export({ format: 'jwk' }),
      kid: 'authority-outage-test',
      use: 'sig',
      alg: 'RS256',
    };
    issuer = createServer((_q, r) => {
      r.setHeader('content-type', 'application/json');
      r.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => issuer.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(issuer.address() as AddressInfo).port}`;
    Object.assign(process.env, {
      KEYCLOAK_URL: base,
      KEYCLOAK_REALM: 'authority-test',
      KEYCLOAK_ISSUER: base + '/realms/authority-test',
    });
    token = jwt.sign(
      {
        sub: randomUUID(),
        sid: randomUUID(),
        preferred_username: 'synthetic',
        realm_access: { roles: ['GURU'] },
      },
      pair.privateKey,
      { algorithm: 'RS256', keyid: jwk.kid, issuer: process.env.KEYCLOAK_ISSUER, expiresIn: 600 },
    );
    const module = await Test.createTestingModule({
      controllers: [AuthorityProbe],
      providers: [UserStatusService, PermissionsService, { provide: PrismaService, useValue: db }],
    }).compile();
    service = module.get(UserStatusService);
    permissions = module.get(PermissionsService);
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    const reflector = new Reflector();
    app.useGlobalGuards(
      new KeycloakGuard(reflector, service),
      new PermissionGuard(reflector, permissions),
      new RolesGuard(reflector, permissions),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  beforeEach(() => {
    service.invalidateAll();
    auditDown = userDown = revoked = false;
    roleDown = permissionDown = false;
    granted = true;
    permissions.invalidateAll();
    record = { isActive: true, deletedAt: null, role: 'GURU' };
  });
  afterAll(async () => {
    await app?.close();
    if (issuer) await new Promise<void>((resolve) => issuer.close(() => resolve()));
    for (const [key, value] of Object.entries({
      KEYCLOAK_URL: env.url,
      KEYCLOAK_REALM: env.realm,
      KEYCLOAK_ISSUER: env.issuer,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const read = (bearer = token, suffix = '') =>
    app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/authority-probe' + suffix,
        headers: { authorization: 'Bearer ' + bearer },
      });

  it.each(['/permissions', '/role'])(
    'returns retryable 503, not false403, on fresh role outage at %s',
    async (suffix) => {
      expect((await read(token, suffix)).statusCode).toBe(200);
      roleDown = true;
      const failure = await read(token, suffix);
      expect(failure.statusCode).toBe(503);
      expect(failure.json()).toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
      expect(failure.headers['retry-after']).toBe('2');
      expect(failure.body).not.toContain('PRIVATE');
      roleDown = false;
      expect((await read(token, suffix)).statusCode).toBe(200);
      revoked = true;
      expect((await read(token, suffix)).statusCode).toBe(401);
    },
  );
  it('maps permission-resolution failure to safe503 and recovers without caching an incomplete grant set', async () => {
    permissionDown = true;
    const failure = await read(token, '/permissions');
    expect(failure.statusCode).toBe(503);
    expect(failure.json()).toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
    expect(failure.body).not.toContain('PRIVATE');
    permissionDown = false;
    expect((await read(token, '/permissions')).statusCode).toBe(200);
  });
  it('keeps genuine missing permission at403', async () => {
    granted = false;
    expect((await read(token, '/permissions')).statusCode).toBe(403);
  });
  it('shares exactly one fresh role read across both guards, then re-reads on the next request', async () => {
    db.user.findFirst.mockClear();
    expect((await read(token, '/permissions')).statusCode).toBe(200);
    expect(db.user.findFirst).toHaveBeenCalledTimes(1);
    expect((await read(token, '/permissions')).statusCode).toBe(200);
    expect(db.user.findFirst).toHaveBeenCalledTimes(2);
  });
  it('keeps genuine foreign identity role at403 despite an old GURU JWT claim', async () => {
    record = { isActive: true, deletedAt: null, role: 'TATA_USAHA' };
    service.invalidateAll();
    expect((await read(token, '/role')).statusCode).toBe(403);
  });

  it('returns 200 -> 503 -> 200 for the same valid token even with a warm user cache', async () => {
    expect((await read()).statusCode).toBe(200);
    auditDown = true;
    const unavailable = await read();
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.headers['retry-after']).toBe('2');
    expect(unavailable.json()).toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
    expect(unavailable.body).not.toContain('PRIVATE');
    auditDown = false;
    expect((await read()).statusCode).toBe(200);
    revoked = true;
    expect((await read()).statusCode).toBe(401);
  });
  it('fails closed with 503 on an uncached account lookup error and recovers without new credentials', async () => {
    userDown = true;
    expect((await read()).statusCode).toBe(503);
    userDown = false;
    expect((await read()).statusCode).toBe(200);
  });
  it.each(['disabled', 'archived', 'missing', 'invalid-role'])(
    'keeps genuine %s account rejection at 401',
    async (condition) => {
      if (condition === 'missing') record = null;
      else if (record) {
        if (condition === 'disabled') record.isActive = false;
        if (condition === 'archived') record.deletedAt = new Date();
        if (condition === 'invalid-role') record.role = 'NOT_A_PRIMARY_ROLE';
      }
      expect((await read()).statusCode).toBe(401);
    },
  );
  it('rejects malformed tokens and never checks DB authority for them', async () => {
    db.auditLog.findUnique.mockClear();
    expect((await read('invalid')).statusCode).toBe(401);
    expect(db.auditLog.findUnique).not.toHaveBeenCalled();
  });
  it('resolves the current role after invalidation rather than trusting a stale JWT claim', async () => {
    expect((await read()).json()).toEqual({ roles: ['GURU'] });
    record = { isActive: true, deletedAt: null, role: 'TATA_USAHA' };
    service.invalidateAll();
    expect((await read()).json()).toEqual({ roles: ['TATA_USAHA'] });
  });
});
