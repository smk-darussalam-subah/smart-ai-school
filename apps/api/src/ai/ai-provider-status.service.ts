import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { logger } from '@smk/logger';

type OpenAiCircuitReason = 'quota_exhausted';
type OpenAiCircuitState = {
  state: 'open';
  reason: OpenAiCircuitReason;
  openedAt: string;
  nextProbeAt: string;
  detailCode: string | null;
};

export type AiProviderStatus = {
  effectiveProvider: 'openai' | 'ollama';
  openaiCircuit: 'closed' | 'open' | 'half_open';
  reason: OpenAiCircuitReason | null;
  openedAt: string | null;
  nextProbeAt: string | null;
  detailCode: string | null;
  message: string;
};

const OPENAI_CIRCUIT_KEY = 'diis:ai:openai:circuit';
const OPENAI_CIRCUIT_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_PROBE_AFTER_SECONDS = 30 * 60;

@Injectable()
export class AiProviderStatusService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private memoryState: OpenAiCircuitState | null = null;

  constructor() {
    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
      this.redis = null;
      return;
    }
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 500,
    });
    this.redis.on('error', (err) => {
      logger.warn('[AiProviderStatusService] Redis unavailable for AI provider circuit', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  async shouldAttemptOpenAiProbe(): Promise<boolean> {
    const state = await this.readState();
    if (!state) return true;
    return Date.now() >= Date.parse(state.nextProbeAt);
  }

  async markOpenAiQuotaExhausted(detailCode: string | null): Promise<void> {
    const now = new Date();
    const nextProbeAt = new Date(now.getTime() + this.probeAfterSeconds() * 1000);
    await this.writeState({
      state: 'open',
      reason: 'quota_exhausted',
      openedAt: now.toISOString(),
      nextProbeAt: nextProbeAt.toISOString(),
      detailCode,
    });
  }

  async markOpenAiRecovered(): Promise<void> {
    await this.clearState();
  }

  async getStatus(): Promise<AiProviderStatus> {
    const state = await this.readState();
    if (!state) {
      return {
        effectiveProvider: 'openai',
        openaiCircuit: 'closed',
        reason: null,
        openedAt: null,
        nextProbeAt: null,
        detailCode: null,
        message: 'OpenAI aktif untuk generate non-PII.',
      };
    }

    const canProbe = Date.now() >= Date.parse(state.nextProbeAt);
    return {
      effectiveProvider: canProbe ? 'openai' : 'ollama',
      openaiCircuit: canProbe ? 'half_open' : 'open',
      reason: state.reason,
      openedAt: state.openedAt,
      nextProbeAt: state.nextProbeAt,
      detailCode: state.detailCode,
      message: canProbe
        ? 'OpenAI sedang masuk masa probe pemulihan; permintaan berikutnya akan mencoba OpenAI secara terbatas.'
        : 'OpenAI sementara dialihkan ke Ollama lokal karena kuota/kredit/batas penggunaan perlu ditangani.',
    };
  }

  private probeAfterSeconds(): number {
    const raw = Number(process.env['OPENAI_CIRCUIT_PROBE_AFTER_SECONDS'] ?? DEFAULT_PROBE_AFTER_SECONDS);
    if (!Number.isFinite(raw)) return DEFAULT_PROBE_AFTER_SECONDS;
    return Math.min(Math.max(Math.floor(raw), 60), 24 * 60 * 60);
  }

  private async readState(): Promise<OpenAiCircuitState | null> {
    const redis = await this.redisClient();
    if (!redis) return this.memoryState;
    try {
      const raw = await redis.get(OPENAI_CIRCUIT_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as OpenAiCircuitState;
    } catch (err) {
      logger.warn('[AiProviderStatusService] Falling back to memory circuit read', {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.memoryState;
    }
  }

  private async writeState(state: OpenAiCircuitState): Promise<void> {
    this.memoryState = state;
    const redis = await this.redisClient();
    if (!redis) return;
    try {
      await redis.set(OPENAI_CIRCUIT_KEY, JSON.stringify(state), 'EX', OPENAI_CIRCUIT_TTL_SECONDS);
    } catch (err) {
      logger.warn('[AiProviderStatusService] Falling back to memory circuit write', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async clearState(): Promise<void> {
    this.memoryState = null;
    const redis = await this.redisClient();
    if (!redis) return;
    try {
      await redis.del(OPENAI_CIRCUIT_KEY);
    } catch (err) {
      logger.warn('[AiProviderStatusService] Failed to clear Redis AI provider circuit', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async redisClient(): Promise<Redis | null> {
    if (!this.redis) return null;
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      return this.redis;
    } catch (err) {
      logger.warn('[AiProviderStatusService] Redis connect failed for AI provider circuit', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
