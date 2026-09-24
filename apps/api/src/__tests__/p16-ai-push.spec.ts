// =============================================================================
// P16 W3-5: AiGenerateService — generate questions, material, ATP.
// P16 W3-6: PushService — subscribe, unsubscribe, notifications.
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { AuthUser } from '@smk/auth';
import { AiGenerateService } from '../ai/ai-generate.service';
import { AiProviderStatusService } from '../ai/ai-provider-status.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { REQUIRED_PERMISSION_KEY } from '../permissions/decorators/require-permission.decorator';
import { PushController } from '../push/push.controller';
import { PushService } from '../push/push.service';
import { SubscribeSchema, UnsubscribeSchema, VerifyPushDeliverySchema } from '../push/dto/push.dto';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SISWA: AuthUser = {
  keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'], tokenIssuedAt: 1_700_000_000,
} as AuthUser;
const ORANG_TUA: AuthUser = { keycloakId: 'kc-ortu', username: 'ortu1', roles: ['ORANG_TUA'] } as AuthUser;
const KEGIATAN_PATCH = JSON.stringify({
  kegiatan: [{
    pertemuan: 'Pertemuan 1',
    pendahuluan: 'Apersepsi singkat.',
    inti: 'Siswa berdiskusi memecahkan masalah.',
    penutup: 'Refleksi dan tindak lanjut.',
    diferensiasi: 'Guru memberi dukungan bertahap dan tantangan tambahan sesuai kesiapan siswa.',
  }],
});

// ── AiGenerateService Tests ─────────────────────────────────────────────────

describe('AiGenerateService', () => {
  let service: AiGenerateService;
  const userFindUnique = jest.fn();
  const teacherFindUnique = jest.fn();
  const rppFindFirst = jest.fn();
  const teachingAssignmentFindFirst = jest.fn();
  const aiGenCreate = jest.fn();
  const chatMock = jest.fn();

  beforeEach(async () => {
    [userFindUnique, teacherFindUnique, rppFindFirst, teachingAssignmentFindFirst, aiGenCreate, chatMock].forEach((m) => m.mockReset());
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    rppFindFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      teacherId: 'teacher-1',
      classId: 'class-1',
      subject: 'Matematika',
      title: 'Fungsi Linear',
      academicYear: '2026/2027',
      semester: 1,
      body: { cp: 'CP aman', tp: ['TP aman'] },
      class: { id: 'class-1', name: 'X TKJ 1', grade: 10, majorCode: 'TKJ' },
    });
    teachingAssignmentFindFirst.mockResolvedValue({ id: 'ta-1' });
    aiGenCreate.mockResolvedValue({ id: 'gen-1' });
    chatMock.mockResolvedValue(KEGIATAN_PATCH);

    const prisma = {
      user: { findUnique: userFindUnique },
      teacher: { findUnique: teacherFindUnique },
      rpp: { findFirst: rppFindFirst },
      teachingAssignment: { findFirst: teachingAssignmentFindFirst },
      aiGeneration: { create: aiGenCreate },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AiGenerateService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'AI_GATEWAY', useValue: { chat: chatMock } },
        { provide: 'OPENAI_GATEWAY', useValue: null },
        {
          provide: AiProviderStatusService,
          useValue: {
            shouldAttemptOpenAiProbe: jest.fn().mockResolvedValue(true),
            markOpenAiQuotaExhausted: jest.fn().mockResolvedValue(undefined),
            markOpenAiRecovered: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(AiGenerateService);
  });

  it('generateRppStep -> calls AI from saved RPP context and creates audit trail', async () => {
    const res = await service.generateRppStep(
      { rppId: '11111111-1111-4111-8111-111111111111', section: 'kegiatan' },
      GURU,
    );
    expect(res.type).toBe('kegiatan');
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(aiGenCreate).toHaveBeenCalledTimes(1);
  });

  it('generateRppStep with empty AI response -> throws stable invalid-output error', async () => {
    chatMock.mockResolvedValue('');
    await expect(service.generateRppStep(
      { rppId: '11111111-1111-4111-8111-111111111111', section: 'kegiatan' },
      GURU,
    )).rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });
  });

  it('legacy raw-context generation endpoints are disabled', () => {
    expect(() => service.rejectLegacyGeneration()).toThrow();
  });

  it('audit trail failure -> fail-soft (does not throw)', async () => {
    aiGenCreate.mockRejectedValue(new Error('DB error'));
    const res = await service.generateRppStep(
      { rppId: '11111111-1111-4111-8111-111111111111', section: 'kegiatan' },
      GURU,
    );
    expect(res.type).toBe('kegiatan');
  });
});

