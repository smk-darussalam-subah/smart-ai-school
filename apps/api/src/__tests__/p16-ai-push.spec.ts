// =============================================================================
// P16 W3-5: AiGenerateService — generate questions, material, ATP.
// P16 W3-6: PushService — subscribe, unsubscribe, notifications.
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AuthUser } from '@smk/auth';
import { AiGenerateService } from '../ai/ai-generate.service';
import { AiProviderStatusService } from '../ai/ai-provider-status.service';
import { PushService } from '../push/push.service';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;
const KEGIATAN_PATCH = JSON.stringify({
  kegiatan: [{
    pertemuan: 'Pertemuan 1',
    pendahuluan: 'Apersepsi singkat.',
    inti: 'Siswa berdiskusi memecahkan masalah.',
    penutup: 'Refleksi dan tindak lanjut.',
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

describe('PushService', () => {
  let service: PushService;
  const userFindUnique = jest.fn();
  const pushSubFindUnique = jest.fn();
  const pushSubCreate = jest.fn();
  const pushSubUpdate = jest.fn();
  const pushSubDeleteMany = jest.fn();
  const notifLogFindMany = jest.fn();

  beforeEach(async () => {
    [userFindUnique, pushSubFindUnique, pushSubCreate, pushSubUpdate, pushSubDeleteMany, notifLogFindMany]
      .forEach((m) => m.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1', phone: '628123', email: 'test@test.com' });
    pushSubFindUnique.mockResolvedValue(null);
    pushSubCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'ps-1', ...a.data }));
    notifLogFindMany.mockResolvedValue([]);

    const prisma = {
      user: { findUnique: userFindUnique },
      pushSubscription: { findUnique: pushSubFindUnique, create: pushSubCreate, update: pushSubUpdate, deleteMany: pushSubDeleteMany },
      notificationLog: { findMany: notifLogFindMany },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PushService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PushService);
  });

  it('subscribe → creates new subscription', async () => {
    const res = await service.subscribe(
      { endpoint: 'https://fcm.google.com/abc', keys: { p256dh: 'key1', auth: 'key2' } },
      SISWA,
    );
    expect(res.id).toBe('ps-1');
    expect(pushSubCreate).toHaveBeenCalled();
  });

  it('subscribe existing → updates keys (no duplicate)', async () => {
    pushSubFindUnique.mockResolvedValue({ id: 'ps-1' });
    pushSubUpdate.mockResolvedValue({ id: 'ps-1' });
    await service.subscribe(
      { endpoint: 'https://fcm.google.com/abc', keys: { p256dh: 'new', auth: 'new' } },
      SISWA,
    );
    expect(pushSubUpdate).toHaveBeenCalled();
    expect(pushSubCreate).not.toHaveBeenCalled();
  });

  it('unsubscribe → deletes subscription', async () => {
    pushSubDeleteMany.mockResolvedValue({ count: 1 });
    const res = await service.unsubscribe({ endpoint: 'https://fcm.google.com/abc' }, SISWA);
    expect(res.unsubscribed).toBe(true);
    expect(pushSubDeleteMany).toHaveBeenCalled();
  });

  it('findMyNotifications → returns notification logs by phone/email', async () => {
    notifLogFindMany.mockResolvedValue([
      { id: 'nl-1', recipient: '628123', channel: 'whatsapp', body: 'test', status: 'sent', createdAt: new Date() },
    ]);
    const res = await service.findMyNotifications(SISWA);
    expect(res).toHaveLength(1);
    expect(notifLogFindMany.mock.calls[0][0].where.recipient.in).toContain('628123');
    expect(notifLogFindMany.mock.calls[0][0].where.recipient.in).toContain('test@test.com');
  });
});
