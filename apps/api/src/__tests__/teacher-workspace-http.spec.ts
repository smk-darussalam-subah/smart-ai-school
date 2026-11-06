import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { PrismaClient, type User } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { UserStatusService } from '../auth/user-status.service';
import { SseTokenService } from '../auth/sse-token.service';
import { KeycloakGuard } from '../auth/guards/keycloak.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionGuard } from '../permissions/permissions.guard';
import { SchoolConfigController } from '../school-config/school-config.controller';
import { SchoolConfigService } from '../school-config/school-config.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  APPOINTMENT_ACTIVATION_LOCK_KEY,
  type AppointmentsService,
} from '../appointments/appointments.service';
import type { AcademicPeriodService } from '../academic-period/academic-period.service';
import type { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import type { ClassesService } from '../classes/classes.service';

const url = process.env.TEACHER_WORKSPACE_TEST_DATABASE_URL;
if (
  url &&
  !/^postgresql:\/\/diis_fixture:diis_fixture_local_only@127\.0\.0\.1:\d+\/diis_teacher_workspace_test(?:\?.*)?$/.test(
    url,
  )
)
  throw Error('Marked loopback disposable DB required');
(url ? describe : describe.skip)(
  'real Fastify -> signed JWT/JWKS -> guards -> service -> PostgreSQL',
  () => {
    const db = new PrismaClient({ datasourceUrl: url }),
      p = db as PrismaService,
      permissions = new PermissionsService(p),
      status = new UserStatusService(p);
    const environment = { ...process.env },
      key = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const actors = {} as Record<'tu' | 'pupil' | 'parent' | 'teacher' | 'humas', User>;
    const sessions = new Map<string, string>(),
      issued = new Map<string, string>();
    let app: NestFastifyApplication, certs: Server, issuer: string, yearId: string;
    const iam = {
      findByEmail: jest.fn(async (email: string) => {
        const user = Object.values(actors).find((u) => u.email === email);
        return user
          ? {
              id: user.keycloakId,
              username: user.role === 'SISWA' ? '001234' : 'qa-' + user.role,
              enabled: true,
            }
          : null;
      }),
      logoutUser: jest.fn(async () => undefined),
      setTempPassword: jest.fn(async (id: string, password: string) => {
        issued.set(id, password);
      }),
    };
    const token = (
      user: User,
      expired = false,
      sid = sessions.get(user.id)!,
      roles = [user.role],
    ) =>
      jwt.sign({ sub: user.keycloakId, sid, realm_access: { roles } }, key.privateKey, {
        algorithm: 'RS256',
        keyid: 'qa-teacher-workspace',
        issuer,
        expiresIn: expired ? -60 : 600,
      });
    beforeAll(async () => {
      const publicKey = key.publicKey.export({ format: 'jwk' });
      certs = createServer((_q, r) => {
        r.setHeader('content-type', 'application/json');
        r.end(
          JSON.stringify({
            keys: [{ ...publicKey, kid: 'qa-teacher-workspace', alg: 'RS256', use: 'sig' }],
          }),
        );
      });
      await new Promise<void>((resolve) => certs.listen(0, '127.0.0.1', resolve));
      const port = (certs.address() as { port: number }).port;
      issuer = `http://127.0.0.1:${port}/realms/teacher-workspace`;
      Object.assign(process.env, {
        KEYCLOAK_URL: `http://127.0.0.1:${port}`,
        KEYCLOAK_REALM: 'teacher-workspace',
        KEYCLOAK_ISSUER: issuer,
      });
      await db.academicYear.updateMany({ data: { isActive: false } });
      const year = await db.academicYear.upsert({
        where: { code: '2026/2027' },
        create: {
          code: '2026/2027',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2027-06-30'),
          isActive: true,
        },
        update: { isActive: true },
      });
      yearId = year.id;
      await db.appointment.updateMany({
        where: {
          staff: {
            user: { email: { endsWith: '@example.invalid' }, fullName: { startsWith: 'QA ' } },
          },
        },
        data: { status: 'ENDED', endedAt: new Date() },
      });
      for (const [name, role] of [
        ['tu', 'TATA_USAHA'],
        ['pupil', 'SISWA'],
        ['parent', 'ORANG_TUA'],
        ['teacher', 'GURU'],
        ['humas', 'GURU'],
      ] as const) {
        const user = await db.user.create({
          data: {
            keycloakId: randomUUID(),
            role,
            email: randomUUID() + '@example.invalid',
            fullName: 'QA HTTP ' + name,
            consentVersion: 'v1.0',
          },
        });
        actors[name] = user;
        sessions.set(user.id, randomUUID());
      }
      const staff = await db.staff.create({
        data: { userId: actors.humas.id, employmentStatus: 'GTY' },
      });
      const position = await db.position.findUniqueOrThrow({ where: { code: 'WAKA_HUMAS' } });
      await db.appointment.create({
        data: {
          staffId: staff.id,
          positionId: position.id,
          academicYearId: yearId,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-07-01'),
        },
      });
      for (const code of ['user.read', 'user.password.reset']) {
        const perm = await db.permission.upsert({
          where: { code },
          create: { code, description: 'QA HTTP permission', module: 'user' },
          update: {},
        });
        await db.rolePermission.upsert({
          where: { role_permissionId: { role: 'TATA_USAHA', permissionId: perm.id } },
          create: { role: 'TATA_USAHA', permissionId: perm.id },
          update: {},
        });
      }
      const calendar = new SchoolConfigService(
        p,
        permissions,
        {
          acquireActivationLock: async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${APPOINTMENT_ACTIVATION_LOCK_KEY}))`;
          },
        } as AppointmentsService,
        {} as AcademicPeriodService,
      );
      const module = await Test.createTestingModule({
        controllers: [AuthController, SchoolConfigController, UsersController],
        providers: [
          { provide: AuthService, useValue: new AuthService(p, permissions) },
          { provide: SseTokenService, useValue: new SseTokenService(p) },
          { provide: SchoolConfigService, useValue: calendar },
          {
            provide: UsersService,
            useValue: new UsersService(
              p,
              status,
              iam as unknown as KeycloakAdminService,
              permissions,
              {} as ClassesService,
            ),
          },
        ],
      }).compile();
      app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
        logger: false,
      });
      const reflector = new Reflector();
      app.useGlobalGuards(
        new KeycloakGuard(reflector, status),
        new PermissionGuard(reflector, permissions),
        new RolesGuard(reflector, permissions),
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });
    afterAll(async () => {
      if (app) await app.close();
      if (certs) await new Promise<void>((r) => certs.close(() => r()));
      await db.$disconnect();
      process.env = environment;
    });
    const request = (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      path: string,
      access: string,
      payload?: unknown,
    ) =>
      app.inject({
        method,
        url: path,
        headers: {
          authorization: 'Bearer ' + access,
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
      });
    const event = () => ({
      academicYearId: yearId,
      name: 'QA HTTP agenda',
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      type: 'event',
      startAt: '2026-11-02T08:00:00+07:00',
      endAt: '2026-11-02T09:00:00+07:00',
      location: 'Aula QA',
    });
    it('authenticates a real signed token against loopback JWKS and current database role', async () => {
      const response = await request('GET', '/auth/session-status', token(actors.teacher));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ active: true, binding: 'oidc' });
      expect(response.headers['cache-control']).toBe('private, no-store');
    });
    it('Humas creates/reads/edits/deletes a timed event through the controller', async () => {
      const access = token(actors.humas),
        created = await request('POST', '/school/calendar', access, event());
      expect(created.statusCode).toBe(201);
      const id = created.json().id as string;
      const saved = await db.academicCalendar.findUniqueOrThrow({ where: { id } });
      expect(saved.location).toBe('Aula QA');
      expect(saved.startAt?.toISOString()).toBe('2026-11-02T01:00:00.000Z');
      expect(
        (await request('PATCH', '/school/calendar/' + id, access, { location: 'QA diubah' }))
          .statusCode,
      ).toBe(200);
      const read = await request(
        'GET',
        '/school/calendar?academicYearId=' + yearId,
        token(actors.pupil),
      );
      expect(
        read
          .json()
          .some((r: { id: string; location: string }) => r.id === id && r.location === 'QA diubah'),
      ).toBe(true);
      expect((await request('DELETE', '/school/calendar/' + id, access)).statusCode).toBe(200);
    });
    it.each([
      { ...event(), startDate: '2026-02-30' },
      { ...event(), endAt: null },
      { ...event(), unknown: 'field' },
      { ...event(), type: 'holiday' },
    ])('rejects invalid calendar request without business writes', async (bad) => {
      const count = await db.academicCalendar.count();
      expect(
        (
          await request('POST', '/school/calendar', token(actors.humas), {
            ...bad,
            academicYearId: yearId,
          })
        ).statusCode,
      ).toBe(400);
      expect(await db.academicCalendar.count()).toBe(count);
    });
    it('denies plain Guru including a forged high role claim', async () => {
      expect(
        (
          await request(
            'POST',
            '/school/calendar',
            token(actors.teacher, false, sessions.get(actors.teacher.id), ['SUPER_ADMIN']),
            event(),
          )
        ).statusCode,
      ).toBe(403);
    });
    it('fresh service authority honors a manual revoke even with a warm permission cache', async () => {
      const access = token(actors.humas);
      await permissions.getEffectivePermissions(actors.humas.keycloakId, ['GURU']);
      const perm = await db.permission.findUniqueOrThrow({
        where: { code: 'school.calendar.manage' },
      });
      const deny = await db.userPermissionOverride.create({
        data: {
          userId: actors.humas.id,
          permissionId: perm.id,
          grant: false,
          source: 'MANUAL',
          status: 'ACTIVE',
        },
      });
      expect((await request('POST', '/school/calendar', access, event())).statusCode).toBe(403);
      await db.userPermissionOverride.delete({ where: { id: deny.id } });
    });
    it('reissues only selected active pupils/parents and forces password change', async () => {
      for (const user of [actors.pupil, actors.parent]) {
        const result = await request(
          'PATCH',
          `/users/${user.id}/learner-credential`,
          token(actors.tu),
        );
        expect(result.statusCode).toBe(200);
        expect(result.json().requiresPasswordChange).toBe(true);
        expect(result.json().temporaryPassword).toBe(issued.get(user.keycloakId));
        expect(result.json()).toMatchObject({
          userId: user.id,
          role: user.role,
          fullName: user.fullName,
        });
        expect(result.headers['cache-control']).toBe('private, no-store');
      }
      expect(iam.setTempPassword).toHaveBeenCalledTimes(2);
    });
    it('does not reset a teacher through the pupil/parent endpoint', async () => {
      const before = iam.setTempPassword.mock.calls.length;
      expect(
        (await request('PATCH', `/users/${actors.teacher.id}/learner-credential`, token(actors.tu)))
          .statusCode,
      ).toBe(403);
      expect(iam.setTempPassword).toHaveBeenCalledTimes(before);
    });
    it('denies ordinary teachers and malformed target IDs', async () => {
      expect(
        (
          await request(
            'PATCH',
            `/users/${actors.pupil.id}/learner-credential`,
            token(actors.teacher),
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (await request('PATCH', '/users/not-a-uuid/learner-credential', token(actors.tu)))
          .statusCode,
      ).toBe(400);
    });
    it('rejects an expired token for all reads but accepts its signature-verified logout proof', async () => {
      const expired = token(actors.teacher, true),
        fresh = token(actors.teacher);
      expect((await request('GET', '/auth/me', expired)).statusCode).toBe(401);
      expect(
        (
          await request('POST', '/auth/session/logout', expired, {
            keycloakId: actors.tu.keycloakId,
          })
        ).statusCode,
      ).toBe(204);
      expect((await request('GET', '/auth/session-status', fresh)).statusCode).toBe(401);
      expect((await request('POST', '/auth/session/logout', expired)).statusCode).toBe(204);
      expect((await request('GET', '/auth/session-status', token(actors.tu))).statusCode).toBe(200);
      expect(
        (await request('GET', '/auth/session-status', token(actors.teacher, false, randomUUID())))
          .statusCode,
      ).toBe(200);
    });
    it('rejects invalid signature/algorithm even for logout', async () => {
      const forged = jwt.sign(
        { sub: actors.teacher.keycloakId, sid: 'forged' },
        'synthetic-wrong-secret',
        { algorithm: 'HS256', keyid: 'qa-teacher-workspace', issuer },
      );
      expect((await request('POST', '/auth/session/logout', forged)).statusCode).toBe(401);
    });
  },
);