// ---- PushService Tests -----------------------------------------------------

describe('Push DTO validation', () => {
  it('accepts only bounded HTTPS endpoints from trusted Web Push providers', () => {
    const parsed = SubscribeSchema.parse({
      endpoint: ' https://fcm.googleapis.com/fcm/send/subscription-1 ',
      keys: { p256dh: ' key1 ', auth: ' key2 ' },
    });
    expect(parsed).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-1',
      keys: { p256dh: 'key1', auth: 'key2' },
    });
    for (const endpoint of [
      'https://updates.push.services.mozilla.com/wpush/v2/subscription-1',
      'https://web.push.apple.com/Q/subscription-1',
      'https://wns2.example.notify.windows.com/w/subscription-1',
    ]) {
      expect(SubscribeSchema.safeParse({ endpoint, keys: { p256dh: 'key1', auth: 'key2' } }).success)
        .toBe(true);
    }

    const invalidEndpoints = [
      'http://fcm.googleapis.com/fcm/send/subscription-1',
      '//fcm.googleapis.com/fcm/send/subscription-1',
      'https://localhost/fcm/send/subscription-1',
      'https://127.0.0.1/fcm/send/subscription-1',
      'https://[::1]/fcm/send/subscription-1',
      'https://example.com/fcm/send/subscription-1',
      'https://fcm.googleapis.com.evil.test/fcm/send/subscription-1',
      'https://notify.windows.com.evil.test/w/subscription-1',
      'https://user:pass@fcm.googleapis.com/fcm/send/subscription-1',
      'https://fcm.googleapis.com:444/fcm/send/subscription-1',
      `https://fcm.googleapis.com/fcm/send/${'x'.repeat(2050)}`,
    ];

    for (const endpoint of invalidEndpoints) {
      expect(SubscribeSchema.safeParse({ endpoint, keys: { p256dh: 'key1', auth: 'key2' } }).success)
        .toBe(false);
      expect(UnsubscribeSchema.safeParse({ endpoint }).success).toBe(false);
    }
  });
});

describe('PushController permissions', () => {
  it.each(['subscribe', 'unsubscribe', 'verifyDelivery', 'findMyNotifications'] as const)(
    '%s accepts report.read so ORANG_TUA can use report notification history',
    (methodName) => {
      expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, PushController.prototype[methodName]))
        .toEqual(['lms.read', 'report.read']);
    },
  );

  it('keeps delivery verification available to every role that can register push', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PushController.prototype.verifyDelivery))
      .toEqual(Reflect.getMetadata(ROLES_KEY, PushController.prototype.subscribe));
  });
});

