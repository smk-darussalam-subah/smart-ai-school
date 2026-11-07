import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AuthUser } from '@smk/auth';
import type { PrismaService } from '../prisma/prisma.service';
import type { SchoolConfigService } from '../school-config/school-config.service';
import type { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { AnalyticsService, StudentAnalyticsService } from '../analytics/analytics.service';
import { AnalyticsController } from '../analytics/analytics.controller';
import { ClassesController } from '../classes/classes.controller';
import { ClassesService } from '../classes/classes.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionGuard } from '../permissions/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const url = process.env.REPORT_ATTENDANCE_PROOF_URL;
if (
  url &&
  !/^postgresql:\/\/diis_local:diis_local@127\.0\.0\.1:\d+\/diis_report_jp_20261030$/.test(url)
)
  throw Error('Dedicated disposable database only');
(url ? describe : describe.skip)('Aggregate analytics production HTTP + PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url }),
    prisma = db as PrismaService;
  const permissions = new PermissionsService(prisma);
  const service = new AnalyticsService(
    prisma,
    {} as SchoolConfigService,
    {} as StaffAttendanceService,
  );
  let classId: string,
    emptyClass: string,
    app: NestFastifyApplication,
    principalId: string,
    permissionId: string,
    principalAppointmentId: string;
  const actors: Record<string, AuthUser> = {};
  const query = () => ({ academicYear: '2025/2026', semester: 2, classId, majorCode: 'QA_AGG_A' });
  beforeAll(async () => {
    await db.academicYear.updateMany({ data: { isActive: false } });
    await db.semester.updateMany({ data: { isActive: false } });
    const activeYear = await db.academicYear.upsert({
      where: { code: '2026/2027' },
      create: {
        code: '2026/2027',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2027-06-30'),
        isActive: true,
      },
      update: { isActive: true },
    });
    const year = await db.academicYear.upsert({
      where: { code: '2025/2026' },
      create: {
        code: '2025/2026',
        startDate: new Date('2025-07-01'),
        endDate: new Date('2026-06-30'),
      },
      update: {},
    });
    const period = {
      academicYearId: year.id,
      number: 2,
      startDate: new Date('2026-01-07'),
      endDate: new Date('2026-06-19'),
      isActive: false,
    };
    await db.semester.upsert({
      where: { academicYearId_number: { academicYearId: year.id, number: 2 } },
      create: period,
      update: period,
    });
    permissionId = (
      await db.permission.findUniqueOrThrow({ where: { code: 'academic.grade.read' } })
    ).id;
    for (const [key, role] of [
      ['principal', 'KEPALA_SEKOLAH'],
      ['teacher', 'GURU'],
      ['tu', 'TATA_USAHA'],
      ['industry', 'INDUSTRI'],
    ] as const) {
      const primaryRole = role === 'KEPALA_SEKOLAH' ? 'GURU' : role;
      const user = await db.user.create({
        data: {
          keycloakId: randomUUID(),
          email: `aggregate-${key}@example.invalid`,
          fullName: `Synthetic ${key}`,
          role: primaryRole,
        },
      });
      actors[key] = {
        keycloakId: user.keycloakId,
        username: 'synthetic',
        roles: [primaryRole],
      } as AuthUser;
      if (key === 'principal') {
        principalId = user.id;
        const staff = await db.staff.create({ data: { userId: user.id, employmentStatus: 'GTY' } });
        const position = await db.position.findUniqueOrThrow({ where: { code: 'KEPALA_SEKOLAH' } });
        principalAppointmentId = (
          await db.appointment.create({
            data: {
              staffId: staff.id,
              positionId: position.id,
              academicYearId: activeYear.id,
              status: 'ACTIVE',
              effectiveFrom: new Date('2026-07-01'),
            },
          })
        ).id;
      }
      await permissions.grantUserPermission(user.id, permissionId);
    }
    const teacherUser = await db.user.findUniqueOrThrow({
      where: { keycloakId: actors.teacher!.keycloakId },
    });
    const teacher = await db.teacher.create({ data: { userId: teacherUser.id } });
    classId = (
      await db.class.create({
        data: {
          name: 'X AGG CURRENT',
          grade: 10,
          majorCode: 'QA_AGG_A',
          academicYear: year.code,
          teacherId: teacher.id,
        },
      })
    ).id;
    emptyClass = (
      await db.class.create({
        data: { name: 'X AGG EMPTY', grade: 10, majorCode: 'QA_AGG_A', academicYear: year.code },
      })
    ).id;
    await db.class.create({
      data: {
        name: 'X AGG OTHER YEAR',
        grade: 10,
        majorCode: 'QA_AGG_A',
        academicYear: '2024/2025',
      },
    });
    const assignment = await db.teachingAssignment.create({
      data: {
        teacherId: teacher.id,
        classId,
        subject: 'QA Aggregate Mathematics',
        academicYear: year.code,
      },
    });
    await db.kktpConfig.create({
      data: { subject: assignment.subject, academicYear: year.code, semester: 2, kktp: 80 },
    });
    for (const [index, score] of [95, 75].entries()) {
      const user = await db.user.create({
        data: {
          keycloakId: randomUUID(),
          email: `aggregate-pupil-${index}@example.invalid`,
          fullName: `Synthetic pupil${index}`,
          role: 'SISWA',
        },
      });
      const student = await db.student.create({
        data: { userId: user.id, nis: `AGG-${index}`, classId, joinedAt: period.startDate },
      });
      if (index === 0)
        await db.sppPayment.create({
          data: { studentId: student.id, month: 1, year: 2000, amount: 100, status: 'unpaid' },
        });
      await db.grade.create({
        data: {
          studentId: student.id,
          assignmentId: assignment.id,
          academicYear: year.code,
          semester: 2,
          type: 'uh',
          score,
          submittedBy: teacherUser.id,
        },
      });
      for (const date of ['2026-01-01', '2026-01-07', '2026-06-19', '2026-07-01'])
        await db.attendance.create({
          data: {
            studentId: student.id,
            classId,
            date: new Date(date),
            status:
              date === '2026-01-07' || date === '2026-06-19'
                ? index === 0
                  ? 'hadir'
                  : 'alpha'
                : 'izin',
            recordedBy: teacherUser.id,
          },
        });
    }
    const otherClass = await db.class.create({
      data: { name: 'X AGG FINANCE B', grade: 10, majorCode: 'QA_AGG_B', academicYear: year.code },
    });
    const otherUser = await db.user.create({
      data: {
        keycloakId: randomUUID(),
        email: 'aggregate-finance-other@example.invalid',
        fullName: 'Synthetic finance pupil',
        role: 'SISWA',
      },
    });
    const otherStudent = await db.student.create({
      data: {
        userId: otherUser.id,
        nis: 'AGG-FIN-B',
        classId: otherClass.id,
        joinedAt: period.startDate,
      },
    });
    await db.sppPayment.create({
      data: { studentId: otherStudent.id, month: 1, year: 2000, amount: 900, status: 'late' },
    });
    const financePermission = await db.permission.findUniqueOrThrow({
      where: { code: 'finance.read' },
    });
    await permissions.grantUserPermission(principalId, financePermission.id);
    const identify: CanActivate = {
      canActivate(ctx: ExecutionContext) {
        const request = ctx
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
        const actor = actors[request.headers['x-qa-actor'] ?? ''];
        if (!actor) throw new UnauthorizedException();
        request.user = actor;
        return true;
      },
    };
    const mod = await Test.createTestingModule({
      controllers: [AnalyticsController, ClassesController],
      providers: [
        { provide: AnalyticsService, useValue: service },
        { provide: StudentAnalyticsService, useValue: {} },
        { provide: ClassesService, useValue: new ClassesService(prisma) },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();
    app = mod.createNestApplication(new FastifyAdapter(), { logger: false });
    app.useGlobalGuards(
      identify,
      new RolesGuard(new Reflector(), permissions),
      new PermissionGuard(new Reflector(), permissions),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    if (app) await app.close();
    await db.$disconnect();
  });
  it('matches independent SQL mean85, pass50% and official-boundary attendance', async () => {
    const value = await service.grades(query());
    const [oracle] = await db.$queryRaw<
      Array<{ count: bigint; mean: number; pass: number }>
    >`SELECT count(*) AS count, avg(score)::float8 AS mean, (100.0*count(*) FILTER (WHERE score>=80)/count(*))::float8 AS pass FROM academic.grades g JOIN academic.teaching_assignments a ON g.assignment_id=a.id WHERE a.class_id=${classId}::uuid AND g.academic_year='2025/2026' AND g.semester=2`;
    expect(value.overall).toMatchObject({
      count: Number(oracle!.count),
      mean: oracle!.mean,
      kkmPassRate: oracle!.pass,
    });
    expect(value.correlation).toMatchObject({
      n: 2,
      r: 1,
      basis: { unit: 'student_daily', from: '2026-01-07', to: '2026-06-19' },
    });
    expect(value.correlation.points.map((p) => p.x).sort((a, b) => a - b)).toEqual([0, 100]);
    if (process.env.REPORT_ATTENDANCE_PROOF_OUTPUT)
      writeFileSync(
        resolve(process.env.REPORT_ATTENDANCE_PROOF_OUTPUT, 'aggregate-grade.json'),
        JSON.stringify(value, null, 2),
      );
  });
  it('a conflicting class/major pair returns no records or correlation pairs', async () => {
    const value = await service.grades({ ...query(), majorCode: 'QA_AGG_OTHER' });
    expect(value.overall.count).toBe(0);
    expect(value.correlation.n).toBe(0);
    expect(value.kkmMatrix.cells).toEqual([]);
  });
  it('empty class has no grade denominator; legitimate zero remains a record', async () => {
    expect((await service.grades({ ...query(), classId: emptyClass })).overall.count).toBe(0);
    const rows = await db.grade.findMany({ where: { assignment: { classId } } });
    try {
      await db.grade.updateMany({ where: { assignment: { classId } }, data: { score: 0 } });
      expect((await service.grades(query())).overall).toMatchObject({
        count: 2,
        mean: 0,
        kkmPassRate: 0,
      });
    } finally {
      await db.$transaction(
        rows.map((row) => db.grade.update({ where: { id: row.id }, data: { score: row.score } })),
      );
    }
  });
  it('finance producer and real HTTP retain global/major/class scope and amount100 versus1000', async () => {
    const rows = [];
    for (const [params, expected] of [
      [{}, 1000],
      [{ majorCode: 'QA_AGG_A' }, 100],
      [{ majorCode: 'QA_AGG_B' }, 900],
      [{ classId, majorCode: 'QA_AGG_B' }, 0],
    ] as const) {
      const result = await service.financeAging(params);
      expect(result.totalAmount).toBe(expected);
      expect(result.scope).toEqual({
        period: 'all_years',
        majorCode: 'majorCode' in params ? params.majorCode : null,
        classId: 'classId' in params ? params.classId : null,
      });
      const query = new URLSearchParams(params as Record<string, string>);
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/finance/aging?' + query,
        headers: { 'x-qa-actor': 'principal' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(result);
      rows.push({ params, result, status: response.statusCode });
    }
    if (process.env.REPORT_ATTENDANCE_PROOF_OUTPUT)
      writeFileSync(
        resolve(process.env.REPORT_ATTENDANCE_PROOF_OUTPUT, 'FINANCE-SCOPE.json'),
        JSON.stringify(
          {
            rows,
            database:
              'disposable PostgreSQL, actual producer and Nest/Fastify/guards, header identity adapter',
          },
          null,
          2,
        ),
      );
  });
  it('controller converts semester text, enforces roles/permission and validates queries', async () => {
    const endpoint =
      '/analytics/grades?' +
      new URLSearchParams({
        academicYear: '2025/2026',
        semester: '2',
        classId,
        majorCode: 'QA_AGG_A',
      });
    const controls: { path: string; actor: string; expected: number; actual: number }[] = [];
    for (const [actor, suffix, expected] of [
      ['principal', '', 200],
      ['teacher', '', 403],
      ['missing', '', 401],
      ['principal', '&semester=bad', 400],
    ] as const) {
      const res = await app.inject({
        method: 'GET',
        url: endpoint + suffix,
        headers: { 'x-qa-actor': actor },
      });
      controls.push({ path: 'analytics', actor, expected, actual: res.statusCode });
      expect(res.statusCode).toBe(expected);
      if (expected === 200)
        expect(res.json().filters).toMatchObject({
          academicYear: '2025/2026',
          semester: 2,
          classId,
          majorCode: 'QA_AGG_A',
        });
    }
    for (const [actor, expected] of [
      ['principal', 200],
      ['teacher', 200],
      ['tu', 200],
      ['industry', 403],
    ] as const) {
      const res = await app.inject({
        method: 'GET',
        url: '/classes?academicYear=2025%2F2026&majorCode=QA_AGG_A&limit=1',
        headers: { 'x-qa-actor': actor },
      });
      controls.push({ path: 'classes', actor, expected, actual: res.statusCode });
      expect(res.statusCode).toBe(expected);
      if (expected === 200) expect(res.json().total).toBe(2);
    }
    await permissions.revokeUserPermission(principalId, permissionId);
    const revoked = await app.inject({
      method: 'GET',
      url: endpoint,
      headers: { 'x-qa-actor': 'principal' },
    });
    controls.push({
      path: 'analytics',
      actor: 'principal-revoked',
      expected: 403,
      actual: revoked.statusCode,
    });
    expect(revoked.statusCode).toBe(403);
    await permissions.grantUserPermission(principalId, permissionId);
    const restored = await app.inject({
      method: 'GET',
      url: endpoint,
      headers: { 'x-qa-actor': 'principal' },
    });
    controls.push({
      path: 'analytics',
      actor: 'principal-restored',
      expected: 200,
      actual: restored.statusCode,
    });
    expect(restored.statusCode).toBe(200);
    await db.appointment.update({
      where: { id: principalAppointmentId },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    const ended = await app.inject({
      method: 'GET',
      url: endpoint,
      headers: { 'x-qa-actor': 'principal' },
    });
    controls.push({
      path: 'analytics',
      actor: 'principal-appointment-ended',
      expected: 403,
      actual: ended.statusCode,
    });
    expect(ended.statusCode).toBe(403);
    if (process.env.REPORT_ATTENDANCE_PROOF_OUTPUT)
      writeFileSync(
        resolve(process.env.REPORT_ATTENDANCE_PROOF_OUTPUT, 'AGGREGATE-HTTP.json'),
        JSON.stringify(
          {
            controls,
            layer:
              'production Nest/Fastify controller, RolesGuard, PermissionGuard, Prisma, disposable PostgreSQL; header identity adapter, no Keycloak',
          },
          null,
          2,
        ),
      );
  });
});
