import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { AuthUser } from '@smk/auth';
import { ClassSessionService } from '../class-sessions/class-session.service';
import { ListClassSessionQuerySchema } from '../class-sessions/class-session.dto';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { AttendanceQuerySchema } from '../staff-attendance/staff-attendance.dto';
import { UsersService } from '../users/users.service';
import { UserStatusService } from '../auth/user-status.service';
import type { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import type { ClassesService } from '../classes/classes.service';
import type { PrismaService } from '../prisma/prisma.service';
import { acquireIdentityMutationLock } from '../common/helpers/identity-mutation-lock';
import { lockOperationalTeachers } from '../common/helpers/operational-teacher';
import {
  readSessionActivation,
  sessionActivationBindingKey,
  sessionAlertSuppression,
} from '../common/helpers/class-session-activation';
import { ClassSessionDueService } from '../class-sessions/class-session-due.service';
import type { NotificationService } from '../notification/notification.service';
import { resolveNotificationIntent } from '../common/helpers/class-session-notification';
import { POSITION_CODES } from '@smk/auth';
import { OperationalMonitoringService } from '../operational-monitoring/operational-monitoring.service';
import type { DisplayDeviceService } from '../display-devices/display-device.service';
import type { DisplayPlaybackLeaseService } from '../operational-monitoring/display-playback-lease.service';

const url = process.env.SESSION_LIFECYCLE_PROOF_DATABASE_URL;
if (
  url &&
  !/^postgresql:\/\/diis_local:diis_local@127\.0\.0\.1:55439\/diis_session_(lifecycle_followup|activation_wave)$/.test(
    url,
  )
) {
  throw new Error('This proof may only use its dedicated disposable loopback database');
}
const proof = url ? describe : describe.skip;
const date = '2026-10-20';
const clock = new Date(`${date}T06:00:00Z`);
proof('R01–R03: real PostgreSQL and production services', () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const db = prisma as unknown as PrismaService;
  const bells = new BellScheduleService(db);
  const permissions = new PermissionsService(db);
  const sessions = new ClassSessionService(
    db,
    bells,
    permissions,
    new AcademicPeriodService(db, permissions),
  );
  // Only the external IdP is synthetic. Identity writes, locks, RBAC, sessions,
  // bells and attendance all use the real production services and PostgreSQL.
  const users = new UsersService(
    db,
    new UserStatusService(db),
    {
      getUserRealmRoles: async () => [],
      assignRealmRole: async () => {},
      removeRealmRole: async () => {},
      setEnabled: async () => {},
      logoutUser: async () => {},
    } as unknown as KeycloakAdminService,
    permissions,
    {} as ClassesService,
  );
  const attendance = new StaffAttendanceService(db, bells, permissions);
  let yearId: string, semesterId: string, bellId: string;
  let owner: Awaited<ReturnType<typeof person>>, admin: Awaited<ReturnType<typeof person>>;
  let current: Awaited<ReturnType<typeof seedSession>>;
  const actor = (person: { keycloakId: string; role: UserRole }) =>
    ({ keycloakId: person.keycloakId, roles: [person.role] }) as AuthUser;
  async function person(role: UserRole = 'GURU') {
    return prisma.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `${randomUUID()}@example.invalid`,
        fullName: 'Synthetic lifecycle proof',
        role,
        createdAt: new Date('2026-07-01'),
        staff: { create: { employmentStatus: role === 'GURU' ? 'GTY' : 'PTY' } },
        teacher: { create: {} },
      },
      include: { teacher: true, staff: true },
    });
  }
  async function seedSession(user: Awaited<ReturnType<typeof person>>, serviceDate = date) {
    const klass = await prisma.class.create({
      data: {
        name: `SYN ${randomUUID().slice(0, 8)}`,
        grade: 10,
        majorCode: 'SYN',
        academicYear: '2026/2027',
      },
    });
    const ta = await prisma.teachingAssignment.create({
      data: {
        teacherId: user.teacher!.id,
        classId: klass.id,
        subject: 'Synthetic subject',
        academicYear: '2026/2027',
      },
    });
    const slot = await prisma.schedule.create({
      data: {
        classId: klass.id,
        teachingAssignmentId: ta.id,
        dayOfWeek: new Date(serviceDate).getUTCDay() || 7,
        academicYear: '2026/2027',
        semester: 1,
        jpStart: 1,
        jpEnd: 1,
      },
    });
    return prisma.classSession.create({
      data: {
        scheduleId: slot.id,
        serviceDate: new Date(serviceDate),
        academicYearId: yearId,
        semesterId,
        bellScheduleProfileId: bellId,
        classId: klass.id,
        teachingAssignmentId: ta.id,
        scheduledTeacherId: user.teacher!.id,
        assignedTeacherId: user.teacher!.id,
        classNameSnapshot: klass.name,
        subjectSnapshot: ta.subject,
        scheduledTeacherName: user.fullName,
        assignedTeacherName: user.fullName,
        scheduledStartAt: new Date(clock.getTime() - 60_000),
        scheduledEndAt: new Date(clock.getTime() + 30 * 60_000),
        alerts: {
          create: ['PRIVATE_T5', 'ROOM_T10', 'ESCALATION_T15'].map((stage) => ({
            stage: stage as 'PRIVATE_T5' | 'ROOM_T10' | 'ESCALATION_T15',
            dueAt: new Date(clock.getTime() + 60_000),
          })),
        },
      },
    });
  }
  async function cleanup() {
    await prisma.classSession.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.teachingAssignment.deleteMany();
    await prisma.class.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.staffAttendance.deleteMany();
    await prisma.userPermissionOverride.deleteMany();
    await prisma.teacher.deleteMany();
    await prisma.staff.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: '@example.invalid' } } });
  }
  beforeAll(async () => {
    jest.useFakeTimers({
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'hrtime',
        'performance',
        'queueMicrotask',
      ],
    });
    jest.setSystemTime(clock);
    await prisma.academicYear.updateMany({ data: { isActive: false } });
    await prisma.semester.updateMany({ data: { isActive: false } });
    const year = await prisma.academicYear.create({
      data: {
        code: '2026/2027',
        isActive: true,
        startDate: new Date('2026-07-01'),
        endDate: new Date('2027-06-30'),
      },
    });
    yearId = year.id;
    const semester = await prisma.semester.create({
      data: {
        academicYearId: yearId,
        number: 1,
        isActive: true,
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    semesterId = semester.id;
    await prisma.bellScheduleProfile.updateMany({ data: { revokedAt: clock } });
    const bell = await prisma.bellScheduleProfile.create({
      data: {
        code: 'SYN_LIFECYCLE',
        name: 'Synthetic lifecycle',
        effectiveFrom: new Date('2026-07-01'),
        provenance: 'disposable local proof',
        segments: {
          create: {
            dayOfWeek: 0,
            type: 'INSTRUCTION',
            jpNumber: 1,
            label: 'JP 1',
            startMinute: 779,
            endMinute: 810,
            sortOrder: 1,
          },
        },
      },
    });
    bellId = bell.id;
    const permission = await prisma.permission.upsert({
      where: { code: 'academic.class-session.manage' },
      update: {},
      create: {
        code: 'academic.class-session.manage',
        module: 'academic',
        description: 'Synthetic role parity',
      },
    });
    await prisma.rolePermission.upsert({
      where: { role_permissionId: { role: 'GURU', permissionId: permission.id } },
      update: {},
      create: { role: 'GURU', permissionId: permission.id },
    });
    await prisma.schoolProfile.create({
      data: { name: 'Synthetic lifecycle school', attendanceWorkingDays: [1, 2, 3, 4, 5, 6] },
    });
  });
  beforeEach(async () => {
    jest.setSystemTime(clock);
    await cleanup();
    admin = await person('SUPER_ADMIN');
    owner = await person();
    current = await seedSession(owner);
    await prisma.$executeRaw`DELETE FROM academic.class_session_activations`;
    await prisma.$executeRaw`INSERT INTO academic.class_session_activations
      (semester_id, enabled, revision, activated_at, changed_by, updated_at)
      VALUES (${semesterId}::uuid, true, 1, ${clock}, ${admin.keycloakId}, ${clock})`;
    await prisma.classSessionEvent.create({
      data: {
        sessionId: current.id,
        eventType: 'ALERT_CREATED',
        eventKey: sessionActivationBindingKey(current.id, 1),
        actorType: 'SYSTEM',
      },
    });
  });
  afterAll(async () => {
    try {
      await cleanup();
      expect(await prisma.classSession.count()).toBe(0);
      expect(await prisma.user.count({ where: { email: { endsWith: '@example.invalid' } } })).toBe(
        0,
      );
    } finally {
      jest.useRealTimers();
      await prisma.$disconnect();
    }
  });
  async function waitForSessionWaiter() {
    for (let attempt = 0; attempt < 150; attempt++) {
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database()
        AND wait_event_type = 'Lock' AND query LIKE '%academic.class_sessions%FOR UPDATE%'`;
      if (rows[0]?.count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Actual queued session row-lock waiter was not observed');
  }
  async function holdSessionInputs() {
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('academic:schedule:mutation:v1'))`,
        );
        entered();
        await held;
      },
      { timeout: 15_000 },
    );
    await ready;
    return async () => {
      release();
      await blocker;
    };
  }
  async function waitForInputWaiters(count: number) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE '%academic:schedule:mutation:v1%'`;
      if ((rows[0]?.count ?? 0) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected ${count} actual input-lock waiters`);
  }
  it('R04: queued start then complete uses post-lock server time and replays without rewriting it', async () => {
    const release = await holdSessionInputs();
    const startDto = { idempotencyKey: randomUUID() };
    const completeDto = { idempotencyKey: randomUUID() };
    const starting = sessions.start(current.id, startDto, actor(owner));
    let completing: ReturnType<typeof sessions.complete> | undefined;
    try {
      await waitForInputWaiters(1);
      jest.setSystemTime(new Date(clock.getTime() + 1000));
      completing = sessions.complete(current.id, completeDto, actor(owner));
      await waitForInputWaiters(2);
      jest.setSystemTime(new Date(clock.getTime() + 2000));
    } finally {
      await release();
    }
    await starting;
    await completing;
    const actual = await prisma.classSession.findUniqueOrThrow({ where: { id: current.id } });
    expect(actual).toMatchObject({ status: 'COMPLETED', version: 3 });
    expect(actual.startedAt).toEqual(new Date(clock.getTime() + 2000));
    expect(actual.completedAt!.getTime()).toBeGreaterThanOrEqual(actual.startedAt!.getTime());
    jest.setSystemTime(new Date(clock.getTime() + 3000));
    await expect(sessions.complete(current.id, completeDto, actor(owner))).resolves.toMatchObject({
      completedAt: actual.completedAt,
      version: 3,
    });
    expect(
      await prisma.classSessionEvent.count({
        where: { sessionId: current.id, eventType: 'STARTED' },
      }),
    ).toBe(1);
    expect(
      await prisma.classSessionEvent.count({
        where: { sessionId: current.id, eventType: 'COMPLETED' },
      }),
    ).toBe(1);
  });
  it('R04: sequential start then complete preserves elapsed time', async () => {
    await sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner));
    jest.setSystemTime(new Date(clock.getTime() + 1000));
    const actual = await sessions.complete(
      current.id,
      { idempotencyKey: randomUUID() },
      actor(owner),
    );
    expect(actual.startedAt).toEqual(clock);
    expect(actual.completedAt).toEqual(new Date(clock.getTime() + 1000));
  });
  it('R04: complete queued before start is rejected without a completion event', async () => {
    const release = await holdSessionInputs();
    const completing = sessions
      .complete(current.id, { idempotencyKey: randomUUID() }, actor(owner))
      .then(
        () => null,
        (error: unknown) => error,
      );
    let starting: ReturnType<typeof sessions.start> | undefined;
    try {
      await waitForInputWaiters(1);
      starting = sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner));
      await waitForInputWaiters(2);
      jest.setSystemTime(new Date(clock.getTime() + 2000));
    } finally {
      await release();
    }
    expect(await completing).toMatchObject({ status: 409 });
    await starting;
    expect(
      await prisma.classSession.findUniqueOrThrow({ where: { id: current.id } }),
    ).toMatchObject({ status: 'STARTED', completedAt: null, version: 2 });
    expect(
      await prisma.classSessionEvent.count({
        where: { sessionId: current.id, eventType: 'COMPLETED' },
      }),
    ).toBe(0);
  });
  it('R04: the existing database constraint still rejects STARTED without startedAt', async () => {
    await expect(
      prisma.classSession.update({
        where: { id: current.id },
        data: { status: 'STARTED', startedAt: null },
      }),
    ).rejects.toThrow('class_sessions_lifecycle_check');
    expect(
      await prisma.classSession.findUniqueOrThrow({ where: { id: current.id } }),
    ).toMatchObject({ status: 'SCHEDULED', version: 1, startedAt: null, completedAt: null });
  });
  it.each(['clock-backwards', 'invalid-clock'] as const)(
    'R04: %s fails closed without altering history or alerts',
    async (scenario) => {
      await prisma.classSession.update({
        where: { id: current.id },
        data: {
          status: 'STARTED',
          startedAt: clock,
        },
      });
      const before = await prisma.classSession.findUniqueOrThrow({ where: { id: current.id } });
      const effectiveClock =
        scenario === 'clock-backwards' ? new Date(clock.getTime() - 1) : new Date(Number.NaN);
      await expect(
        sessions.complete(
          current.id,
          { idempotencyKey: randomUUID() },
          actor(owner),
          effectiveClock,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(await prisma.classSession.findUniqueOrThrow({ where: { id: current.id } })).toEqual(
        before,
      );
      expect(await prisma.classSessionEvent.count({ where: { sessionId: current.id } })).toBe(1);
      expect(
        await prisma.classSessionAlert.count({
          where: { sessionId: current.id, status: 'PENDING' },
        }),
      ).toBe(3);
    },
  );
  it('R04: cancellation queued behind start also takes its clock after locks', async () => {
    const release = await holdSessionInputs();
    const starting = sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner));
    let cancelling: ReturnType<typeof sessions.cancel> | undefined;
    try {
      await waitForInputWaiters(1);
      jest.setSystemTime(new Date(clock.getTime() + 1000));
      cancelling = sessions.cancel(
        current.id,
        { idempotencyKey: randomUUID(), reason: 'Synthetic queued cancellation' },
        actor(admin),
      );
      await waitForInputWaiters(2);
      jest.setSystemTime(new Date(clock.getTime() + 2000));
    } finally {
      await release();
    }
    await starting;
    await cancelling;
    const actual = await prisma.classSession.findUniqueOrThrow({ where: { id: current.id } });
    expect(actual.status).toBe('CANCELLED');
    expect(actual.cancelledAt!.getTime()).toBeGreaterThanOrEqual(actual.startedAt!.getTime());
  });
  it('R04: reassignment takes its audit clock after the queued authority check', async () => {
    const replacement = await person();
    await prisma.teachingAssignment.create({
      data: {
        teacherId: replacement.teacher!.id,
        classId: current.classId,
        subject: current.subjectSnapshot,
        academicYear: '2026/2027',
      },
    });
    const release = await holdSessionInputs();
    const reassigning = sessions.reassign(
      current.id,
      {
        teacherId: replacement.teacher!.id,
        reason: 'Synthetic queued reassignment',
        idempotencyKey: randomUUID(),
      },
      actor(admin),
    );
    try {
      await waitForInputWaiters(1);
      jest.setSystemTime(new Date(clock.getTime() + 2000));
    } finally {
      await release();
    }
    expect(await reassigning).toMatchObject({
      status: 'REASSIGNED',
      reassignedAt: new Date(clock.getTime() + 2000),
    });
  });
  it.each(
    (['start', 'complete'] as const).flatMap((action) =>
      (['disabled', 'TU', 'archived'] as const).map((change) => ({ action, change })),
    ),
  )('R01: committed $change beats a queued $action request', async ({ action, change }) => {
    if (action === 'complete')
      await prisma.classSession.update({
        where: { id: current.id },
        data: { status: 'STARTED', startedAt: clock },
      });
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM academic.class_sessions WHERE id = ${current.id}::uuid FOR UPDATE`,
        );
        entered();
        await hold;
      },
      { timeout: 15_000 },
    );
    await ready;
    const pending = sessions[action](
      current.id,
      { idempotencyKey: randomUUID() },
      actor(owner),
      clock,
    ).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    try {
      await waitForSessionWaiter();
      if (change === 'disabled') await users.updateActive(owner.id, false, admin.keycloakId);
      if (change === 'TU') await users.updateRole(owner.id, 'TATA_USAHA', admin.keycloakId);
      if (change === 'archived') {
        const latest = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
        await users.archiveUser(
          owner.id,
          {
            reason: 'Synthetic queued archival',
            expectedUpdatedAt: latest.updatedAt.toISOString(),
          },
          admin.keycloakId,
        );
      }
    } finally {
      release();
      await blocker;
    }
    expect((await pending).error).toMatchObject({ status: 403 });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject(
      change === 'TU' ? { role: 'TATA_USAHA' } : { isActive: false },
    );
    expect(
      await prisma.classSession.findUniqueOrThrow({ where: { id: current.id } }),
    ).toMatchObject({ status: action === 'complete' ? 'STARTED' : 'SCHEDULED', version: 1 });
    expect(await prisma.classSessionEvent.count({ where: { sessionId: current.id } })).toBe(1);
    expect(
      await prisma.classSessionAlert.count({
        where: { sessionId: current.id, status: 'PENDING' },
      }),
    ).toBe(3);
  });
  it('R01: a valid first commit is durable, but a replay after revocation is denied', async () => {
    const dto = { idempotencyKey: randomUUID() };
    await expect(sessions.start(current.id, dto, actor(owner), clock)).resolves.toMatchObject({
      status: 'STARTED',
    });
    await users.updateActive(owner.id, false, admin.keycloakId);
    await expect(sessions.start(current.id, dto, actor(owner), clock)).rejects.toMatchObject({
      status: 403,
    });
    expect(
      await prisma.classSessionEvent.count({
        where: { sessionId: current.id, eventType: 'STARTED' },
      }),
    ).toBe(1);
  });
  it('R01: account archival is observed before starting a session', async () => {
    const latest = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    await users.archiveUser(
      owner.id,
      { reason: 'Synthetic archive proof', expectedUpdatedAt: latest.updatedAt.toISOString() },
      admin.keycloakId,
    );
    await expect(
      sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner), clock),
    ).rejects.toMatchObject({ status: 403 });
    expect(await prisma.classSessionEvent.count({ where: { sessionId: current.id } })).toBe(1);
  });
  it('R01: teacher-to-TU transition invalidates an old Guru request', async () => {
    await users.updateRole(owner.id, 'TATA_USAHA', admin.keycloakId);
    await expect(
      sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner), clock),
    ).rejects.toMatchObject({ status: 403 });
    expect(await prisma.teacher.count({ where: { id: owner.teacher!.id } })).toBe(1);
  });
  it.each([
    'disabled',
    'TU',
    'archivedUser',
    'archivedTeacher',
    'archivedStaff',
    'missingStaff',
  ] as const)(
    'R02: preview then %s drift causes zero new sessions/events/alerts',
    async (state) => {
      const target = '2026-10-21';
      const future = await seedSession(owner, target);
      await prisma.classSession.delete({ where: { id: future.id } });
      const plan = await sessions.materialize(target, 'system', { preview: true });
      if (!('planHash' in plan)) throw new Error('Preview required');
      expect(plan.newCount).toBe(1);
      if (state === 'disabled') await users.updateActive(owner.id, false, admin.keycloakId);
      if (state === 'TU') await users.updateRole(owner.id, 'TATA_USAHA', admin.keycloakId);
      if (state === 'archivedUser')
        await prisma.user.update({ where: { id: owner.id }, data: { deletedAt: clock } });
      if (state === 'archivedTeacher')
        await prisma.teacher.update({
          where: { id: owner.teacher!.id },
          data: { deletedAt: clock },
        });
      if (state === 'archivedStaff')
        await prisma.staff.update({ where: { id: owner.staff!.id }, data: { deletedAt: clock } });
      if (state === 'missingStaff') await prisma.staff.delete({ where: { id: owner.staff!.id } });
      await expect(
        sessions.materialize(target, admin.keycloakId, { expectedPlanHash: plan.planHash }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await prisma.classSession.count({ where: { serviceDate: new Date(target) } })).toBe(0);
      expect(await prisma.classSessionEvent.count()).toBe(1); // Unchanged activation provenance on the earlier fixture.
      expect(await prisma.classSessionAlert.count()).toBe(3); // Only the earlier day's untouched fixture.
    },
  );
  it('R02: two fresh confirmations create one session, one event and three alerts', async () => {
    const future = await seedSession(owner, '2026-10-21');
    await prisma.classSession.delete({ where: { id: future.id } });
    const plan = await sessions.materialize('2026-10-21', 'system', { preview: true });
    if (!('planHash' in plan)) throw new Error('Preview required');
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        sessions.materialize('2026-10-21', admin.keycloakId, { expectedPlanHash: plan.planHash }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const created = await prisma.classSession.findMany({
      where: { serviceDate: new Date('2026-10-21') },
    });
    expect(created).toHaveLength(1);
    expect(
      await prisma.classSessionEvent.count({
        where: { sessionId: created[0]!.id, eventType: 'MATERIALIZED' },
      }),
    ).toBe(1);
    expect(await prisma.classSessionAlert.count({ where: { sessionId: created[0]!.id } })).toBe(3);
  });
  it('R02: former-teacher replacement cannot take ownership or reactivate alerts', async () => {
    const replacement = await person();
    await prisma.teachingAssignment.create({
      data: {
        teacherId: replacement.teacher!.id,
        classId: current.classId,
        subject: current.subjectSnapshot,
        academicYear: '2026/2027',
      },
    });
    await users.updateRole(replacement.id, 'TATA_USAHA', admin.keycloakId);
    await expect(
      sessions.reassign(
        current.id,
        {
          teacherId: replacement.teacher!.id,
          idempotencyKey: randomUUID(),
          reason: 'Synthetic reassignment',
        },
        actor(admin),
        clock,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await prisma.classSession.findUniqueOrThrow({ where: { id: current.id } }),
    ).toMatchObject({ assignedTeacherId: owner.teacher!.id, version: 1 });
    expect(await prisma.classSessionEvent.count()).toBe(1);
  });
  it('R03: former-teacher TU remains staff, never a teacher KPI or teacher-filter entry', async () => {
    await users.updateRole(owner.id, 'TATA_USAHA', admin.keycloakId);
    await prisma.staffAttendance.create({
      data: {
        userId: owner.id,
        date: new Date(date),
        checkInAt: clock,
        arrivalBasis: 'WORKDAY',
        expectedArrivalAt: new Date(`${date}T00:00:00Z`),
        locationInStatus: 'INSIDE',
      },
    });
    const query = AttendanceQuerySchema.parse({ from: date, to: date, limit: 100 });
    const report = await attendance.report(query);
    expect(report.teacherSummary).toEqual({
      total: 0,
      present: 0,
      inside: 0,
      required: 0,
      dueRequired: 0,
      presentRequired: 0,
      late: 0,
      absent: 0,
      notRequired: 0,
      notScheduled: 0,
      notDue: 0,
      review: 0,
      unknown: 0,
    });
    const teacherRows = await attendance.report({ ...query, unit: 'TEACHER' });
    expect(teacherRows.total).toBe(0);
    const staffRows = await attendance.report({ ...query, unit: 'STAFF' });
    expect(staffRows.data.some((row) => row.employee.id === owner.id && row.employee.teacher)).toBe(
      true,
    );
    expect(report.summary.present).toBe(1);
  });
  it.each(['archivedTeacher', 'archivedStaff', 'inactiveUser'] as const)(
    'R03: %s cannot contribute to teacher denominator',
    async (state) => {
      if (state === 'archivedTeacher')
        await prisma.teacher.update({
          where: { id: owner.teacher!.id },
          data: { deletedAt: clock },
        });
      if (state === 'archivedStaff')
        await prisma.staff.update({ where: { id: owner.staff!.id }, data: { deletedAt: clock } });
      if (state === 'inactiveUser') await users.updateActive(owner.id, false, admin.keycloakId);
      const report = await attendance.report(AttendanceQuerySchema.parse({ from: date, to: date }));
      expect(report.teacherSummary.total).toBe(0);
      expect(report.teacherSummary.dueRequired).toBe(0);
    },
  );
  it('a lifecycle mutation waits when the session authority check has already won serialization', async () => {
    // This barrier is the actual production authority check after row locks.
    const original = permissions.hasFreshPermission.bind(permissions);
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const barrier = jest
      .spyOn(permissions, 'hasFreshPermission')
      .mockImplementation(async (...args) => {
        const allowed = await original(...args);
        entered();
        await hold;
        return allowed;
      });
    const pending = sessions.start(
      current.id,
      { idempotencyKey: randomUUID() },
      actor(owner),
      clock,
    );
    try {
      await Promise.race([
        ready,
        pending.then(() => {
          throw new Error('Authority barrier not reached');
        }),
      ]);
      const revoke = prisma.$transaction(async (tx) => {
        await acquireIdentityMutationLock(tx);
        await tx.user.update({ where: { id: owner.id }, data: { isActive: false } });
      });
      release();
      await expect(pending).resolves.toMatchObject({ status: 'STARTED' });
      await revoke;
    } finally {
      release();
      barrier.mockRestore();
    }
    expect(
      await prisma.classSessionEvent.count({
        where: { sessionId: current.id, eventType: 'STARTED' },
      }),
    ).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      isActive: false,
    });
  });
  it('activation is absent/off by default; no daily session or new start is allowed', async () => {
    await prisma.$executeRaw`DELETE FROM academic.class_session_activations`;
    expect(await sessions.activationStatus()).toMatchObject({
      enabled: false,
      revision: 0,
      semesterId,
    });
    expect(await sessions.prepareToday(clock)).toMatchObject({ suppressed: 'ACTIVATION_DISABLED' });
    await expect(
      sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner), clock),
    ).rejects.toMatchObject({ status: 409 });
    expect(await prisma.classSession.count()).toBe(1);
  });
  it('off blocks a new start but preserves a started session and its authorized completion', async () => {
    const started = await seedSession(owner);
    await prisma.classSession.update({
      where: { id: started.id },
      data: { status: 'STARTED', startedAt: clock },
    });
    expect(await sessions.disableActivation(semesterId, 1, actor(admin))).toMatchObject({
      enabled: false,
      revision: 2,
    });
    const read = await sessions.list({ date, page: 1, limit: 100 }, actor(owner));
    expect(read.data.find((row) => row.id === current.id)).toMatchObject({
      canOperate: false,
      operationBlockedReason: expect.any(String),
    });
    expect(read.data.find((row) => row.id === started.id)).toMatchObject({ canOperate: true });
    expect(
      await prisma.classSession.findUniqueOrThrow({ where: { id: started.id } }),
    ).toMatchObject({ status: 'STARTED' });
    await expect(
      sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner), clock),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      sessions.complete(started.id, { idempotencyKey: randomUUID() }, actor(owner), clock),
    ).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(
      await prisma.classSessionAlert.count({
        where: { status: { in: ['PENDING', 'CLAIMED', 'DISPATCHED'] } },
      }),
    ).toBe(0);
  });
  it('stale disable confirmation and ordinary teacher cannot change activation', async () => {
    await expect(sessions.disableActivation(semesterId, 9, actor(admin))).rejects.toMatchObject({
      status: 409,
    });
    await expect(sessions.disableActivation(semesterId, 1, actor(owner))).rejects.toMatchObject({
      status: 403,
    });
    expect(await readSessionActivation(db, semesterId)).toMatchObject({
      enabled: true,
      revision: 1,
    });
  });
  it('two enable confirmations serialize to one durable activation and future-session binding', async () => {
    await prisma.$executeRaw`DELETE FROM academic.class_session_activations`;
    jest.setSystemTime(new Date(`${date}T05:00:00Z`));
    const plan = await sessions.materialize(date, 'system', { preview: true, activate: true });
    if (!('planHash' in plan)) throw new Error('Preview required');
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        sessions.materialize(date, admin.keycloakId, {
          activate: true,
          expectedPlanHash: plan.planHash,
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await readSessionActivation(db, semesterId)).toMatchObject({
      enabled: true,
      revision: 1,
    });
    expect(await prisma.classSession.count()).toBe(1);
    const restarted = new ClassSessionService(
      db,
      bells,
      permissions,
      new AcademicPeriodService(db, permissions),
    );
    await restarted.prepareToday();
    await restarted.prepareToday();
    expect(await prisma.classSession.count()).toBe(1);
    expect(await prisma.classSessionAlert.count()).toBe(3);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'classSession.activation.enable',
          resourceId: (await readSessionActivation(db, semesterId))!.id,
        },
      }),
    ).toBe(1);
  });
  it('activation after the start time never revives an unstarted older session', async () => {
    await sessions.disableActivation(semesterId, 1, actor(admin));
    const plan = await sessions.materialize(date, 'system', { preview: true, activate: true });
    if (!('planHash' in plan)) throw new Error('Preview required');
    await sessions.materialize(date, admin.keycloakId, {
      activate: true,
      expectedPlanHash: plan.planHash,
    });
    expect(await readSessionActivation(db, semesterId)).toMatchObject({
      enabled: true,
      revision: 3,
    });
    await expect(
      sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner), clock),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.classSessionEvent.count({
        where: { eventKey: sessionActivationBindingKey(current.id, 3) },
      }),
    ).toBe(0);
  });
  it('a changed snapshot rejects activation atomically, without leaving enabled configuration', async () => {
    await prisma.$executeRaw`DELETE FROM academic.class_session_activations`;
    jest.setSystemTime(new Date(`${date}T05:00:00Z`));
    await prisma.classSession.update({
      where: { id: current.id },
      data: { scheduledEndAt: new Date(`${date}T07:00:00Z`) },
    });
    const plan = await sessions.materialize(date, 'system', { preview: true, activate: true });
    if (!('planHash' in plan)) throw new Error('Preview required');
    await expect(
      sessions.materialize(date, admin.keycloakId, {
        activate: true,
        expectedPlanHash: plan.planHash,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await readSessionActivation(db, semesterId)).toBeNull();
  });
  it.each(['holiday', 'break'] as const)(
    '%s rejects preparation and suppresses session alerts',
    async (type) => {
      const holiday = await prisma.academicCalendar.create({
        data: {
          academicYearId: yearId,
          type,
          name: 'Synthetic closure',
          startDate: new Date(date),
          endDate: new Date(date),
        },
      });
      try {
        expect(await sessions.prepareToday(clock)).toMatchObject({ suppressed: 'HOLIDAY' });
        expect(
          await prisma.$transaction((tx) => sessionAlertSuppression(tx, bells, current, clock)),
        ).toBe('HOLIDAY');
      } finally {
        await prisma.academicCalendar.delete({ where: { id: holiday.id } });
      }
    },
  );
  it('Sunday is never a preparation or alert day', async () => {
    expect(await sessions.prepareToday(new Date('2026-10-25T06:00:00Z'))).toMatchObject({
      suppressed: 'SUNDAY',
    });
    expect(
      await prisma.$transaction((tx) =>
        sessionAlertSuppression(
          tx,
          bells,
          { ...current, serviceDate: new Date('2026-10-25') },
          new Date('2026-10-25T06:00:00Z'),
        ),
      ),
    ).toBe('SUNDAY');
  });
  it('new semester requires a new explicit activation; previous activation is not inherited', async () => {
    await prisma.semester.update({ where: { id: semesterId }, data: { isActive: false } });
    const next = await prisma.semester.create({
      data: {
        academicYearId: yearId,
        number: 2,
        isActive: true,
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-06-30'),
      },
    });
    jest.setSystemTime(new Date('2027-01-04T01:00:00Z'));
    try {
      expect(await sessions.activationStatus()).toMatchObject({
        semesterId: next.id,
        enabled: false,
        revision: 0,
      });
      expect(await sessions.prepareToday()).toMatchObject({ suppressed: 'ACTIVATION_DISABLED' });
    } finally {
      await prisma.semester.delete({ where: { id: next.id } });
      await prisma.semester.update({ where: { id: semesterId }, data: { isActive: true } });
    }
  });
  it('private reminder uses DIIS account ID, not Keycloak subject, and queued intent is cancelled on off', async () => {
    await prisma.classSessionAlert.updateMany({
      where: { sessionId: current.id },
      data: { dueAt: new Date(`${date}T07:00:00Z`) },
    });
    await prisma.classSessionAlert.updateMany({
      where: { sessionId: current.id, stage: 'PRIVATE_T5' },
      data: { dueAt: clock },
    });
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const worker = new ClassSessionDueService(
      db,
      bells,
      { enqueueCommittedPendingLogs: enqueue } as unknown as NotificationService,
      sessions,
    );
    const result = await worker.runDueScan(clock);
    expect(result).toMatchObject({ dispatchedCount: 1 });
    const log = await prisma.notificationLog.findFirstOrThrow({
      where: { refType: 'class_session_alert', status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.recipient).toBe(owner.id);
    expect(log.recipient).not.toBe(owner.keycloakId);
    expect(await resolveNotificationIntent(db, log.id)).toMatchObject({ recipient: owner.id });
    await sessions.disableActivation(semesterId, 1, actor(admin));
    expect(await resolveNotificationIntent(db, log.id)).toBeNull();
    expect(await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } })).toMatchObject(
      { status: 'failed', error: 'ACTIVATION_DISABLED' },
    );
    await prisma.notificationLog.delete({ where: { id: log.id } });
  });
  it('escalation accepts the full final appointment date in WIB, then rejects expiry on queued retry', async () => {
    const recipient = await person();
    const position = await prisma.position.upsert({
      where: { code: 'WAKA_KURIKULUM' },
      update: {},
      create: {
        code: 'WAKA_KURIKULUM',
        name: 'Synthetic Waka',
        category: 'STRUKTURAL',
        scopeType: 'NONE',
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        staffId: recipient.staff!.id,
        positionId: position.id,
        academicYearId: yearId,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-07-01'),
        effectiveUntil: new Date(date),
      },
    });
    await prisma.classSessionAlert.updateMany({
      where: { sessionId: current.id },
      data: { dueAt: new Date(`${date}T07:00:00Z`) },
    });
    await prisma.classSessionAlert.updateMany({
      where: { sessionId: current.id, stage: 'ESCALATION_T15' },
      data: { dueAt: clock },
    });
    const worker = new ClassSessionDueService(
      db,
      bells,
      { enqueueCommittedPendingLogs: async () => {} } as unknown as NotificationService,
      sessions,
    );
    expect(await permissions.getActivePositionCodes(recipient.keycloakId)).toContain(
      'WAKA_KURIKULUM',
    );
    expect(await worker.runDueScan(clock)).toMatchObject({ dispatchedCount: 1 });
    const log = await prisma.notificationLog.findFirstOrThrow({
      where: { refType: 'class_session_alert', recipient: recipient.id },
      orderBy: { createdAt: 'desc' },
    });
    try {
      expect(await resolveNotificationIntent(db, log.id)).toMatchObject({
        recipient: recipient.id,
      });
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { effectiveUntil: new Date(new Date(date).getTime() - 86400_000) },
      });
      expect(await resolveNotificationIntent(db, log.id)).toBeNull();
      expect(
        await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } }),
      ).toMatchObject({ status: 'failed', error: 'STALE_ESCALATION_RECIPIENT' });
    } finally {
      await prisma.notificationLog.delete({ where: { id: log.id } });
    }
  });
  it('current instruction, bell snapshot, period and operational teacher all gate alert delivery', async () => {
    expect(
      await prisma.$transaction((tx) => sessionAlertSuppression(tx, bells, current, clock)),
    ).toBeNull();
    expect(
      await prisma.$transaction((tx) =>
        sessionAlertSuppression(tx, bells, current, current.scheduledEndAt),
      ),
    ).toBe('OUTSIDE_SESSION_WINDOW');
    expect(
      await prisma.$transaction((tx) =>
        sessionAlertSuppression(
          tx,
          bells,
          { ...current, bellScheduleProfileId: randomUUID() },
          clock,
        ),
      ),
    ).toBe('STALE_BELL_PROFILE');
    await prisma.user.update({ where: { id: owner.id }, data: { isActive: false } });
    expect(
      await prisma.$transaction((tx) => sessionAlertSuppression(tx, bells, current, clock)),
    ).toBe('INELIGIBLE_TEACHER');
  });
  it('closed semester blocks starts and alerts without preventing opt-out', async () => {
    const closure = await prisma.semesterClosure.create({
      data: {
        academicYearId: yearId,
        semesterId,
        closedByUserId: admin.id,
        readinessVersion: 'synthetic',
        readinessHash: 'synthetic',
        idempotencyKey: randomUUID(),
        snapshot: {},
      },
    });
    try {
      expect(
        await prisma.$transaction((tx) => sessionAlertSuppression(tx, bells, current, clock)),
      ).toBe('STALE_OR_CLOSED_PERIOD');
      await expect(
        sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner), clock),
      ).rejects.toMatchObject({ status: 409 });
      await expect(sessions.prepareToday(clock)).rejects.toMatchObject({ status: 409 });
      await expect(sessions.disableActivation(semesterId, 1, actor(admin))).resolves.toMatchObject({
        enabled: false,
      });
    } finally {
      await prisma.semesterClosure.delete({ where: { id: closure.id } });
    }
  });
  it('instruction break suppresses reminders; next valid JP restores eligibility', async () => {
    const original = await prisma.bellScheduleSegment.findMany({ where: { profileId: bellId } });
    await prisma.bellScheduleSegment.deleteMany({ where: { profileId: bellId } });
    await prisma.bellScheduleSegment.createMany({
      data: [
        {
          profileId: bellId,
          dayOfWeek: 0,
          type: 'INSTRUCTION',
          jpNumber: 1,
          label: 'JP 1',
          startMinute: 779,
          endMinute: 790,
          sortOrder: 1,
        },
        {
          profileId: bellId,
          dayOfWeek: 0,
          type: 'BREAK',
          jpNumber: null,
          label: 'Istirahat',
          startMinute: 790,
          endMinute: 795,
          sortOrder: 2,
        },
        {
          profileId: bellId,
          dayOfWeek: 0,
          type: 'INSTRUCTION',
          jpNumber: 2,
          label: 'JP 2',
          startMinute: 795,
          endMinute: 810,
          sortOrder: 3,
        },
      ],
    });
    await prisma.schedule.update({ where: { id: current.scheduleId }, data: { jpEnd: 2 } });
    try {
      expect(
        await prisma.$transaction((tx) =>
          sessionAlertSuppression(tx, bells, current, new Date(`${date}T06:12:00Z`)),
        ),
      ).toBe('OUTSIDE_INSTRUCTION');
      expect(
        await prisma.$transaction((tx) =>
          sessionAlertSuppression(tx, bells, current, new Date(`${date}T06:15:00Z`)),
        ),
      ).toBeNull();
    } finally {
      await prisma.bellScheduleSegment.deleteMany({ where: { profileId: bellId } });
      await prisma.bellScheduleSegment.createMany({ data: original });
    }
  });
  it.each(POSITION_CODES)('base Guru ownership remains valid with appointment %s', async (code) => {
    const major =
      code === 'KAPROG'
        ? await prisma.major.create({
            data: { code: `SYN-${randomUUID().slice(0, 6)}`, name: 'Synthetic major' },
          })
        : null;
    const position = await prisma.position.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: `Synthetic ${code}`,
        category: 'FUNGSIONAL',
        scopeType: major ? 'MAJOR' : 'NONE',
      },
    });
    await prisma.appointment.create({
      data: {
        staffId: owner.staff!.id,
        positionId: position.id,
        academicYearId: yearId,
        majorId: major?.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-07-01'),
      },
    });
    expect(await permissions.getActivePositionCodes(owner.keycloakId)).toContain(code);
    const appointedActor = { ...actor(owner), roles: ['GURU', code] } as AuthUser;
    const otherTeacher = await person();
    const foreignSession = await seedSession(otherTeacher);
    const ownRead = await sessions.list(
      ListClassSessionQuerySchema.parse({ date, scope: 'own' }),
      appointedActor,
    );
    expect(ownRead.data.map((row) => row.id)).toEqual([current.id]);
    expect(ownRead.data.map((row) => row.id)).not.toContain(foreignSession.id);
    await expect(
      sessions.list(
        ListClassSessionQuerySchema.parse({ scope: 'own', teacherId: otherTeacher.teacher!.id }),
        appointedActor,
      ),
    ).rejects.toMatchObject({ status: 403 });
    if (code === 'KAPROG') {
      const jurisdiction = await sessions.list(
        ListClassSessionQuerySchema.parse({ date }),
        appointedActor,
      );
      expect(jurisdiction.data).toEqual([]); // Own out-of-major teaching must not broaden the default appointment scope.
    }
    await expect(
      sessions.start(current.id, { idempotencyKey: randomUUID() }, actor(owner), clock),
    ).resolves.toMatchObject({ status: 'STARTED' });
    await sessions.disableActivation(semesterId, 1, actor(admin));
    await expect(
      sessions.complete(current.id, { idempotencyKey: randomUUID() }, actor(owner), clock),
    ).resolves.toMatchObject({ status: 'COMPLETED' });
    if (major) {
      await prisma.appointment.deleteMany({ where: { staffId: owner.staff!.id } });
      await prisma.major.delete({ where: { id: major.id } });
    }
  });
  it('room display cannot claim, play or acknowledge a stopped reminder; stale playback lease is not a grant', async () => {
    const device = await prisma.displayDevice.create({
      data: {
        profile: 'RUANG_GURU',
        label: 'Synthetic display',
        status: 'ACTIVE',
        credentialHash: 'a'.repeat(64),
        activatedAt: clock,
        createdBy: admin.keycloakId,
        audioEnabled: true,
        isAudibleLeader: true,
      },
    });
    const alert = await prisma.classSessionAlert.findFirstOrThrow({
      where: { sessionId: current.id, stage: 'ROOM_T10' },
    });
    await prisma.classSessionAlert.update({
      where: { id: alert.id },
      data: { status: 'DISPATCHED', dispatchedAt: clock },
    });
    const delivery = await prisma.classSessionAlertDelivery.create({
      data: { alertId: alert.id, deviceId: device.id, audible: true },
    });
    const leases = {
      claim: jest.fn().mockResolvedValue({ token: randomUUID(), expiresAt: clock.toISOString() }),
      assertAndExtend: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(true),
    };
    const display = new OperationalMonitoringService(
      db,
      {
        authenticateCredential: async () => ({ ...device, credentialVersion: 1 }),
      } as unknown as DisplayDeviceService,
      bells,
      leases as unknown as DisplayPlaybackLeaseService,
    );
    try {
      expect(await display.claimPlayback('synthetic', delivery.id)).toMatchObject({
        claimed: true,
      });
      await sessions.disableActivation(semesterId, 1, actor(admin));
      await expect(display.claimPlayback('synthetic', delivery.id)).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        display.markPlayed('synthetic', delivery.id, randomUUID(), clock),
      ).rejects.toMatchObject({ status: 409 });
      await expect(display.markDelivered('synthetic', delivery.id, clock)).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        display.acknowledge('synthetic', delivery.id, undefined, clock),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await prisma.classSessionAlertDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
      ).toMatchObject({ status: 'CANCELLED' });
      expect(leases.assertAndExtend).not.toHaveBeenCalled();
    } finally {
      await prisma.classSessionAlertDelivery.delete({ where: { id: delivery.id } });
      await prisma.displayDevice.delete({ where: { id: device.id } });
    }
  });
  it('a revoked teacher does not stop a daily scan for unrelated valid teachers', async () => {
    const other = await person();
    const target = await seedSession(other);
    await prisma.classSessionEvent.create({
      data: {
        sessionId: target.id,
        eventType: 'ALERT_CREATED',
        eventKey: sessionActivationBindingKey(target.id, 1),
        actorType: 'SYSTEM',
      },
    });
    await prisma.user.update({ where: { id: owner.id }, data: { isActive: false } });
    jest.setSystemTime(new Date(`${date}T05:00:00Z`));
    await expect(sessions.prepareToday()).resolves.toMatchObject({
      createdCount: 0,
      totalCount: 1,
    });
    expect(await prisma.classSession.count()).toBe(2);
  });
  it.each(['teacher', 'staff'] as const)(
    'eligibility holds the %s profile stable until the transaction commits',
    async (profile) => {
      let release!: () => void, entered!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = prisma.$transaction(
        async (tx) => {
          await acquireIdentityMutationLock(tx);
          expect(await lockOperationalTeachers(tx, [owner.teacher!.id])).toEqual(
            new Set([owner.teacher!.id]),
          );
          entered();
          await hold;
        },
        { timeout: 15_000 },
      );
      await ready;
      let changed = false;
      const update = (
        profile === 'teacher'
          ? prisma.teacher.update({ where: { id: owner.teacher!.id }, data: { deletedAt: clock } })
          : prisma.staff.update({ where: { id: owner.staff!.id }, data: { deletedAt: clock } })
      ).then(() => {
        changed = true;
      });
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 150; attempt++) {
          const rows = await prisma.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database()
            AND wait_event_type = 'Lock' AND query NOT LIKE '%pg_stat_activity%'`;
          if (rows[0]?.count) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
        expect(changed).toBe(false);
      } finally {
        release();
        await locked;
        await update;
      }
      expect(changed).toBe(true);
    },
  );
});
