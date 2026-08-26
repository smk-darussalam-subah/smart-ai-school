import { PrismaClient } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { ClassSessionDueService } from '../class-sessions/class-session-due.service';
import { ClassSessionService } from '../class-sessions/class-session.service';
import { DisplayDeviceService } from '../display-devices/display-device.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';

const databaseUrl = process.env.WAVE85_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('Wave 8.5 PostgreSQL pairing proof', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const service = new DisplayDeviceService(prisma as unknown as PrismaService);

  beforeEach(async () => {
    await prisma.displayDevice.deleteMany();
  });

  afterAll(async () => {
    await prisma.displayDevice.deleteMany();
    await prisma.$disconnect();
  });

  it('persists attempts one through five and keeps the sixth request locked out', async () => {
    const pairing = await service.createPairing(
      { profile: 'RUANG_GURU', label: 'Proof TV Guru', audioEnabled: false },
      'synthetic-proof-actor',
    );

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await expect(service.activate(pairing.id, 'deliberately-wrong-code')).rejects.toThrow(
        'Aktivasi perangkat gagal',
      );
      const persisted = await prisma.displayPairingChallenge.findFirstOrThrow({
        where: { deviceId: pairing.id },
        select: { attempts: true, consumedAt: true },
      });
      expect(persisted.attempts).toBe(Math.min(attempt, 5));
      expect(persisted.consumedAt).toBeNull();
    }
  });

  it('serializes wrong/correct races, rejects replay, and never revives an expired challenge', async () => {
    const pairing = await service.createPairing(
      { profile: 'RUANG_GURU', label: 'Proof Race TV', audioEnabled: false },
      'synthetic-proof-actor',
    );
    const raced = await Promise.allSettled([
      service.activate(pairing.id, 'deliberately-wrong-code'),
      service.activate(pairing.id, pairing.pairingCode),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(raced.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(service.activate(pairing.id, pairing.pairingCode)).rejects.toThrow(
      'Aktivasi perangkat gagal',
    );
    await expect(prisma.displayDevice.findUniqueOrThrow({ where: { id: pairing.id } })).resolves.toMatchObject({
      status: 'ACTIVE',
      credentialHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const expired = await prisma.displayDevice.create({
      data: {
        profile: 'RUANG_TU',
        label: 'Proof Expired TV',
        createdBy: 'synthetic-proof-actor',
        pairingChallenges: {
          create: {
            challengeHash: 'a'.repeat(64),
            expiresAt: new Date(Date.now() + 250),
            createdBy: 'synthetic-proof-actor',
          },
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(service.activate(expired.id, 'expired-code-value')).rejects.toThrow(
      'Aktivasi perangkat gagal',
    );
    await expect(prisma.displayPairingChallenge.findFirstOrThrow({
      where: { deviceId: expired.id },
    })).resolves.toMatchObject({ attempts: 0, consumedAt: null });
  });
});

describePostgres('Wave 8.5 PostgreSQL class-session concurrency proof', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const sessionService = new ClassSessionService(
    prisma as unknown as PrismaService,
    {} as BellScheduleService,
  );
  const teacherKeycloakId = '71000000-0000-4000-8000-000000000001';
  const auth = {
    keycloakId: teacherKeycloakId,
    roles: ['GURU'],
    email: 'wave85-teacher@example.invalid',
    username: 'wave85-teacher',
    fullName: 'Guru Proof',
  } as AuthUser;

  async function cleanup() {
    await prisma.classSession.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.teachingAssignment.deleteMany();
    await prisma.class.deleteMany();
    await prisma.teacher.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: '@example.invalid' } } });
    await prisma.bellScheduleProfile.deleteMany();
    await prisma.semester.deleteMany();
    await prisma.academicYear.deleteMany();
  }

  async function seed() {
    await cleanup();
    const year = await prisma.academicYear.create({
      data: {
        code: '2098/2099',
        startDate: new Date('2098-07-01T00:00:00.000Z'),
        endDate: new Date('2099-06-30T00:00:00.000Z'),
        isActive: true,
      },
    });
    const semester = await prisma.semester.create({
      data: {
        academicYearId: year.id,
        number: 1,
        startDate: new Date('2098-07-01T00:00:00.000Z'),
        endDate: new Date('2098-12-31T00:00:00.000Z'),
        isActive: true,
      },
    });
    const bell = await prisma.bellScheduleProfile.create({
      data: {
        code: 'WAVE85_PROOF',
        name: 'Wave 8.5 Proof',
        scope: 'SCHOOL',
        kind: 'NORMAL',
        effectiveFrom: new Date('2098-07-01T00:00:00.000Z'),
        provenance: 'synthetic-postgresql-proof',
      },
    });
    const user = await prisma.user.create({
      data: {
        keycloakId: teacherKeycloakId,
        email: 'wave85-teacher@example.invalid',
        fullName: 'Guru Proof',
        role: 'GURU',
      },
    });
    const teacher = await prisma.teacher.create({ data: { userId: user.id } });
    const start = new Date(Date.now() - 60_000);
    const end = new Date(Date.now() + 30 * 60_000);

    const sessions = [];
    for (let index = 1; index <= 3; index += 1) {
      const classRow = await prisma.class.create({
        data: {
          name: `X PROOF ${index}`,
          majorCode: 'PRF',
          grade: 10,
          academicYear: year.code,
        },
      });
      const assignment = await prisma.teachingAssignment.create({
        data: {
          teacherId: teacher.id,
          classId: classRow.id,
          subject: 'Proof Subject',
          academicYear: year.code,
        },
      });
      const schedule = await prisma.schedule.create({
        data: {
          classId: classRow.id,
          teachingAssignmentId: assignment.id,
          dayOfWeek: 1,
          jpStart: index,
          jpEnd: index,
          academicYear: year.code,
          semester: 1,
        },
      });
      sessions.push(await prisma.classSession.create({
        data: {
          scheduleId: schedule.id,
          serviceDate: new Date('2098-08-24T00:00:00.000Z'),
          academicYearId: year.id,
          semesterId: semester.id,
          bellScheduleProfileId: bell.id,
          classId: classRow.id,
          teachingAssignmentId: assignment.id,
          scheduledTeacherId: teacher.id,
          assignedTeacherId: teacher.id,
          classNameSnapshot: classRow.name,
          subjectSnapshot: assignment.subject,
          scheduledTeacherName: 'Guru Proof',
          assignedTeacherName: 'Guru Proof',
          scheduledStartAt: start,
          scheduledEndAt: end,
        },
      }));
    }
    return sessions;
  }

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('serializes cross-session key reuse and preserves exact replay semantics', async () => {
    const sessions = await seed();
    const key = '72000000-0000-4000-8000-000000000001';
    const now = new Date();
    const raced = await Promise.allSettled([
      sessionService.start(sessions[0]!.id, { idempotencyKey: key }, auth, now),
      sessionService.start(sessions[1]!.id, { idempotencyKey: key }, auth, now),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(raced.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const winner = raced[0]!.status === 'fulfilled' ? sessions[0]! : sessions[1]!;
    await expect(sessionService.start(winner.id, { idempotencyKey: key }, auth, now)).resolves.toMatchObject({
      id: winner.id,
      status: 'STARTED',
    });
    expect(await prisma.classSessionEvent.count({ where: { eventType: 'STARTED' } })).toBe(1);

    const cancelKey = '72000000-0000-4000-8000-000000000002';
    await sessionService.cancel(sessions[2]!.id, {
      idempotencyKey: cancelKey,
      reason: 'Pembatalan proof pertama',
    }, auth, now);
    await expect(sessionService.cancel(sessions[2]!.id, {
      idempotencyKey: cancelKey,
      reason: 'Pembatalan proof dengan payload berbeda',
    }, auth, now)).rejects.toThrow('Idempotency key sudah digunakan untuk permintaan lain');
  });

  it('allows only one worker to claim a due alert and keeps the lease durable across instances', async () => {
    const sessions = await seed();
    const alert = await prisma.classSessionAlert.create({
      data: {
        sessionId: sessions[0]!.id,
        stage: 'PRIVATE_T5',
        dueAt: new Date(Date.now() - 1_000),
      },
    });
    const workerA = new ClassSessionDueService(
      prisma as unknown as PrismaService,
      {} as BellScheduleService,
      {} as NotificationService,
    );
    const workerB = new ClassSessionDueService(
      prisma as unknown as PrismaService,
      {} as BellScheduleService,
      {} as NotificationService,
    );
    type Claim = { id: string; claimToken: string };
    const claimA = (workerA as unknown as { claimDueAlerts(now: Date): Promise<Claim[]> }).claimDueAlerts.bind(workerA);
    const claimB = (workerB as unknown as { claimDueAlerts(now: Date): Promise<Claim[]> }).claimDueAlerts.bind(workerB);
    const claims = await Promise.all([claimA(new Date()), claimB(new Date())]);
    expect(claims.flat().map((claim) => claim.id)).toEqual([alert.id]);
    await expect(prisma.classSessionAlert.findUniqueOrThrow({ where: { id: alert.id } })).resolves.toMatchObject({
      status: 'CLAIMED',
      claimToken: expect.any(String),
      leaseUntil: expect.any(Date),
    });
  });
});