describe('PushService', () => {
  let service: PushService;
  const userFindUnique = jest.fn();
  const pushSubQueryRaw = jest.fn();
  const pushSubFindMany = jest.fn();
  const pushSubFindFirst = jest.fn();
  const pushSubDelete = jest.fn();
  const pushSubDeleteMany = jest.fn();
  const notifLogFindMany = jest.fn();
  const notifLogFindFirst = jest.fn();
  const reportCardFindMany = jest.fn();
  const reportCardFindFirst = jest.fn();

  beforeEach(async () => {
    [
      userFindUnique,
      pushSubQueryRaw,
      pushSubFindMany,
      pushSubFindFirst,
      pushSubDelete,
      pushSubDeleteMany,
      notifLogFindMany,
      notifLogFindFirst,
      reportCardFindMany,
      reportCardFindFirst,
    ]
      .forEach((m) => m.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1', phone: '628123', email: 'test@test.com' });
    pushSubFindMany.mockResolvedValue([]);
    pushSubQueryRaw.mockResolvedValue([{ id: 'ps-1' }]);
    notifLogFindMany.mockResolvedValue([]);
    notifLogFindFirst.mockResolvedValue(null);
    reportCardFindMany.mockResolvedValue([]);
    reportCardFindFirst.mockResolvedValue(null);

    const prisma = {
      user: { findUnique: userFindUnique },
      $queryRaw: pushSubQueryRaw,
      pushSubscription: {
        findMany: pushSubFindMany,
        findFirst: pushSubFindFirst,
        delete: pushSubDelete,
        deleteMany: pushSubDeleteMany,
      },
      notificationLog: { findMany: notifLogFindMany, findFirst: notifLogFindFirst },
      reportCard: { findMany: reportCardFindMany, findFirst: reportCardFindFirst },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PushService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PushService);
  });

  it('subscribe atomically binds an endpoint to the verified token issue time', async () => {
    const res = await service.subscribe(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'key1', auth: 'key2' } },
      SISWA,
    );
    expect(res).toEqual({ reconciled: true });
    const query = pushSubQueryRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('ON CONFLICT ("endpoint") DO UPDATE');
    expect(query.strings.join(' ')).toContain("bindingIssuedAt");
    expect(query.values).toContain('user-1');
    expect(query.values).toContain(1_700_000_000);
    expect(query.values).toContain(JSON.stringify({
      p256dh: 'key1', auth: 'key2', bindingIssuedAt: 1_700_000_000,
    }));
  });

  it('fails closed when the verified authentication token has no binding order', async () => {
    await expect(service.subscribe(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'key1', auth: 'key2' } },
      { ...SISWA, tokenIssuedAt: undefined },
    )).rejects.toThrow('Sesi autentikasi tidak memiliki urutan binding yang valid');
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(pushSubQueryRaw).not.toHaveBeenCalled();
  });

  it('unsubscribe → deletes subscription', async () => {
    pushSubDeleteMany.mockResolvedValue({ count: 1 });
    const res = await service.unsubscribe({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }, SISWA);
    expect(res.unsubscribed).toBe(true);
    expect(pushSubDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', endpoint: 'https://fcm.googleapis.com/fcm/send/abc' },
    });
  });

  it('rejects an older account binding that finishes after a newer account session', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/reused-device';
    let releaseOldLookup: ((value: { id: string }) => void) | undefined;
    const oldLookup = new Promise<{ id: string }>((resolve) => {
      releaseOldLookup = resolve;
    });
    userFindUnique.mockImplementation(({ where }: { where: { keycloakId: string } }) => (
      where.keycloakId === 'kc-user-a' ? oldLookup : Promise.resolve({ id: 'user-b' })
    ));
    const binding = { userId: 'user-a', bindingIssuedAt: 100 };
    pushSubQueryRaw.mockImplementation((query: { values: unknown[] }) => {
      const [userId, , keysJson, issuedAt] = query.values as [string, string, string, number];
      if (
        binding.bindingIssuedAt > issuedAt
        || (binding.bindingIssuedAt === issuedAt && binding.userId !== userId)
      ) return Promise.resolve([]);
      binding.userId = userId;
      binding.bindingIssuedAt = JSON.parse(keysJson).bindingIssuedAt as number;
      return Promise.resolve([{ id: 'ps-1' }]);
    });

    const delayedOld = service.subscribe({ endpoint, keys: { p256dh: 'a', auth: 'a' } }, {
      ...SISWA,
      keycloakId: 'kc-user-a',
      tokenIssuedAt: 100,
    });
    const newer = await service.subscribe({ endpoint, keys: { p256dh: 'b', auth: 'b' } }, {
      ...SISWA,
      keycloakId: 'kc-user-b',
      tokenIssuedAt: 200,
    });
    releaseOldLookup?.({ id: 'user-a' });
    const stale = await delayedOld;

    expect(newer).toEqual({ reconciled: true });
    expect(stale).toEqual({ reconciled: false });
    expect(binding).toEqual({ userId: 'user-b', bindingIssuedAt: 200 });
  });

  it('does not let the current owner downgrade the binding generation before another takeover', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/monotonic-owner';
    userFindUnique.mockImplementation(({ where }: { where: { keycloakId: string } }) => (
      Promise.resolve({ id: where.keycloakId === 'kc-user-b' ? 'user-b' : 'user-a' })
    ));
    const binding = { userId: 'user-b', bindingIssuedAt: 200 };
    pushSubQueryRaw.mockImplementation((query: { values: unknown[] }) => {
      const [userId, , keysJson, issuedAt] = query.values as [string, string, string, number];
      if (
        binding.bindingIssuedAt > issuedAt
        || (binding.bindingIssuedAt === issuedAt && binding.userId !== userId)
      ) return Promise.resolve([]);
      binding.userId = userId;
      binding.bindingIssuedAt = JSON.parse(keysJson).bindingIssuedAt as number;
      return Promise.resolve([{ id: 'ps-1' }]);
    });

    await expect(service.subscribe(
      { endpoint, keys: { p256dh: 'stale-b', auth: 'stale-b' } },
      { ...SISWA, keycloakId: 'kc-user-b', tokenIssuedAt: 100 },
    )).resolves.toEqual({ reconciled: false });
    await expect(service.subscribe(
      { endpoint, keys: { p256dh: 'a', auth: 'a' } },
      { ...SISWA, keycloakId: 'kc-user-a', tokenIssuedAt: 150 },
    )).resolves.toEqual({ reconciled: false });

    expect(binding).toEqual({ userId: 'user-b', bindingIssuedAt: 200 });
  });

  it('findMyNotifications → returns only push logs bound to current user id', async () => {
    notifLogFindMany.mockResolvedValue([
      {
        id: 'nl-1',
        channel: 'push',
        subject: null,
        body: 'Rapor tersedia',
        status: 'sent',
        sentAt: null,
        refType: null,
        refId: null,
        createdAt: new Date(),
      },
    ]);
    const res = await service.findMyNotifications(SISWA);
    expect(res).toHaveLength(1);
    expect(notifLogFindMany.mock.calls[0][0].where).toEqual({ recipient: 'user-1', channel: 'push' });
    expect(notifLogFindMany.mock.calls[0][0].select.recipient).toBeUndefined();
    expect(notifLogFindMany.mock.calls[0][0].select.refId).toBe(true);
    expect(res[0]).toMatchObject({ targetHref: '/dashboard/akademik' });
    expect(JSON.stringify(res[0])).not.toContain('refId');
  });

  it('findMyNotifications → resolves report targets to the owning child instead of active UI child', async () => {
    const reportA = '11111111-1111-4111-8111-111111111111';
    const reportB = '22222222-2222-4222-8222-222222222222';
    const reportForeign = '33333333-3333-4333-8333-333333333333';
    notifLogFindMany.mockResolvedValue([
      {
        id: 'nl-a',
        channel: 'push',
        subject: 'Rapor A',
        body: 'Rapor tersedia',
        status: 'sent',
        sentAt: null,
        refType: 'report-card',
        refId: reportA,
        createdAt: new Date(),
      },
      {
        id: 'nl-b',
        channel: 'push',
        subject: 'Rapor B',
        body: 'Rapor tersedia',
        status: 'sent',
        sentAt: null,
        refType: 'report-card',
        refId: reportB,
        createdAt: new Date(),
      },
      {
        id: 'nl-foreign',
        channel: 'push',
        subject: 'Rapor asing',
        body: 'Rapor tersedia',
        status: 'sent',
        sentAt: null,
        refType: 'report-card',
        refId: reportForeign,
        createdAt: new Date(),
      },
    ]);
    reportCardFindMany.mockResolvedValue([
      { id: reportA, studentId: 'child-a' },
      { id: reportB, studentId: 'child-b' },
    ]);

    const res = await service.findMyNotifications(ORANG_TUA);

    expect(reportCardFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: [reportA, reportB, reportForeign] },
        status: 'distributed',
        student: expect.objectContaining({
          deletedAt: null,
          OR: [{ parentId: 'user-1' }],
        }),
      }),
    }));
    expect(res.map((item) => item.targetHref)).toEqual([
      '/dashboard/rapor?studentId=child-a',
      '/dashboard/rapor?studentId=child-b',
      '/dashboard/rapor',
    ]);
    expect(JSON.stringify(res)).not.toContain(reportA);
  });

  it('dispatchNotificationLog → no subscription succeeds as in-app-only availability', async () => {
    await expect(service.dispatchNotificationLog({
      logId: 'log-1',
      userId: 'user-1',
      title: 'Rapor semester tersedia',
      body: 'Rapor semester tersedia di DIIS.',
    })).resolves.toEqual({ attempted: 0, staleRemoved: 0 });
  });

  it('verifies push delivery against the current session and endpoint owner', async () => {
    const previousPublic = process.env.VAPID_PUBLIC_KEY;
    const previousPrivate = process.env.VAPID_PRIVATE_KEY;
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    const endpoint = 'https://fcm.googleapis.com/fcm/send/ok';
    const proof = createHmac('sha256', 'private').update('user-1').update('\0').update(endpoint).digest('hex');
    pushSubFindFirst.mockResolvedValue({ id: 'ps-1' });
    try {
      await expect(service.verifyDelivery({ endpoint, proof }, SISWA)).resolves.toEqual({ deliver: true });
      expect(pushSubFindFirst).toHaveBeenCalledWith({
        where: { endpoint, userId: 'user-1' }, select: { id: true },
      });
      await expect(service.verifyDelivery({ endpoint, proof: 'b'.repeat(64) }, SISWA))
        .resolves.toEqual({ deliver: false });
      userFindUnique.mockResolvedValue({ id: 'user-2' });
      pushSubFindFirst.mockResolvedValue(null);
      await expect(service.verifyDelivery({ endpoint, proof }, ORANG_TUA))
        .resolves.toEqual({ deliver: false });
      expect(VerifyPushDeliverySchema.safeParse({ endpoint, proof: 'bad' }).success).toBe(false);
      await expect(service.verifyDelivery({ endpoint, proof: 'bad' }, SISWA))
        .resolves.toEqual({ deliver: false });
    } finally {
      if (previousPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
      else process.env.VAPID_PUBLIC_KEY = previousPublic;
      if (previousPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
      else process.env.VAPID_PRIVATE_KEY = previousPrivate;
    }
  });

  it('dispatchNotificationLog → sends safe payload and removes stale subscriptions', async () => {
    const webpush = await import('web-push');
    const previousPublic = process.env.VAPID_PUBLIC_KEY;
    const previousPrivate = process.env.VAPID_PRIVATE_KEY;
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    notifLogFindFirst.mockResolvedValue({
      refType: 'report-card',
      refId: '11111111-1111-4111-8111-111111111111',
    });
    reportCardFindFirst.mockResolvedValue({ studentId: 'student-1' });
    pushSubFindMany.mockResolvedValue([
      { id: 'ps-unsafe', endpoint: 'https://127.0.0.1/internal', keys: { p256dh: 'px', auth: 'ax' } },
      { id: 'ps-1', endpoint: 'https://fcm.googleapis.com/fcm/send/ok', keys: { p256dh: 'p', auth: 'a' } },
      { id: 'ps-2', endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/stale', keys: { p256dh: 'p2', auth: 'a2' } },
    ]);
    (webpush.sendNotification as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 410 });

    try {
      const result = await service.dispatchNotificationLog({
        logId: 'log-1',
        userId: 'user-1',
        title: 'Rapor semester tersedia',
        body: 'Rapor semester 1 tahun ajaran 2026/2027 telah dibagikan di DIIS.',
      });

      expect(result).toEqual({ attempted: 2, staleRemoved: 2 });
      const payload = JSON.parse((webpush.sendNotification as jest.Mock).mock.calls[0][1]);
      expect((webpush.sendNotification as jest.Mock).mock.calls[0][0].endpoint)
        .toBe('https://fcm.googleapis.com/fcm/send/ok');
      expect(payload).toEqual(expect.objectContaining({
        title: 'Rapor semester tersedia',
        url: '/dashboard/rapor?studentId=student-1',
        deliveryProof: createHmac('sha256', 'private')
          .update('user-1').update('\0').update('https://fcm.googleapis.com/fcm/send/ok').digest('hex'),
      }));
      expect(JSON.stringify(payload)).not.toContain('NIS');
      expect(pushSubDelete).toHaveBeenCalledWith({ where: { id: 'ps-unsafe' } });
      expect(pushSubDelete).toHaveBeenCalledWith({ where: { id: 'ps-2' } });
    } finally {
      if (previousPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
      else process.env.VAPID_PUBLIC_KEY = previousPublic;
      if (previousPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
      else process.env.VAPID_PRIVATE_KEY = previousPrivate;
    }
  });
});
