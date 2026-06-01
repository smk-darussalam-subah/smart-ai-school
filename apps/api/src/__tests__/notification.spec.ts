// =============================================================================
// notification.spec.ts — Unit tests SMA-42
//
// Skenario wajib:
//   ✓ notify() tulis pending SEBELUM adapter.send (urutan terverifikasi via mock)
//   ✓ send sukses → status 'sent', sentAt diisi
//   ✓ send gagal → status 'failed', error dicatat, TIDAK throw ke caller
//   ✓ Idempotensi: refType+refId+recipient+channel sudah sent → adapter.send TIDAK dipanggil
//   ✓ Startup retry: pending > 5 menit → dikirim ulang
//   ✓ Provider factory: NOTIF_PROVIDER unset → LogAdapter (tidak throw)
//   ✓ LogAdapter: send() tidak throw, hanya log
//   ✓ FonnteAdapter: channel bukan whatsapp → throw
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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-01T08:00:00.000Z');
const STALE = new Date('2026-06-01T07:50:00.000Z'); // 10 menit lalu = stale

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLog(overrides: Partial<{
  id: string; status: string; recipient: string; channel: string; body: string;
  subject: string | null; refType: string | null; refId: string | null; createdAt: Date;
}> = {}) {
  return {
    id: 'log-1',
    status: 'pending',
    recipient: '6281234567890',
    channel: 'whatsapp',
    body: 'Halo Dunia',
    subject: null,
    refType: null,
    refId: null,
    createdAt: NOW,
    ...overrides,
  };
}

// ── Mock PrismaService ────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    notificationLog: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

// ── Mock Adapter ──────────────────────────────────────────────────────────────

function buildAdapterMock(): jest.Mocked<NotificationAdapter> {
  return { send: jest.fn() };
}

// ── Build NotificationService ─────────────────────────────────────────────────

async function buildService(
  prismaMock: ReturnType<typeof buildPrismaMock>,
  adapterMock: NotificationAdapter,
): Promise<NotificationService> {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      NotificationService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: 'NOTIFICATION_ADAPTER', useValue: adapterMock },
    ],
  }).compile();
  return mod.get(NotificationService);
}

// =============================================================================
// TESTS
// =============================================================================

