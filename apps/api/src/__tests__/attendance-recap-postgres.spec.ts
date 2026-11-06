import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { writeFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { PrismaClient, type User } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AuthUser } from '@smk/auth';
import { AttendanceRecapService } from '../attendance/attendance-recap.service';
import { AttendanceRecapController } from '../attendance/attendance-recap.controller';
import { AttendanceRecapSchema } from '../attendance/attendance-recap.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakGuard } from '../auth/guards/keycloak.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../permissions/permissions.guard';
import { UserStatusService } from '../auth/user-status.service';

const url = process.env.JP_RECAP_DATABASE_URL;
if (
  url &&
  !/^postgresql:\/\/diis_fixture:diis_fixture_local_only@127\.0\.0\.1:55473\/diis_jp_recap_test(?:\?.*)?$/.test(
    url,
  )
)
  throw Error('Marked disposable loopback DB required');
(url ? describe : describe.skip)(
  'recap production service, signed HTTP guards and PostgreSQL',
  () => {
    const db = new PrismaClient({ datasourceUrl: url }),
      prisma = db as PrismaService,
      permissions = new PermissionsService(prisma),
      service = new AttendanceRecapService(prisma, permissions);
    const actors = {} as Record<
      'teacher' | 'other' | 'principal' | 'student' | 'parent' | 'tu' | 'waka' | 'kaprog' | 'admin',
      User
    >;
    const key = generateKeyPairSync('rsa', { modulusLength: 2048 }),
      environment = { ...process.env };
    let server: Server, issuer: string, app: NestFastifyApplication;
    let yearId: string,
      semesterId: string,
      teacherId: string,
      otherTeacherId: string,
      classId: string,
      foreignClassId: string,
      aId: string,
      bId: string,
      foreignId: string,
      firstSession: string,
      secondSession: string,
      bellId: string,
      ownAssignment: string;
    const user = (who: keyof typeof actors) =>
      ({
        keycloakId: actors[who].keycloakId,
        roles: [actors[who].role],
        username: 'qa-recap',
      }) as AuthUser;
    const query = (values: Record<string, unknown> = {}) =>
      AttendanceRecapSchema.parse({
        academicYear: '2026/2027',
        semester: 1,
        from: '2026-11-02',
        to: '2026-11-02',
        context: 'own',
        ...values,
      });
    const token = (who: keyof typeof actors, expiresIn = 600) =>
      jwt.sign(
        {
          sub: actors[who].keycloakId,
          sid: 'qa-recap-session-' + who,
          realm_access: { roles: [actors[who].role] },
        },
        key.privateKey,
        { algorithm: 'RS256', keyid: 'qa-recap-key', issuer, expiresIn },
      );
    async function session(
      teacher: string,
      klass: string,
      assignment: string,
      start: number,
      end: number,
      subject: string,
      name: string,
      scheduleDay = 1,
    ) {
      const schedule = await db.schedule.create({
        data: {
          classId: klass,
          teachingAssignmentId: assignment,
          dayOfWeek: scheduleDay,
          jpStart: start,
          jpEnd: end,
          academicYear: '2026/2027',
          semester: 1,
        },
      });
      return db.classSession.create({
        data: {
          scheduleId: schedule.id,
          serviceDate: new Date('2026-11-02'),
          academicYearId: yearId,
          semesterId,
          bellScheduleProfileId: bellId,
          classId: klass,
          teachingAssignmentId: assignment,
          scheduledTeacherId: teacher,
          assignedTeacherId: teacher,
          classNameSnapshot: name,
          subjectSnapshot: subject,
          scheduledTeacherName: 'QA Guru',
          assignedTeacherName: teacher === teacherId ? 'QA Guru A' : 'QA Guru B',
          scheduledStartAt: new Date(Date.parse('2026-11-02T00:00:00Z') + (start - 1) * 40 * 60000),
          scheduledEndAt: new Date(Date.parse('2026-11-02T00:00:00Z') + end * 40 * 60000),
          status: 'COMPLETED',
          startedAt: new Date('2026-11-02T00:00:00Z'),
          completedAt: new Date('2026-11-02T03:00:00Z'),
        },
      });
    }
    beforeAll(async () => {
      server = createServer((_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            keys: [
              {
                ...key.publicKey.export({ format: 'jwk' }),
                kid: 'qa-recap-key',
                alg: 'RS256',
                use: 'sig',
              },
            ],
          }),
        );
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const port = (server.address() as { port: number }).port;
      issuer = `http://127.0.0.1:${port}/realms/qa-recap`;
      Object.assign(process.env, {
        KEYCLOAK_URL: `http://127.0.0.1:${port}`,
        KEYCLOAK_REALM: 'qa-recap',
        KEYCLOAK_ISSUER: issuer,
      });
      await db.academicYear.updateMany({ data: { isActive: false } });
      await db.semester.updateMany({ data: { isActive: false } });
      await db.bellScheduleProfile.updateMany({ data: { revokedAt: new Date() } });
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
      const semester = await db.semester.create({
        data: {
          academicYearId: yearId,
          number: 1,
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-12-31'),
          isActive: true,
        },
      });
      semesterId = semester.id;
      for (const [name, role] of [
        ['teacher', 'GURU'],
        ['other', 'GURU'],
        ['principal', 'GURU'],
        ['student', 'SISWA'],
        ['parent', 'ORANG_TUA'],
        ['tu', 'TATA_USAHA'],
        ['waka', 'GURU'],
        ['kaprog', 'GURU'],
        ['admin', 'SUPER_ADMIN'],
      ] as const)
        actors[name] = await db.user.create({
          data: {
            keycloakId: randomUUID(),
            fullName: 'QA Recap ' + name,
            role,
            email: randomUUID() + '@example.invalid',
            consentVersion: 'v1.0',
          },
        });
      const t = await db.teacher.create({ data: { userId: actors.teacher.id } });
      teacherId = t.id;
      const o = await db.teacher.create({ data: { userId: actors.other.id } });
      otherTeacherId = o.id;
      for (const who of ['teacher', 'other', 'waka', 'principal', 'kaprog'] as const)
        await db.staff.create({ data: { userId: actors[who].id, employmentStatus: 'GTY' } });
      const position = await db.position.upsert({
        where: { code: 'WAKA_KURIKULUM' },
        create: { code: 'WAKA_KURIKULUM', name: 'Waka Kurikulum', category: 'STRUKTURAL' },
        update: {},
      });
      const wakaStaff = await db.staff.findUniqueOrThrow({ where: { userId: actors.waka.id } });
      await db.appointment.create({
        data: {
          staffId: wakaStaff.id,
          positionId: position.id,
          academicYearId: yearId,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-07-01'),
        },
      });
      const ksPosition = await db.position.upsert({
        where: { code: 'KEPALA_SEKOLAH' },
        create: { code: 'KEPALA_SEKOLAH', name: 'Kepala Sekolah', category: 'STRUKTURAL' },
        update: {},
      });
      const ksStaff = await db.staff.findUniqueOrThrow({ where: { userId: actors.principal.id } });
      await db.appointment.create({
        data: {
          staffId: ksStaff.id,
          positionId: ksPosition.id,
          academicYearId: yearId,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-07-01'),
        },
      });
      const major = await db.major.upsert({
        where: { code: 'QA' },
        create: { code: 'QA', name: 'QA disposable' },
        update: { isActive: true },
      });
      const kaprogPosition = await db.position.upsert({
        where: { code: 'KAPROG' },
        create: { code: 'KAPROG', name: 'Kaprog QA', category: 'STRUKTURAL', scopeType: 'MAJOR' },
        update: { scopeType: 'MAJOR', isActive: true },
      });
      const kaprogStaff = await db.staff.findUniqueOrThrow({ where: { userId: actors.kaprog.id } });
      await db.appointment.create({
        data: {
          staffId: kaprogStaff.id,
          positionId: kaprogPosition.id,
          academicYearId: yearId,
          majorId: major.id,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-07-01'),
        },
      });
      const c = await db.class.create({
        data: { name: 'X QA A', grade: 10, majorCode: 'QA', academicYear: '2026/2027', teacherId },
      });
      classId = c.id;
      const foreign = await db.class.create({
        data: { name: 'XI QA B', grade: 11, majorCode: 'QB', academicYear: '2026/2027' },
      });
      foreignClassId = foreign.id;
      const empty = await db.class.create({
        data: {
          name: 'X QA Belum Ada Sesi',
          grade: 10,
          majorCode: 'QA',
          academicYear: '2026/2027',
        },
      });
      const a = await db.student.create({
        data: {
          userId: actors.student.id,
          classId,
          nis: 'QA-RECAP-A',
          joinedAt: new Date('2026-07-01'),
        },
      });
      aId = a.id;
      for (const [name, klass] of [
        ['B', classId],
        ['C', foreignClassId],
      ] as const) {
        const u = await db.user.create({
          data: {
            role: 'SISWA',
            keycloakId: randomUUID(),
            fullName: 'QA Siswa ' + name,
            email: randomUUID() + '@example.invalid',
          },
        });
        const s = await db.student.create({
          data: {
            userId: u.id,
            classId: klass,
            nis: 'QA-RECAP-' + name,
            joinedAt: new Date('2026-07-01'),
          },
        });
        if (name === 'B') bId = s.id;
        else foreignId = s.id;
      }
      const ta = await db.teachingAssignment.create({
        data: { teacherId, classId, subject: 'Matematika QA', academicYear: '2026/2027' },
      });
      ownAssignment = ta.id;
      const tb = await db.teachingAssignment.create({
        data: {
          teacherId: otherTeacherId,
          classId,
          subject: 'Bahasa QA',
          academicYear: '2026/2027',
        },
      });
      const tf = await db.teachingAssignment.create({
        data: {
          teacherId: otherTeacherId,
          classId: foreignClassId,
          subject: 'Mapel Asing',
          academicYear: '2026/2027',
        },
      });
      await db.teachingAssignment.create({
        data: {
          teacherId,
          classId: empty.id,
          subject: 'Belum Terjadwal',
          academicYear: '2026/2027',
        },
      });
      const bell = await db.bellScheduleProfile.create({
        data: {
          code: 'QA_RECAP',
          name: 'QA Recap JP 1-10',
          scope: 'SCHOOL',
          kind: 'NORMAL',
          effectiveFrom: new Date('2026-07-01'),
          effectiveUntil: new Date('2027-06-30'),
          provenance: 'Disposable QA',
          segments: {
            create: Array.from({ length: 10 }, (_, i) => ({
              dayOfWeek: 0,
              type: 'INSTRUCTION',
              jpNumber: i + 1,
              label: `JP ${i + 1}`,
              startMinute: 420 + i * 40,
              endMinute: 460 + i * 40,
              sortOrder: i + 1,
            })),
          },
        },
      });
      bellId = bell.id;
      const s1 = await session(teacherId, classId, ta.id, 1, 2, ta.subject, c.name);
      firstSession = s1.id;
      const s2 = await session(otherTeacherId, classId, tb.id, 3, 4, tb.subject, c.name);
      secondSession = s2.id;
      const s3 = await session(
        otherTeacherId,
        foreignClassId,
        tf.id,
        1,
        2,
        tf.subject,
        foreign.name,
      );
      for (const [sid, studentId, statuses, start] of [
        [s1.id, aId, ['hadir', 'hadir'], 1],
        [s1.id, bId, ['izin', 'alpha'], 1],
        [s2.id, aId, ['hadir', 'hadir'], 3],
        [s3.id, foreignId, ['hadir', 'sakit'], 1],
      ] as const)
        for (let i = 0; i < statuses.length; i++)
          await db.studentSessionAttendance.create({
            data: {
              sessionId: sid,
              studentId,
              jp: start + i,
              status: statuses[i]!,
              notes: statuses[i] === 'izin' ? 'Izin QA' : null,
              recordedBy: actors.teacher.id,
            },
          });
      for (const code of ['academic.attendance.read', 'academic.class-session.read']) {
        const permission = await db.permission.upsert({
          where: { code },
          create: { code, module: 'academic', description: 'QA recap' },
          update: {},
        });
        for (const role of ['GURU', 'KEPALA_SEKOLAH'] as const)
          await db.rolePermission.upsert({
            where: { role_permissionId: { role, permissionId: permission.id } },
            create: { role, permissionId: permission.id },
            update: {},
          });
      }
      await db.rolePermission.deleteMany({
        where: {
          role: 'TATA_USAHA',
          permission: { code: { in: ['academic.attendance.read', 'academic.class-session.read'] } },
        },
      });
      const module = await Test.createTestingModule({
        controllers: [AttendanceRecapController],
        providers: [{ provide: AttendanceRecapService, useValue: service }],
      }).compile();
      app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
        logger: false,
      });
      const reflector = new Reflector();
      app.useGlobalGuards(
        new KeycloakGuard(reflector, new UserStatusService(prisma)),
        new PermissionGuard(reflector, permissions),
        new RolesGuard(reflector, permissions),
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    }, 30000);
    afterAll(async () => {
      await app?.close();
      if (server) await new Promise<void>((r) => server.close(() => r()));
      await db.$disconnect();
      process.env = environment;
    });
    it('teacher sees own sessions only and counts unique students separately from JP', async () => {
      const r = await service.read(query(), user('teacher'));
      expect(r.metrics).toMatchObject({
        H: 2,
        I: 1,
        A: 1,
        recorded: 4,
        due: 4,
        attendancePct: 50,
        coveragePct: 100,
        students: 2,
      });
      expect(r.options.subjects).toEqual(['Matematika QA']);
      expect(r.coverage.classesWithoutSessions).toBe(1);
    });
    it('homeroom sees other subjects in their class without foreign classes', async () => {
      const r = await service.read(
        query({ context: 'homeroom', view: 'students' }),
        user('teacher'),
      );
      expect(r.metrics).toMatchObject({
        H: 4,
        I: 1,
        A: 1,
        U: 2,
        attendancePct: 66.67,
        coveragePct: 75,
      });
      expect(r.students).toHaveLength(2);
      expect(r.options.classes.every((c) => c.id === classId)).toBe(true);
    });
    it('principal aggregates whole permitted school with JP weights', async () => {
      const r = await service.read(query({ context: 'authorized' }), user('principal'));
      expect(r.metrics).toMatchObject({
        H: 5,
        I: 1,
        S: 1,
        A: 1,
        U: 2,
        attendancePct: 62.5,
        coveragePct: 80,
        students: 3,
      });
    });
    it('active Waka appointment reads the school instead of personal teaching only', async () => {
      const r = await service.read(query({ context: 'authorized' }), user('waka'));
      expect(r.metrics.students).toBe(3);
      expect(r.metrics.attendancePct).toBe(62.5);
    });
    it('rejects foreign student and narrows tampered teacher/class filters', async () => {
      await expect(
        service.read(query({ view: 'detail', studentId: foreignId }), user('teacher')),
      ).rejects.toThrow('cakupan');
      await expect(
        service.read(query({ classId: foreignClassId }), user('teacher')),
      ).rejects.toThrow('kewenangan');
      const r = await service.read(query({ teacherId: otherTeacherId }), user('teacher'));
      expect(r.metrics.recorded).toBe(0);
      expect(r.timeline).toHaveLength(0);
    });
    it('does not allow an unappointed teacher to request homeroom scope', async () => {
      await expect(service.read(query({ context: 'homeroom' }), user('other'))).rejects.toThrow(
        'binaan',
      );
    });
    it('revoking current homeroom mandate removes access on the next request', async () => {
      await db.class.update({ where: { id: classId }, data: { teacherId: null } });
      try {
        await expect(service.read(query({ context: 'homeroom' }), user('teacher'))).rejects.toThrow(
          'binaan',
        );
      } finally {
        await db.class.update({ where: { id: classId }, data: { teacherId } });
      }
    });
    it('per-JP deadline excludes prefilled future JP until its exact end', async () => {
      const q = query();
      const before = await service.read(q, user('teacher'), new Date('2026-11-02T00:39:59.999Z'));
      expect(before.metrics).toMatchObject({
        N: 4,
        due: 0,
        attendancePct: null,
        coveragePct: null,
      });
      const first = await service.read(q, user('teacher'), new Date('2026-11-02T00:40:00Z'));
      expect(first.metrics).toMatchObject({ H: 1, I: 1, N: 2, due: 2, attendancePct: 50 });
    });
    it('Saturday and JP 9-10 follow retained bell timing instead of a fixed eight-column weekday calendar', async () => {
      const s = await session(teacherId, classId, ownAssignment, 9, 10, 'Praktik QA', 'X QA A', 6);
      try {
        await db.classSession.update({
          where: { id: s.id },
          data: {
            serviceDate: new Date('2026-11-07'),
            scheduledStartAt: new Date('2026-11-07T05:20:00Z'),
            scheduledEndAt: new Date('2026-11-07T06:40:00Z'),
            status: 'MISSED',
            startedAt: null,
            completedAt: null,
            missedAt: new Date('2026-11-07T06:40:00Z'),
          },
        });
        const r = await service.read(
          query({ from: '2026-11-07', to: '2026-11-07', view: 'matrix' }),
          user('teacher'),
          new Date('2026-11-08T00:00:00Z'),
        );
        expect(r.options.jps).toEqual([9, 10]);
        expect(r.metrics).toMatchObject({ U: 4, due: 4, A: 0 });
      } finally {
        await db.classSession.delete({ where: { id: s.id } });
        await db.schedule.delete({ where: { id: s.scheduleId } });
      }
    });
    it('three parallel recap reads with a three-connection pool do not acquire a second connection inside transactions', async () => {
      const bounded = new PrismaClient({
        datasourceUrl: url + '?connection_limit=3&pool_timeout=2',
      });
      try {
        const p = bounded as PrismaService,
          reader = new AttendanceRecapService(p, new PermissionsService(p));
        const responses = await Promise.all(
          [1, 2, 3].map(() => reader.read(query(), user('teacher'))),
        );
        expect(responses.map((r) => r.metrics.attendancePct)).toEqual([50, 50, 50]);
      } finally {
        await bounded.$disconnect();
      }
    });
    it('keeps archived student history without breaking the entire recap', async () => {
      await db.student.update({ where: { id: aId }, data: { deletedAt: new Date() } });
      try {
        expect(
          (await service.read(query({ view: 'detail', studentId: aId }), user('teacher'))).timeline,
        ).toHaveLength(2);
      } finally {
        await db.student.update({ where: { id: aId }, data: { deletedAt: null } });
      }
    });
    it('cancellation excludes stored decisions without deleting them', async () => {
      await db.classSession.update({
        where: { id: firstSession },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      try {
        expect((await service.read(query(), user('teacher'))).metrics).toMatchObject({
          C: 4,
          recorded: 0,
          due: 0,
          attendancePct: null,
        });
        expect(
          await db.studentSessionAttendance.count({ where: { sessionId: firstSession } }),
        ).toBe(4);
      } finally {
        await db.classSession.update({
          where: { id: firstSession },
          data: { status: 'COMPLETED', cancelledAt: null },
        });
      }
    });
    it('holiday is excluded on official calendar', async () => {
      const h = await db.academicCalendar.create({
        data: {
          academicYearId: yearId,
          name: 'QA holiday',
          type: 'holiday',
          startDate: new Date('2026-11-02'),
          endDate: new Date('2026-11-02'),
        },
      });
      try {
        expect((await service.read(query(), user('teacher'))).metrics.due).toBe(0);
      } finally {
        await db.academicCalendar.delete({ where: { id: h.id } });
      }
    });
    it('matrix date, pagination, missing list and export share the same cohort', async () => {
      const base = { context: 'homeroom' };
      const matrix = await service.read(
        query({ ...base, view: 'matrix', pageSize: 1 }),
        user('teacher'),
      );
      expect(matrix.students).toHaveLength(1);
      expect(matrix.pagination.total).toBe(2);
      expect(matrix.students[0]!.slots).toHaveLength(4);
      const missing = await service.read(query({ ...base, view: 'missing' }), user('teacher'));
      expect(missing.missing).toMatchObject([
        { sessionId: secondSession, students: 1, jps: [3, 4] },
      ]);
      const exp = await service.read(
        query({ ...base, view: 'export', status: 'I' }),
        user('teacher'),
      );
      expect(exp.timeline).toHaveLength(1);
      expect(exp.timeline[0]!.notes).toBe('Izin QA');
      expect(exp.metrics).toEqual(missing.metrics);
    });
    it('audit returns only the selected student changes from an actual stored event', async () => {
      const event = await db.auditLog.create({
        data: {
          actorId: actors.teacher.keycloakId,
          actorUsername: 'QA Guru A',
          actorRoles: ['GURU'],
          action: 'attendance.session.save',
          resourceType: 'class-session',
          resourceId: firstSession,
          method: 'POST',
          path: '/qa',
          statusCode: 200,
          outcome: 'success',
          metadata: {
            changed: [
              { studentId: aId, jp: 1, from: 'izin', to: 'hadir', notesChanged: true },
              { studentId: bId, jp: 1, from: null, to: 'izin', notesChanged: false },
            ],
          },
        },
      });
      const r = await service.read(query({ view: 'audit', studentId: aId }), user('teacher'));
      expect(r.audits).toMatchObject([
        {
          id: event.id,
          actor: 'QA Guru A',
          changes: [{ jp: 1, from: 'izin', to: 'hadir', notesChanged: true }],
        },
      ]);
    });
    it('duplicate co-teaching physical JP counts once; conflicts become U', async () => {
      const s = await session(
        otherTeacherId,
        classId,
        ownAssignment,
        1,
        2,
        'Co-teaching QA',
        'X QA A',
        2,
      );
      try {
        for (const sid of [aId, bId])
          for (const jp of [1, 2])
            await db.studentSessionAttendance.create({
              data: {
                studentId: sid,
                sessionId: s.id,
                jp,
                status: sid === aId ? 'hadir' : jp === 1 ? 'izin' : 'alpha',
                recordedBy: actors.other.id,
              },
            });
        const q = query({ context: 'authorized', classId });
        const same = await service.read(q, user('principal'));
        expect(same.metrics.due).toBe(8);
        await db.studentSessionAttendance.update({
          where: { studentId_sessionId_jp: { studentId: aId, sessionId: s.id, jp: 1 } },
          data: { status: 'alpha' },
        });
        const conflict = await service.read(q, user('principal'));
        expect(conflict.metrics).toMatchObject({ H: 3, U: 3, due: 8 });
      } finally {
        await db.studentSessionAttendance.deleteMany({ where: { sessionId: s.id } });
        await db.classSession.delete({ where: { id: s.id } });
        await db.schedule.delete({ where: { id: s.scheduleId } });
      }
    });
    it('Kaprog reads only current authorized major using actual appointment', async () => {
      const r = await service.read(query({ context: 'authorized' }), user('kaprog'));
      expect(r.metrics).toMatchObject({
        students: 2,
        H: 4,
        I: 1,
        A: 1,
        U: 2,
        attendancePct: 66.67,
      });
      expect(r.options.classes.every((c) => c.majorCode === 'QA')).toBe(true);
    });
    it.each(['detail', 'audit', 'export'] as const)(
      'Kaprog cannot widen %s to a foreign major student',
      async (view) => {
        await expect(
          service.read(
            query({ context: 'authorized', view, studentId: foreignId }),
            user('kaprog'),
          ),
        ).rejects.toThrow('Rincian siswa');
      },
    );
    it('Super Admin reads the same school denominator, not a different calculation', async () => {
      const r = await service.read(query({ context: 'authorized' }), user('admin'));
      expect(r.metrics).toMatchObject({ students: 3, attendancePct: 62.5, coveragePct: 80 });
    });
    it('range JP and range audit bind the same permitted units', async () => {
      const response = await app.inject({
        url: '/attendance/student-sessions/recap?academicYear=2026%2F2027&semester=1&from=2026-11-02&to=2026-11-02&context=homeroom&jpFrom=2&jpTo=3',
        headers: { authorization: 'Bearer ' + token('teacher') },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().jps.map((j: { jp: number }) => j.jp)).toEqual([2, 3]);
      expect(response.json().metrics).toMatchObject({
        H: 2,
        A: 1,
        U: 1,
        due: 4,
        attendancePct: 66.67,
        coveragePct: 75,
      });
      expect(response.json().filters).toMatchObject({ jpFrom: 2, jpTo: 3, jp: null });
    });
    it('real Nest/Fastify/JWT accepts numeric strings through the actual controller', async () => {
      const response = await app.inject({
        url: '/attendance/student-sessions/recap?academicYear=2026%2F2027&semester=1&from=2026-11-02&to=2026-11-02&jp=1',
        headers: { authorization: 'Bearer ' + token('teacher') },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().metrics).toMatchObject({ recorded: 2, H: 1, I: 1 });
      if (process.env.JP_RECAP_PRODUCER_EVIDENCE)
        writeFileSync(
          process.env.JP_RECAP_PRODUCER_EVIDENCE,
          JSON.stringify(response.json(), null, 2),
        );
    });
    it.each([
      'semester=3',
      'semester=nope',
      'studentId=bad&view=detail',
      'jp=0',
      'jpFrom=1',
      'jpFrom=3&jpTo=1',
      'jp=1&jpFrom=1&jpTo=2',
      'admin=true',
    ])('real HTTP rejects invalid %s', async (value) => {
      const response = await app.inject({
        url: '/attendance/student-sessions/recap?' + value,
        headers: { authorization: 'Bearer ' + token('teacher') },
      });
      expect(response.statusCode).toBe(400);
    });
    it.each(['student', 'parent', 'tu'] as const)(
      'real guards deny ungranted role %s',
      async (who) => {
        const r = await app.inject({
          url: '/attendance/student-sessions/recap',
          headers: { authorization: 'Bearer ' + token(who) },
        });
        expect(r.statusCode).toBe(403);
      },
    );
    it('expired and unauthenticated requests cannot read', async () => {
      expect((await app.inject({ url: '/attendance/student-sessions/recap' })).statusCode).toBe(
        401,
      );
      expect(
        (
          await app.inject({
            url: '/attendance/student-sessions/recap',
            headers: { authorization: 'Bearer ' + token('teacher', -60) },
          })
        ).statusCode,
      ).toBe(401);
    });
    it.each(['principal', 'waka'] as const)(
      'real HTTP position reader %s reaches whole-school scope',
      async (who) => {
        const r = await app.inject({
          url: '/attendance/student-sessions/recap?context=authorized&academicYear=2026%2F2027&semester=1&from=2026-11-02&to=2026-11-02',
          headers: { authorization: 'Bearer ' + token(who) },
        });
        expect(r.statusCode).toBe(200);
        expect(r.json().metrics).toMatchObject({ students: 3, attendancePct: 62.5 });
      },
    );
  },
);
