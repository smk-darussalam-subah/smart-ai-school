jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));
import * as webpush from 'web-push';
import { PrismaClient, Prisma } from '@prisma/client';
import type { VerifyPushDeliveryDto } from '../push/dto/push.dto';
import type { AuthUser } from '@smk/auth';
import { StudentSessionAttendanceService } from '../attendance/student-session-attendance.service';
import { StudentSessionAttendanceReadService } from '../attendance/student-session-attendance-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { NotificationService } from '../notification/notification.service';
import { studentAttendanceNoticeTarget } from '../common/helpers/student-session-notification';
import { acquireIdentityMutationLock } from '../common/helpers/identity-mutation-lock';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PushService } from '../push/push.service';
import { resolvePendingNotificationIntent } from '../notification/notification-worker';
const url = process.env.STUDENT_JP_DATABASE_URL;
if (
  url &&
  !/^postgresql:\/\/diis_local:diis_local@127\.0\.0\.1:(55441\/diis_student_session_jp|55445\/diis_learning_ai_remediation)$/.test(
    url,
  )
)
  throw Error('Disposable local database only');
const proof = url ? describe : describe.skip;
proof('student/session/JP production service on PostgreSQL', () => {
  const browserProof: Record<string, unknown> = {};
  const prisma = new PrismaClient({ datasourceUrl: url }),
    db = prisma as PrismaService,
    permissions = new PermissionsService(db),
    period = new AcademicPeriodService(db, permissions),
    enqueue = jest.fn(async (_ids: string[]) => ({ queuedCount: 0 }));
  const service = new StudentSessionAttendanceService(db, permissions, period, {
    enqueueCommittedPendingLogs: enqueue,
  } as unknown as NotificationService);
  const audit = new StudentSessionAttendanceReadService(db, permissions);
  let teacher: AuthUser, learner: AuthUser, parent: AuthUser, foreign: AuthUser;
  let teacherUserId: string,
    teacherId: string,
    studentId: string,
    otherId: string,
    parentId: string,
    classId: string,
    sessionId: string,
    secondId: string,
    semesterId: string,
    yearId: string;
  let seq = 0;
  const auth = (keycloakId: string, role: string) =>
    ({ keycloakId, roles: [role], username: 'synthetic' }) as AuthUser;
  async function person(role: 'GURU' | 'SISWA' | 'ORANG_TUA') {
    seq++;
    return prisma.user.create({
      data: {
        keycloakId: `81000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        email: `sjp-${seq}@example.invalid`,
        fullName: `Synthetic ${role} ${seq}`,
        role,
        consentAt: new Date(),
        ...(role === 'GURU' ? { staff: { create: { employmentStatus: 'GTY' } } } : {}),
      },
    });
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
    jest.setSystemTime(new Date('2026-10-22T03:00:00Z'));
    await prisma.academicYear.updateMany({ data: { isActive: false } });
    await prisma.semester.updateMany({ data: { isActive: false } });
    await prisma.bellScheduleProfile.updateMany({ data: { revokedAt: new Date() } });
    const year = await prisma.academicYear.create({
      data: {
        code: '2026/2027',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2027-06-30'),
        isActive: true,
      },
    });
    yearId = year.id;
    const sem = await prisma.semester.create({
      data: {
        academicYearId: year.id,
        number: 1,
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31'),
        isActive: true,
      },
    });
    semesterId = sem.id;
    const t = await person('GURU');
    teacherUserId = t.id;
    teacher = auth(t.keycloakId, 'GURU');
    const profile = await prisma.teacher.create({ data: { userId: t.id } });
    teacherId = profile.id;
    const p = await person('ORANG_TUA');
    parentId = p.id;
    parent = auth(p.keycloakId, 'ORANG_TUA');
    const f = await person('ORANG_TUA');
    foreign = auth(f.keycloakId, 'ORANG_TUA');
    const c = await prisma.class.create({
      data: { name: 'X SYN', grade: 10, majorCode: 'SYN', academicYear: year.code },
    });
    classId = c.id;
    for (let i = 0; i < 2; i++) {
      const u = await person('SISWA');
      const s = await prisma.student.create({
        data: {
          userId: u.id,
          nis: 'SJP' + i,
          joinedAt: new Date('2026-07-01'),
          classId: c.id,
          parentId: p.id,
        },
      });
      if (i === 0) {
        studentId = s.id;
        learner = auth(u.keycloakId, 'SISWA');
      } else otherId = s.id;
    }
    const assignment = await prisma.teachingAssignment.create({
      data: {
        teacherId: profile.id,
        classId: c.id,
        subject: 'Matematika Sintetis',
        academicYear: year.code,
      },
    });
    await prisma.subject.create({ data: { code: 'MTKSYN', name: 'Matematika Sintetis' } });
    const bell = await prisma.bellScheduleProfile.create({
      data: {
        code: 'SJP_TEST',
        name: 'Synthetic',
        scope: 'SCHOOL',
        kind: 'NORMAL',
        effectiveFrom: new Date('2026-07-01'),
        effectiveUntil: new Date('2027-06-30'),
        provenance: 'disposable',
        segments: {
          create: Array.from({ length: 8 }, (_, i) => ({
            dayOfWeek: 0,
            type: 'INSTRUCTION',
            jpNumber: i + 1,
            label: 'JP ' + (i + 1),
            startMinute: 420 + i * 40,
            endMinute: 460 + i * 40,
            sortOrder: i + 1,
          })),
        },
      },
    });
    for (const [index, start, end] of [
      [0, 1, 2],
      [1, 3, 8],
    ]) {
      const schedule = await prisma.schedule.create({
        data: {
          classId: c.id,
          teachingAssignmentId: assignment.id,
          dayOfWeek: 4,
          jpStart: start!,
          jpEnd: end!,
          academicYear: year.code,
          semester: 1,
        },
      });
      const session = await prisma.classSession.create({
        data: {
          scheduleId: schedule.id,
          serviceDate: new Date('2026-10-22'),
          academicYearId: year.id,
          semesterId: sem.id,
          bellScheduleProfileId: bell.id,
          classId: c.id,
          teachingAssignmentId: assignment.id,
          scheduledTeacherId: profile.id,
          assignedTeacherId: profile.id,
          classNameSnapshot: 'X SYN',
          subjectSnapshot: 'Matematika Sintetis',
          scheduledTeacherName: 'Synthetic Guru',
          assignedTeacherName: 'Synthetic Guru',
          scheduledStartAt: new Date(
            Date.parse('2026-10-22T00:00:00Z') + (start! - 1) * 40 * 60000,
          ),
          scheduledEndAt: new Date(Date.parse('2026-10-22T00:00:00Z') + end! * 40 * 60000),
          status: index === 0 ? 'STARTED' : 'SCHEDULED',
          startedAt: index === 0 ? new Date('2026-10-22T00:00:00Z') : null,
        },
      });
      if (index === 0) sessionId = session.id;
      else secondId = session.id;
    }
    for (const [role, codes] of [
      [
        'GURU',
        ['academic.attendance.create', 'academic.attendance.read', 'academic.class-session.read'],
      ],
      ['SISWA', ['attendance.own.read']],
      ['ORANG_TUA', ['attendance.child.read']],
    ] as const)
      for (const code of codes) {
        const permission = await prisma.permission.upsert({
          where: { code },
          update: {},
          create: { code, module: 'academic', description: 'Synthetic' },
        });
        await prisma.rolePermission.upsert({
          where: { role_permissionId: { role, permissionId: permission.id } },
          update: {},
          create: { role, permissionId: permission.id },
        });
      }
    await prisma.attendance.create({
      data: {
        studentId,
        classId,
        date: new Date('2026-10-22'),
        status: 'hadir',
        recordedBy: t.id,
        notes: 'LEGACY-UNCHANGED',
      },
    });
  }, 30000);
  beforeEach(async () => {
    enqueue.mockClear();
    await prisma.studentSessionAttendance.deleteMany();
    await prisma.notificationLog.deleteMany({ where: { refType: 'student_session_attendance' } });
    await prisma.classSession.update({
      where: { id: sessionId },
      data: { status: 'STARTED', supersededAt: null },
    });
    await prisma.classSession.update({
      where: { id: secondId },
      data: { status: 'SCHEDULED', startedAt: null },
    });
    await prisma.user.update({
      where: { id: teacherUserId },
      data: { isActive: true, role: 'GURU' },
    });
    await prisma.student.update({
      where: { id: studentId },
      data: { parentId, classId, status: 'active' },
    });
    await prisma.academicCalendar.deleteMany({ where: { name: 'SJP-HOLIDAY' } });
  });
  afterAll(async () => {
    if (process.env.STUDENT_JP_BROWSER_FIXTURE) {
      const target = resolve(process.env.STUDENT_JP_BROWSER_FIXTURE);
      if (
        !target
          .replaceAll('\\', '/')
          .endsWith('/evidence/student-session-jp-20261022/browser/producer.json')
      )
        throw Error('Unexpected fixture output path');
      writeFileSync(target, JSON.stringify(browserProof, null, 2));
    }
    jest.useRealTimers();
    await prisma.$disconnect();
  });
  async function body(id = sessionId, mode: 'hadir' | 'alpha' | 'izin' | 'sakit' = 'hadir') {
    const roster = await service.roster({ sessionId: id }, teacher);
    return {
      records: roster.students.flatMap((s) =>
        roster.slots.map((slot) => ({
          studentId: s.id,
          jp: slot.jp,
          status: mode,
          notes: 'Synthetic note',
          revision:
            roster.records.find((x) => x.studentId === s.id && x.jp === slot.jp)?.revision ?? 0,
        })),
      ),
    };
  }
  const read = () => service.learner({ from: '2026-10-01', to: '2026-10-22' }, learner);
  it('audit reads real JP records rather than the independent daily attendance', async () => {
    const bodyValue = await body(sessionId, 'izin');
    await service.save(sessionId, bodyValue, teacher);
    const result = await audit.read(sessionId, { scope: 'own' }, teacher);
    expect(result.students).toHaveLength(2);
    expect(result.slots.map((slot) => slot.jp)).toEqual([1, 2]);
    expect(result.records).toHaveLength(4);
    expect(result.records.every((record) => record.status === 'izin')).toBe(true);
    expect((await prisma.attendance.findFirstOrThrow()).status).toBe('hadir');
  });
  it('audit rejects a different teacher and a freshly revoked read permission', async () => {
    const u = await person('GURU');
    await prisma.teacher.create({ data: { userId: u.id } });
    await expect(
      audit.read(sessionId, { scope: 'own' }, auth(u.keycloakId, 'GURU')),
    ).rejects.toThrow();
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'academic.class-session.read' },
    });
    const override = await prisma.userPermissionOverride.create({
      data: { userId: teacherUserId, permissionId: permission.id, grant: false },
    });
    try {
      await expect(audit.read(sessionId, {}, teacher)).rejects.toThrow();
    } finally {
      await prisma.userPermissionOverride.delete({ where: { id: override.id } });
    }
  });
  it('learner explicitly selects the official semester despite overlapping historical date ranges', async () => {
    const historical = await prisma.semester.create({
      data: {
        academicYearId: yearId,
        number: 2,
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31'),
        isActive: false,
      },
    });
    try {
      const result = await service.learner(
        { from: '2026-10-01', to: '2026-10-22', academicYear: '2026/2027', semester: 1 },
        learner,
      );
      expect(result.semester).toBe(1);
      expect(result.sessions.map((row) => row.id)).toContain(sessionId);
      const other = await service.learner(
        { from: '2026-10-01', to: '2026-10-22', academicYear: '2026/2027', semester: 2 },
        learner,
      );
      expect(other.sessions).toEqual([]);
    } finally {
      await prisma.semester.delete({ where: { id: historical.id } });
    }
  });
  it('returns roster from the actual session timing, not the changed Schedule', async () => {
    const s = await prisma.classSession.findUniqueOrThrow({ where: { id: sessionId } });
    await prisma.schedule.update({ where: { id: s.scheduleId }, data: { jpStart: 9, jpEnd: 10 } });
    expect((await service.roster({ sessionId }, teacher)).slots.map((x) => x.jp)).toEqual([1, 2]);
  });
  it('starts with unknown JP and never 0%/Alpha', async () => {
    browserProof.unknown = await read();
    browserProof.roster = await service.roster({ sessionId }, teacher);
    expect((await read()).totals).toMatchObject({
      expected: 8,
      unknown: 8,
      alpha: 0,
      pct: null,
      tone: 'unknown',
    });
  });
  it('admission is a calendar date, without inventing an intraday membership time', async () => {
    await prisma.student.update({
      where: { id: studentId },
      data: { joinedAt: new Date('2026-10-22T01:00:00Z') },
    });
    try {
      expect(
        (await service.roster({ sessionId }, teacher)).students.some((s) => s.id === studentId),
      ).toBe(true);
      expect((await read()).totals.expected).toBe(8);
      await prisma.student.update({
        where: { id: studentId },
        data: { joinedAt: new Date('2026-10-23') },
      });
      expect((await read()).totals.expected).toBe(0);
    } finally {
      await prisma.student.update({
        where: { id: studentId },
        data: { joinedAt: new Date('2026-07-01') },
      });
    }
  });
  it('inactive enrollment cannot acquire new expected JP', async () => {
    await prisma.student.update({ where: { id: studentId }, data: { status: 'inactive' } });
    expect((await read()).totals.expected).toBe(0);
  });
  it('persists atomic decisions and leaves daily attendance unchanged', async () => {
    await service.save(sessionId, await body(), teacher);
    expect(await prisma.studentSessionAttendance.count()).toBe(4);
    expect(await prisma.attendance.findFirst({ where: { studentId } })).toMatchObject({
      status: 'hadir',
      notes: 'LEGACY-UNCHANGED',
    });
    expect((await read()).totals).toMatchObject({ hadir: 2, unknown: 6, pct: null });
  });
  it('replay cannot duplicate records, revisions or inbox intents', async () => {
    const dto = await body(sessionId, 'alpha');
    await service.save(sessionId, dto, teacher);
    const before = await prisma.notificationLog.count({
      where: { refType: 'student_session_attendance' },
    });
    expect(await service.save(sessionId, dto, teacher)).toMatchObject({ replayed: true });
    expect(
      await prisma.notificationLog.count({ where: { refType: 'student_session_attendance' } }),
    ).toBe(before);
    expect(await prisma.studentSessionAttendance.count()).toBe(4);
    expect(await prisma.studentSessionAttendance.findFirst()).toMatchObject({ revision: 1 });
  });
  it('partial-JP exception and 2+6 weighted total are correct', async () => {
    await service.save(sessionId, await body(), teacher);
    await prisma.classSession.update({
      where: { id: secondId },
      data: { status: 'STARTED', startedAt: new Date('2026-10-22T01:20:00Z') },
    });
    const dto = await body(secondId, 'alpha');
    dto.records.forEach((r) => {
      if (r.jp === 3 || r.jp === 4) r.status = 'hadir';
    });
    await service.save(secondId, dto, teacher);
    expect((await read()).totals).toMatchObject({
      hadir: 4,
      alpha: 4,
      expected: 8,
      pct: 50,
      tone: 'yellow',
    });
    browserProof.yellow = await read();
  });
  it.each([
    ['hadir', 100, 'green'],
    ['alpha', 0, 'red'],
  ] as const)('complete %s gives %i%', async (status, pct, tone) => {
    await prisma.classSession.update({
      where: { id: secondId },
      data: { status: 'STARTED', startedAt: new Date('2026-10-22T01:20:00Z') },
    });
    await service.save(sessionId, await body(sessionId, status), teacher);
    await service.save(secondId, await body(secondId, status), teacher);
    expect((await read()).totals).toMatchObject({ pct, tone, complete: true });
    browserProof[tone] = await read();
  });
  it('six of eight JP yields blue 75%, including mixed Izin/Sakit notes', async () => {
    await prisma.classSession.update({
      where: { id: secondId },
      data: { status: 'STARTED', startedAt: new Date('2026-10-22T01:20:00Z') },
    });
    await service.save(sessionId, await body(), teacher);
    const dto = await body(secondId);
    dto.records.forEach((r) => {
      if (r.jp === 7) {
        r.status = 'izin';
        r.notes = 'Izin keluarga sintetis';
      }
      if (r.jp === 8) {
        r.status = 'sakit';
        r.notes = 'Sakit sintetis';
      }
    });
    await service.save(secondId, dto, teacher);
    expect((await read()).totals).toMatchObject({
      pct: 75,
      tone: 'blue',
      hadir: 6,
      izin: 1,
      sakit: 1,
    });
    browserProof.blue = await read();
    const logs = await prisma.notificationLog.findMany({
      where: { refType: 'student_session_attendance' },
    });
    expect(logs).toHaveLength(2);
    expect(logs.every((log) => log.subject === 'Informasi kehadiran sesi')).toBe(true);
  });
  it('rejects roster changed after preview without any partial write', async () => {
    const dto = await body();
    await prisma.student.update({ where: { id: studentId }, data: { classId: null } });
    await expect(service.save(sessionId, dto, teacher)).rejects.toThrow('Daftar siswa/JP');
    expect(await prisma.studentSessionAttendance.count()).toBe(0);
  });
  it('queued save rechecks revocation after waiting for the domain lock', async () => {
    const dto = await body();
    let unlock!: () => void, locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('academic:schedule:mutation:v1'))`,
        );
        locked();
        await gate;
      },
      { timeout: 15000 },
    );
    await ready;
    const pending = service.save(sessionId, dto, teacher).then(
      () => false,
      () => true,
    );
    try {
      let waiting = false;
      for (let i = 0; i < 80; i++) {
        const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(
          Prisma.sql`SELECT COUNT(*)::bigint AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'`,
        );
        if (Number(rows[0]?.count) > 0) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      await prisma.$transaction(async (tx) => {
        await acquireIdentityMutationLock(tx);
        await tx.user.update({ where: { id: teacherUserId }, data: { isActive: false } });
      });
    } finally {
      unlock();
      await holder;
    }
    expect(await pending).toBe(true);
    expect(await prisma.studentSessionAttendance.count()).toBe(0);
  }, 20000);
  it('permission override and inactive parent invalidate an existing inbox intent', async () => {
    await service.save(sessionId, await body(sessionId, 'alpha'), teacher);
    const log = await prisma.notificationLog.findFirstOrThrow({
      where: { refType: 'student_session_attendance', refId: { startsWith: studentId + ':' } },
    });
    await prisma.user.update({ where: { id: parentId }, data: { isActive: false } });
    expect(await studentAttendanceNoticeTarget(db, log)).toBeNull();
    await prisma.user.update({ where: { id: parentId }, data: { isActive: true } });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'attendance.child.read' },
    });
    await prisma.userPermissionOverride.create({
      data: { userId: parentId, permissionId: permission.id, grant: false },
    });
    expect(await studentAttendanceNoticeTarget(db, log)).toBeNull();
    await prisma.userPermissionOverride.deleteMany({
      where: { userId: parentId, permissionId: permission.id },
    });
  });
  it('an audit failure rolls back records and notification intents together', async () => {
    const dto = await body(sessionId, 'alpha');
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION academic.sjp_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='attendance.session.save' THEN RAISE EXCEPTION 'Synthetic audit rejection'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER sjp_test_reject_audit BEFORE INSERT ON audit.audit_log FOR EACH ROW EXECUTE FUNCTION academic.sjp_test_reject_audit()`,
    );
    try {
      await expect(service.save(sessionId, dto, teacher)).rejects.toThrow();
      expect(await prisma.studentSessionAttendance.count()).toBe(0);
      expect(
        await prisma.notificationLog.count({ where: { refType: 'student_session_attendance' } }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER sjp_test_reject_audit ON audit.audit_log');
      await prisma.$executeRawUnsafe('DROP FUNCTION academic.sjp_test_reject_audit()');
    }
  });
  it('rejects stale revisions without replacing newer values', async () => {
    const stale = await body();
    await service.save(sessionId, stale, teacher);
    stale.records[0]!.status = 'alpha';
    await expect(service.save(sessionId, stale, teacher)).rejects.toThrow('diperbarui');
    expect(await prisma.studentSessionAttendance.findFirst()).toMatchObject({
      status: 'hadir',
      revision: 1,
    });
  });
  it('assignment changed after preview rejects the former teacher', async () => {
    const dto = await body(),
      alternative = await person('GURU'),
      profile = await prisma.teacher.create({ data: { userId: alternative.id } });
    await prisma.classSession.update({
      where: { id: sessionId },
      data: { assignedTeacherId: profile.id },
    });
    try {
      await expect(service.save(sessionId, dto, teacher)).rejects.toThrow('kewenangan');
      expect(await prisma.studentSessionAttendance.count()).toBe(0);
    } finally {
      await prisma.classSession.update({
        where: { id: sessionId },
        data: { assignedTeacherId: teacherId },
      });
    }
  });
  it('closed semester rejects attendance without touching legacy daily records', async () => {
    const dto = await body();
    await prisma.semesterClosure.create({
      data: {
        academicYearId: yearId,
        semesterId,
        closedByUserId: teacherUserId,
        readinessVersion: 'synthetic',
        readinessHash: 'synthetic-only',
        idempotencyKey: 'sjp-synthetic-close',
        snapshot: { synthetic: true },
      },
    });
    try {
      await expect(service.save(sessionId, dto, teacher)).rejects.toThrow('ditutup');
      expect(await prisma.studentSessionAttendance.count()).toBe(0);
    } finally {
      await prisma.semesterClosure.deleteMany({ where: { semesterId } });
    }
  });
  it('fresh permission override rejects save after preview', async () => {
    const dto = await body(),
      permission = await prisma.permission.findUniqueOrThrow({
        where: { code: 'academic.attendance.create' },
      });
    const override = await prisma.userPermissionOverride.create({
      data: { userId: teacherUserId, permissionId: permission.id, grant: false },
    });
    try {
      await expect(service.save(sessionId, dto, teacher)).rejects.toThrow();
      expect(await prisma.studentSessionAttendance.count()).toBe(0);
    } finally {
      await prisma.userPermissionOverride.delete({ where: { id: override.id } });
    }
  });
  it('serializes concurrent replay once', async () => {
    const dto = await body(sessionId, 'izin');
    const results = await Promise.all([
      service.save(sessionId, dto, teacher),
      service.save(sessionId, dto, teacher),
    ]);
    expect(results.filter((x) => x.replayed)).toHaveLength(1);
    expect(
      await prisma.notificationLog.count({ where: { refType: 'student_session_attendance' } }),
    ).toBe(2);
  });
  it('rejects foreign/partial roster and out-of-range JP with no partial writes', async () => {
    const dto = await body();
    dto.records[0]!.jp = 39;
    await expect(service.save(sessionId, dto, teacher)).rejects.toThrow('Daftar siswa/JP');
    expect(await prisma.studentSessionAttendance.count()).toBe(0);
  });
  it('inactive guru and historical teacher with TU role cannot save', async () => {
    const dto = await body();
    await prisma.user.update({ where: { id: teacherUserId }, data: { isActive: false } });
    await expect(service.save(sessionId, dto, teacher)).rejects.toThrow();
    await prisma.user.update({
      where: { id: teacherUserId },
      data: { isActive: true, role: 'TATA_USAHA' },
    });
    await expect(service.save(sessionId, dto, teacher)).rejects.toThrow();
    expect(await prisma.studentSessionAttendance.count()).toBe(0);
  });
  it('cancelled session cannot save or contribute absence', async () => {
    const dto = await body();
    await prisma.classSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await expect(service.save(sessionId, dto, teacher)).rejects.toThrow();
    expect((await read()).totals.expected).toBe(6);
  });
  it('holidays do not create student absence', async () => {
    await prisma.academicCalendar.create({
      data: {
        academicYearId: yearId,
        name: 'SJP-HOLIDAY',
        type: 'holiday',
        startDate: new Date('2026-10-22'),
        endDate: new Date('2026-10-22'),
      },
    });
    expect((await read()).totals.expected).toBe(0);
    await expect(service.roster({ sessionId }, teacher)).rejects.toThrow('libur');
  });
  it('parent sees own child only, foreign parent/student claims fail', async () => {
    expect(
      (await service.learner({ from: '2026-10-01', to: '2026-10-22', studentId }, parent))
        .studentId,
    ).toBe(studentId);
    await expect(
      service.learner({ from: '2026-10-01', to: '2026-10-22', studentId }, foreign),
    ).rejects.toThrow();
    await expect(
      service.learner({ from: '2026-10-01', to: '2026-10-22', studentId: otherId }, learner),
    ).rejects.toThrow();
  });
  it('committed notifications survive queue outage and are invalid after parent transfer/correction', async () => {
    enqueue.mockRejectedValueOnce(Error('synthetic queue unavailable'));
    await expect(
      service.save(sessionId, await body(sessionId, 'alpha'), teacher),
    ).resolves.toMatchObject({ replayed: false });
    const log = await prisma.notificationLog.findFirstOrThrow({
      where: { refType: 'student_session_attendance', refId: { startsWith: studentId + ':' } },
    });
    expect(await studentAttendanceNoticeTarget(db, log)).toContain('attendanceDate=2026-10-22');
    const inbox = new PushService(db);
    expect(
      (await inbox.findMyNotifications(parent)).some(
        (n) => n.id === log.id && n.targetHref.includes('attendanceDate=2026-10-22'),
      ),
    ).toBe(true);
    expect(await resolvePendingNotificationIntent(db, log.id)).not.toBeNull();
    await prisma.student.update({ where: { id: studentId }, data: { parentId: null } });
    expect(await studentAttendanceNoticeTarget(db, log)).toBeNull();
    expect((await inbox.findMyNotifications(parent)).some((n) => n.id === log.id)).toBe(false);
    expect(await resolvePendingNotificationIntent(db, log.id)).toBeNull();
  });
  it('correction stops old pending notices and does not reuse their revision ref', async () => {
    await service.save(sessionId, await body(sessionId, 'alpha'), teacher);
    const logs = await prisma.notificationLog.findMany({
      where: { refType: 'student_session_attendance' },
    });
    await service.save(sessionId, await body(sessionId, 'hadir'), teacher);
    for (const log of logs) {
      expect(await studentAttendanceNoticeTarget(db, log)).toBeNull();
      expect(await prisma.notificationLog.findUnique({ where: { id: log.id } })).toMatchObject({
        status: 'failed',
        error: 'ATTENDANCE_UPDATED',
      });
    }
    expect(
      await prisma.auditLog.count({ where: { action: 'attendance.session.save' } }),
    ).toBeGreaterThan(0);
  });
  it('database rejects duplicate key and JP zero', async () => {
    await service.save(sessionId, await body(), teacher);
    const row = await prisma.studentSessionAttendance.findFirstOrThrow();
    await expect(
      prisma.studentSessionAttendance.create({
        data: {
          studentId: row.studentId,
          sessionId: row.sessionId,
          jp: row.jp,
          status: 'hadir',
          recordedBy: teacherUserId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw(
        Prisma.sql`UPDATE academic.student_session_attendance SET jp=0 WHERE id=${row.id}::uuid`,
      ),
    ).rejects.toThrow();
  });
  it.each(['transfer', 'permission', 'correction', 'session'] as const)(
    'provider-accepted sent push rechecks current PostgreSQL %s before display',
    async (change) => {
      const savedPublic = process.env.VAPID_PUBLIC_KEY,
        savedPrivate = process.env.VAPID_PRIVATE_KEY;
      process.env.VAPID_PUBLIC_KEY = 'synthetic-public';
      process.env.VAPID_PRIVATE_KEY = 'synthetic-private';
      const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-postgres-delivery';
      const grant = await prisma.rolePermission.findFirstOrThrow({
        where: { role: 'ORANG_TUA', permission: { code: 'attendance.child.read' } },
      });
      try {
        await service.save(sessionId, await body(sessionId, 'alpha'), teacher);
        const log = await prisma.notificationLog.findFirstOrThrow({
          where: {
            recipient: parentId,
            refType: 'student_session_attendance',
            refId: { startsWith: studentId + ':' },
          },
        });
        await prisma.pushSubscription.create({
          data: { userId: parentId, endpoint, keys: { p256dh: 'synthetic', auth: 'synthetic' } },
        });
        const transport = jest.mocked(webpush.sendNotification);
        transport.mockReset().mockResolvedValue({} as never);
        const push = new PushService(db);
        await push.dispatchNotificationLog({
          logId: log.id,
          userId: parentId,
          title: log.subject ?? 'Notifikasi DIIS',
          body: log.body,
        });
        expect(transport).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(String(transport.mock.calls[0]![1]));
        const input: VerifyPushDeliveryDto = {
          endpoint,
          proof: payload.deliveryProof,
          message: {
            ...payload.delivery,
            title: payload.title,
            body: payload.body,
            url: payload.url,
            tag: payload.tag,
          },
        };
        await prisma.notificationLog.update({
          where: { id: log.id },
          data: { status: 'sent', sentAt: new Date() },
        });
        expect(await push.verifyDelivery(input, parent)).toEqual({ deliver: true });
        if (change === 'transfer')
          await prisma.student.update({ where: { id: studentId }, data: { parentId: null } });
        if (change === 'permission')
          await prisma.rolePermission.delete({
            where: { role_permissionId: { role: 'ORANG_TUA', permissionId: grant.permissionId } },
          });
        if (change === 'correction')
          await service.save(sessionId, await body(sessionId, 'hadir'), teacher);
        if (change === 'session')
          await prisma.classSession.update({
            where: { id: sessionId },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          });
        expect(await push.verifyDelivery(input, parent)).toEqual({ deliver: false });
        // Sent is deliberately not rewritten by correction; revision/ownership is the fence.
        expect(
          (await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } })).status,
        ).toBe('sent');
      } finally {
        await prisma.pushSubscription.deleteMany({ where: { endpoint } });
        if (change === 'permission')
          await prisma.rolePermission.upsert({
            where: { role_permissionId: { role: 'ORANG_TUA', permissionId: grant.permissionId } },
            update: {},
            create: { role: 'ORANG_TUA', permissionId: grant.permissionId },
          });
        if (savedPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
        else process.env.VAPID_PUBLIC_KEY = savedPublic;
        if (savedPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
        else process.env.VAPID_PRIVATE_KEY = savedPrivate;
      }
    },
  );
});
