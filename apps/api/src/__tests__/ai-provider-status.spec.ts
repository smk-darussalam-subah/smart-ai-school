jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockRedisStore = new Map<string, string>();
const mockRedisInstance = {
  status: 'wait',
  on: jest.fn(),
  connect: jest.fn().mockImplementation(async () => {
    mockRedisInstance.status = 'ready';
  }),
  get: jest.fn().mockImplementation(async (key: string) => mockRedisStore.get(key) ?? null),
  set: jest.fn().mockImplementation(async (key: string, value: string, ...args: unknown[]) => {
    if (args.includes('NX') && mockRedisStore.has(key)) return null;
    mockRedisStore.set(key, value);
    return 'OK';
  }),
  del: jest.fn().mockImplementation(async (key: string) => {
    mockRedisStore.delete(key);
  }),
  quit: jest.fn().mockResolvedValue(undefined),
};

jest.mock('ioredis', () => jest.fn(() => mockRedisInstance));

import Redis from 'ioredis';
import { AiProviderStatusService } from '../ai/ai-provider-status.service';

describe('AiProviderStatusService', () => {
  const originalEnv = process.env;
  const dateNowSpy = jest.spyOn(Date, 'now');

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisStore.clear();
    mockRedisInstance.status = 'wait';
    process.env = {
      ...originalEnv,
      REDIS_URL: 'redis://localhost:6379',
      OPENAI_CIRCUIT_PROBE_AFTER_SECONDS: '60',
      OPENAI_CIRCUIT_PROBE_LEASE_SECONDS: '60',
    };
    dateNowSpy.mockReturnValue(Date.parse('2026-08-04T01:00:00.000Z'));
  });

  afterAll(() => {
    process.env = originalEnv;
    dateNowSpy.mockRestore();
  });

  it('opens the OpenAI circuit in Redis and skips OpenAI until the probe window', async () => {
    const service = new AiProviderStatusService();

    await service.markOpenAiQuotaExhausted('project_spend_limit_exceeded');

    expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', expect.objectContaining({
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 500,
    }));
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      'diis:ai:openai:circuit',
      expect.stringContaining('project_spend_limit_exceeded'),
      'EX',
      604800,
    );
    await expect(service.shouldAttemptOpenAiProbe()).resolves.toBe(false);

    const status = await service.getStatus();
    expect(status).toMatchObject({
      effectiveProvider: 'ollama',
      openaiCircuit: 'open',
      reason: 'quota_exhausted',
      detailCode: 'project_spend_limit_exceeded',
    });
  });

  it('allows a half-open OpenAI probe after the bounded recovery window', async () => {
    const service = new AiProviderStatusService();
    mockRedisStore.set('diis:ai:openai:circuit', JSON.stringify({
      state: 'open',
      reason: 'quota_exhausted',
      openedAt: '2026-08-04T00:30:00.000Z',
      nextProbeAt: '2026-08-04T00:59:00.000Z',
      detailCode: 'organization_spend_limit_exceeded',
    }));

    await expect(service.shouldAttemptOpenAiProbe()).resolves.toBe(true);
    await expect(service.getStatus()).resolves.toMatchObject({
      effectiveProvider: 'openai',
      openaiCircuit: 'half_open',
    });
  });

  it('allows only one concurrent half-open OpenAI probe lease', async () => {
    const service = new AiProviderStatusService();
    mockRedisStore.set('diis:ai:openai:circuit', JSON.stringify({
      state: 'open',
      reason: 'quota_exhausted',
      openedAt: '2026-08-04T00:30:00.000Z',
      nextProbeAt: '2026-08-04T00:59:00.000Z',
      detailCode: 'credit_balance_exhausted',
    }));

    const [first, second] = await Promise.all([
      service.shouldAttemptOpenAiProbe(),
      service.shouldAttemptOpenAiProbe(),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect([first, second].filter((value) => !value)).toHaveLength(1);
    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      'diis:ai:openai:probe-lease',
      expect.any(String),
      'EX',
      60,
      'NX',
    );
  });

  it('throttles quota notice incidents in Redis and returns one incident id per window', async () => {
    const service = new AiProviderStatusService();

    const first = await service.claimOpenAiQuotaNoticeIncident();
    const second = await service.claimOpenAiQuotaNoticeIncident();

    expect(first).toEqual(expect.any(String));
    expect(second).toBeNull();
    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      'diis:ai:openai:quota-notice',
      first,
      'EX',
      21600,
      'NX',
    );
  });

  it('releases a failed quota notice incident only when the incident id still matches', async () => {
    const service = new AiProviderStatusService();
    const incidentId = await service.claimOpenAiQuotaNoticeIncident();
    expect(incidentId).toEqual(expect.any(String));

    await service.releaseOpenAiQuotaNoticeIncident(`${incidentId}-other`);
    expect(mockRedisStore.has('diis:ai:openai:quota-notice')).toBe(true);

    await service.releaseOpenAiQuotaNoticeIncident(incidentId as string);
    expect(mockRedisStore.has('diis:ai:openai:quota-notice')).toBe(false);
  });

  it('clears the circuit when OpenAI recovers', async () => {
    const service = new AiProviderStatusService();
    await service.markOpenAiQuotaExhausted('insufficient_quota');

    await service.markOpenAiRecovered();

    expect(mockRedisInstance.del).toHaveBeenCalledWith('diis:ai:openai:circuit');
    await expect(service.getStatus()).resolves.toMatchObject({
      effectiveProvider: 'openai',
      openaiCircuit: 'closed',
    });
  });
});
