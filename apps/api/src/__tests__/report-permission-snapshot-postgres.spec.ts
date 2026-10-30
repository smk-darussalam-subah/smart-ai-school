import { PrismaClient, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { APPOINTMENT_ACTIVATION_LOCK_KEY } from '../appointments/appointments.service';
import type { AuthUser } from '@smk/auth';
import { ReportCardsService } from '../report-cards/report-cards.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
const url = process.env.REPORT_ATTENDANCE_PROOF_URL;
if (
  url &&
  !/^postgresql:\/\/diis_local:diis_local@127\.0\.0\.1:\d+\/diis_report_jp_20261030$/.test(url)
)
  throw Error('Dedicated local disposable database required');
const observations: unknown[] = [];
(url ? describe : describe.skip)(
  'Report permission snapshot after successful nonblocking locks',
  () => {
    const db = new PrismaClient({ datasourceUrl: url }),
      p = db as PrismaService,
      permissions = new PermissionsService(p);
    const service = new ReportCardsService(
      p,
      new EventEmitter2(),
      permissions,
      {} as NotificationService,
      new AcademicPeriodService(p, permissions),
    );
    let permissionId: string;
    beforeAll(async () => {
      await db.semester.updateMany({ data: { isActive: false } });
      await db.academicYear.updateMany({ data: { isActive: false } });
      const y = await db.academicYear.upsert({
        where: { code: '2026/2027' },
        create: {
          code: '2026/2027',
          startDate: new Date('2026-07-01'),
          endDate: new Date('2027-06-30'),
          isActive: true,
        },
        update: { isActive: true },
      });
      await db.semester.upsert({
        where: { academicYearId_number: { academicYearId: y.id, number: 1 } },
        create: {
          academicYearId: y.id,
          number: 1,
          startDate: new Date('2026-07-13'),
          endDate: new Date('2026-12-19'),
          isActive: true,
        },
        update: {
          isActive: true,
          startDate: new Date('2026-07-13'),
          endDate: new Date('2026-12-19'),
        },
      });
      permissionId = (
        await db.permission.upsert({
          where: { code: 'report.wali.manage' },
          create: {
            code: 'report.wali.manage',
            description: 'Synthetic local report proof',
            module: 'report',
          },
          update: {},
        })
      ).id;
    });
    afterAll(async () => {
      if (process.env.REPORT_ATTENDANCE_PROOF_OUTPUT)
        writeFileSync(
          process.env.REPORT_ATTENDANCE_PROOF_OUTPUT + '/AUTHORITY-OBSERVATIONS.json',
          JSON.stringify(
            {
              at: new Date().toISOString(),
              method:
                'Actual services and PostgreSQL; hook pauses before lifecycle/fresh authority, not replacing authority checks; disposable only',
              observations,
            },
            null,
            2,
          ) + '\n',
        );
      await db.$disconnect();
    });
    async function fixture() {
      const suffix = randomUUID();
      const user = await db.user.create({
        data: {
          keycloakId: randomUUID(),
          email: `teacher-${suffix}@example.invalid`,
          fullName: 'Synthetic reviewer teacher',
          role: 'GURU',
        },
      });
      const teacher = await db.teacher.create({ data: { userId: user.id } });
      const c = await db.class.create({
        data: {
          name: 'Review ' + suffix.slice(0, 8),
          majorCode: 'QAREV',
          grade: 10,
          academicYear: '2026/2027',
          teacherId: teacher.id,
        },
      });
      const pupil = await db.user.create({
        data: {
          keycloakId: randomUUID(),
          email: `pupil-${suffix}@example.invalid`,
          fullName: 'Synthetic reviewer pupil',
          role: 'SISWA',
        },
      });
      await db.student.create({
        data: {
          userId: pupil.id,
          nis: suffix.slice(0, 16),
          classId: c.id,
          joinedAt: new Date('2026-07-13'),
        },
      });
      return {
        userId: user.id,
        keycloakId: user.keycloakId,
        actor: { keycloakId: user.keycloakId, username: 'synthetic', roles: ['GURU'] } as AuthUser,
        dto: { classId: c.id, academicYear: '2026/2027', semester: 1 },
      };
    }
    it('negative control: deny committed before a fresh request prevents all report writes', async () => {
      const f = await fixture();
      await permissions.grantUserPermission(f.userId, permissionId);
      await permissions.revokeUserPermission(f.userId, permissionId);
      await expect(service.generate(f.dto, f.actor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await db.reportCard.count({ where: { classId: f.dto.classId } })).toBe(0);
      observations.push({ scenario: 'deny-before-request', blocked: true, reports: 0 });
    });
    it.each([
      ['update-existing', false],
      ['insert-first-deny', false],
      ['update-existing', true],
      ['insert-first-deny', true],
      ['role-replacement', false],
      ['role-replacement', true],
    ] as const)(
      'rejects %s after snapshot (refresh=%s), retaining the original reviewer pause',
      async (mode, refresh) => {
        const f = await fixture();
        const oldRoleIds = (await db.rolePermission.findMany({ where: { role: 'GURU' } })).map(
          (row) => row.permissionId,
        );
        if (mode === 'update-existing')
          await permissions.grantUserPermission(f.userId, permissionId);
        else
          await permissions.setRolePermissions('GURU', [...new Set([...oldRoleIds, permissionId])]);
        if (refresh) await service.generate(f.dto, f.actor);
        const before = await db.reportCard.findMany({ where: { classId: f.dto.classId } });
        let enter!: () => void, release!: () => void;
        const entered = new Promise<void>((r) => (enter = r)),
          gate = new Promise<void>((r) => (release = r));
        const hooks = service as unknown as {
          lockFreshReportDomain(
            tx: Prisma.TransactionClient,
            key: string,
            wait?: boolean,
          ): Promise<void>;
        };
        const original = hooks.lockFreshReportDomain.bind(hooks);
        let pause = true,
          freshObserved: boolean | undefined;
        const lockSpy = jest
          .spyOn(hooks, 'lockFreshReportDomain')
          .mockImplementation(async (...args) => {
            if (pause && args[1] === 'users:last-active-super-admin') {
              pause = false;
              enter();
              await gate;
            }
            return original(...args);
          });
        const freshOriginal = permissions.hasFreshPermission.bind(permissions);
        const freshSpy = jest
          .spyOn(permissions, 'hasFreshPermission')
          .mockImplementation(async (...args) => {
            const value = await freshOriginal(...args);
            if (args[0] === f.keycloakId) freshObserved = value;
            return value;
          });
        const operation = service.generate(f.dto, f.actor).then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error: error as Error }),
        );
        try {
          await entered;
          if (mode === 'role-replacement')
            await permissions.setRolePermissions(
              'GURU',
              oldRoleIds.filter((id) => id !== permissionId),
            );
          else await permissions.revokeUserPermission(f.userId, permissionId);
          const latest = await freshOriginal(
            f.keycloakId,
            'report.wali.manage',
            db as unknown as Prisma.TransactionClient,
          );
          expect(latest).toBe(false);
          release();
          const result = await operation;
          const reports = await db.reportCard.count({ where: { classId: f.dto.classId } });
          const attempts = lockSpy.mock.calls.filter(([, key]) => key === 'users:last-active-super-admin').length;
          observations.push({
            scenario: mode,
            refresh,
            attempts,
            revokeCommittedBeforeFreshAuthority: true,
            latestPermission: latest,
            transactionPermission: freshObserved,
            error: result.error?.name ?? null,
            generated: result.value?.generated ?? 0,
            reports,
          });
          expect(result.error).toBeInstanceOf(ForbiddenException);
          expect(attempts).toBeGreaterThanOrEqual(2);
          expect(attempts).toBeLessThanOrEqual(3);
          expect(result.value).toBeNull();
          expect(reports).toBe(refresh ? 1 : 0);
          expect(await db.reportCard.findMany({ where: { classId: f.dto.classId } })).toEqual(
            before,
          );
          expect(freshObserved).toBe(false);
          await expect(service.generate(f.dto, f.actor)).rejects.toBeInstanceOf(ForbiddenException);
        } finally {
          release();
          lockSpy.mockRestore();
          freshSpy.mockRestore();
          await operation;
          if (mode !== 'update-existing') await permissions.setRolePermissions('GURU', oldRoleIds);
        }
      },
    );
    it.each([false, true])(
      'a winning generate serializes the later override revoke (refresh=%s)',
      async (refresh) => {
        const f = await fixture();
        await permissions.grantUserPermission(f.userId, permissionId);
        if (refresh) await service.generate(f.dto, f.actor);
        let enter!: () => void, release!: () => void;
        const entered = new Promise<void>((resolve) => (enter = resolve)),
          gate = new Promise<void>((resolve) => (release = resolve));
        const hooks = service as unknown as {
          buildGradeSnapshot(
            tx: Prisma.TransactionClient,
            student: string,
            classId: string,
            year: string,
            semester: number,
          ): Promise<unknown>;
        };
        const original = hooks.buildGradeSnapshot.bind(hooks);
        const spy = jest
          .spyOn(hooks, 'buildGradeSnapshot')
          .mockImplementationOnce(async (...args) => {
            enter();
            await gate;
            return original(...args);
          });
        const operation = service.generate(f.dto, f.actor);
        let revoke: Promise<unknown> | undefined;
        try {
          await entered;
          revoke = permissions.revokeUserPermission(f.userId, permissionId);
          let waiting = false;
          for (let i = 0; i < 100; i++) {
            const rows = await db.$queryRaw<
              Array<{ n: bigint }>
            >`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='transactionid' AND query LIKE '%auth.permissions%'`;
            if (Number(rows[0]?.n) > 0) {
              waiting = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          expect(waiting).toBe(true);
          release();
          expect(await operation).toMatchObject(refresh ? { refreshed: 1 } : { generated: 1 });
          await revoke;
          expect(
            await permissions.hasFreshPermission(
              f.keycloakId,
              'report.wali.manage',
              db as unknown as Prisma.TransactionClient,
            ),
          ).toBe(false);
          await expect(service.generate(f.dto, f.actor)).rejects.toBeInstanceOf(ForbiddenException);
          expect(await db.reportCard.count({ where: { classId: f.dto.classId } })).toBe(1);
        } finally {
          release();
          spy.mockRestore();
          await operation.catch(() => undefined);
          await revoke;
        }
      },
    );
    it('the anchor changes MVCC version but preserves every catalog value', async () => {
      const f = await fixture(),
        before = await db.permission.findUniqueOrThrow({ where: { id: permissionId } });
      const [oldVersion] = await db.$queryRaw<
        Array<{ version: string }>
      >`SELECT xmin::text AS version FROM auth.permissions WHERE id=${permissionId}::uuid`;
      await permissions.grantUserPermission(f.userId, permissionId);
      const [newVersion] = await db.$queryRaw<
        Array<{ version: string }>
      >`SELECT xmin::text AS version FROM auth.permissions WHERE id=${permissionId}::uuid`;
      expect(newVersion!.version).not.toBe(oldVersion!.version);
      expect(await db.permission.findUniqueOrThrow({ where: { id: permissionId } })).toEqual(
        before,
      );
    });
    it('failed override mutation rolls back the anchor and leaves authority unchanged', async () => {
      const f = await fixture();
      await permissions.grantUserPermission(f.userId, permissionId);
      const before = await db.permission.findUniqueOrThrow({ where: { id: permissionId } });
      const host = db as unknown as {
        $transaction<T>(
          callback: (tx: Prisma.TransactionClient) => Promise<T>,
          options?: { timeout?: number },
        ): Promise<T>;
      };
      const original = host.$transaction.bind(host);
      const spy = jest
        .spyOn(host, '$transaction')
        .mockImplementationOnce(async (callback, options) =>
          original(async (tx) => {
            await callback(tx);
            throw new Error('Synthetic failure immediately before commit');
          }, options),
        );
      try {
        await expect(permissions.revokeUserPermission(f.userId, permissionId)).rejects.toThrow(
          'Synthetic failure',
        );
      } finally {
        spy.mockRestore();
      }
      expect(await db.permission.findUniqueOrThrow({ where: { id: permissionId } })).toEqual(
        before,
      );
      expect(await service.generate(f.dto, f.actor)).toMatchObject({ generated: 1 });
    });
    it('concurrent replacements of an initially empty role yield one complete set', async () => {
      const old = (await db.rolePermission.findMany({ where: { role: 'INDUSTRI' } })).map(
        (row) => row.permissionId,
      );
      const other = await db.permission.findUniqueOrThrow({ where: { code: 'student.read' } });
      try {
        await permissions.setRolePermissions('INDUSTRI', []);
        await Promise.all([
          permissions.setRolePermissions('INDUSTRI', [permissionId]),
          permissions.setRolePermissions('INDUSTRI', [other.id]),
        ]);
        const rows = await db.rolePermission.findMany({ where: { role: 'INDUSTRI' } });
        expect(rows).toHaveLength(1);
        expect([permissionId, other.id]).toContain(rows[0]!.permissionId);
      } finally {
        await permissions.setRolePermissions('INDUSTRI', old);
      }
    });
    it('appointment-only authority revoked after snapshot but before cutover is not stale', async () => {
      const f = await fixture();
      const oldRoleIds = (await db.rolePermission.findMany({ where: { role: 'GURU' } })).map(
        (row) => row.permissionId,
      );
      await permissions.setRolePermissions(
        'GURU',
        oldRoleIds.filter((id) => id !== permissionId),
      );
      const staff = await db.staff.create({ data: { userId: f.userId, employmentStatus: 'GTY' } });
      const position = await db.position.create({
        data: {
          code: 'QA_REPORT_' + randomUUID().slice(0, 8),
          name: 'Synthetic report permission',
          category: 'FUNGSIONAL',
          scopeType: 'NONE',
        },
      });
      await db.positionPermission.create({ data: { positionId: position.id, permissionId } });
      const year = await db.academicYear.findFirstOrThrow({ where: { isActive: true } });
      const appointment = await db.appointment.create({
        data: {
          staffId: staff.id,
          positionId: position.id,
          academicYearId: year.id,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-07-01'),
        },
      });
      expect(
        await permissions.hasFreshPermission(
          f.keycloakId,
          'report.wali.manage',
          db as unknown as Prisma.TransactionClient,
        ),
      ).toBe(true);
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>((resolve) => (enter = resolve)),
        gate = new Promise<void>((resolve) => (release = resolve));
      const hooks = service as unknown as {
        lockFreshReportDomain(
          tx: Prisma.TransactionClient,
          key: string,
          wait?: boolean,
        ): Promise<void>;
      };
      const original = hooks.lockFreshReportDomain.bind(hooks);
      let once = true;
      const spy = jest.spyOn(hooks, 'lockFreshReportDomain').mockImplementation(async (...args) => {
        if (once && args[1] === APPOINTMENT_ACTIVATION_LOCK_KEY) {
          once = false;
          enter();
          await gate;
        }
        return original(...args);
      });
      const op = service.generate(f.dto, f.actor).then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error: error as unknown }),
      );
      try {
        await entered;
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${APPOINTMENT_ACTIVATION_LOCK_KEY}))`;
          await tx.appointment.update({
            where: { id: appointment.id },
            data: { status: 'ENDED', endedAt: new Date() },
          });
        });
        release();
        const result = await op;
        expect(result.error).toBeInstanceOf(ForbiddenException);
        expect(result.value).toBeNull();
        expect(await db.reportCard.count({ where: { classId: f.dto.classId } })).toBe(0);
      } finally {
        release();
        spy.mockRestore();
        await op;
        await permissions.setRolePermissions('GURU', oldRoleIds);
      }
    });
  },
);
