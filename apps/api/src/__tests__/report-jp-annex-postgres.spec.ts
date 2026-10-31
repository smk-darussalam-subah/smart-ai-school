import { PrismaClient, type UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ReportCardsController } from '../report-cards/report-cards.controller';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../permissions/permissions.guard';
import type { AuthUser } from '@smk/auth';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { ReportCardsService } from '../report-cards/report-cards.service';

const url = process.env.REPORT_ATTENDANCE_PROOF_URL;
const proofOutput = process.env.REPORT_ATTENDANCE_PROOF_OUTPUT;
if (
  url &&
  !/^postgresql:\/\/diis_local:diis_local@127\.0\.0\.1:\d+\/diis_report_jp_20261030$/.test(url)
)
  throw Error('Dedicated disposable DB only');
const proof = url ? describe : describe.skip;
proof('Saved JP annex on actual PostgreSQL', () => {
  const prisma = new PrismaClient({ datasourceUrl: url }),
    db = prisma as PrismaService,
    permissions = new PermissionsService(db);
  const service = new ReportCardsService(
    db,
    new EventEmitter2(),
    permissions,
    {} as NotificationService,
    new AcademicPeriodService(db, permissions),
  );
  let classId: string,
    studentId: string,
    secondId: string,
    sessionId: string,
    parentId: string,
    firstReport: string,
    secondReport: string;
  let learner: AuthUser, parent: AuthUser, otherParent: AuthUser, teacher: AuthUser;
  const auth = (keycloakId: string, role: UserRole) =>
    ({ keycloakId, username: 'synthetic', roles: [role] }) as AuthUser;
  const person = (role: UserRole, label: string) =>
    prisma.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `annex-${label}@example.invalid`,
        fullName: `QA ${label}`,
        role,
        consentAt: new Date(),
      },
    });
  const input = () => ({ classId, academicYear: '2026/2027', semester: 1 });
  beforeAll(async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-30T03:00:00Z'),
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'queueMicrotask',
        'performance',
        'hrtime',
      ],
    });
    await prisma.semester.updateMany({ data: { isActive: false } });
    await prisma.academicYear.updateMany({ data: { isActive: false } });
    await prisma.bellScheduleProfile.updateMany({ data: { revokedAt: new Date() } });
    const yearData = {
      code: '2026/2027',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2027-06-30'),
      isActive: true,
    };
    const year = await prisma.academicYear.upsert({
      where: { code: yearData.code },
      create: yearData,
      update: yearData,
    });
    const semData = {
      academicYearId: year.id,
      number: 1,
      startDate: new Date('2026-07-13'),
      endDate: new Date('2026-12-19'),
      isActive: true,
    };
    const sem = await prisma.semester.upsert({
      where: { academicYearId_number: { academicYearId: year.id, number: 1 } },
      create: semData,
      update: semData,
    });
    const t = await person('GURU', 'teacher'),
      a = await person('ORANG_TUA', 'parent-a'),
      b = await person('ORANG_TUA', 'parent-b');
    parentId = a.id;
    teacher = auth(t.keycloakId, 'GURU');
    const managePermission = await prisma.permission.upsert({ where: { code: 'report.wali.manage' }, create: { code: 'report.wali.manage', description: 'Synthetic wali grant', module: 'report' }, update: {} });
    await prisma.userPermissionOverride.create({ data: { userId: t.id, permissionId: managePermission.id, grant: true, source: 'MANUAL', status: 'ACTIVE', reason: 'Disposable report proof' } });
    parent = auth(a.keycloakId, 'ORANG_TUA');
    otherParent = auth(b.keycloakId, 'ORANG_TUA');
    const profile = await prisma.teacher.create({ data: { userId: t.id } });
    const c = await prisma.class.create({
      data: {
        name: 'X QA ANNEX',
        grade: 10,
        majorCode: 'QA',
        academicYear: year.code,
        teacherId: profile.id,
      },
    });
    classId = c.id;
    const u = await person('SISWA', 'learner-a'),
      v = await person('SISWA', 'learner-b');
    learner = auth(u.keycloakId, 'SISWA');
    const student = await prisma.student.create({
      data: {
        userId: u.id,
        nis: 'ANNEX-A',
        classId,
        parentId: a.id,
        joinedAt: new Date('2026-07-13'),
      },
    });
    studentId = student.id;
    secondId = (
      await prisma.student.create({
        data: {
          userId: v.id,
          nis: 'ANNEX-B',
          classId,
          parentId: b.id,
          joinedAt: new Date('2026-07-13'),
        },
      })
    ).id;
    const assignment = await prisma.teachingAssignment.create({
      data: { teacherId: profile.id, classId, subject: 'Matematika QA', academicYear: year.code },
    });
    const bell = await prisma.bellScheduleProfile.create({
      data: {
        code: 'ANNEX_QA',
        name: 'QA',
        scope: 'SCHOOL',
        kind: 'NORMAL',
        effectiveFrom: sem.startDate,
        provenance: 'disposable fixture',
        segments: {
          create: Array.from({ length: 6 }, (_, i) => ({
            type: 'INSTRUCTION',
            dayOfWeek: 0,
            jpNumber: i + 1,
            label: `JP ${i + 1}`,
            startMinute: 450 + i * 40,
            endMinute: 490 + i * 40,
            sortOrder: i + 1,
          })),
        },
      },
    });
    const schedule = await prisma.schedule.create({
      data: {
        classId,
        teachingAssignmentId: assignment.id,
        dayOfWeek: 1,
        jpStart: 1,
        jpEnd: 6,
        academicYear: year.code,
        semester: 1,
      },
    });
    const session = await prisma.classSession.create({
      data: {
        scheduleId: schedule.id,
        serviceDate: new Date('2026-10-19'),
        academicYearId: year.id,
        semesterId: sem.id,
        bellScheduleProfileId: bell.id,
        classId,
        teachingAssignmentId: assignment.id,
        scheduledTeacherId: profile.id,
        assignedTeacherId: profile.id,
        classNameSnapshot: c.name,
        subjectSnapshot: assignment.subject,
        scheduledTeacherName: t.fullName,
        assignedTeacherName: t.fullName,
        scheduledStartAt: new Date('2026-10-19T00:30:00Z'),
        scheduledEndAt: new Date('2026-10-19T04:30:00Z'),
        status: 'COMPLETED',
        startedAt: new Date('2026-10-19T00:30:00Z'),
        completedAt: new Date('2026-10-19T04:30:00Z'),
      },
    });
    sessionId = session.id;
    await prisma.studentSessionAttendance.createMany({
      data: (['hadir', 'hadir', 'izin', 'sakit', 'alpha'] as const).map((status, i) => ({
        studentId,
        sessionId,
        jp: i + 1,
        status,
        notes: status === 'izin' ? 'Alasan A' : status === 'sakit' ? 'Alasan B' : null,
        recordedBy: t.id,
      })),
    });
  });
  afterAll(async () => {
    jest.useRealTimers();
    await prisma.$disconnect();
  });
  it('concurrent generate produces one report per student with the same mixed JP basis', async () => {
    const legacy = await prisma.attendance.findMany({ where: { classId } });
    const results = await Promise.all([
      service.generate(input(), teacher),
      service.generate(input(), teacher),
    ]);
    expect(results.reduce((n, r) => n + r.generated, 0)).toBe(2);
    const reports = await prisma.reportCard.findMany({ where: { classId } });
    expect(reports).toHaveLength(2);
    firstReport = reports.find((r) => r.studentId === studentId)!.id;
    secondReport = reports.find((r) => r.studentId === secondId)!.id;
    const attendance = reports.find((r) => r.id === firstReport)!.attendance as {
      hadir: number;
      jp: { totals: Record<string, unknown>; sessions: { slots: { notes: string | null }[] }[] };
    };
    expect(attendance.hadir).toBe(0);
    expect(attendance.jp.totals).toMatchObject({
      expected: 6,
      hadir: 2,
      izin: 1,
      sakit: 1,
      alpha: 1,
      unknown: 1,
      pct: null,
    });
    expect(attendance.jp.sessions[0]!.slots[2]!.notes).toBe('Alasan A');
    expect(await prisma.attendance.findMany({ where: { classId } })).toEqual(legacy);
    const report = (await service.findAll({ page: 1, limit: 20, classId }, teacher)).data.find(
      (r) => r.id === firstReport,
    )!;
    expect(report.attendance).toHaveProperty('jpAvailable', true);
    expect(report.attendance).not.toHaveProperty('jp');
    if (proofOutput) writeFileSync(
      resolve(proofOutput, 'BROWSER-FIXTURE.json'),
      JSON.stringify(report, null, 2),
    );
    if (proofOutput) writeFileSync(
      resolve(proofOutput, 'BROWSER-SECTIONS.json'),
      JSON.stringify(
        await service.findOfficialSections(studentId, '2026/2027', 1, teacher),
        null,
        2,
      ),
    );
  });
  it('students and parents cannot read draft annex, while the wali can', async () => {
    for (const actor of [learner, parent, otherParent])
      await expect(
        service.findOfficialSections(studentId, '2026/2027', 1, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    const result = await service.findOfficialSections(studentId, '2026/2027', 1, teacher);
    expect(result.attendance).toHaveProperty('jp');
  });
  it('a later JP correction changes only refreshed drafts, not a prior snapshot', async () => {
    const before = await prisma.reportCard.findUniqueOrThrow({ where: { id: firstReport } });
    await prisma.studentSessionAttendance.update({
      where: { studentId_sessionId_jp: { studentId, sessionId, jp: 3 } },
      data: { status: 'hadir', notes: 'Koreksi QA', revision: { increment: 1 } },
    });
    expect(
      (await prisma.reportCard.findUniqueOrThrow({ where: { id: firstReport } })).attendance,
    ).toEqual(before.attendance);
    await service.generate(input(), teacher);
    const after = await prisma.reportCard.findUniqueOrThrow({ where: { id: firstReport } });
    expect(after.attendance).not.toEqual(before.attendance);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(JSON.stringify(after.attendance)).toContain('Koreksi QA');
    expect(JSON.stringify(after.attendance)).not.toContain('Alasan A');
  });
  it.each(['checked', 'published', 'distributed'] as const)(
    'preserves %s reports byte-for-byte when source attendance changes',
    async (status) => {
      await prisma.reportCard.update({ where: { id: firstReport }, data: { status } });
      const before = await prisma.reportCard.findUniqueOrThrow({ where: { id: firstReport } });
      await prisma.studentSessionAttendance.update({
        where: { studentId_sessionId_jp: { studentId, sessionId, jp: 4 } },
        data: { notes: `Later ${status}`, revision: { increment: 1 } },
      });
      expect(await service.generate(input(), teacher)).toMatchObject({ skipped: 1, refreshed: 1 });
      expect(await prisma.reportCard.findUnique({ where: { id: firstReport } })).toEqual(before);
    },
  );
  it('distributed annex follows current family ownership and never reads live JP', async () => {
    const saved = (await service.findOfficialSections(studentId, '2026/2027', 1, parent))
      .attendance;
    expect(saved).toHaveProperty('jp');
    expect(await service.findAttendanceSummary(studentId, '2026/2027', 1, learner)).toEqual(saved);
    await expect(
      service.findOfficialSections(studentId, '2026/2027', 1, otherParent),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.student.update({ where: { id: studentId }, data: { parentId: null } });
    await expect(
      service.findOfficialSections(studentId, '2026/2027', 1, parent),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.student.update({ where: { id: studentId }, data: { parentId } });
    expect(
      (await service.findOfficialSections(studentId, '2026/2027', 1, parent)).attendance,
    ).toEqual(saved);
    expect(JSON.stringify(saved)).not.toContain('Later distributed');
  });
  it('second student never receives the first student reasons, even through list responses', async () => {
    await prisma.reportCard.update({
      where: { id: secondReport },
      data: { status: 'distributed' },
    });
    const result = await service.findAll({ page: 1, limit: 20 }, otherParent);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.studentId).toBe(secondId);
    expect(JSON.stringify(result)).not.toContain('Alasan B');
    expect(JSON.stringify(result)).not.toContain('Koreksi QA');
  });
  it('serves the saved annex through real HTTP/guards and denies wrong child, missing auth and revoked permission', async () => {
    const actors: Record<string, AuthUser> = { learner, parent, otherParent, teacher };
    const readPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'report.read' },
    });
    for (const actor of Object.values(actors)) {
      const user = await prisma.user.findUniqueOrThrow({ where: { keycloakId: actor.keycloakId } });
      await permissions.grantUserPermission(user.id, readPermission.id);
    }
    const identify: CanActivate = {
      canActivate(context: ExecutionContext) {
        const request = context
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
        const actor = actors[request.headers['x-qa-actor'] ?? ''];
        if (!actor) throw new UnauthorizedException();
        request.user = actor;
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [ReportCardsController],
      providers: [
        { provide: ReportCardsService, useValue: service },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();
    const app: NestFastifyApplication = module.createNestApplication(new FastifyAdapter(), {
      logger: false,
    });
    const reflector = new Reflector();
    app.useGlobalGuards(
      identify,
      new RolesGuard(reflector, permissions),
      new PermissionGuard(reflector, permissions),
    );
    const controls: { actor: string; status: number; expected: number }[] = [];
    try {
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      const url = `/report-cards/${studentId}/official-sections?year=2026%2F2027&semester=1`;
      for (const [actor, expected] of [
        ['learner', 200],
        ['parent', 200],
        ['teacher', 200],
        ['otherParent', 403],
        ['missing', 401],
      ] as const) {
        const response = await app.inject({ method: 'GET', url, headers: { 'x-qa-actor': actor } });
        controls.push({ actor, status: response.statusCode, expected });
        if (proofOutput) writeFileSync(
          resolve(proofOutput, 'HTTP-PROGRESS.json'),
          JSON.stringify(
            {
              controls,
              lastBody: response.statusCode !== expected ? response.body : undefined,
              explicitFixtureGrants: true,
            },
            null,
            2,
          ),
        );
        expect(response.statusCode).toBe(expected);
        if (expected === 200)
          expect(response.json().attendance.jp).toMatchObject({ studentId, classId });
        else expect(response.body).not.toContain('Alasan B');
      }
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: 'report.read' },
      });
      await permissions.revokeUserPermission(parentId, permission.id);
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { 'x-qa-actor': 'parent' },
      });
      controls.push({ actor: 'parent-revoked', status: response.statusCode, expected: 403 });
      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain('Alasan B');
      if (proofOutput) writeFileSync(
        resolve(proofOutput, 'HTTP-RESULT.json'),
        JSON.stringify(
          {
            controls,
            identity: 'synthetic header adapter',
            guards: 'production RolesGuard/PermissionGuard and DB PermissionsService',
            database: 'disposable PostgreSQL',
            globalKeycloak: false,
          },
          null,
          2,
        ),
      );
    } finally {
      await app.close();
    }
  });
  it('does not backfill an already distributed report that never had a JP annex', async () => {
    const old = await prisma.reportCard.update({
      where: { id: firstReport },
      data: { status: 'distributed', attendance: { hadir: 7, izin: 1, sakit: 0, alpha: 0 } },
    });
    expect(await service.generate(input(), teacher)).toMatchObject({ skipped: 2 });
    expect(await prisma.reportCard.findUnique({ where: { id: firstReport } })).toEqual(old);
    const read = await service.findOfficialSections(studentId, '2026/2027', 1, learner);
    expect(read.attendance).toEqual({ hadir: 7, izin: 1, sakit: 0, alpha: 0, total: 8 });
  });
  it('does not expose a mismatched annex even if a saved JSON binding is corrupt', async () => {
    const before = await prisma.reportCard.findUniqueOrThrow({ where: { id: secondReport } });
    const corrupt = {
      hadir: 0,
      jp: {
        studentId,
        classId,
        academicYear: '2026/2027',
        semester: 1,
        privateReason: 'Never expose this foreign reason',
      },
    };
    await prisma.reportCard.update({ where: { id: secondReport }, data: { attendance: corrupt } });
    try {
      const list = await service.findAll({ page: 1, limit: 20 }, otherParent);
      const detail = await service.findOfficialSections(secondId, '2026/2027', 1, otherParent);
      expect(JSON.stringify([list, detail])).not.toContain('Never expose this foreign reason');
      expect(detail.attendance).toHaveProperty('jp', { unavailable: true });
    } finally {
      if (before.attendance)
        await prisma.reportCard.update({
          where: { id: secondReport },
          data: { attendance: before.attendance },
        });
    }
  });
});
