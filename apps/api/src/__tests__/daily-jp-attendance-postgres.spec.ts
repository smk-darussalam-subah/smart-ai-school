import { Prisma, PrismaClient } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { UserStatusService } from '../auth/user-status.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { ClassesService } from '../classes/classes.service';
import { ClassSessionService } from '../class-sessions/class-session.service';
import { ClassSessionDueService } from '../class-sessions/class-session-due.service';
import { NotificationService } from '../notification/notification.service';
import { BellScheduleController } from '../bell-schedule/bell-schedule.controller';
import { TeacherAttendanceService } from '../teacher-attendance/teacher-attendance.service';
import type { AuthUser } from '@smk/auth';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { ScheduleService } from '../schedule/schedule.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { StaffAttendanceController } from '../staff-attendance/staff-attendance.controller';
import { REQUIRED_PERMISSION_KEY } from '../permissions/decorators/require-permission.decorator';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { PermissionGuard } from '../permissions/permissions.guard';

const databaseUrl = process.env.JP_ATTENDANCE_PROOF_DATABASE_URL;
if (
  databaseUrl &&
  !/^postgresql:\/\/[^@]+@127\.0\.0\.1:55439\/diis_jp_presensi(?:_[a-z0-9_]+)?(?:\?|$)/.test(
    databaseUrl,
  )
) {
  throw new Error('Proof is restricted to the dedicated local disposable database');
}
const describeProof = databaseUrl ? describe : describe.skip;
const fixtureClockDate = process.env.JP_PROOF_CLOCK_DATE ?? '2026-10-06';
if (!['2026-10-06', '2026-10-13'].includes(fixtureClockDate)) throw new Error('Unsupported synthetic fixture clock');
const fixtureOffset = new Date(fixtureClockDate).getTime() - new Date('2026-10-06').getTime();
function proofDate(value: string): string {
  const ymd = new Date(new Date(value.slice(0, 10)).getTime() + fixtureOffset).toISOString().slice(0, 10);
  return ymd + value.slice(10);
}
function proofUrl(value: string): string { return value.replace(/2026-10-\d{2}/g, proofDate); }
const clock = new Date(proofDate('2026-10-06T00:31:00Z'));
describeProof('JP + staff attendance: production services on disposable PostgreSQL', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const db = prisma as unknown as PrismaService;
  const bell = new BellScheduleService(db);
  const permissions = new PermissionsService(db);
  const period = new AcademicPeriodService(db, permissions);
  const schedules = new ScheduleService(db, period, bell);
  const attendance = new StaffAttendanceService(db, bell, permissions);
  const sessions = new ClassSessionService(db, bell);
  // Real identity lifecycle service; only the external Keycloak side effect is synthetic.
  const users = new UsersService(db, new UserStatusService(db), {
    getUserRealmRoles: async () => [], assignRealmRole: async () => {},
    removeRealmRole: async () => {}, setEnabled: async () => {},
  } as unknown as KeycloakAdminService, permissions, {} as ClassesService);
  const SA = {
    keycloakId: '76000000-0000-4000-8000-000000000001',
    roles: ['SUPER_ADMIN'],
    username: 'proof-admin',
  } as AuthUser;
  let guru: AuthUser;
  let teacherId: string;
  let profileId: string;
  const assignmentIds: string[] = [];
  const classIds: string[] = [];
  let sequence = 2;
  async function employee(role: 'GURU' | 'TATA_USAHA' = 'GURU') {
    const id = '76000000-0000-4000-8000-' + String(sequence++).padStart(12, '0');
    const user = await prisma.user.create({
      data: {
        keycloakId: id,
        email: id + '@example.invalid',
        fullName: 'Synthetic proof employee',
        createdAt: new Date(proofDate('2026-10-05T00:00:00Z')),
        role,
        staff: { create: { employmentStatus: role === 'GURU' ? 'GTY' : 'PTY' } },
      },
    });
    const teacher =
      role === 'GURU' ? await prisma.teacher.create({ data: { userId: user.id } }) : null;
    return {
      user,
      teacher,
      auth: { keycloakId: id, roles: [role], username: 'proof' } as AuthUser,
    };
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
    await prisma.academicYear.updateMany({ data: { isActive: false } }); // migration's synthetic default year
    await prisma.bellScheduleProfile.updateMany({ data: { revokedAt: new Date() } }); // migration's legacy common pattern
    const year = await prisma.academicYear.create({
      data: {
        code: '2026/2027',
        startDate: new Date('2026-07-13'),
        endDate: new Date('2027-06-30'),
        isActive: true,
      },
    });
    await prisma.semester.create({
      data: {
        academicYearId: year.id,
        number: 1,
        startDate: new Date(proofDate('2026-10-05')),
        endDate: new Date(proofDate('2026-10-10')),
        isActive: true,
      },
    });
    await prisma.user.create({
      data: {
        keycloakId: SA.keycloakId,
        email: 'jp-proof-admin@example.invalid',
        fullName: 'Synthetic proof admin',
        createdAt: new Date(proofDate('2026-10-05T00:00:00Z')),
        role: 'SUPER_ADMIN',
      },
    });
    const profile = await bell.create(
      {
        code: 'JP_PROOF_20261006',
        name: 'Synthetic daily JP proof',
        scope: 'SCHOOL',
        kind: 'NORMAL',
        effectiveFrom: '2026-07-13',
        effectiveUntil: '2027-06-30',
        provenance: 'isolated synthetic proof',
        segments: [1, 2, 3, 4, 5, 6].flatMap((day) =>
          Array.from({ length: day === 5 ? 8 : 10 }, (_, index) => ({
            dayOfWeek: day,
            type: 'INSTRUCTION' as const,
            jpNumber: index + 1,
            label: 'JP ' + (index + 1),
            startMinute: 420 + index * 40,
            endMinute: 460 + index * 40,
            sortOrder: index + 1,
          })),
        ),
      },
      SA.keycloakId,
    );
    profileId = profile!.id;
    await prisma.schoolProfile.create({
      data: { name: 'Synthetic school', latitude: 0, longitude: 0, geofenceRadiusM: 300 },
    });
    const person = await employee();
    guru = person.auth;
    teacherId = person.teacher!.id;
    for (let index = 0; index < 6; index++) {
      const row = await prisma.class.create({
        data: { name: 'X PROOF ' + index, majorCode: 'PRF', grade: 10, academicYear: year.code },
      });
      classIds.push(row.id);
      const assignment = await prisma.teachingAssignment.create({
        data: {
          teacherId,
          classId: row.id,
          subject: index === 5 ? 'Mathematics' : 'PJOK',
          academicYear: year.code,
        },
      });
      assignmentIds.push(assignment.id);
    }
  }, 30000);
  afterAll(async () => {
    jest.useRealTimers();
    await prisma.$disconnect();
  });
  const slot = (
    index: number,
    jpStart = 3,
    jpEnd = 4,
    dayOfWeek = 2,
    room: string | null = 'LAPANGAN',
  ) => ({
    classId: classIds[index]!,
    teachingAssignmentId: assignmentIds[index]!,
    dayOfWeek,
    jpStart,
    jpEnd,
    room,
    academicYear: '2026/2027',
    semester: 1,
  });
  const gps = () => ({ lat: 0, lng: 0, accuracyM: 8, capturedAt: new Date().toISOString() });

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }
  async function waitForLockWaiter(key: string) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const result = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted
          AND objid = ((hashtext(${key})::bigint & 4294967295)::oid)`);
      if (Number(result[0]?.count) > 0) return;
      await new Promise((done) => setTimeout(done, 5));
    }
    throw new Error('Expected actual PostgreSQL advisory lock waiter: ' + key);
  }
  async function holdLock(key: string) {
    const entered = deferred();
    const release = deferred();
    const completion = prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      entered.resolve();
      await release.promise;
    }, { timeout: 10000 });
    await entered.promise;
    return { release: () => release.resolve(), completion };
  }
  async function teachingPair(subject = 'PJOK') {
    const person = await employee();
    const assignments = [];
    for (let index = 0; index < 2; index++) {
      const klass = await prisma.class.create({ data: { name: 'X FOLLOWUP ' + sequence++, grade: 10, majorCode: 'PRF', academicYear: '2026/2027' } });
      assignments.push(await prisma.teachingAssignment.create({ data: { classId: klass.id, teacherId: person.teacher!.id, subject, academicYear: '2026/2027' } }));
    }
    const base = assignments.map((assignment) => ({ ...slot(0, 1, 2, 2, null), classId: assignment.classId, teachingAssignmentId: assignment.id }));
    return { person, base };
  }

  it('resolves 10 JP Tuesday, 8 Friday; rejects a weekly slot absent on configured day', async () => {
    expect((await bell.resolveForDate(proofDate('2026-10-06'))).segments).toHaveLength(10);
    expect((await bell.resolveForDate(proofDate('2026-10-09'))).segments).toHaveLength(8);
    await expect(schedules.create(slot(0, 9, 10, 5), SA)).rejects.toThrow(ConflictException);
    await expect(prisma.schedule.count()).resolves.toBe(0);
  });
  it('serializes teacher collisions, then groups approved same subject/location without double teacher context', async () => {
    const raced = await Promise.allSettled([
      schedules.create(slot(0), SA),
      schedules.create(slot(1), SA),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(raced.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const anchor = await prisma.schedule.findFirstOrThrow();
    const targetIndex = anchor.classId === classIds[0] ? 1 : 0;
    await expect(
      schedules.create(
        {
          ...slot(targetIndex),
          concurrency: {
            anchorScheduleId: anchor.id,
            mode: 'JOINT_CLASS',
            reason: 'Synthetic joint teaching approval',
          },
        },
        guru,
      ),
    ).rejects.toThrow(ForbiddenException);
    const target = await schedules.create(
      {
        ...slot(targetIndex),
        concurrency: {
          anchorScheduleId: anchor.id,
          mode: 'JOINT_CLASS',
          reason: 'Synthetic joint teaching approval',
        },
      },
      SA,
    );
    expect(target.concurrencyGroupId).toBeTruthy();
    expect(
      (await prisma.schedule.findUniqueOrThrow({ where: { id: anchor.id } })).concurrencyGroupId,
    ).toBe(target.concurrencyGroupId);
    const context = await attendance.context(guru);
    expect(context.schedules).toHaveLength(1);
    expect(context.schedules[0]!.classes).toHaveLength(2);
    expect(context.schedules[0]!.startAt).toBe(proofDate('2026-10-06T01:20:00.000Z'));
    await expect(schedules.update(target.id, { jpEnd: 5 }, SA)).rejects.toThrow(ConflictException);
    await expect(
      schedules.create(
        {
          ...slot(5),
          concurrency: {
            anchorScheduleId: anchor.id,
            mode: 'JOINT_CLASS',
            reason: 'Different subject negative test',
          },
        },
        SA,
      ),
    ).rejects.toThrow(ConflictException);
  });
  it('requires expiry for an exception, preserves ordinary class/room conflicts, and blocks JP shrink impact', async () => {
    const anchor = await schedules.create(slot(2, 6, 7, 2, 'ROOM C'), SA);
    const exceptional = await schedules.create(
      {
        ...slot(3, 6, 7, 2, 'ROOM D'),
        concurrency: {
          anchorScheduleId: anchor.id,
          mode: 'AUTHORIZED_EXCEPTION',
          reason: 'Temporary staffing constraint proof',
          expiresOn: proofDate('2026-10-10'),
        },
      },
      SA,
    );
    expect(exceptional.concurrencyGroup?.mode).toBe('AUTHORIZED_EXCEPTION');
    await expect(
      schedules.create(
        {
          ...slot(4, 6, 7, 2, 'ROOM C'),
          concurrency: {
            anchorScheduleId: anchor.id,
            mode: 'AUTHORIZED_EXCEPTION',
            reason: 'Room conflict must not disappear',
            expiresOn: proofDate('2026-10-10'),
          },
        },
        SA,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      schedules.create(
        {
          ...slot(4, 6, 7, 2, 'ROOM D'),
          concurrency: {
            anchorScheduleId: anchor.id,
            mode: 'AUTHORIZED_EXCEPTION',
            reason: 'Expired approval negative proof',
            expiresOn: proofDate('2026-10-05'),
          },
        },
        SA,
      ),
    ).rejects.toThrow(BadRequestException);
    const current = await prisma.bellScheduleProfile.findUniqueOrThrow({
      where: { id: profileId },
      include: { segments: true },
    });
    const reduced = current.segments
      .filter((segment) => !(segment.dayOfWeek === 2 && segment.jpNumber! >= 6))
      .map(({ dayOfWeek, type, jpNumber, label, startMinute, endMinute, sortOrder }) => ({
        dayOfWeek,
        type,
        jpNumber,
        label,
        startMinute,
        endMinute,
        sortOrder,
      }));
    await expect(bell.update(profileId, { segments: reduced }, SA.keycloakId)).rejects.toThrow(ConflictException);
    expect((await bell.resolveForDate(proofDate('2026-10-06'))).segments).toHaveLength(10);
    await expect(bell.update(profileId, { effectiveUntil: proofDate('2026-10-05') }, SA.keycloakId)).rejects.toThrow(
      ConflictException,
    );
    await expect(bell.revoke(profileId, SA.keycloakId)).rejects.toThrow(ConflictException);
    expect((await bell.resolveForDate(proofDate('2026-10-06'))).segments).toHaveLength(10);
    // A staff-room bell must not be checked against school teaching JP.
    await expect(
      bell.create(
        {
          code: 'TU_PROOF',
          name: 'Staff-room proof',
          scope: 'RUANG_TU',
          kind: 'NORMAL',
          effectiveFrom: proofDate('2026-10-05'),
          effectiveUntil: proofDate('2026-10-10'),
          provenance: 'isolated synthetic proof',
          segments: [
            {
              dayOfWeek: 0,
              type: 'INSTRUCTION',
              jpNumber: 1,
              label: 'JP 1',
              startMinute: 420,
              endMinute: 460,
              sortOrder: 1,
            },
          ],
        },
        SA.keycloakId,
      ),
    ).resolves.toBeTruthy();
  });
  it('persists one check-in/out and one event each under concurrent replay; checkout location is independent', async () => {
    const person = await employee('TATA_USAHA');
    const first = await Promise.all(
      Array.from({ length: 5 }, () => attendance.record(gps(), person.auth)),
    );
    expect(new Set(first.map((result) => result.receipt.id)).size).toBe(1);
    expect(first.filter((result) => !result.replayed)).toHaveLength(1);
    const last = await Promise.all(
      Array.from({ length: 5 }, () =>
        attendance.record({ locationFailure: 'POLICY_BLOCKED' }, person.auth, true),
      ),
    );
    expect(new Set(last.map((result) => result.receipt.checkOutAt!.toISOString())).size).toBe(1);
    const stored = await attendance.detail(first[0]!.receipt.id);
    expect(stored.locationInStatus).toBe('INSIDE');
    expect(stored.locationOutStatus).toBe('UNVERIFIED');
    expect(stored.events.map((event) => event.kind).sort()).toEqual(['CHECK_IN', 'CHECK_OUT']);
    expect(stored).not.toHaveProperty('latIn');
    expect(stored).not.toHaveProperty('lngOut');
  });
  it('strict policy fails closed; review policy stores GPS failure without claiming outside or inside', async () => {
    const person = await employee();
    const profile = await attendance.policy();
    await prisma.schoolProfile.update({
      where: { id: profile.id },
      data: { attendanceMode: 'STRICT' },
    });
    await expect(
      attendance.record({ locationFailure: 'PERMISSION_DENIED' }, person.auth),
    ).rejects.toThrow(BadRequestException);
    await expect(prisma.staffAttendance.count({ where: { userId: person.user.id } })).resolves.toBe(
      0,
    );
    await prisma.schoolProfile.update({
      where: { id: profile.id },
      data: { attendanceMode: 'REVIEW' },
    });
    const result = await attendance.record({ locationFailure: 'PERMISSION_DENIED' }, person.auth);
    expect(result.receipt.locationInStatus).toBe('UNVERIFIED');
    expect(result.receipt.distanceInM).toBeNull();
  });
  it('corrections preserve location evidence; history is append-only; midnight date and report aggregation are authoritative', async () => {
    const person = await employee();
    const result = await attendance.record(gps(), person.auth);
    await attendance.correct(
      result.receipt.id,
      { checkInAt: proofDate('2026-10-05T23:58:00Z'), reason: 'Synthetic correction with documented reason' },
      SA,
    );
    const corrected = await attendance.detail(result.receipt.id);
    expect(corrected.locationInStatus).toBe('INSIDE');
    expect(corrected.events.find((event) => event.kind === 'CORRECTION')?.before).toMatchObject({
      checkInAt: clock.toISOString(),
    });
    await expect(
      attendance.correct(
        result.receipt.id,
        { checkInAt: proofDate('2026-10-04T23:58:00Z'), reason: 'Wrong school date negative test' },
        SA,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      attendance.correct(
        result.receipt.id,
        { checkInAt: proofDate('2026-10-06T00:32:00Z'), reason: 'Future timestamp negative test' },
        SA,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      prisma.staffAttendanceEvent.delete({ where: { id: corrected.events[0]!.id } }),
    ).rejects.toThrow();
    const report = await attendance.report({
      from: proofDate('2026-10-06'),
      to: proofDate('2026-10-06'),
      search: '',
      unit: 'ALL',
      status: 'ALL',
      location: 'ALL',
      page: 1,
      limit: 100,
    });
    expect(
      report.summary.present +
        report.summary.absent +
        report.data.filter((row) => row.status === 'NOT_DUE').length,
    ).toBe(report.summary.expected);
    expect(
      report.summary.onTime +
        report.summary.late +
        report.data.filter((row) => row.receipt && !row.arrival.dueAt).length,
    ).toBe(report.summary.present);
    expect(report.trend[0]!.present).toBe(report.summary.present);
    jest.setSystemTime(new Date(proofDate('2026-10-06T17:01:00Z')));
    const midnight = await attendance.record(gps(), person.auth);
    expect(midnight.receipt.date.toISOString().slice(0, 10)).toBe(proofDate('2026-10-07'));
    jest.setSystemTime(clock);
  });
  it('uses permission gates on staff endpoints and denies non-admin correction through authoritative roles', async () => {
    const reflector = new Reflector();
    expect(
      reflector.get(REQUIRED_PERMISSION_KEY, StaffAttendanceController.prototype.correct),
    ).toBe('staff.attendance.manage');
    const guard = new RolesGuard(reflector, permissions);
    const request = { user: guru };
    const context = {
      getHandler: () => StaffAttendanceController.prototype.correct,
      getClass: () => StaffAttendanceController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(
      attendance.context({ keycloakId: crypto.randomUUID(), roles: ['GURU'] } as AuthUser),
    ).rejects.toThrow(ForbiddenException);
  });
  it('uses each teacher first lesson, fixed TU 07:00, active principal exemption, and immutable arrival snapshots', async () => {
    const person = await employee();
    const classRow = await prisma.class.create({
      data: { name: 'X ARRIVAL PROOF', majorCode: 'PRF', grade: 10, academicYear: '2026/2027' },
    });
    const assignment = await prisma.teachingAssignment.create({
      data: {
        teacherId: person.teacher!.id,
        classId: classRow.id,
        subject: 'PJOK',
        academicYear: '2026/2027',
      },
    });
    await schedules.create(
      { ...slot(0, 4, 5, 2, null), classId: classRow.id, teachingAssignmentId: assignment.id },
      SA,
    );
    let context = await attendance.context(person.auth);
    expect(context.arrival).toMatchObject({
      basis: 'TEACHING',
      recommendedAt: proofDate('2026-10-06T01:30:00.000Z'),
      dueAt: proofDate('2026-10-06T01:45:00.000Z'),
      firstTeachingAt: proofDate('2026-10-06T02:00:00.000Z'),
    });
    expect(context.eligible).toBe(false);
    const query = {
      from: proofDate('2026-10-06'),
      to: proofDate('2026-10-06'),
      search: '',
      unit: 'ALL' as const,
      status: 'ALL' as const,
      location: 'ALL' as const,
      page: 1,
      limit: 100,
    };
    expect(
      (await attendance.report(query)).data.find((row) => row.employee.id === person.user.id)
        ?.status,
    ).toBe('NOT_DUE');
    jest.setSystemTime(new Date(proofDate('2026-10-06T01:30:00Z')));
    expect((await attendance.context(person.auth)).eligible).toBe(true);
    jest.setSystemTime(new Date(proofDate('2026-10-06T01:45:00Z')));
    const onTime = await attendance.record(gps(), person.auth);
    expect(onTime.receipt.expectedArrivalAt?.toISOString()).toBe(proofDate('2026-10-06T01:45:00.000Z'));
    const school = await attendance.policy();
    await prisma.schoolProfile.update({
      where: { id: school.id },
      data: { attendanceTeacherLeadMin: 60, attendanceTeacherLeadTarget: 60 },
    });
    expect(
      (await attendance.report(query)).data.find((row) => row.employee.id === person.user.id)
        ?.status,
    ).toBe('PRESENT');
    await prisma.schoolProfile.update({
      where: { id: school.id },
      data: {
        attendanceTeacherLeadMin: 15,
        attendanceTeacherLeadTarget: 30,
        attendanceStartMinute: 480,
      },
    });
    const tu = await employee('TATA_USAHA');
    const tuReceipt = await attendance.record(gps(), tu.auth);
    expect(tuReceipt.receipt.expectedArrivalAt?.toISOString()).toBe(proofDate('2026-10-06T00:00:00.000Z'));
    expect(
      (await attendance.report(query)).data.find((row) => row.employee.id === tu.user.id)?.status,
    ).toBe('LATE');
    const principal = await employee();
    expect(
      (await attendance.context({ ...principal.auth, roles: ['GURU', 'KEPALA_SEKOLAH'] })).arrival
        .basis,
    ).toBe('NONE');
    const staff = await prisma.staff.findUniqueOrThrow({ where: { userId: principal.user.id } });
    const position = await prisma.position.findUniqueOrThrow({ where: { code: 'KEPALA_SEKOLAH' } });
    const year = await prisma.academicYear.findUniqueOrThrow({ where: { code: '2026/2027' } });
    await prisma.appointment.create({
      data: {
        staffId: staff.id,
        positionId: position.id,
        academicYearId: year.id,
        effectiveFrom: new Date('2026-07-13'),
        effectiveUntil: new Date('2027-06-30'),
        status: 'ACTIVE',
        approvedAt: new Date(),
        activatedAt: new Date(),
      },
    });
    jest.setSystemTime(new Date(proofDate('2026-10-06T08:00:00Z')));
    context = await attendance.context(principal.auth);
    expect(context.arrival.basis).toBe('EXEMPT');
    expect(
      (await attendance.report(query)).data.find((row) => row.employee.id === principal.user.id)
        ?.status,
    ).toBe('NOT_REQUIRED');
    const principalReceipt = await attendance.record(gps(), principal.auth);
    expect(principalReceipt.receipt.expectedArrivalAt).toBeNull();
    expect(
      (await attendance.report(query)).data.find((row) => row.employee.id === principal.user.id)
        ?.status,
    ).toBe('PRESENT');
    const noSchedule = await employee();
    expect(
      (await attendance.report(query)).data.find((row) => row.employee.id === noSchedule.user.id)
        ?.status,
    ).toBe('NOT_SCHEDULED');
    await prisma.schoolProfile.update({
      where: { id: school.id },
      data: { attendanceStartMinute: 420 },
    });
    jest.setSystemTime(clock);
  });
  it('runs real Fastify routes, query/body validation and DB-backed permission/role guards with isolated fixture authentication', async () => {
    const module = await Test.createTestingModule({
      controllers: [StaffAttendanceController, BellScheduleController],
      providers: [{ provide: StaffAttendanceService, useValue: attendance }, { provide: BellScheduleService, useValue: bell }],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    const reflector = new Reflector();
    // Test-only authentication fixture. Production JWT verification is not modified or claimed here.
    app.useGlobalGuards(
      {
        canActivate: (context: ExecutionContext) => {
          const request = context
            .switchToHttp()
            .getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
          if (request.headers['x-proof-user'] === 'admin') request.user = SA;
          else if (request.headers['x-proof-user'] === 'teacher') request.user = guru;
          else if (request.headers['x-proof-user'] === 'spoof')
            request.user = { ...guru, roles: ['SUPER_ADMIN'] };
          return true;
        },
      },
      new RolesGuard(reflector, permissions),
      new PermissionGuard(reflector, permissions),
    );
    try {
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      expect(
        (await app.inject({ method: 'GET', url: '/staff-attendance/context' })).statusCode,
      ).toBe(403);
      const context = await app.inject({
        method: 'GET',
        url: '/staff-attendance/context',
        headers: { 'x-proof-user': 'teacher' },
      });
      expect(context.statusCode).toBe(200);
      expect(context.json().arrival.basis).toBe('TEACHING');
      const report = await app.inject({
        method: 'GET',
        url: proofUrl('/staff-attendance/report?from=2026-10-06&to=2026-10-06'),
        headers: { 'x-proof-user': 'admin' },
      });
      expect(report.statusCode).toBe(200);
      expect(report.json()).toMatchObject({ page: 1, limit: 20 });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: proofUrl('/staff-attendance/report?from=2026-02-30&to=2026-10-06'),
            headers: { 'x-proof-user': 'admin' },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: proofUrl('/staff-attendance/report?from=2026-10-06&to=2026-10-06'),
            headers: { 'x-proof-user': 'spoof' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/staff-attendance/check-in',
            payload: { userId: crypto.randomUUID() },
            headers: { 'x-proof-user': 'teacher' },
          })
        ).statusCode,
      ).toBe(400);
      const location = await app.inject({
        method: 'POST',
        url: '/staff-attendance/location',
        payload: { locationFailure: 'POLICY_BLOCKED' },
        headers: { 'x-proof-user': 'teacher' },
      });
      expect(location.statusCode).toBe(201);
      expect(location.json().status).toBe('UNVERIFIED');
      const receipt = await attendance.record(gps(), guru);
      const forbidden = await app.inject({
        method: 'PATCH',
        url: '/staff-attendance/' + receipt.receipt.id,
        payload: { checkInAt: clock.toISOString(), reason: 'Spoofed admin negative runtime proof' },
        headers: { 'x-proof-user': 'spoof' },
      });
      expect(forbidden.statusCode).toBe(403);
      expect(
        await prisma.staffAttendanceEvent.count({
          where: { attendanceId: receipt.receipt.id, kind: 'CORRECTION' },
        }),
      ).toBe(0);
    } finally {
      await app.close();
    }
  }, 30000);

  it.each(['disable', 'role'] as const)('JP-R01: pending presensi fails closed after real lifecycle %s commits', async (action) => {
    const person = await employee('TATA_USAHA');
    const held = await holdLock('attendance:' + person.user.id);
    const pending = attendance.record(gps(), person.auth).then(() => null, (error: unknown) => error);
    try {
      await waitForLockWaiter('attendance:' + person.user.id);
      if (action === 'disable') await users.updateActive(person.user.id, false, SA.keycloakId);
      else await users.updateRole(person.user.id, 'SISWA', SA.keycloakId);
    } finally { held.release(); await held.completion; }
    expect(await pending).toBeInstanceOf(ForbiddenException);
    expect(await prisma.staffAttendance.count({ where: { userId: person.user.id } })).toBe(0);
    expect(await prisma.staffAttendanceEvent.count({ where: { actorId: person.auth.keycloakId } })).toBe(0);
  });

  it.each(['disable', 'role'] as const)('JP-R01: pending approval cannot use stale SUPER_ADMIN after lifecycle %s', async (action) => {
    const approver = await employee();
    await prisma.user.update({ where: { id: approver.user.id }, data: { role: 'SUPER_ADMIN' } });
    const actor = { ...approver.auth, roles: ['SUPER_ADMIN'] } as AuthUser;
    const pair = await teachingPair();
    const room = 'FOLLOWUP ' + action;
    const anchor = await schedules.create({ ...pair.base[0]!, room }, SA);
    const held = await holdLock('academic:schedule:mutation:v1');
    const pending = schedules.create({ ...pair.base[1]!, concurrency: { anchorScheduleId: anchor.id, mode: 'JOINT_CLASS', reason: 'Synthetic stale approval regression' }, room }, actor).then(() => null, (error: unknown) => error);
    try {
      await waitForLockWaiter('academic:schedule:mutation:v1');
      if (action === 'disable') await users.updateActive(approver.user.id, false, SA.keycloakId);
      else await users.updateRole(approver.user.id, 'GURU', SA.keycloakId);
    } finally { held.release(); await held.completion; }
    expect(await pending).toBeInstanceOf(ForbiddenException);
    expect(await prisma.scheduleConcurrencyGroup.count({ where: { approvedBy: actor.keycloakId } })).toBe(0);
    expect(await prisma.schedule.count({ where: { teachingAssignmentId: pair.base[1]!.teachingAssignmentId } })).toBe(0);
    expect((await prisma.schedule.findUniqueOrThrow({ where: { id: anchor.id } })).concurrencyGroupId).toBeNull();
  });

  it.each(['attendance', 'approval'] as const)('JP-R01: %s winning identity serialization commits before real revocation without deadlock', async (kind) => {
    const entered = deferred();
    const release = deferred();
    const actor = await employee(kind === 'attendance' ? 'TATA_USAHA' : 'GURU');
    let pending: Promise<unknown>;
    let revoke: Promise<unknown> | undefined;
    if (kind === 'attendance') {
      const guarded = prisma.$extends({ query: { staffAttendance: { async create({ args, query }) {
        entered.resolve(); await release.promise; return query(args);
      } } } });
      pending = new StaffAttendanceService(guarded as unknown as PrismaService, bell, permissions).record(gps(), actor.auth);
    } else {
      await prisma.user.update({ where: { id: actor.user.id }, data: { role: 'SUPER_ADMIN' } });
      const pair = await teachingPair();
      const anchor = await schedules.create({ ...pair.base[0]!, room: 'JOINT FOLLOWUP' }, SA);
      const guarded = prisma.$extends({ query: { scheduleConcurrencyGroup: { async create({ args, query }) {
        entered.resolve(); await release.promise; return query(args);
      } } } });
      pending = new ScheduleService(guarded as unknown as PrismaService, period, bell, permissions).create({ ...pair.base[1]!, room: 'JOINT FOLLOWUP', concurrency: { anchorScheduleId: anchor.id, mode: 'JOINT_CLASS', reason: 'Synthetic mutation-first regression' } }, { ...actor.auth, roles: ['SUPER_ADMIN'] });
    }
    try {
      await Promise.race([entered.promise, pending.then(() => { throw new Error('Mutation must pause under identity lock'); })]);
      revoke = kind === 'attendance' ? users.updateActive(actor.user.id, false, SA.keycloakId) : users.updateRole(actor.user.id, 'GURU', SA.keycloakId);
      await waitForLockWaiter('users:last-active-super-admin');
    } finally { release.resolve(); }
    await expect(pending).resolves.toBeTruthy();
    await expect(revoke).resolves.toBeTruthy();
    if (kind === 'attendance') expect(await prisma.staffAttendance.count({ where: { userId: actor.user.id } })).toBe(1);
    else expect(await prisma.scheduleConcurrencyGroup.count({ where: { approvedBy: actor.auth.keycloakId } })).toBe(1);
  });

  it.each((['schedule-create', 'schedule-update', 'schedule-delete', 'bell-create', 'bell-update', 'bell-revoke', 'correction', 'note', 'policy'] as const)
    .flatMap((kind) => (['disable', 'role'] as const).map((action) => ({ kind, action }))))('JP-R01 adjacent writes: $kind denies stale authority after $action', async ({ kind, action }) => {
    const approver = await employee();
    await prisma.user.update({ where: { id: approver.user.id }, data: { role: 'SUPER_ADMIN' } });
    const actor = { ...approver.auth, roles: ['SUPER_ADMIN'] } as AuthUser;
    const pair = await teachingPair();
    const anchor = await schedules.create(pair.base[0]!, SA);
    const code = 'STALE_BELL_' + sequence++;
    const bellDate = new Date(new Date('2028-01-01').getTime() + sequence * 2 * 86400000).toISOString().slice(0, 10);
    const bellDto = { code, name: 'Synthetic authority proof', scope: 'RUANG_TU' as const,
      kind: 'NORMAL' as const, provenance: 'Synthetic stale authority regression',
      effectiveFrom: bellDate, effectiveUntil: bellDate,
      segments: [{ dayOfWeek: 0, type: 'INSTRUCTION' as const, jpNumber: 1, label: 'JP 1', startMinute: 420, endMinute: 460, sortOrder: 1 }] };
    const profile = kind === 'bell-update' || kind === 'bell-revoke' ? await bell.create(bellDto, SA.keycloakId) : null;
    const target = await employee('TATA_USAHA');
    const receipt = (await attendance.record(gps(), target.auth)).receipt;
    const policyBefore = await attendance.policy();
    const eventCount = await prisma.staffAttendanceEvent.count({ where: { attendanceId: receipt.id } });
    const key = ['correction', 'note'].includes(kind) ? 'attendance:' + target.user.id
      : kind === 'policy' ? 'operational:attendance-policy:mutation:v1' : 'academic:schedule:mutation:v1';
    const held = await holdLock(key);
    const mutate = () => {
      switch (kind) {
        case 'schedule-create': return schedules.create({ ...pair.base[1]!, jpStart: 3, jpEnd: 4 }, actor);
        case 'schedule-update': return schedules.update(anchor.id, { room: 'STALE MUST NOT WRITE' }, actor);
        case 'schedule-delete': return schedules.remove(anchor.id, actor);
        case 'bell-create': return bell.create(bellDto, actor.keycloakId);
        case 'bell-update': return bell.update(profile!.id, { name: 'STALE MUST NOT WRITE' }, actor.keycloakId);
        case 'bell-revoke': return bell.revoke(profile!.id, actor.keycloakId);
        case 'correction': return attendance.correct(receipt.id, { checkInAt: new Date(clock.getTime() - 60000).toISOString(), reason: 'Synthetic stale correction must not write' }, actor);
        case 'note': return attendance.note(receipt.id, 'Synthetic stale note must not write', actor);
        case 'policy': return attendance.updatePolicy({ attendanceMode: policyBefore.attendanceMode === 'STRICT' ? 'STRICT' : 'REVIEW',
          attendanceAccuracyM: policyBefore.attendanceAccuracyM + 1, attendanceStartMinute: policyBefore.attendanceStartMinute,
          attendanceTeacherLeadMin: policyBefore.attendanceTeacherLeadMin, attendanceTeacherLeadTarget: policyBefore.attendanceTeacherLeadTarget,
          attendanceEndMinute: policyBefore.attendanceEndMinute, attendanceWorkingDays: policyBefore.attendanceWorkingDays,
          attendancePromptCooldown: policyBefore.attendancePromptCooldown }, actor);
      }
    };
    const pending = mutate().then(() => null, (error: unknown) => error);
    try {
      await waitForLockWaiter(key);
      if (action === 'disable') await users.updateActive(approver.user.id, false, SA.keycloakId);
      else await users.updateRole(approver.user.id, 'GURU', SA.keycloakId);
    } finally { held.release(); await held.completion; }
    expect(await pending).toBeInstanceOf(ForbiddenException);
    expect(await prisma.schedule.count({ where: { teachingAssignmentId: pair.base[1]!.teachingAssignmentId } })).toBe(0);
    expect(await prisma.schedule.findUniqueOrThrow({ where: { id: anchor.id } })).toMatchObject({ room: null });
    if (profile) expect(await prisma.bellScheduleProfile.findUniqueOrThrow({ where: { id: profile.id } })).toMatchObject({ name: bellDto.name, revokedAt: null });
    else expect(await prisma.bellScheduleProfile.count({ where: { code } })).toBe(0);
    expect((await prisma.staffAttendance.findUniqueOrThrow({ where: { id: receipt.id } })).checkInAt).toEqual(receipt.checkInAt);
    expect(await prisma.staffAttendanceEvent.count({ where: { attendanceId: receipt.id } })).toBe(eventCount);
    expect((await attendance.policy()).attendanceAccuracyM).toBe(policyBefore.attendanceAccuracyM);
  });

  it('JP-R02: expiry is inclusive, then suppresses context/arrival/report/materialization and preserves templates; renewal restores operations', async () => {
    const pair = await teachingPair();
    const anchor = await schedules.create(pair.base[0]!, SA);
    const exceptional = await schedules.create({ ...pair.base[1]!, concurrency: {
      anchorScheduleId: anchor.id, mode: 'AUTHORIZED_EXCEPTION', reason: 'Synthetic inclusive expiry proof', expiresOn: proofDate('2026-10-06'),
    } }, SA);
    expect((await attendance.context(pair.person.auth)).arrival.basis).toBe('TEACHING');
    const semester = await prisma.semester.findFirstOrThrow({ where: { academicYear: { code: '2026/2027' }, number: 1 } });
    await prisma.semester.update({ where: { id: semester.id }, data: { endDate: new Date(proofDate('2026-10-20')) } });
    try {
      const first = await sessions.materialize(proofDate('2026-10-06'));
      expect(first.skippedExpiredCount).toBe(0);
      jest.setSystemTime(new Date(proofDate('2026-10-13T00:31:00Z')));
      const context = await attendance.context(pair.person.auth);
      expect(context.schedules).toEqual([]);
      expect(context.arrival).toMatchObject({ basis: 'UNAVAILABLE', dueAt: null });
      expect(context.scheduleError).toMatch(/kedaluwarsa/);
      const receipt = await attendance.record(gps(), pair.person.auth);
      expect(receipt.receipt.arrivalBasis).toBe('UNAVAILABLE');
      expect(receipt.receipt.expectedArrivalAt).toBeNull();
      const report = await attendance.report({ from: proofDate('2026-10-13'), to: proofDate('2026-10-13'), unit: 'ALL', status: 'ALL', location: 'ALL', search: '', page: 1, limit: 100 });
      expect(report.data.find((row) => row.employee.id === pair.person.user.id)?.status).toBe('UNKNOWN');
      const expired = await sessions.materialize(proofDate('2026-10-13'));
      expect(expired.skippedExpiredCount).toBeGreaterThanOrEqual(2);
      expect(expired.suppressed).toBe('EXPIRED_CONCURRENCY');
      expect(await prisma.classSession.count({ where: { serviceDate: new Date(proofDate('2026-10-13')), scheduleId: { in: [anchor.id, exceptional.id] } } })).toBe(0);
      expect(await prisma.schedule.count({ where: { id: { in: [anchor.id, exceptional.id] } } })).toBe(2);
      // Preserve a pre-fix future materialization without treating it as an obligation.
      const existing = await prisma.classSession.findFirstOrThrow({ where: { scheduleId: anchor.id, serviceDate: new Date(proofDate('2026-10-06')) } });
      const { id: _id, createdAt: _created, updatedAt: _updated, ...snapshot } = existing;
      const historical = await prisma.classSession.create({ data: { ...snapshot, serviceDate: new Date(proofDate('2026-10-13')),
        scheduledStartAt: new Date(proofDate('2026-10-13T00:00:00Z')), scheduledEndAt: new Date(proofDate('2026-10-13T01:20:00Z')) } });
      await prisma.classSessionAlert.create({ data: { sessionId: historical.id, stage: 'PRIVATE_T5', dueAt: new Date(proofDate('2026-10-13T00:05:00Z')) } });
      await expect(sessions.start(historical.id, { idempotencyKey: crypto.randomUUID() }, pair.person.auth)).rejects.toThrow(/kedaluwarsa/);
      const scan = await new ClassSessionDueService(db, bell, {} as NotificationService).runDueScan(new Date(proofDate('2026-10-13T09:00:00Z')));
      expect(scan).toMatchObject({ skipped: false, dispatchedCount: 0 });
      expect((await prisma.classSession.findUniqueOrThrow({ where: { id: historical.id } })).status).toBe('SCHEDULED');
      expect(await prisma.classSessionEvent.count({ where: { sessionId: historical.id, eventType: 'MISSED' } })).toBe(0);
      expect((await prisma.classSessionAlert.findFirstOrThrow({ where: { sessionId: historical.id } })).cancellationReason).toBe('EXPIRED_CONCURRENCY');
      // Restore authorization fixture only; no unapproved production renewal route is implied.
      await prisma.scheduleConcurrencyGroup.update({ where: { id: exceptional.concurrencyGroupId! }, data: { expiresOn: new Date(proofDate('2026-10-13')) } });
      expect((await attendance.context(pair.person.auth)).schedules).toHaveLength(1);
      await sessions.materialize(proofDate('2026-10-13'));
      expect(await prisma.classSession.count({ where: { serviceDate: new Date(proofDate('2026-10-13')), scheduleId: { in: [anchor.id, exceptional.id] } } })).toBe(2);
    } finally {
      jest.setSystemTime(clock);
      await prisma.semester.update({ where: { id: semester.id }, data: { endDate: semester.endDate } });
    }
  });

  it.each(['SISWA', 'ORANG_TUA'] as const)('JP-R03: actual %s guard can read timing-only catalog but cannot manage or read approval metadata', async (role) => {
    const person = await prisma.user.create({ data: { keycloakId: crypto.randomUUID(), fullName: 'Synthetic timing reader', email: crypto.randomUUID() + '@example.invalid', role, createdAt: new Date(proofDate('2026-10-05')) } });
    const code = role === 'SISWA' ? 'student.own.read' : 'student.child.read';
    const permission = await prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: 'student', description: 'Synthetic role-seed parity' } });
    await prisma.rolePermission.upsert({ where: { role_permissionId: { role, permissionId: permission.id } }, update: {}, create: { role, permissionId: permission.id } });
    const module = await Test.createTestingModule({ controllers: [BellScheduleController], providers: [{ provide: BellScheduleService, useValue: bell }] }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    const reflector = new Reflector();
    app.useGlobalGuards({ canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest<{ user: AuthUser }>().user = { keycloakId: person.keycloakId, roles: [role] } as AuthUser;
      return true;
    } }, new RolesGuard(reflector, permissions), new PermissionGuard(reflector, permissions));
    try {
      await app.init(); await app.getHttpAdapter().getInstance().ready();
      const response = await app.inject({ method: 'GET', url: '/bell-schedules/catalog' });
      expect(response.statusCode).toBe(200);
      const catalog = response.json();
      expect(catalog.profiles.find((profile: { id: string }) => profile.id === profileId)?.segments).toHaveLength(58);
      for (const profile of catalog.profiles) {
        for (const field of ['provenance', 'createdBy', 'approvedBy', 'revokedAt', 'revokedBy']) expect(profile).not.toHaveProperty(field);
      }
      expect(catalog.periods[0]).toHaveProperty('academicYear.code');
      expect((await app.inject({ method: 'GET', url: '/bell-schedules?includeRevoked=true' })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/bell-schedules', payload: {} })).statusCode).toBe(403);
      expect((await app.inject({ method: 'PATCH', url: '/bell-schedules/' + profileId, payload: {} })).statusCode).toBe(403);
      expect((await app.inject({ method: 'DELETE', url: '/bell-schedules/' + profileId })).statusCode).toBe(403);
      await permissions.revokeUserPermission(person.id, permission.id);
      expect((await app.inject({ method: 'GET', url: '/bell-schedules/catalog' })).statusCode).toBe(403);
    } finally { await app.close(); }
  }, 30000);

  it('JP-R05: future semester API coverage permits JP 11/12; shortening a later profile fails closed', async () => {
    const year = await prisma.academicYear.findUniqueOrThrow({ where: { code: '2026/2027' } });
    const semester = await prisma.semester.create({ data: { academicYearId: year.id, number: 2, startDate: new Date('2027-01-04'), endDate: new Date('2027-01-16'), isActive: false } });
    await bell.update(profileId, { effectiveUntil: '2026-12-31' }, SA.keycloakId);
    const future = await bell.create({ code: 'FUTURE_12_PROOF', name: 'Synthetic semester 2', scope: 'SCHOOL', kind: 'NORMAL', provenance: 'Synthetic future period parity', effectiveFrom: '2027-01-01', effectiveUntil: '2027-06-30', segments: Array.from({ length: 12 }, (_, index) => ({ dayOfWeek: 0, type: 'INSTRUCTION' as const, jpNumber: index + 1, label: 'JP ' + (index + 1), startMinute: 420 + 30 * index, endMinute: 420 + 30 * (index + 1), sortOrder: index + 1 })) }, SA.keycloakId);
    try {
      const available = await bell.instructionDaysForPeriod(db, '2026/2027', 2);
      expect(available.get(1)?.has(12)).toBe(true);
      const pair = await teachingPair('Future period');
      const created = await schedules.create({ ...pair.base[0]!, semester: 2, jpStart: 11, jpEnd: 12 }, SA);
      expect(created).toMatchObject({ jpStart: 11, jpEnd: 12, semester: 2 });
      await expect(bell.update(future.id, { effectiveUntil: '2027-01-09' }, SA.keycloakId)).rejects.toThrow(ConflictException);
      await schedules.remove(created.id, SA);
    } finally {
      await prisma.semester.delete({ where: { id: semester.id } });
      await prisma.bellScheduleProfile.update({ where: { id: future.id }, data: { revokedAt: new Date() } });
      await bell.update(profileId, { effectiveUntil: '2027-06-30' }, SA.keycloakId);
    }
  });

  it('JP-R06: actual compatibility adapter returns preserved historical photo, no N+1 source guesses or foreign association', async () => {
    const person = await employee();
    const other = await employee();
    const legacy = await prisma.teacherAttendance.create({ data: { teacherId: person.teacher!.id, date: new Date(proofDate('2026-10-05')), checkInAt: new Date(proofDate('2026-10-05T00:00Z')), photoUrl: '/media/synthetic-historical.jpg' } });
    await prisma.staffAttendance.create({ data: { userId: person.user.id, date: legacy.date, checkInAt: legacy.checkInAt, legacyTeacherAttendanceId: legacy.id, locationInStatus: 'UNVERIFIED' } });
    const receipt = await attendance.record(gps(), person.auth);
    const adapter = new TeacherAttendanceService(db, attendance);
    const query = { page: 1, limit: 31, outsideOnly: false };
    const history = await adapter.findAll(query, person.auth);
    expect(history.data.find((row) => row.date.getTime() === legacy.date.getTime())?.photoUrl).toBe(legacy.photoUrl);
    expect(history.data.find((row) => row.id === receipt.receipt.id)?.photoUrl).toBeNull();
    expect((await adapter.findAll({ ...query, teacherId: person.teacher!.id }, other.auth)).data).toEqual([]);
    const foreign = await prisma.teacherAttendance.create({ data: { teacherId: other.teacher!.id, date: new Date(proofDate('2026-10-04')), checkInAt: new Date(proofDate('2026-10-04T00:00Z')), photoUrl: '/media/synthetic-foreign.jpg' } });
    await prisma.staffAttendance.create({ data: { userId: person.user.id, date: foreign.date, checkInAt: foreign.checkInAt, legacyTeacherAttendanceId: foreign.id, locationInStatus: 'UNVERIFIED' } });
    expect((await adapter.findAll(query, person.auth)).data.find((row) => row.date.getTime() === foreign.date.getTime())?.photoUrl).toBeNull();
  });

  it.each(['bell-first', 'materialize-first'] as const)(
    'JP-R08: actual %s lock ordering keeps session/alerts coherent and replay immutable', async (ordering) => {
      const pair = await teachingPair('Bell materialization race');
      const schedule = await schedules.create({ ...pair.base[0]!, dayOfWeek: 4 }, SA);
      const original = await prisma.bellScheduleProfile.findUniqueOrThrow({
        where: { id: profileId }, include: { segments: true },
      });
      const segments = original.segments.map(({ dayOfWeek, type, jpNumber, label, startMinute, endMinute, sortOrder }) =>
        ({ dayOfWeek, type, jpNumber, label, startMinute, endMinute, sortOrder }));
      const shifted = segments.map((segment) => ({ ...segment,
        startMinute: segment.startMinute + 10, endMinute: segment.endMinute + 10 }));
      const entered = deferred();
      const release = deferred();
      const pending: Promise<{ value?: unknown; error?: unknown }>[] = [];
      const observe = (operation: Promise<unknown>) => {
        const result = operation.then((value) => ({ value }), (error: unknown) => ({ error }));
        pending.push(result);
        return result;
      };
      // Pause the actual writer after its shared lock, or the actual reader after
      // its bell query. No fabricated profile result, lock or persistence layer.
      const writerDb = prisma.$extends({ query: { bellScheduleProfile: {
        async update({ args, query }) {
          if (ordering === 'bell-first') { entered.resolve(); await release.promise; }
          return query(args);
        },
      } } });
      const writer = new BellScheduleService(writerDb as unknown as PrismaService);
      const readerBell = new BellScheduleService(db);
      const read = jest.spyOn(readerBell, 'resolveForDate').mockImplementation(async (date, scope, tx) => {
        const profile = await bell.resolveForDate(date, scope, tx);
        if (ordering === 'materialize-first') { entered.resolve(); await release.promise; }
        return profile;
      });
      const materializer = new ClassSessionService(db, readerBell);
      const date = proofDate('2026-10-08');
      try {
        const first = observe(ordering === 'bell-first'
          ? writer.update(profileId, { segments: shifted }, SA.keycloakId)
          : materializer.materialize(date));
        await Promise.race([entered.promise, first.then((result) => {
          throw ('error' in result ? result.error : new Error('Race barrier was not entered'));
        })]);
        const second = observe(ordering === 'bell-first'
          ? materializer.materialize(date)
          : writer.update(profileId, { segments: shifted }, SA.keycloakId));
        await waitForLockWaiter('academic:schedule:mutation:v1');
        if (ordering === 'bell-first') expect(read).not.toHaveBeenCalled();
        else expect((await bell.resolveForDate(date)).segments[0]?.startMinute).toBe(420);
        release.resolve();
        for (const result of await Promise.all([first, second])) expect(result).not.toHaveProperty('error');
        expect((await bell.resolveForDate(date)).segments[0]?.startMinute).toBe(430);
        const session = await prisma.classSession.findFirstOrThrow({
          where: { scheduleId: schedule.id, serviceDate: new Date(date) },
        });
        const expectedStart = new Date(date + (ordering === 'bell-first' ? 'T00:10:00Z' : 'T00:00:00Z'));
        expect(session.scheduledStartAt).toEqual(expectedStart);
        expect(session.scheduledEndAt).toEqual(new Date(expectedStart.getTime() + 80 * 60_000));
        const alerts = await prisma.classSessionAlert.findMany({ where: { sessionId: session.id }, orderBy: { dueAt: 'asc' } });
        expect(alerts.map((alert) => alert.stage)).toEqual(['PRIVATE_T5', 'ROOM_T10', 'ESCALATION_T15']);
        expect(alerts.map((alert) => alert.dueAt.getTime() - expectedStart.getTime())).toEqual([5, 10, 15].map((minutes) => minutes * 60_000));
        await materializer.materialize(date);
        expect(await prisma.classSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
          scheduledStartAt: session.scheduledStartAt, scheduledEndAt: session.scheduledEndAt,
        });
        expect(await prisma.classSessionAlert.findMany({ where: { sessionId: session.id }, orderBy: { dueAt: 'asc' } })).toEqual(alerts);
        expect(await prisma.classSessionEvent.count({ where: { sessionId: session.id, eventType: 'MATERIALIZED' } })).toBe(1);
      } finally {
        release.resolve();
        await Promise.all(pending);
        read.mockRestore();
        await bell.update(profileId, { segments }, SA.keycloakId);
      }
    }, 30000,
  );

  it.each(['holiday', 'nonworking'] as const)('JP-R04: voluntary TU receipt on %s has no late deadline in context/record/report', async (kind) => {
    const person = await employee('TATA_USAHA');
    const school = await attendance.policy();
    let calendarId: string | undefined;
    if (kind === 'holiday') {
      const year = await prisma.academicYear.findUniqueOrThrow({ where: { code: '2026/2027' } });
      calendarId = (await prisma.academicCalendar.create({ data: { academicYearId: year.id, name: 'Synthetic holiday', type: 'holiday', startDate: new Date(proofDate('2026-10-06')), endDate: new Date(proofDate('2026-10-06')) } })).id;
    } else await prisma.schoolProfile.update({ where: { id: school.id }, data: { attendanceWorkingDays: school.attendanceWorkingDays.filter((day) => day !== 2) } });
    try {
      jest.setSystemTime(new Date(proofDate('2026-10-06T02:00:00Z')));
      const context = await attendance.context(person.auth);
      expect(context.workingDay).toBe(false);
      expect(context.arrival.dueAt).toBeNull();
      expect(context.eligible).toBe(false);
      const receipt = await attendance.record(gps(), person.auth);
      expect(receipt.receipt).toMatchObject({ arrivalBasis: 'NONE', expectedArrivalAt: null, recommendedArrivalAt: null });
      const report = await attendance.report({ from: proofDate('2026-10-06'), to: proofDate('2026-10-06'), unit: 'ALL', status: 'ALL', location: 'ALL', search: '', page: 1, limit: 100 });
      expect(report.data.find((row) => row.employee.id === person.user.id)?.status).toBe('PRESENT');
      expect(report.summary.late).toBe(0);
      expect(report.summary.absent).toBe(0);
    } finally {
      if (calendarId) await prisma.academicCalendar.delete({ where: { id: calendarId } });
      await prisma.schoolProfile.update({ where: { id: school.id }, data: { attendanceWorkingDays: school.attendanceWorkingDays } });
      jest.setSystemTime(clock);
    }
  });
});
