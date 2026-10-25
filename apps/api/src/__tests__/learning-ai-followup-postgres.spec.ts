import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../permissions/permissions.guard';
import { ClassSessionController } from '../class-sessions/class-session.controller';
import { ClassSessionService } from '../class-sessions/class-session.service';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { StudentSessionAttendanceService } from '../attendance/student-session-attendance.service';
import { StudentSessionAttendanceReadService } from '../attendance/student-session-attendance-read.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { NotificationService } from '../notification/notification.service';
import { AiGenerateService } from '../ai/ai-generate.service';
import { AiProviderStatusService } from '../ai/ai-provider-status.service';
import { QuestionBankService } from '../question-bank/question-bank.service';

const url = process.env.STUDENT_JP_DATABASE_URL;
if (
  url &&
  url !== 'postgresql://diis_local:diis_local@127.0.0.1:55445/diis_learning_ai_remediation'
)
  throw Error('Exact disposable loopback database only');
const proof = url ? describe : describe.skip;
proof('R01–R05 follow-up: production services on disposable PostgreSQL', () => {
  const prisma = new PrismaClient({ datasourceUrl: url }),
    db = prisma as PrismaService;
  const permissions = new PermissionsService(db),
    period = new AcademicPeriodService(db, permissions);
  const sessions = new ClassSessionService(db, {} as BellScheduleService, permissions, period);
  const reader = new StudentSessionAttendanceReadService(db, permissions);
  const saver = new StudentSessionAttendanceService(db, permissions, period, {
    enqueueCommittedPendingLogs: async () => ({ queuedCount: 0 }),
  } as unknown as NotificationService);
  const gateway = {
    generate: jest.fn(async () => {
      throw Error('No provider calls allowed');
    }),
  };
  const ai = () => new AiGenerateService(db, gateway as never, null, {} as AiProviderStatusService);
  const bank = new QuestionBankService(db),
    now = new Date('2026-10-22T03:00:00Z');
  const auth = (keycloakId: string): AuthUser => ({
    keycloakId,
    roles: ['GURU'],
    username: 'synthetic',
    email: 'synthetic@example.invalid',
    fullName: 'Synthetic',
  });
  let session: Awaited<ReturnType<typeof prisma.classSession.findFirstOrThrow>>,
    teacher: AuthUser,
    studentIds: string[],
    seq = 0;
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
    jest.setSystemTime(now);
    // Original suite seeds the same production schema first; no application fixture is invented here.
    session = await prisma.classSession.findFirstOrThrow({
      where: { classNameSnapshot: 'X SYN' },
      orderBy: { scheduledStartAt: 'asc' },
    });
    const profile = await prisma.teacher.findUniqueOrThrow({
      where: { id: session.assignedTeacherId },
      include: { user: true },
    });
    teacher = auth(profile.user.keycloakId);
    studentIds = (
      await prisma.student.findMany({
        where: { classId: session.classId },
        orderBy: { nis: 'asc' },
      })
    ).map((s) => s.id);
    expect(studentIds).toHaveLength(2);
  });
  beforeEach(async () => {
    gateway.generate.mockClear();
    await prisma.classSession.update({
      where: { id: session.id },
      data: {
        status: 'STARTED',
        startedAt: session.scheduledStartAt,
        assignedTeacherId: session.assignedTeacherId,
        supersededAt: null,
      },
    });
    await prisma.student.updateMany({
      where: { id: { in: studentIds } },
      data: { deletedAt: null, status: 'active', classId: session.classId },
    });
    await prisma.studentSessionAttendance.deleteMany({ where: { sessionId: session.id } });
  });
  afterAll(async () => {
    jest.useRealTimers();
    await prisma.$disconnect();
  });
  async function seedAttendance() {
    const roster = await saver.roster({ sessionId: session.id }, teacher);
    await saver.save(
      session.id,
      {
        records: roster.students.flatMap((s) =>
          roster.slots.map((slot) => ({
            studentId: s.id,
            jp: slot.jp,
            status: 'hadir' as const,
            notes: 'Synthetic',
            revision: 0,
          })),
        ),
      },
      teacher,
    );
  }
  it.each(['archived', 'inactive', 'moved'] as const)(
    'R01: %s student with records remains in the exact-session historical recap',
    async (change) => {
      await seedAttendance();
      await prisma.student.update({
        where: { id: studentIds[0] },
        data:
          change === 'archived'
            ? { deletedAt: now }
            : change === 'inactive'
              ? { status: 'inactive' }
              : { classId: null },
      });
      const result = await reader.read(session.id, { scope: 'own' }, teacher);
      expect(result.students).toHaveLength(2);
      expect(result.records).toHaveLength(4);
      expect(result.records.every((record) => record.status === 'hadir')).toBe(true);
      expect(
        await prisma.studentSessionAttendance.count({ where: { sessionId: session.id } }),
      ).toBe(4);
    },
  );
  it.each(['archived', 'inactive', 'moved'] as const)(
    'R01: %s student without records does not create expected unknown JP',
    async (change) => {
      await prisma.student.update({
        where: { id: studentIds[0] },
        data:
          change === 'archived'
            ? { deletedAt: now }
            : change === 'inactive'
              ? { status: 'inactive' }
              : { classId: null },
      });
      const result = await reader.read(session.id, { scope: 'own' }, teacher);
      expect(result.students.map((s) => s.id)).toEqual([studentIds[1]]);
      expect(result.records).toEqual([]);
      expect(result.slots.map((slot) => slot.jp)).toEqual([1, 2]);
    },
  );
  it('R01: an archived record from a different session cannot add a student to this recap', async () => {
    const other = await prisma.classSession.findFirstOrThrow({
      where: { classId: session.classId, id: { not: session.id } },
    });
    await prisma.student.update({ where: { id: studentIds[0] }, data: { deletedAt: now } });
    await prisma.studentSessionAttendance.create({
      data: {
        studentId: studentIds[0]!,
        sessionId: other.id,
        jp: 3,
        status: 'izin',
        revision: 1,
        recordedBy: (
          await prisma.user.findUniqueOrThrow({ where: { keycloakId: teacher.keycloakId } })
        ).id,
      },
    });
    const result = await reader.read(session.id, { scope: 'own' }, teacher);
    expect(result.students.map((s) => s.id)).toEqual([studentIds[1]]);
  });
  it('R02: one connection serves a list control and exact-session recap', async () => {
    const client = new PrismaClient({ datasourceUrl: url + '?connection_limit=1&pool_timeout=1' }),
      q = client as PrismaService;
    try {
      const p = new PermissionsService(q),
        a = new AcademicPeriodService(q, p),
        list = new ClassSessionService(q, {} as BellScheduleService, p, a);
      expect(
        (await list.list({ id: session.id, scope: 'own', page: 1, limit: 1 }, teacher)).data,
      ).toHaveLength(1);
      expect(
        (
          await new StudentSessionAttendanceReadService(q, p).read(
            session.id,
            { scope: 'own' },
            teacher,
          )
        ).students,
      ).toHaveLength(2);
    } finally {
      await client.$disconnect();
    }
  });
  it('R02: three occupied transaction connections complete without requesting a fourth', async () => {
    const client = new PrismaClient({ datasourceUrl: url + '?connection_limit=3&pool_timeout=1' });
    try {
      const q = client as PrismaService,
        p = new PermissionsService(q),
        list = new ClassSessionService(
          q,
          {} as BellScheduleService,
          p,
          new AcademicPeriodService(q, p),
        );
      const controls = await Promise.all(
        Array.from({ length: 3 }, () =>
          list.list({ id: session.id, scope: 'own', page: 1, limit: 1 }, teacher),
        ),
      );
      expect(controls.every((r) => r.data.length === 1)).toBe(true);
      let entered = 0,
        release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const bridge = new Proxy(client, {
        get(target, key) {
          if (key === '$transaction')
            return (callback: (tx: unknown) => Promise<unknown>, options: unknown) =>
              target.$transaction(async (tx) => {
                entered++;
                if (entered === 3) release();
                await barrier;
                return callback(tx);
              }, options as never);
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as PrismaService;
      const read = new StudentSessionAttendanceReadService(bridge, new PermissionsService(bridge));
      const results = await Promise.all(
        Array.from({ length: 3 }, () => read.read(session.id, { scope: 'own' }, teacher)),
      );
      expect(entered).toBe(3);
      expect(results.every((r) => r.students.length === 2)).toBe(true);
    } finally {
      await client.$disconnect();
    }
  });
  async function leader(code: 'WAKA_KURIKULUM' | 'KEPALA_SEKOLAH' | 'KAPROG') {
    const n = ++seq,
      user = await prisma.user.create({
        data: {
          keycloakId: `94000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
          email: `followup-${n}@example.invalid`,
          fullName: 'Synthetic leader',
          role: 'GURU',
          staff: { create: { employmentStatus: 'GTY' } },
        },
        include: { staff: true },
      });
    const profile = await prisma.teacher.create({ data: { userId: user.id } });
    const major =
      code === 'KAPROG'
        ? await prisma.major.upsert({
            where: { code: 'SYN' },
            create: { code: 'SYN', name: 'Synthetic major' },
            update: {},
          })
        : null;
    const position = await prisma.position.findUniqueOrThrow({ where: { code } });
    const appointment = await prisma.appointment.create({
      data: {
        staffId: user.staff!.id,
        positionId: position.id,
        academicYearId: session.academicYearId,
        majorId: major?.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-07-01'),
      },
    });
    return {
      user: auth(user.keycloakId),
      profile,
      appointment,
      dispose: async () => {
        await prisma.appointment.delete({ where: { id: appointment.id } });
        await prisma.teacher.delete({ where: { id: profile.id } });
        await prisma.staff.delete({ where: { id: user.staff!.id } });
        await prisma.user.delete({ where: { id: user.id } });
      },
    };
  }
  it.each(['WAKA_KURIKULUM', 'KEPALA_SEKOLAH'] as const)(
    'R03: fresh %s operations reads foreign sessions, own does not',
    async (code) => {
      const actor = await leader(code);
      try {
        const request = { user: actor.user },
          context = {
            getHandler: () => ClassSessionController.prototype.list,
            getClass: () => ClassSessionController,
            switchToHttp: () => ({ getRequest: () => request }),
          } as unknown as ExecutionContext;
        await new RolesGuard(new Reflector(), permissions).canActivate(context);
        await new PermissionGuard(new Reflector(), permissions).canActivate(context);
        expect(request.user.roles).toContain(code);
        const controller = new ClassSessionController(sessions, {} as never);
        expect(
          (await controller.list({ id: session.id, page: '1', limit: '1' }, request.user)).data,
        ).toHaveLength(1);
        expect((await reader.read(session.id, {}, request.user)).students).toHaveLength(2);
        expect(
          (await sessions.list({ id: session.id, scope: 'own', page: 1, limit: 1 }, request.user))
            .data,
        ).toHaveLength(0);
        await expect(reader.read(session.id, { scope: 'own' }, request.user)).rejects.toMatchObject(
          { status: 403 },
        );
        await prisma.appointment.update({
          where: { id: actor.appointment.id },
          data: { status: 'ENDED', effectiveUntil: new Date('2026-10-21') },
        });
        expect(
          (await sessions.list({ id: session.id, page: 1, limit: 1 }, request.user)).data,
        ).toHaveLength(0);
        await expect(reader.read(session.id, {}, request.user)).rejects.toMatchObject({
          status: 403,
        });
      } finally {
        await actor.dispose();
      }
    },
  );
  it('R03: Kaprog remains major-scoped and revocation/foreign question access fail closed', async () => {
    const actor = await leader('KAPROG');
    try {
      expect((await reader.read(session.id, {}, actor.user)).students).toHaveLength(2);
      await prisma.class.update({ where: { id: session.classId }, data: { majorCode: 'OTHER' } });
      await expect(reader.read(session.id, {}, actor.user)).rejects.toMatchObject({ status: 403 });
      await prisma.class.update({ where: { id: session.classId }, data: { majorCode: 'SYN' } });
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: 'academic.class-session.read' },
      });
      const override = await prisma.userPermissionOverride.create({
        data: {
          userId: (
            await prisma.user.findUniqueOrThrow({ where: { keycloakId: actor.user.keycloakId } })
          ).id,
          permissionId: permission.id,
          grant: false,
        },
      });
      try {
        await expect(reader.read(session.id, {}, actor.user)).rejects.toMatchObject({
          status: 403,
        });
      } finally {
        await prisma.userPermissionOverride.delete({ where: { id: override.id } });
      }
    } finally {
      await prisma.class.update({ where: { id: session.classId }, data: { majorCode: 'SYN' } });
      await actor.dispose();
    }
  });
  async function generation() {
    const module = await prisma.lmsModule.create({
      data: {
        teacherId: session.assignedTeacherId,
        classId: session.classId,
        subject: session.subjectSnapshot,
        title: 'Synthetic followup module',
        tp: 'Memahami bilangan.',
        content: 'Bilangan negatif kurang dari nol.',
        academicYear: '2026/2027',
        semester: 1,
      },
    });
    const items = [1, 2, 3].map((n) => ({
      itemKey: `followup-item-${n}`,
      question: {
        type: 'true_false' as const,
        subject: session.subjectSnapshot,
        body: `Kontrol bilangan sintetis nomor ${n}.`,
        answer: true,
        difficulty: 'easy' as const,
        tags: [],
      },
      tpRefs: ['TP 1'],
      cognitiveLevel: 'C2' as const,
      rationale: 'Kontrol sintetis',
      warnings: [],
    }));
    const row = await prisma.aiGeneration.create({
      data: {
        teacherId: session.assignedTeacherId,
        type: 'question-drafts',
        prompt: 'Synthetic only',
        output: JSON.stringify({ items }),
        model: 'synthetic',
        sourceType: 'module',
        sourceId: module.id,
        status: 'drafted',
        contextSnapshot: {},
        requestSpec: {},
      },
    });
    return {
      row,
      items,
      dto: (indices: number[], key = 'followup-accept-0001') => ({
        idempotencyKey: key,
        items: indices.map((index) => {
          const { itemKey, question, tpRefs, cognitiveLevel } = items[index]!;
          return { itemKey, question, tpRefs, cognitiveLevel };
        }),
      }),
      dispose: async () => {
        await prisma.question.deleteMany({ where: { aiGenerationId: row.id } });
        await prisma.aiDraftAcceptance.deleteMany({ where: { aiGenerationId: row.id } });
        await prisma.aiGeneration.delete({ where: { id: row.id } });
        await prisma.lmsModule.delete({ where: { id: module.id } });
      },
    };
  }
  it('R04: replay/lost ACK keeps the same IDs and never publishes an assessment', async () => {
    const fixture = await generation(),
      service = ai(),
      assessmentCount = await prisma.assessmentSession.count();
    try {
      const first = await service.acceptQuestionDrafts(fixture.row.id, fixture.dto([0]), teacher);
      const replay = await service.acceptQuestionDrafts(fixture.row.id, fixture.dto([0]), teacher);
      expect(replay.questions[0]!.id).toBe(first.questions[0]!.id);
      expect(await prisma.question.count({ where: { aiGenerationId: fixture.row.id } })).toBe(1);
      expect(await prisma.assessmentSession.count()).toBe(assessmentCount);
      expect(gateway.generate).not.toHaveBeenCalled();
    } finally {
      await fixture.dispose();
    }
  });
  it('R04: same-key and new-key replay after hard deletion cannot resurrect an item', async () => {
    const fixture = await generation(),
      service = ai();
    try {
      const first = await service.acceptQuestionDrafts(fixture.row.id, fixture.dto([0]), teacher);
      await bank.remove(first.questions[0]!.id, teacher);
      for (const key of ['followup-accept-0001', 'followup-other-key-0002'])
        await expect(
          service.acceptQuestionDrafts(fixture.row.id, fixture.dto([0], key), teacher),
        ).rejects.toMatchObject({ status: 409, response: { error: 'AI_ACCEPTED_ITEM_CHANGED' } });
      expect(await prisma.question.count({ where: { aiGenerationId: fixture.row.id } })).toBe(0);
      await expect(
        service.regenerateQuestionDraftItem(fixture.row.id, fixture.items[0]!.itemKey, {}, teacher),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        service.rejectQuestionDrafts(
          fixture.row.id,
          { idempotencyKey: 'followup-reject-0001' },
          teacher,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(gateway.generate).not.toHaveBeenCalled();
    } finally {
      await fixture.dispose();
    }
  });
  it('R04: an operator edit survives replay; no stale overwrite', async () => {
    const fixture = await generation(),
      service = ai();
    try {
      const first = await service.acceptQuestionDrafts(fixture.row.id, fixture.dto([0]), teacher);
      await bank.update(
        first.questions[0]!.id,
        { ...fixture.items[0]!.question, body: 'Pertanyaan telah diperbaiki oleh guru.' },
        teacher,
      );
      await expect(
        service.acceptQuestionDrafts(fixture.row.id, fixture.dto([0]), teacher),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await prisma.question.findUniqueOrThrow({ where: { id: first.questions[0]!.id } })).body,
      ).toBe('Pertanyaan telah diperbaiki oleh guru.');
    } finally {
      await fixture.dispose();
    }
  });
  it('R04: partial accept works, but a subset containing a deleted accepted item rolls back atomically', async () => {
    const fixture = await generation(),
      service = ai();
    try {
      const a = await service.acceptQuestionDrafts(fixture.row.id, fixture.dto([0]), teacher);
      await bank.remove(a.questions[0]!.id, teacher);
      const b = await service.acceptQuestionDrafts(
        fixture.row.id,
        fixture.dto([1], 'followup-subset-0002'),
        teacher,
      );
      expect(b.acceptedCount).toBe(1);
      await expect(
        service.acceptQuestionDrafts(
          fixture.row.id,
          fixture.dto([2, 0], 'followup-subset-0003'),
          teacher,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await prisma.question.findMany({ where: { aiGenerationId: fixture.row.id } })).map(
          (q) => q.aiItemKey,
        ),
      ).toEqual([fixture.items[1]!.itemKey]);
      expect(
        await prisma.aiDraftAcceptance.count({
          where: { aiGenerationId: fixture.row.id, idempotencyKey: 'followup-subset-0003' },
        }),
      ).toBe(0);
      await service.acceptQuestionDrafts(
        fixture.row.id,
        fixture.dto([2], 'followup-subset-0004'),
        teacher,
      );
      expect(
        (await prisma.aiGeneration.findUniqueOrThrow({ where: { id: fixture.row.id } })).status,
      ).toBe('accepted');
    } finally {
      await fixture.dispose();
    }
  });
  it('R04: two service instances cannot create duplicate canonical questions', async () => {
    const fixture = await generation();
    try {
      const results = await Promise.all([
        ai().acceptQuestionDrafts(fixture.row.id, fixture.dto([0]), teacher),
        ai().acceptQuestionDrafts(
          fixture.row.id,
          fixture.dto([0], 'followup-second-instance'),
          teacher,
        ),
      ]);
      expect(results[0]!.questions[0]!.id).toBe(results[1]!.questions[0]!.id);
      expect(await prisma.question.count({ where: { aiGenerationId: fixture.row.id } })).toBe(1);
    } finally {
      await fixture.dispose();
    }
  });
  it('R03: Waka academic-read does not grant foreign Bank Soal access', async () => {
    const actor = await leader('WAKA_KURIKULUM'),
      fixture = await generation();
    try {
      const saved = await ai().acceptQuestionDrafts(fixture.row.id, fixture.dto([0]), teacher);
      const freshCodes = await permissions.getActivePositionCodes(actor.user.keycloakId);
      const user = { ...actor.user, roles: ['GURU', ...freshCodes] } as AuthUser;
      await expect(bank.findOne(saved.questions[0]!.id, user)).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      await fixture.dispose();
      await actor.dispose();
    }
  });
});
