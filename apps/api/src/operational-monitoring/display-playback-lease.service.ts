import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const PLAYBACK_LEASE_MS = 45_000;
const COMPARE_AND_DELETE =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
const COMPARE_AND_EXTEND =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

export type DisplayPlaybackClaim = {
  token: string;
  expiresAt: string;
};

@Injectable()
export class DisplayPlaybackLeaseService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly keyPrefix: string;
  private connectPromise: Promise<void> | null = null;

  constructor() {
    const namespace = process.env['REDIS_QUEUE_NAMESPACE']?.trim() || 'local';
    this.keyPrefix = `diis:${namespace}:display:playback`;
    const redisUrl = process.env['REDIS_URL']?.trim();
    this.redis = redisUrl
      ? new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 500,
        })
      : null;
    this.redis?.on('error', () => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  async claim(scope: string, deliveryId: string): Promise<DisplayPlaybackClaim | null> {
    const redis = await this.client();
    const token = randomUUID();
    const result = await redis.set(
      this.key(scope),
      this.value(deliveryId, token),
      'PX',
      PLAYBACK_LEASE_MS,
      'NX',
    );
    if (result !== 'OK') return null;
    return {
      token,
      expiresAt: new Date(Date.now() + PLAYBACK_LEASE_MS).toISOString(),
    };
  }

  async assertAndExtend(scope: string, deliveryId: string, token: string): Promise<boolean> {
    const redis = await this.client();
    const result = await redis.eval(
      COMPARE_AND_EXTEND,
      1,
      this.key(scope),
      this.value(deliveryId, token),
      PLAYBACK_LEASE_MS,
    );
    return Number(result) === 1;
  }

  async release(scope: string, deliveryId: string, token: string): Promise<boolean> {
    const redis = await this.client();
    const result = await redis.eval(
      COMPARE_AND_DELETE,
      1,
      this.key(scope),
      this.value(deliveryId, token),
    );
    return Number(result) === 1;
  }

  private async client(): Promise<Redis> {
    if (!this.redis) {
      throw new ServiceUnavailableException('Koordinasi audio display belum tersedia');
    }
    try {
      if (this.redis.status === 'wait') {
        if (!this.connectPromise) {
          this.connectPromise = this.redis
            .connect()
            .then(() => undefined)
            .finally(() => {
              this.connectPromise = null;
            });
        }
        await this.connectPromise;
      } else if (this.redis.status === 'connecting' && this.connectPromise) {
        await this.connectPromise;
      }
      if (this.redis.status !== 'ready') {
        throw new Error('Redis playback lease is not ready');
      }
      return this.redis;
    } catch {
      throw new ServiceUnavailableException('Koordinasi audio display belum tersedia');
    }
  }

  private key(scope: string): string {
    return `${this.keyPrefix}:${scope.toLowerCase()}`;
  }

  private value(deliveryId: string, token: string): string {
    return `${deliveryId}:${token}`;
  }
}
