const mockRedis = {
  status: 'wait',
  on: jest.fn(),
  connect: jest.fn(),
  set: jest.fn(),
  eval: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => mockRedis),
}));

import { DisplayPlaybackLeaseService } from '../operational-monitoring/display-playback-lease.service';

describe('DisplayPlaybackLeaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://display-proof.test:6379';
    process.env.REDIS_QUEUE_NAMESPACE = 'display-proof';
    mockRedis.status = 'wait';
    mockRedis.connect.mockImplementation(async () => {
      await Promise.resolve();
      mockRedis.status = 'ready';
    });
    mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_QUEUE_NAMESPACE;
  });

  it('shares one lazy Redis connection and grants one concurrent claim winner', async () => {
    const service = new DisplayPlaybackLeaseService();
    const claims = await Promise.all([
      service.claim('RUANG_GURU', '50000000-0000-4000-8000-000000000001'),
      service.claim('RUANG_GURU', '50000000-0000-4000-8000-000000000002'),
    ]);

    expect(mockRedis.connect).toHaveBeenCalledTimes(1);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(mockRedis.set).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
  });

  it('uses compare-and-extend and compare-and-delete fencing', async () => {
    const service = new DisplayPlaybackLeaseService();
    mockRedis.status = 'ready';
    mockRedis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(
      service.assertAndExtend(
        'RUANG_GURU',
        '50000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toBe(true);
    await expect(
      service.release(
        'RUANG_GURU',
        '50000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000099',
      ),
    ).resolves.toBe(false);
    expect(mockRedis.eval).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
  });
});
