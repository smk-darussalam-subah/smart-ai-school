import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { HttpException } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { LmsService } from '../lms/lms.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { PermissionsService } from '../permissions/permissions.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CreateLmsModuleSchema, UpdateLmsModuleSchema } from '../lms/dto/lms.dto';

const url = process.env.LMS_LIFECYCLE_DATABASE_URL;
if (url && url !== 'postgresql://diis_local:diis_local@127.0.0.1:55446/diis_lms_r01_r05') {
  throw Error('Only the exact disposable LMS database is allowed');
}
const proof = url ? describe : describe.skip;
proof('LMS context and lifecycle against PostgreSQL with production migrations', () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const db = prisma as PrismaService;
  const period = new AcademicPeriodService(db, new PermissionsService(db));
  const service = new LmsService(db, period);
  let teacherId: string, otherTeacherId: string, classId: string, otherClassId: string;
  let studentId: string, studentUserId: string, ownRpp: string, foreignRpp: string;
  let guru: AuthUser,
    reviewer: AuthUser,
    pupil: AuthUser,
    otherPupil: AuthUser,
    noClassPupil: AuthUser;
  const admin: AuthUser = {
    keycloakId: 'synthetic-admin',
    username: 'synthetic',
    roles: ['SUPER_ADMIN'],
  } as AuthUser;
  const actor = (keycloakId: string, roles: AuthUser['roles']): AuthUser => ({
    keycloakId,
    username: 'synthetic',
    fullName: 'Synthetic',
    email: 'synthetic@example.invalid',
    roles,
  });
  let counter = 0;
  const runId = randomUUID().slice(0, 8);
  async function person(role: 'GURU' | 'SISWA') {
    return prisma.user.create({
      data: {
        role,
        keycloakId: randomUUID(),
        email: `lms-${randomUUID()}-${++counter}@example.invalid`,
        fullName: `Synthetic ${role}`,
        isActive: true,
      },
    });
  }
  const base = () =>
    CreateLmsModuleSchema.parse({
      teacherId,
      classId,
      subject: 'Synthetic Math',
      title: 'Synthetic module',
      content: 'Synthetic material',
      academicYear: '2026/2027',
      semester: 1,
      publish: true,
    });
  const module = (title = 'Synthetic module') => service.create({ ...base(), title }, guru);
  beforeAll(async () => {
    const year = await prisma.academicYear.upsert({
      where: { code: '2026/2027' },
      update: {},
      create: {
        code: '2026/2027',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2027-06-30'),
      },
    });
    for (const number of [1, 2])
      await prisma.semester.upsert({
        where: { academicYearId_number: { academicYearId: year.id, number } },
        update: {},
        create: {
          academicYearId: year.id,
          number,
          startDate: new Date(number === 1 ? '2026-07-01' : '2027-01-01'),
          endDate: new Date(number === 1 ? '2026-12-31' : '2027-06-30'),
        },
      });
    const a = await person('GURU'),
      b = await person('GURU');
    teacherId = (await prisma.teacher.create({ data: { userId: a.id } })).id;
    otherTeacherId = (await prisma.teacher.create({ data: { userId: b.id } })).id;
    guru = actor(a.keycloakId, ['GURU']);
    reviewer = actor(a.keycloakId, ['GURU', 'KEPALA_SEKOLAH']);
    classId = (
      await prisma.class.create({
        data: {
          name: `X LMS SYN A ${runId}`,
          grade: 10,
          majorCode: 'SYN',
          academicYear: '2026/2027',
        },
      })
    ).id;
    otherClassId = (
      await prisma.class.create({
        data: {
          name: `X LMS SYN B ${runId}`,
          grade: 10,
          majorCode: 'SYN',
          academicYear: '2026/2027',
        },
      })
    ).id;
    for (const [tid, cid] of [
      [teacherId, classId],
      [otherTeacherId, otherClassId],
    ]) {
      await prisma.teachingAssignment.create({
        data: {
          teacherId: tid!,
          classId: cid!,
          subject: 'Synthetic Math',
          academicYear: '2026/2027',
        },
      });
    }
    for (const [cid, label] of [
      [classId, 'A'],
      [otherClassId, 'B'],
      [null, 'NONE'],
    ] as const) {
      const u = await person('SISWA');
      const row = await prisma.student.create({
        data: {
          userId: u.id,
          nis: `LMS-${runId}-${label}`,
          classId: cid,
          joinedAt: new Date('2026-07-01'),
        },
      });
      if (label === 'A') {
        studentId = row.id;
        studentUserId = u.id;
        pupil = actor(u.keycloakId, ['SISWA']);
      } else if (label === 'B') otherPupil = actor(u.keycloakId, ['SISWA']);
      else noClassPupil = actor(u.keycloakId, ['SISWA']);
    }
    ownRpp = (
      await prisma.rpp.create({
        data: {
          teacherId,
          classId,
          subject: 'Synthetic Math',
          title: 'Own draft source',
          academicYear: '2026/2027',
          semester: 1,
        },
      })
    ).id;
    foreignRpp = (
      await prisma.rpp.create({
        data: {
          teacherId: otherTeacherId,
          classId: otherClassId,
          subject: 'Synthetic Math',
          title: 'Foreign source',
          academicYear: '2026/2027',
          semester: 1,
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    // A failed negative assertion must not contaminate the next race scenario.
    await prisma.student.update({ where: { id: studentId }, data: { classId, deletedAt: null } });
  });

  // Barrier at transaction entry reproduces the original reviewer interleavings.
  function delayed() {
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const arrived = new Promise<void>((r) => {
      reached = r;
    });
    const client = new Proxy(prisma, {
      get(target, key) {
        if (key === '$transaction')
          return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
            reached();
            await gate;
            return target.$transaction(callback);
          };
        const value: unknown = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return { service: new LmsService(client as PrismaService, period), arrived, release };
  }
  async function denied(promise: Promise<unknown>, status: number) {
    await expect(promise).rejects.toMatchObject({ status });
  }
  async function row(id: string) {
    return prisma.lmsModule.findUniqueOrThrow({ where: { id } });
  }
  const progressRow = (moduleId: string) =>
    prisma.lmsModuleProgress.findUniqueOrThrow({
      where: { moduleId_studentId: { moduleId, studentId } },
    });

  it.each(['draft', 'published'])(
    'R01 null broadening rejected for %s with no mutation',
    async (status) => {
      const m = await service.create({ ...base(), publish: status === 'published' }, guru);
      await denied(
        service.update(
          m.id,
          UpdateLmsModuleSchema.parse({ classId: null, title: 'Uncommitted title' }),
          guru,
        ),
        403,
      );
      expect(await row(m.id)).toMatchObject({ classId, title: m.title, status });
      await denied(service.findOne(m.id, otherPupil), 403);
      await denied(service.findOne(m.id, noClassPupil), 403);
    },
  );
  it('R01 unpublish then null then republish cannot broaden audience', async () => {
    const m = await module();
    await service.setStatus(m.id, 'draft', guru);
    await denied(service.update(m.id, { classId: null }, guru), 403);
    await service.setStatus(m.id, 'published', guru);
    expect((await row(m.id)).classId).toBe(classId);
  });
  it.each([false, true])('R01 foreign RPP denied for own teacher, reviewer=%s', async (review) => {
    const m = await module();
    await denied(service.update(m.id, { rppId: foreignRpp }, review ? reviewer : guru), 403);
    expect((await row(m.id)).rppId).toBeNull();
    await denied(service.create({ ...base(), rppId: foreignRpp }, review ? reviewer : guru), 403);
  });
  it('R01 own draft RPP remains supported; context mismatch rejected; detach explicit', async () => {
    const m = await service.create({ ...base(), rppId: ownRpp }, guru);
    await service.update(m.id, { title: 'Edited published content' }, guru);
    await denied(service.update(m.id, { semester: 2 }, guru), 403);
    await denied(service.update(m.id, { classId: otherClassId }, guru), 403);
    await service.update(m.id, { rppId: null, semester: 2 }, guru);
    expect(await row(m.id)).toMatchObject({
      rppId: null,
      semester: 2,
      title: 'Edited published content',
    });
  });
  it('R01 revoked assignment fails even a title edit', async () => {
    const assignment = await prisma.teachingAssignment.create({
      data: { teacherId, classId, subject: 'Temporary SYN', academicYear: '2026/2027' },
    });
    const m = await service.create({ ...base(), subject: 'Temporary SYN' }, guru);
    await prisma.teachingAssignment.delete({ where: { id: assignment.id } });
    await denied(service.update(m.id, { title: 'Not authorized' }, guru), 403);
    await service.setStatus(m.id, 'draft', guru);
    await denied(service.setStatus(m.id, 'published', guru), 403);
    expect((await row(m.id)).title).toBe(m.title);
  });
  it('R01 valid assigned retarget succeeds; concrete foreign class still denied', async () => {
    const m = await module();
    await denied(service.update(m.id, { classId: otherClassId }, guru), 403);
    const assignment = await prisma.teachingAssignment.create({
      data: {
        teacherId,
        classId: otherClassId,
        subject: 'Synthetic Math',
        academicYear: '2026/2027',
      },
    });
    await service.update(m.id, { classId: otherClassId }, guru);
    expect((await row(m.id)).classId).toBe(otherClassId);
    await prisma.lmsModule.delete({ where: { id: m.id } });
    await prisma.teachingAssignment.delete({ where: { id: assignment.id } });
  });
  it('R01 general modules keep content edits, learner visibility and progress', async () => {
    const m = await service.create({ ...base(), classId: null }, reviewer);
    await service.update(m.id, { title: 'General material retained', classId: null }, guru);
    await service.findOne(m.id, otherPupil);
    await service.findOne(m.id, noClassPupil);
    await service.updateProgress(m.id, { progress: 40 }, noClassPupil);
    await denied(service.update(m.id, { subject: 'New general audience context' }, guru), 403);
    const learning = await service.findMyLearning(noClassPupil);
    expect(learning.data.find((x) => x.id === m.id)?.myProgress?.progress).toBe(40);
  });
  it('R01 historical own classless RPP still creates a general draft', async () => {
    const rpp = await prisma.rpp.create({
      data: {
        teacherId,
        classId: null,
        subject: 'Historical SYN',
        title: 'Historical general RPP',
        academicYear: '2026/2027',
        semester: 1,
      },
    });
    const m = await service.create({ ...base(), rppId: rpp.id, publish: false }, guru);
    expect(m).toMatchObject({
      rppId: rpp.id,
      classId: null,
      subject: rpp.subject,
      status: 'draft',
    });
    await service.update(m.id, { rppId: null, title: 'Detached general source' }, guru);
    expect(await row(m.id)).toMatchObject({ rppId: null, classId: null, subject: rpp.subject });
  });
  it('R01 stale classless editor cannot reverse a newer concrete audience', async () => {
    const m = await service.create({ ...base(), classId: null }, reviewer),
      d = delayed();
    const pending = d.service.update(m.id, { classId: null }, guru).then(
      () => null,
      (e: unknown) => e,
    );
    await d.arrived;
    await service.update(m.id, { classId }, guru);
    d.release();
    expect(await pending).toMatchObject({ status: 403 });
    expect((await row(m.id)).classId).toBe(classId);
  });
  it.each([true, false])(
    'R02 concurrent first insert and stale progress, completion first=%s',
    async (completionFirst) => {
      const m = await module(),
        d = delayed();
      const pending = d.service.updateProgress(
        m.id,
        { progress: completionFirst ? 20 : 100 },
        pupil,
      );
      await d.arrived;
      const first = await service.updateProgress(
        m.id,
        { progress: completionFirst ? 100 : 20 },
        pupil,
      );
      d.release();
      const last = await pending;
      const final = await progressRow(m.id);
      expect(final).toMatchObject({ progress: 100, status: 'completed' });
      expect(final.completedAt).not.toBeNull();
      if (completionFirst) expect(final.completedAt).toEqual(first.completedAt);
      expect(last.completedAt).toEqual(final.completedAt);
      expect(await prisma.lmsModuleProgress.count({ where: { moduleId: m.id } })).toBe(1);
    },
  );
  it('R02 parallel values, replay and explicit completed remain monotonic', async () => {
    const m = await module();
    await Promise.all(
      [20, 80, 100, 40, 0].map((progress) => service.updateProgress(m.id, { progress }, pupil)),
    );
    const before = await progressRow(m.id);
    for (const progress of [20, 0, 100]) await service.updateProgress(m.id, { progress }, pupil);
    expect(await progressRow(m.id)).toMatchObject({
      progress: before.progress,
      status: before.status,
      startedAt: before.startedAt,
      completedAt: before.completedAt,
    });
    const second = await module();
    const completed = await service.updateProgress(
      second.id,
      { progress: 80, status: 'completed' },
      pupil,
    );
    const stale = await service.updateProgress(second.id, { progress: 20 }, pupil);
    expect(stale).toMatchObject({
      progress: 80,
      status: 'completed',
      completedAt: completed.completedAt,
    });
  });
  it.each(['unpublish', 'archive', 'class', 'student-archive'])(
    'R02 queued progress checks fresh access after %s',
    async (change) => {
      const m = await module(),
        d = delayed();
      const pending = d.service.updateProgress(m.id, { progress: 50 }, pupil).then(
        () => null,
        (e: unknown) => e,
      );
      await d.arrived;
      if (change === 'unpublish' || change === 'archive')
        await service.setStatus(m.id, change === 'archive' ? 'archived' : 'draft', guru);
      else
        await prisma.student.update({
          where: { id: studentId },
          data: change === 'class' ? { classId: otherClassId } : { deletedAt: new Date() },
        });
      d.release();
      expect(await pending).toMatchObject({ status: change === 'student-archive' ? 404 : 403 });
      expect(await prisma.lmsModuleProgress.count({ where: { moduleId: m.id } })).toBe(0);
      await prisma.student.update({
        where: { userId: studentUserId },
        data: { classId, deletedAt: null },
      });
    },
  );
  it.each([false, true])(
    'R03 archive wins over queued delete, admin=%s, history remains',
    async (isAdmin) => {
      const m = await module(),
        d = delayed();
      await service.updateProgress(m.id, { progress: 45 }, pupil);
      const pending = d.service.remove(m.id, isAdmin ? admin : guru).then(
        () => null,
        (e: unknown) => e,
      );
      await d.arrived;
      await service.setStatus(m.id, 'archived', guru);
      d.release();
      expect(await pending).toMatchObject({ status: 409 });
      expect((await row(m.id)).status).toBe('archived');
      expect((await progressRow(m.id)).progress).toBe(45);
      await denied(service.update(m.id, { title: 'Terminal edit' }, guru), 409);
      await denied(service.setStatus(m.id, 'published', guru), 409);
      expect((await service.setStatus(m.id, 'archived', guru)).status).toBe('archived');
    },
  );
  it.each([false, true])(
    'R03 delete wins, delayed archive is honestly missing, admin=%s',
    async (isAdmin) => {
      const m = await module(),
        d = delayed();
      const pending = d.service.setStatus(m.id, 'archived', guru).then(
        () => null,
        (e: unknown) => e,
      );
      await d.arrived;
      await service.remove(m.id, isAdmin ? admin : guru);
      d.release();
      const result = await pending;
      expect(result).toBeInstanceOf(HttpException);
      if (!(result instanceof HttpException)) throw Error('Expected a business conflict/not-found');
      expect([404, 409]).toContain(result.getStatus());
      expect(await prisma.lmsModule.findUnique({ where: { id: m.id } })).toBeNull();
    },
  );
  it('negative controls: ownership, teacher profile, student and database context guard remain', async () => {
    const m = await module();
    await denied(
      service.update(m.id, { title: 'Foreign edit' }, { ...guru, keycloakId: randomUUID() }),
      404,
    );
    await denied(service.findOne(m.id, otherPupil), 403);
    await denied(service.updateProgress(m.id, { progress: 20 }, otherPupil), 403);
    await expect(
      prisma.lmsModule.update({ where: { id: m.id }, data: { classId: otherClassId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect((await row(m.id)).classId).toBe(classId);
  });

  it('closed academic period rejects every mutation without partial writes', async () => {
    const m = await module();
    const semester = await prisma.semester.findFirstOrThrow({
      where: { number: 1, academicYear: { code: '2026/2027' } },
    });
    const teacher = await prisma.teacher.findUniqueOrThrow({ where: { id: teacherId } });
    const closure = await prisma.semesterClosure.create({
      data: {
        academicYearId: semester.academicYearId,
        semesterId: semester.id,
        closedByUserId: teacher.userId,
        readinessVersion: 'synthetic-lms-proof',
        readinessHash: 'synthetic',
        idempotencyKey: randomUUID(),
        snapshot: {},
      },
    });
    try {
      await denied(service.create(base(), guru), 409);
      await denied(service.update(m.id, { title: 'Closed edit' }, guru), 409);
      await denied(service.setStatus(m.id, 'archived', guru), 409);
      await denied(service.remove(m.id, admin), 409);
      await denied(service.updateProgress(m.id, { progress: 100 }, pupil), 409);
      expect(await row(m.id)).toMatchObject({ title: m.title, status: 'published' });
      expect(await prisma.lmsModuleProgress.count({ where: { moduleId: m.id } })).toBe(0);
    } finally {
      await prisma.semesterClosure.delete({ where: { id: closure.id } });
    }
  });
});
