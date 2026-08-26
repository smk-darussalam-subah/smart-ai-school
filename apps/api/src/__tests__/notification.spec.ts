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
import { LogAdapter } from '../notification/adapters/log.adapter';
import { FonnteAdapter } from '../notification/adapters/fonnte.adapter';
import { buildNotificationQueueOptions, resolveNotificationQueuePrefix } from '../notification/queue.config';
import {
  buildNotificationWorkerOptions,
  resolvePendingNotificationIntent,
} from '../notification/notification-worker';

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

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('notify() tulis pending lalu queue.add()', async () => {
    await service.notify({ channel: 'whatsapp', to: '6281234567890', body: 'test' });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
    );
    expect(queue.add).toHaveBeenCalledWith('whatsapp', expect.objectContaining({ logId: 'log-1' }), expect.any(Object));
  });

  it('idempotensi: ref sudah sent → skip', async () => {
    prisma.notificationLog.findFirst.mockResolvedValueOnce({ id: 'existing', status: 'sent' });

    await service.notify({ channel: 'whatsapp', to: '628xxx', body: 'x', refType: 'grade', refId: 'g-1' });

    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.notificationLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['pending', 'sent'] } }),
    }));
  });

  it('idempotensi: ref pending -> requeue job agar outbox tidak false-success', async () => {
    prisma.notificationLog.findFirst.mockResolvedValueOnce({
      id: 'existing-pending',
      status: 'pending',
      channel: 'whatsapp',
      recipient: '628xxx',
      body: 'x',
      subject: null,
    });

    await service.notify({ channel: 'whatsapp', to: '628xxx', body: 'x', refType: 'grade', refId: 'g-1' });

    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      'whatsapp',
      expect.objectContaining({ logId: 'existing-pending' }),
      { jobId: 'existing-pending' },
    );
  });

  it('tanpa refType → tidak cek idempotensi, langsung queue', async () => {
    await service.notify({ channel: 'whatsapp', to: '628xxx', body: 'x' });

    expect(prisma.notificationLog.findFirst).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('tanpa queue -> throw agar outbox bisa retry', async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [NotificationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = mod.get(NotificationService);
    await expect(svc.notify({ channel: 'whatsapp', to: '628xxx', body: 'x' })).rejects.toThrow('Notification queue not initialized');
  });

  it('queue.add gagal -> row tetap pending dan error dilempar agar outbox retry', async () => {
    queue.add.mockRejectedValueOnce(new Error('redis down'));

    await expect(service.notify({ channel: 'whatsapp', to: '628xxx', body: 'x' })).rejects.toThrow('redis down');

    expect(prisma.notificationLog.update).not.toHaveBeenCalled();
  });

  it('enqueueCommittedPendingLogs queues pending committed rows with stable jobId', async () => {
    prisma.notificationLog.findMany.mockResolvedValueOnce([
      { id: 'committed-1', channel: 'whatsapp', recipient: '628xxx', body: 'x', subject: null },
    ]);

    const result = await service.enqueueCommittedPendingLogs(['committed-1', 'committed-1']);

    expect(result).toEqual({ queuedCount: 1 });
    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['committed-1'] }, status: 'pending' },
    }));
    expect(queue.add).toHaveBeenCalledWith(
      'whatsapp',
      expect.objectContaining({ logId: 'committed-1' }),
      { jobId: 'committed-1' },
    );
  });

  it('enqueueCommittedPendingLogs keeps committed rows pending when queue is unavailable', async () => {
    prisma.notificationLog.findMany.mockResolvedValueOnce([
      { id: 'committed-1', channel: 'whatsapp', recipient: '628xxx', body: 'x', subject: null },
    ]);
    queue.add.mockRejectedValueOnce(new Error('redis down'));

    await expect(service.enqueueCommittedPendingLogs(['committed-1'])).rejects.toThrow('redis down');

    expect(prisma.notificationLog.update).not.toHaveBeenCalled();
  });

  it('idempotensi race: unique conflict ref pending -> refetch dan requeue row pemenang', async () => {
    prisma.notificationLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'winner-pending',
        status: 'pending',
        channel: 'whatsapp',
        recipient: '628xxx',
        body: 'x',
        subject: null,
      });
    prisma.notificationLog.create.mockRejectedValueOnce({ code: 'P2002' });

    await service.notify({ channel: 'whatsapp', to: '628xxx', body: 'x', refType: 'grade', refId: '00000000-0000-4000-8000-000000000001' });

    expect(queue.add).toHaveBeenCalledWith(
      'whatsapp',
      expect.objectContaining({ logId: 'winner-pending' }),
      { jobId: 'winner-pending' },
    );
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

describe('Notification worker authoritative intent', () => {
  it('skips a stale queued job after its durable intent is no longer pending', async () => {
    const prisma = {
      notificationLog: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'failed',
          channel: 'push',
          recipient: 'old-teacher',
          body: 'stale',
          subject: null,
        }),
      },
    };
    await expect(resolvePendingNotificationIntent(
      prisma as unknown as PrismaService,
      'stale-job',
    )).resolves.toBeNull();
  });

  it('uses the current pending row instead of stale payload fields from BullMQ', async () => {
    const authoritative = {
      status: 'pending',
      channel: 'push',
      recipient: 'replacement-teacher',
      body: 'current',
      subject: 'Konfirmasi sesi',
    };
    const prisma = {
      notificationLog: { findUnique: jest.fn().mockResolvedValue(authoritative) },
    };
    await expect(resolvePendingNotificationIntent(
      prisma as unknown as PrismaService,
      'current-job',
    )).resolves.toEqual(authoritative);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NotificationModule factory
// ════════════════════════════════════════════════════════════════════════════

describe('Notification BullMQ namespace', () => {
  it('membangun prefix terisolasi per environment eksplisit', () => {
    const prodPrefix = resolveNotificationQueuePrefix('production', 'production');
    const stagingPrefix = resolveNotificationQueuePrefix('staging', 'production');

    expect(prodPrefix).toBe('diis:production:bull');
    expect(stagingPrefix).toBe('diis:staging:bull');
    expect(prodPrefix).not.toBe(stagingPrefix);
  });

  it('fail-fast saat production tidak memiliki REDIS_QUEUE_NAMESPACE', () => {
    expect(() => resolveNotificationQueuePrefix('', 'production')).toThrow('REDIS_QUEUE_NAMESPACE');
    expect(() => resolveNotificationQueuePrefix('   ', 'production')).toThrow('REDIS_QUEUE_NAMESPACE');
  });

  it('test/dev memakai default lokal yang aman dan tervalidasi', () => {
    expect(resolveNotificationQueuePrefix(undefined, 'test')).toBe('diis:local:bull');
    expect(() => resolveNotificationQueuePrefix('Staging Prod', 'production')).toThrow('REDIS_QUEUE_NAMESPACE');
  });

  it('Queue dan Worker memakai prefix yang sama dalam satu environment', () => {
    const connection = { host: 'redis', port: 6379 };
    const prefix = resolveNotificationQueuePrefix('staging', 'production');

    expect(buildNotificationQueueOptions(connection, prefix).prefix).toBe('diis:staging:bull');
    expect(buildNotificationWorkerOptions(connection, prefix).prefix).toBe('diis:staging:bull');
  });
});

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
