import { PrismaClient, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import { ReportCardsService } from '../report-cards/report-cards.service';
import { PermissionsService } from '../permissions/permissions.service';
import { ClassesService } from '../classes/classes.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { APPOINTMENT_ACTIVATION_LOCK_KEY } from '../appointments/appointments.service';

const url = process.env.REPORT_ATTENDANCE_PROOF_URL;
if (
  url &&
  !/^postgresql:\/\/diis_local:diis_local@127\.0\.0\.1:\d+\/diis_report_jp_20261030$/.test(url)
)
  throw Error('Dedicated disposable database only');
const proof = url ? describe : describe.skip;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
proof('Report generation authority at serialization point (actual PostgreSQL)', () => {
  const db = new PrismaClient({ datasourceUrl: url }),
    prisma = db as PrismaService;
  const permissions = new PermissionsService(prisma),
    classes = new ClassesService(prisma);
  const service = new ReportCardsService(
    prisma,
    new EventEmitter2(),
    permissions,
    {} as NotificationService,
    new AcademicPeriodService(prisma, permissions),
  );
  let actor: AuthUser,
    userId: string,
    teacherId: string,
    classId: string,
    studentId: string,
    permissionId: string;
  const dto = () => ({ classId, academicYear: '2026/2027', semester: 1 });
  beforeAll(async () => {
    await db.semester.updateMany({ data: { isActive: false } });
    await db.academicYear.updateMany({ data: { isActive: false } });
    const yearData = {
      code: '2026/2027',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2027-06-30'),
      isActive: true,
    };
    const year = await db.academicYear.upsert({
      where: { code: yearData.code },
      create: yearData,
      update: yearData,
    });
    const sem = {
      academicYearId: year.id,
      number: 1,
      startDate: new Date('2026-07-13'),
      endDate: new Date('2026-12-19'),
      isActive: true,
    };
    await db.semester.upsert({
      where: { academicYearId_number: { academicYearId: year.id, number: 1 } },
      create: sem,
      update: sem,
    });
    permissionId = (
      await db.permission.upsert({
        where: { code: 'report.wali.manage' },
        create: { code: 'report.wali.manage', description: 'Report proof', module: 'report' },
        update: {},
      })
    ).id;
  });
  beforeEach(async () => {
    const suffix = randomUUID();
    const person = await db.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `report-${suffix}@example.invalid`,
        fullName: 'Synthetic teacher',
        role: 'GURU',
      },
    });
    userId = person.id;
    actor = { keycloakId: person.keycloakId, username: 'synthetic', roles: ['GURU'] } as AuthUser;
    teacherId = (await db.teacher.create({ data: { userId } })).id;
    classId = (
      await db.class.create({
        data: {
          name: `QA ${suffix}`,
          academicYear: '2026/2027',
          grade: 10,
          majorCode: 'QA',
          teacherId,
        },
      })
    ).id;
    const pupil = await db.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `pupil-${suffix}@example.invalid`,
        fullName: 'Synthetic pupil',
        role: 'SISWA',
      },
    });
    studentId = (
      await db.student.create({
        data: {
          userId: pupil.id,
          nis: suffix.slice(0, 16),
          classId,
          joinedAt: new Date('2026-07-13'),
        },
      })
    ).id;
    await permissions.grantUserPermission(userId, permissionId);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  async function waitForSql(fragment: string, event = 'advisory') {
    for (let i = 0; i < 120; i++) {
      const rows = await db.$queryRaw<
        Array<{ n: bigint }>
      >`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event=${event} AND query LIKE ${'%' + fragment + '%'}`;
      if (Number(rows[0]?.n) > 0) return;
      await delay(20);
    }
    throw Error('Operation never reached expected lock: ' + fragment);
  }
  async function queued(mutate: () => Promise<unknown>, cutover: boolean | 'class' = false) {
    let acquired!: () => void, release!: () => void;
    const held = new Promise<void>((resolve) => (acquired = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    const blocker = db.$transaction(
      async (tx) => {
        if (cutover === 'class')
          await tx.$queryRaw`SELECT id FROM academic.classes WHERE id=${classId}::uuid FOR UPDATE`;
        else if (cutover)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${APPOINTMENT_ACTIVATION_LOCK_KEY}))`;
        else
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('report-card-generate'), hashtext(${classId + ':2026/2027:1'}))`;
        acquired();
        await gate;
      },
      { timeout: 20000 },
    );
    await held;
    const operation = service.generate(dto(), actor).then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error: error as unknown }),
    );
    try {
      await waitForSql(
        cutover === 'class'
          ? 'academic.classes'
          : cutover
            ? 'pg_advisory_xact_lock(hashtext'
            : 'report-card-generate',
        cutover === 'class' ? 'transactionid' : 'advisory',
      );
      await mutate();
      release();
      await blocker;
      const result = await operation;
      expect(result.error).toBeInstanceOf(ForbiddenException);
      expect(result.value).toBeNull();
    } finally {
      release();
      await blocker;
      await operation;
    }
  }
  it('rejects a homeroom revoked before the request', async () => {
    await classes.update(classId, { teacherId: null });
    await expect(service.generate(dto(), actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await db.reportCard.count({ where: { classId } })).toBe(0);
  });
  it('rejects queued create after ClassesService revokes the homeroom', async () => {
    await queued(() => classes.update(classId, { teacherId: null }));
    expect(await db.reportCard.count({ where: { classId } })).toBe(0);
  });
  it('rejects queued draft refresh and preserves the entire existing snapshot', async () => {
    await service.generate(dto(), actor);
    const before = await db.reportCard.findFirstOrThrow({ where: { studentId } });
    await queued(() => classes.update(classId, { teacherId: null }));
    expect(await db.reportCard.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  });
  it.each(['disabled', 'archived', 'TU'])(
    'rejects a queued request after the actor becomes %s',
    async (condition) => {
      await queued(() =>
        db.user.update({
          where: { id: userId },
          data:
            condition === 'disabled'
              ? { isActive: false }
              : condition === 'archived'
                ? { deletedAt: new Date() }
                : { role: 'TATA_USAHA' },
        }),
      );
      expect(await db.reportCard.count({ where: { classId } })).toBe(0);
    },
  );
  it('does not reuse a warm permission cache when a queued grant is revoked', async () => {
    expect(
      await permissions.hasPermission(actor.keycloakId, actor.roles, 'report.wali.manage'),
    ).toBe(true);
    await queued(() => permissions.revokeUserPermission(userId, permissionId));
    expect(await db.reportCard.count({ where: { classId } })).toBe(0);
  });
  it('restarts an old snapshot after a cutover queue before reading permission inserts', async () => {
    await queued(() => permissions.revokeUserPermission(userId, permissionId), true);
    expect(await db.reportCard.count({ where: { classId } })).toBe(0);
  });
  it.each([false, 'class'] as const)(
    'sees the first deny override inserted while waiting for %s',
    async (mode) => {
      await db.userPermissionOverride.deleteMany({ where: { userId, permissionId } });
      await db.rolePermission.createMany({
        data: [{ role: 'GURU', permissionId }],
        skipDuplicates: true,
      });
      permissions.invalidateAll();
      expect(
        await permissions.hasPermission(actor.keycloakId, actor.roles, 'report.wali.manage'),
      ).toBe(true);
      await queued(() => permissions.revokeUserPermission(userId, permissionId), mode);
      expect(await db.reportCard.count({ where: { classId } })).toBe(0);
    },
  );
  it('does not wait on lifecycle ownership while holding a class seat lock', async () => {
    let acquired!: () => void, release!: () => void;
    const held = new Promise<void>((resolve) => (acquired = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('users:last-active-super-admin'))`;
        acquired();
        await gate;
        await tx.$queryRaw`SELECT id FROM academic.classes WHERE id=${classId}::uuid FOR UPDATE`;
      },
      { timeout: 10000 },
    );
    await held;
    try {
      await expect(service.generate(dto(), actor)).rejects.toBeInstanceOf(ConflictException);
      expect(await db.reportCard.count({ where: { classId } })).toBe(0);
    } finally {
      release();
      await blocker;
    }
  }, 15000);
  it('holds the class mandate through a winning generate; revocation then commits after it', async () => {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => (enter = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    const hooks = service as unknown as {
      buildGradeSnapshot(
        tx: Prisma.TransactionClient,
        studentId: string,
        classId: string,
        year: string,
        semester: number,
      ): Promise<unknown>;
    };
    const original = hooks.buildGradeSnapshot.bind(hooks);
    const spy = jest.spyOn(hooks, 'buildGradeSnapshot').mockImplementationOnce(async (...args) => {
      enter();
      await gate;
      return original(...args);
    });
    const operation = service.generate(dto(), actor);
    let revoke: Promise<unknown> | undefined;
    try {
      await entered;
      revoke = classes.update(classId, { teacherId: null });
      await waitForSql('academic.classes', 'transactionid');
      release();
      expect(await operation).toMatchObject({ generated: 1 });
      await revoke;
      expect(await db.reportCard.count({ where: { classId } })).toBe(1);
      await expect(service.generate(dto(), actor)).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      release();
      spy.mockRestore();
      await operation.catch(() => undefined);
      await revoke;
    }
  }, 25000);
});
