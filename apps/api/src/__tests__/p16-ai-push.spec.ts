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
import { AuthUser } from '@smk/auth';
import { AiGenerateService } from '../ai/ai-generate.service';
import { AiProviderStatusService } from '../ai/ai-provider-status.service';
import { PushService } from '../push/push.service';
import { SubscribeSchema, UnsubscribeSchema } from '../push/dto/push.dto';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;
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

describe('PushService', () => {
  let service: PushService;
  const userFindUnique = jest.fn();
  const pushSubFindUnique = jest.fn();
  const pushSubCreate = jest.fn();
  const pushSubUpdate = jest.fn();
  const pushSubFindMany = jest.fn();
  const pushSubDelete = jest.fn();
  const pushSubDeleteMany = jest.fn();
  const notifLogFindMany = jest.fn();

  beforeEach(async () => {
    [userFindUnique, pushSubFindUnique, pushSubCreate, pushSubUpdate, pushSubFindMany, pushSubDelete, pushSubDeleteMany, notifLogFindMany]
      .forEach((m) => m.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1', phone: '628123', email: 'test@test.com' });
    pushSubFindUnique.mockResolvedValue(null);
    pushSubFindMany.mockResolvedValue([]);
    pushSubCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'ps-1', ...a.data }));
    notifLogFindMany.mockResolvedValue([]);

    const prisma = {
      user: { findUnique: userFindUnique },
      pushSubscription: {
        findUnique: pushSubFindUnique,
        findMany: pushSubFindMany,
        create: pushSubCreate,
        update: pushSubUpdate,
        delete: pushSubDelete,
        deleteMany: pushSubDeleteMany,
      },
      notificationLog: { findMany: notifLogFindMany },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PushService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PushService);
  });

  it('subscribe → creates new subscription', async () => {
    const res = await service.subscribe(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'key1', auth: 'key2' } },
      SISWA,
    );
    expect(res.id).toBe('ps-1');
    expect(pushSubCreate).toHaveBeenCalled();
  });

  it('subscribe existing → updates keys (no duplicate)', async () => {
    pushSubFindUnique.mockResolvedValue({ id: 'ps-1' });
    pushSubUpdate.mockResolvedValue({ id: 'ps-1' });
    await service.subscribe(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'new', auth: 'new' } },
      SISWA,
    );
    expect(pushSubUpdate).toHaveBeenCalled();
    expect(pushSubCreate).not.toHaveBeenCalled();
  });

  it('unsubscribe → deletes subscription', async () => {
    pushSubDeleteMany.mockResolvedValue({ count: 1 });
    const res = await service.unsubscribe({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }, SISWA);
    expect(res.unsubscribed).toBe(true);
    expect(pushSubDeleteMany).toHaveBeenCalled();
  });

  it('findMyNotifications → returns only push logs bound to current user id', async () => {
    notifLogFindMany.mockResolvedValue([
      { id: 'nl-1', channel: 'push', body: 'Rapor tersedia', status: 'sent', createdAt: new Date() },
    ]);
    const res = await service.findMyNotifications(SISWA);
    expect(res).toHaveLength(1);
    expect(notifLogFindMany.mock.calls[0][0].where).toEqual({ recipient: 'user-1', channel: 'push' });
    expect(notifLogFindMany.mock.calls[0][0].select.recipient).toBeUndefined();
  });

  it('dispatchNotificationLog → no subscription succeeds as in-app-only availability', async () => {
    await expect(service.dispatchNotificationLog({
      logId: 'log-1',
      userId: 'user-1',
      title: 'Rapor semester tersedia',
      body: 'Rapor semester tersedia di DIIS.',
    })).resolves.toEqual({ attempted: 0, staleRemoved: 0 });
  });

  it('dispatchNotificationLog → sends safe payload and removes stale subscriptions', async () => {
    const webpush = await import('web-push');
    const previousPublic = process.env.VAPID_PUBLIC_KEY;
    const previousPrivate = process.env.VAPID_PRIVATE_KEY;
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
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
        url: '/dashboard/rapor',
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
