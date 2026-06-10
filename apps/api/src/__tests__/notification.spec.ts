// =============================================================================
// notification.spec.ts — Unit tests SMA-42 (BullMQ edition)
// =============================================================================

jest.mock('@smk/auth', () => ({
  verifyKeycloakToken: jest.fn(),
  extractAuthUser: jest.fn(),
}));

jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  logError: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from '../notification/notification.service';
import { NotificationModule } from '../notification/notification.module';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationAdapter } from '@smk/types';
import { LogAdapter } from '../notification/adapters/log.adapter';
import { FonnteAdapter } from '../notification/adapters/fonnte.adapter';

const NOW = new Date('2026-06-01T08:00:00.000Z');
const STALE = new Date('2026-06-01T07:50:00.000Z');

function buildPrismaMock() {
  return {
    notificationLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1', channel: 'whatsapp', recipient: '628xxx', body: 'test', subject: null }),
      update: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function buildQueueMock() {
  return { add: jest.fn().mockResolvedValue(undefined), close: jest.fn() };
}

async function buildService(prismaMock = buildPrismaMock(), queueMock = buildQueueMock()) {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [NotificationService, { provide: PrismaService, useValue: prismaMock }],
  }).compile();
  const service = mod.get(NotificationService);
  service.setQueue(queueMock as never);
  return service;
}

describe('NotificationService (BullMQ)', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let queue: ReturnType<typeof buildQueueMock>;
  let service: NotificationService;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    queue = buildQueueMock();
    service = await buildService(prisma, queue);
  });

  it('notify() tulis pending lalu queue.add()', async () => {
    await service.notify({ channel: 'whatsapp', to: '6281234567890', body: 'test' });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
    );
    expect(queue.add).toHaveBeenCalledWith('whatsapp', expect.objectContaining({ logId: 'log-1' }), expect.any(Object));
  });

  it('idempotensi: ref sudah sent → skip', async () => {
    prisma.notificationLog.findFirst.mockResolvedValueOnce({ id: 'existing' });

    await service.notify({ channel: 'whatsapp', to: '628xxx', body: 'x', refType: 'grade', refId: 'g-1' });

    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('tanpa refType → tidak cek idempotensi, langsung queue', async () => {
    await service.notify({ channel: 'whatsapp', to: '628xxx', body: 'x' });

    expect(prisma.notificationLog.findFirst).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('tanpa queue → tidak throw, skip', async () => {
    const svc = await buildService(prisma); // no queue set
    await expect(svc.notify({ channel: 'whatsapp', to: '628xxx', body: 'x' })).resolves.not.toThrow();
  });

  it('onModuleInit: stale pending → queue.add()', async () => {
    prisma.notificationLog.findMany.mockResolvedValueOnce([
      { id: 'stale-1', channel: 'whatsapp', recipient: '628xxx', body: 'stale', subject: null, createdAt: STALE, status: 'pending' },
    ]);

    await service.onModuleInit();

    expect(queue.add).toHaveBeenCalledWith('whatsapp', expect.objectContaining({ logId: 'stale-1' }), expect.any(Object));
  });

  it('onModuleInit: tidak ada stale → tidak add ke queue', async () => {
    await service.onModuleInit();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('onModuleInit: DB error → fail-soft (tidak throw)', async () => {
    prisma.notificationLog.findMany.mockRejectedValueOnce(new Error('DB down'));
    await expect(service.onModuleInit()).resolves.not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NotificationModule factory
// ════════════════════════════════════════════════════════════════════════════

describe('NotificationModule factory', () => {
  const originalEnv = process.env;

  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; jest.clearAllMocks(); });

  it('NOTIF_PROVIDER unset → LogAdapter', async () => {
    delete process.env['NOTIF_PROVIDER'];
    const mod = await Test.createTestingModule({ imports: [NotificationModule] })
      .overrideProvider(PrismaService).useValue(buildPrismaMock() as never)
      .overrideProvider('REDIS_CONNECTION').useValue({ host: 'mock', port: 6379 })
      .overrideProvider('NOTIFICATION_QUEUE').useValue({ add: jest.fn(), close: jest.fn() })
      .overrideProvider('NOTIFICATION_WORKER').useValue({ close: jest.fn(), on: jest.fn() })
      .compile();
    expect(mod.get('NOTIFICATION_ADAPTER')).toBeInstanceOf(LogAdapter);
  });

  it('NOTIF_PROVIDER=log → LogAdapter', async () => {
    process.env['NOTIF_PROVIDER'] = 'log';
    const mod = await Test.createTestingModule({ imports: [NotificationModule] })
      .overrideProvider(PrismaService).useValue(buildPrismaMock() as never)
      .overrideProvider('REDIS_CONNECTION').useValue({ host: 'mock', port: 6379 })
      .overrideProvider('NOTIFICATION_QUEUE').useValue({ add: jest.fn(), close: jest.fn() })
      .overrideProvider('NOTIFICATION_WORKER').useValue({ close: jest.fn(), on: jest.fn() })
      .compile();
    expect(mod.get('NOTIFICATION_ADAPTER')).toBeInstanceOf(LogAdapter);
  });

  it('NOTIF_PROVIDER=fonnte tanpa FONNTE_API_KEY → throw', async () => {
    process.env['NOTIF_PROVIDER'] = 'fonnte';
    delete process.env['FONNTE_API_KEY'];
    await expect(
      Test.createTestingModule({ imports: [NotificationModule] })
        .overrideProvider(PrismaService).useValue(buildPrismaMock() as never)
        .overrideProvider('REDIS_CONNECTION').useValue({ host: 'mock', port: 6379 })
        .overrideProvider('NOTIFICATION_QUEUE').useValue({ add: jest.fn(), close: jest.fn() })
        .overrideProvider('NOTIFICATION_WORKER').useValue({ close: jest.fn(), on: jest.fn() })
        .compile(),
    ).rejects.toThrow('FONNTE_API_KEY');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Adapters
// ════════════════════════════════════════════════════════════════════════════

describe('LogAdapter', () => {
  const adapter = new LogAdapter();

  it('send() tidak throw', async () => {
    await expect(adapter.send('whatsapp', '628xxx', 'test')).resolves.not.toThrow();
  });

  it('send() email tidak throw', async () => {
    await expect(adapter.send('email', 'a@b.com', 'test', 'Subjek')).resolves.not.toThrow();
  });
});

describe('FonnteAdapter', () => {
  it('channel email → throw', async () => {
    const adapter = new FonnteAdapter('test-key');
    await expect(adapter.send('email', 'a@b.com', 'x')).rejects.toThrow();
  });
});
