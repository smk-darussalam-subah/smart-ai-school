import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { KeycloakTokenPayloadSchema } from '@smk/auth';
import { SchoolConfigService } from '../school-config/school-config.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AuthService } from '../auth/auth.service';
import { UserStatusService } from '../auth/user-status.service';
import { SseTokenService } from '../auth/sse-token.service';
import { verifiedSessionBinding } from '../auth/session-binding';
import {
  APPOINTMENT_ACTIVATION_LOCK_KEY,
  type AppointmentsService,
} from '../appointments/appointments.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AcademicPeriodService } from '../academic-period/academic-period.service';
import { CreateCalendarEventSchema } from '../school-config/dto/calendar-event.dto';

const url = process.env.TEACHER_WORKSPACE_TEST_DATABASE_URL;
if (
  url &&
  !/^postgresql:\/\/diis_fixture:diis_fixture_local_only@127\.0\.0\.1:\d+\/diis_teacher_workspace_test(?:\?.*)?$/.test(
    url,
  )
)
  throw Error('Explicit local disposable teacher-workspace database required');
(url ? describe : describe.skip)('approved teacher workspace with actual PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url }),
    db2 = new PrismaClient({ datasourceUrl: url });
  const prisma = db as PrismaService,
    permissions = new PermissionsService(prisma);
  const calendar = new SchoolConfigService(
    prisma,
    permissions,
    {
      acquireActivationLock: async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${APPOINTMENT_ACTIVATION_LOCK_KEY}))`;
      },
    } as AppointmentsService,
    {} as AcademicPeriodService,
  );
  let yearId: string, actor: AuthUser, appointmentId: string;
  const namePrefix = 'Synthetic workspace ' + randomUUID();
  beforeAll(async () => {
    await db.$executeRaw`COMMENT ON DATABASE diis_teacher_workspace_test IS 'DIIS_TEACHER_WORKSPACE_DISPOSABLE_V1'`;
    await db.academicYear.updateMany({ data: { isActive: false } });
    await db.appointment.updateMany({
      where: { staff: { user: { email: { endsWith: '@example.invalid' } } } },
      data: { status: 'ENDED', endedAt: new Date() },
    });
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
    const u = await db.user.create({
      data: {
        keycloakId: randomUUID(),
        role: 'GURU',
        email: randomUUID() + '@example.invalid',
        fullName: 'QA Humas',
      },
    });
    const staff = await db.staff.create({ data: { userId: u.id, employmentStatus: 'GTY' } });
    const pos = await db.position.findUniqueOrThrow({ where: { code: 'WAKA_HUMAS' } });
    const appointment = await db.appointment.create({
      data: {
        staffId: staff.id,
        positionId: pos.id,
        academicYearId: year.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-07-01'),
      },
    });
    appointmentId = appointment.id;
    actor = {
      keycloakId: u.keycloakId,
      roles: ['GURU'],
      email: u.email,
      username: 'qa-humas',
      fullName: u.fullName,
    };
  });
  afterAll(async () => {
    await db.$disconnect();
    await db2.$disconnect();
  });
  const data = (overrides: Record<string, unknown> = {}) =>
    CreateCalendarEventSchema.parse({
      academicYearId: yearId,
      name: namePrefix,
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      type: 'event',
      startAt: '2026-11-02T08:00:00+07:00',
      endAt: '2026-11-02T10:00:00+07:00',
      location: 'Aula QA',
      ...overrides,
    });
  it.each(['holiday', 'exam', 'event', 'break'])(
    'active Humas can create/update/delete %s with exact WIB times',
    async (type) => {
      const row = await calendar.createCalendarEvent(
        data({
          type,
          ...(['holiday', 'break'].includes(type) ? { startAt: null, endAt: null } : {}),
        }),
        actor,
      );
      expect(row.startAt?.toISOString() ?? null).toBe(
        ['holiday', 'break'].includes(type) ? null : '2026-11-02T01:00:00.000Z',
      );
      expect(row.location).toBe('Aula QA');
      const updated = await calendar.updateCalendarEvent(
        row.id,
        { location: 'Ruang QA', startAt: null, endAt: null },
        actor,
      );
      expect(updated.startAt).toBeNull();
      expect(updated.endAt).toBeNull();
      expect(updated.location).toBe('Ruang QA');
      await calendar.deleteCalendarEvent(row.id, actor);
      expect(await db.academicCalendar.findUnique({ where: { id: row.id } })).toBeNull();
    },
  );
  it('ordinary Guru and a forged JWT position never grant calendar writes', async () => {
    const u = await db.user.create({
      data: {
        keycloakId: randomUUID(),
        role: 'GURU',
        email: randomUUID() + '@example.invalid',
        fullName: 'QA Guru',
      },
    });
    await expect(
      calendar.createCalendarEvent(data(), {
        ...actor,
        keycloakId: u.keycloakId,
        roles: ['WAKA_HUMAS'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });
  it('missing actor fails closed, including direct service calls', async () => {
    await expect(calendar.createCalendarEvent(data())).rejects.toThrow(ForbiddenException);
  });
  it.each([
    { endAt: '2026-11-02T07:00:00+07:00' },
    { startAt: null },
    { endAt: '2026-11-03T10:00:00+07:00' },
    { startDate: '2026-06-01', endDate: '2026-06-01', startAt: null, endAt: null },
  ])('rejects invalid date/time or year range without writes', async (invalid) => {
    const before = await db.academicCalendar.count();
    await expect(calendar.createCalendarEvent(data(invalid), actor)).rejects.toThrow();
    expect(await db.academicCalendar.count()).toBe(before);
  });
  it('preserves date-only events without invented clock values', async () => {
    const row = await calendar.createCalendarEvent(
      data({ startAt: null, endAt: null, location: null }),
      actor,
    );
    expect(row.startAt).toBeNull();
    expect(row.endAt).toBeNull();
    await expect(
      db.academicCalendar.update({
        where: { id: row.id },
        data: { startAt: new Date(), endAt: null },
      }),
    ).rejects.toThrow();
  });
  it('rejects a queued Humas mutation after appointment revocation commits', async () => {
    let held!: () => void, release!: () => void;
    const ready = new Promise<void>((r) => {
        held = r;
      }),
      wait = new Promise<void>((r) => {
        release = r;
      });
    const blocker = db2.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${APPOINTMENT_ACTIVATION_LOCK_KEY}))`;
      held();
      await wait;
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: 'ENDED', endedAt: new Date() },
      });
    });
    await ready;
    const request = calendar.createCalendarEvent(data(), actor);
    await new Promise((r) => setTimeout(r, 80));
    release();
    await blocker;
    await expect(request).rejects.toThrow(ForbiddenException);
    await db.appointment.update({
      where: { id: appointmentId },
      data: { status: 'ACTIVE', endedAt: null },
    });
  });
  it('binds logout to verified issuer, subject and OIDC session, not token rotation', async () => {
    const payload = KeycloakTokenPayloadSchema.parse({
      sub: actor.keycloakId,
      iss: 'https://idp.fixture.invalid/realms/qa',
      iat: 1,
      exp: 9999999999,
      sid: randomUUID(),
    });
    const a = verifiedSessionBinding(payload, 'at-old'),
      b = verifiedSessionBinding(payload, 'at-new');
    expect(a).toEqual(b);
    const auth = new AuthService(prisma, permissions),
      statusA = new UserStatusService(prisma),
      statusB = new UserStatusService(db2 as PrismaService);
    const sessionActor = { ...actor, sessionBinding: a.id, sessionBindingKind: a.kind };
    expect((await statusA.getAuthorizationState(actor.keycloakId, a.id)).blocked).toBe(false);
    await Promise.all([auth.logoutSession(sessionActor), auth.logoutSession(sessionActor)]);
    expect((await statusA.getAuthorizationState(actor.keycloakId, b.id)).blocked).toBe(true);
    expect((await statusB.getAuthorizationState(actor.keycloakId, b.id)).blocked).toBe(true);
    const next = verifiedSessionBinding({ ...payload, sid: randomUUID() }, 'new-signin');
    expect((await statusB.getAuthorizationState(actor.keycloakId, next.id)).blocked).toBe(false);
    expect(
      verifiedSessionBinding({ ...payload, iss: 'https://another.invalid' }, 'at-old').id,
    ).not.toBe(a.id);
  });
  it('revoked sessions cannot consume pre-issued SSE tickets; normal consumption is atomic', async () => {
    const ticketService = new SseTokenService(prisma),
      auth = new AuthService(prisma, permissions);
    const sessionBinding = verifiedSessionBinding(
      KeycloakTokenPayloadSchema.parse({
        sub: actor.keycloakId,
        iss: 'https://fixture.invalid',
        sid: randomUUID(),
        iat: 1,
        exp: 9999999999,
      }),
      'at',
    ).id;
    const user = { ...actor, sessionBinding };
    const ticket = await ticketService.createToken(user);
    expect(ticket.token.length).toBeLessThanOrEqual(128);
    const results = await Promise.allSettled([
      ticketService.validateAndConsumeToken(ticket.token),
      new SseTokenService(db2 as PrismaService).validateAndConsumeToken(ticket.token),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const queued = await ticketService.createToken(user);
    await auth.logoutSession(user);
    await expect(ticketService.validateAndConsumeToken(queued.token)).rejects.toThrow();
  });
  it('parallel revocation reads do not hold a small pool while acquiring another connection', async () => {
    const pool = new PrismaClient({ datasourceUrl: url + '?connection_limit=3&pool_timeout=5' });
    try {
      const status = new UserStatusService(pool as PrismaService);
      const binding = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      await status.getAuthorizationState(actor.keycloakId, binding);
      const results = await Promise.all(
        Array.from({ length: 60 }, () => status.getAuthorizationState(actor.keycloakId, binding)),
      );
      expect(results.every((r) => !r.blocked)).toBe(true);
      await new AuthService(prisma, permissions).logoutSession({
        ...actor,
        sessionBinding: binding,
      });
      const denied = await Promise.all(
        Array.from({ length: 60 }, () => status.getAuthorizationState(actor.keycloakId, binding)),
      );
      expect(denied.every((r) => r.blocked)).toBe(true);
    } finally {
      await pool.$disconnect();
    }
  });
});
