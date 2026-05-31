// =============================================================================
// prisma.spec.ts — Unit tests PrismaService lifecycle hooks
// Verifikasi onModuleInit ($connect) dan onModuleDestroy ($disconnect)
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PrismaService } from '../prisma/prisma.service';

describe('PrismaService — lifecycle hooks', () => {
  let service: PrismaService;

  beforeAll(() => {
    // PrismaClient constructor membutuhkan DATABASE_URL tersedia di env
    process.env.DATABASE_URL =
      process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
  });

  beforeEach(() => {
    service = new PrismaService();
    jest.clearAllMocks();
  });

  it('onModuleInit — memanggil $connect', async () => {
    const connectSpy = jest.fn().mockResolvedValue(undefined);
    (service as unknown as Record<string, unknown>)['$connect'] = connectSpy;

    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy — memanggil $disconnect', async () => {
    const disconnectSpy = jest.fn().mockResolvedValue(undefined);
    (service as unknown as Record<string, unknown>)['$disconnect'] = disconnectSpy;

    await service.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