describe('NotificationService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let adapter: jest.Mocked<NotificationAdapter>;
  let service: NotificationService;

  beforeEach(async () => {
    jest.useFakeTimers({ now: NOW.getTime() });
    prisma = buildPrismaMock();
    adapter = buildAdapterMock();
    service = await buildService(prisma, adapter);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── Test 1: Tulis pending SEBELUM adapter.send ──────────────────────────────

  it('notify() tulis pending SEBELUM adapter.send', async () => {
    const callOrder: string[] = [];
    prisma.notificationLog.findFirst.mockResolvedValue(null);
    prisma.notificationLog.create.mockImplementation(async () => {
      callOrder.push('create');
      return buildLog({ id: 'log-1' });
    });
    adapter.send.mockImplementation(async () => {
      callOrder.push('send');
    });
    prisma.notificationLog.update.mockResolvedValue(buildLog({ status: 'sent' }));

    await service.notify({ channel: 'whatsapp', to: '6281234567890', body: 'test' });

    expect(callOrder).toEqual(['create', 'send']);
  });

  // ── Test 2: Send sukses → status sent ───────────────────────────────────────

  it('send sukses → status sent, sentAt diisi', async () => {
    prisma.notificationLog.findFirst.mockResolvedValue(null);
    prisma.notificationLog.create.mockResolvedValue(buildLog({ id: 'log-2' }));
    adapter.send.mockResolvedValue(undefined);
    prisma.notificationLog.update.mockResolvedValue(buildLog({ id: 'log-2', status: 'sent' }));

    await service.notify({ channel: 'whatsapp', to: '628xxx', body: 'ok' });

    expect(prisma.notificationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-2' },
        data: expect.objectContaining({ status: 'sent', sentAt: expect.any(Date) }),
      }),
    );
  });

  // ── Test 3: Send gagal → status failed, TIDAK throw ──────────────────────

  it('send gagal → status failed, error dicatat, tidak throw ke caller', async () => {
    prisma.notificationLog.findFirst.mockResolvedValue(null);
    prisma.notificationLog.create.mockResolvedValue(buildLog({ id: 'log-3' }));
    adapter.send.mockRejectedValue(new Error('Fonnte timeout'));
    prisma.notificationLog.update.mockResolvedValue(buildLog({ id: 'log-3', status: 'failed' }));

    await expect(service.notify({ channel: 'whatsapp', to: '628xxx', body: 'fail' })).resolves.not.toThrow();

    expect(prisma.notificationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-3' },
        data: expect.objectContaining({ status: 'failed', error: 'Fonnte timeout' }),
      }),
    );
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });

  // ── Test 4: Idempotensi N-9 ───────────────────────────────────────────────

  it('idempotensi: ref sudah sent → adapter.send TIDAK dipanggil', async () => {
    prisma.notificationLog.findFirst.mockResolvedValue(
      buildLog({ id: 'log-existing', status: 'sent' }),
    );

    await service.notify({
      channel: 'whatsapp',
      to: '6281234567890',
      body: 'tes',
      refType: 'grade',
      refId: 'ref-uuid-1',
    });

    expect(adapter.send).not.toHaveBeenCalled();
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
  });

  // ── Test 5: Idempotensi tidak memblokir tanpa refType ─────────────────────

  it('tanpa refType → tidak cek idempotensi, langsung kirim', async () => {
    prisma.notificationLog.create.mockResolvedValue(buildLog({ id: 'log-5' }));
    adapter.send.mockResolvedValue(undefined);
    prisma.notificationLog.update.mockResolvedValue(buildLog({ id: 'log-5', status: 'sent' }));

    await service.notify({ channel: 'whatsapp', to: '628xxx', body: 'no ref' });

    expect(prisma.notificationLog.findFirst).not.toHaveBeenCalled();
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });

  // ── Test 6: Startup retry — pending stale dikirim ulang ──────────────────

  it('onModuleInit: pending > 5 menit → dikirim ulang', async () => {
    prisma.notificationLog.findMany.mockResolvedValue([
      buildLog({ id: 'stale-1', createdAt: STALE }),
    ]);
    adapter.send.mockResolvedValue(undefined);
    prisma.notificationLog.update.mockResolvedValue(buildLog({ id: 'stale-1', status: 'sent' }));

    await service.onModuleInit();

    expect(adapter.send).toHaveBeenCalledTimes(1);
    expect(prisma.notificationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stale-1' },
        data: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });

  // ── Test 7: Startup retry — tidak ada stale → tidak kirim ────────────────

  it('onModuleInit: tidak ada stale → adapter.send tidak dipanggil', async () => {
    prisma.notificationLog.findMany.mockResolvedValue([]);

    await service.onModuleInit();

    expect(adapter.send).not.toHaveBeenCalled();
  });

  // ── Test 7b: Startup retry — tabel belum ada (P2021) → tidak crash ───────

  it('onModuleInit: DB error (tabel belum ada) → tidak throw, fail-soft', async () => {
    prisma.notificationLog.findMany.mockRejectedValue(
      Object.assign(new Error('The table `notification.notification_logs` does not exist'), {
        code: 'P2021',
      }),
    );

    await expect(service.onModuleInit()).resolves.not.toThrow();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  // ── Test 8: Startup retry dengan refType+refId tersedia ─────────────────

  it('onModuleInit: stale dengan refType/refId → retry tetap dikirim', async () => {
    prisma.notificationLog.findMany.mockResolvedValue([
      buildLog({ id: 'stale-ref', createdAt: STALE, refType: 'payment', refId: 'pay-1' }),
    ]);
    adapter.send.mockResolvedValue(undefined);
    prisma.notificationLog.update.mockResolvedValue(buildLog({ id: 'stale-ref', status: 'sent' }));

    await service.onModuleInit();

    expect(adapter.send).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// PROVIDER FACTORY — NOTIF_PROVIDER env
// =============================================================================

describe('NotificationModule factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('NOTIF_PROVIDER unset → LogAdapter (tidak throw)', async () => {
    delete process.env['NOTIF_PROVIDER'];

    const mod: TestingModule = await Test.createTestingModule({
      imports: [NotificationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(buildPrismaMock())
      .compile();

    const adapter = mod.get<NotificationAdapter>('NOTIFICATION_ADAPTER');
    expect(adapter).toBeInstanceOf(LogAdapter);
  });

  it('NOTIF_PROVIDER=log → LogAdapter', async () => {
    process.env['NOTIF_PROVIDER'] = 'log';

    const mod: TestingModule = await Test.createTestingModule({
      imports: [NotificationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(buildPrismaMock())
      .compile();

    const adapter = mod.get<NotificationAdapter>('NOTIFICATION_ADAPTER');
    expect(adapter).toBeInstanceOf(LogAdapter);
  });

  it('NOTIF_PROVIDER=fonnte tanpa FONNTE_API_KEY → throw saat compile()', async () => {
    process.env['NOTIF_PROVIDER'] = 'fonnte';
    delete process.env['FONNTE_API_KEY'];

    await expect(
      Test.createTestingModule({ imports: [NotificationModule] })
        .overrideProvider(PrismaService)
        .useValue(buildPrismaMock())
        .compile(),
    ).rejects.toThrow('FONNTE_API_KEY');
  });
});

// =============================================================================
// ADAPTERS — LogAdapter & FonnteAdapter
// =============================================================================

describe('LogAdapter', () => {
  it('send() tidak throw', async () => {
    const adapter = new LogAdapter();
    await expect(adapter.send('whatsapp', '628xxx', 'tes')).resolves.not.toThrow();
  });

  it('send() email tidak throw (LogAdapter menerima semua channel)', async () => {
    const adapter = new LogAdapter();
    await expect(adapter.send('email', 'x@y.com', 'tes', 'Subjek')).resolves.not.toThrow();
  });
});

describe('FonnteAdapter', () => {
  it('channel email → throw', async () => {
    const adapter = new FonnteAdapter('fake-key');
    await expect(adapter.send('email', 'x@y.com', 'body')).rejects.toThrow(
      'FonnteAdapter hanya mendukung channel whatsapp',
    );
  });
});
