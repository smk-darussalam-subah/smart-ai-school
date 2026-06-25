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
import { PushService } from '../push/push.service';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;

// ── AiGenerateService Tests ─────────────────────────────────────────────────

describe('AiGenerateService', () => {
  let service: AiGenerateService;
  const userFindUnique = jest.fn();
  const teacherFindUnique = jest.fn();
  const aiGenCreate = jest.fn();
  const chatMock = jest.fn();

  beforeEach(async () => {
    [userFindUnique, teacherFindUnique, aiGenCreate, chatMock].forEach((m) => m.mockReset());
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    aiGenCreate.mockResolvedValue({ id: 'gen-1' });

    const prisma = {
      user: { findUnique: userFindUnique },
      teacher: { findUnique: teacherFindUnique },
      aiGeneration: { create: aiGenCreate },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AiGenerateService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'AI_GATEWAY', useValue: { chat: chatMock } },
      ],
    }).compile();
    service = moduleRef.get(AiGenerateService);
  });

  it('generateQuestions → calls AI and creates audit trail', async () => {
    chatMock.mockResolvedValue('[{"body":"Q1","options":["A","B","C","D"],"answer":"A","difficulty":"medium"}]');
    const res = await service.generateQuestions(
      { rppBody: 'RPP content here', subject: 'Matematika', count: 1, type: 'multiple_choice' },
      GURU,
    );
    expect(res.type).toBe('questions');
    expect(Array.isArray(res.output)).toBe(true);
    expect(chatMock).toHaveBeenCalled();
    expect(aiGenCreate).toHaveBeenCalled();
  });

  it('generateMaterial → returns markdown text', async () => {
    chatMock.mockResolvedValue('# Materi HTML\n\nIni adalah materi...');
    const res = await service.generateMaterial(
      { rppBody: 'RPP content', subject: 'Pemrograman Web' },
      GURU,
    );
    expect(res.type).toBe('material');
    expect(res.output).toContain('# Materi HTML');
  });

  it('generateAtp → returns JSON array', async () => {
    chatMock.mockResolvedValue('[{"code":"TP 1.1","tp":"desc","atp":["sub1"]}]');
    const res = await service.generateAtp(
      { cp: 'CP content', tp: ['TP 1', 'TP 2'], subject: 'Matematika' },
      GURU,
    );
    expect(res.type).toBe('atp');
    expect(Array.isArray(res.output)).toBe(true);
  });

  it('generateQuestions with empty AI response → throws', async () => {
    chatMock.mockResolvedValue('');
    await expect(service.generateQuestions(
      { rppBody: 'RPP', subject: 'X', count: 1, type: 'multiple_choice' }, GURU,
    )).rejects.toThrow('AI mengembalikan respons kosong');
  });

  it('audit trail failure → fail-soft (does not throw)', async () => {
    chatMock.mockResolvedValue('[{"body":"Q1","options":["A"],"answer":"A","difficulty":"easy"}]');
    aiGenCreate.mockRejectedValue(new Error('DB error'));
    const res = await service.generateQuestions(
      { rppBody: 'RPP', subject: 'X', count: 1, type: 'multiple_choice' }, GURU,
    );
    expect(res.type).toBe('questions'); // still returns result
  });
});

// ── PushService Tests ────────────────────────────────────────────────────────

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
