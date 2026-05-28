// =============================================================================
// throttler.spec.ts — Unit tests untuk ThrottlerGuard (Item 1)
// W3-03 Security Hardening: rate limiting 100 req/menit per IP
//
// Strategi: direct instantiation + onModuleInit() agar lifecycle hooks berjalan
// tanpa ketergantungan pada NestJS DI context (lebih cepat, tidak butuh storage token).
// =============================================================================

import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerException,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Buat ExecutionContext minimal untuk ThrottlerGuard.
 * Guard membutuhkan: req.ip, res.header untuk setHeaders
 */
function buildMockContext(ip = '127.0.0.1'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip, ips: [], headers: {} }),
      getResponse: () => ({ header: jest.fn() }),
    }),
    getClass: () => jest.fn(),
    getHandler: () => jest.fn(),
  } as unknown as ExecutionContext;
}

/**
 * Buat mock ThrottlerStorage.
 * @param isBlocked - true = simulasi limit terlampaui
 * @param totalHits - jumlah hit yang dikembalikan storage
 */
function createMockStorage(isBlocked: boolean, totalHits: number): ThrottlerStorage {
  return {
    increment: jest.fn().mockResolvedValue({
      totalHits,
      isBlocked,
      timeToExpire: 60_000,
      timeToBlockExpire: isBlocked ? 60_000 : 0,
    }),
  };
}

/**
 * Buat ThrottlerGuard dengan direct instantiation.
 * Setelah dibuat, panggil onModuleInit() agar this.throttlers terisi.
 */
async function createGuard(storage: ThrottlerStorage): Promise<ThrottlerGuard> {
  const options = [{ ttl: 60_000, limit: 100 }];
  // Langsung instantiate guard tanpa NestJS DI untuk menghindari
  // overhead TestingModule dan lifecycle hook yang tidak terpanggil otomatis.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guard = new ThrottlerGuard(options as any, storage, new Reflector());
  // Jalankan lifecycle hook onModuleInit() — ini yang set this.throttlers
  await guard.onModuleInit();
  return guard;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ThrottlerGuard — Rate Limiting 100 req/menit (Item 1)', () => {

  describe('ThrottlerException', () => {
    it('memiliki HTTP status 429 (Too Many Requests)', () => {
      const ex = new ThrottlerException();
      expect(ex.getStatus()).toBe(429);
    });

    it('pesan default tersedia dan tidak kosong', () => {
      const ex = new ThrottlerException();
      expect(ex.message).toBeDefined();
      expect(ex.message.length).toBeGreaterThan(0);
    });

    it('adalah instance dari Error', () => {
      expect(new ThrottlerException()).toBeInstanceOf(Error);
    });
  });

  describe('ThrottlerModule konfigurasi', () => {
    it('forRoot dengan ttl=60_000ms dan limit=100 ter-compile tanpa error', async () => {
      const module = await Test.createTestingModule({
        imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      }).compile();

      expect(module).toBeDefined();
      await module.close();
    });
  });

  describe('canActivate — perilaku rate limit', () => {
    it('request normal (di bawah limit, isBlocked=false) → returns true', async () => {
      const storage = createMockStorage(false, 1);
      const guard = await createGuard(storage);
      const ctx = buildMockContext();

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('storage.increment dipanggil saat canActivate berjalan', async () => {
      const storage = createMockStorage(false, 1);
      const guard = await createGuard(storage);

      await guard.canActivate(buildMockContext());

      expect((storage.increment as jest.Mock)).toHaveBeenCalledTimes(1);
    });

    it('req ke-101 (limit terlampaui, isBlocked=true) → ThrottlerException dilempar', async () => {
      const storage = createMockStorage(true, 101);
      const guard = await createGuard(storage);
      const ctx = buildMockContext();

      await expect(guard.canActivate(ctx)).rejects.toThrow(ThrottlerException);
    });

    it('ThrottlerException dari canActivate memiliki status 429', async () => {
      const storage = createMockStorage(true, 101);
      const guard = await createGuard(storage);
      const ctx = buildMockContext();

      try {
        await guard.canActivate(ctx);
        fail('Seharusnya melempar ThrottlerException');
      } catch (err) {
        expect(err).toBeInstanceOf(ThrottlerException);
        expect((err as ThrottlerException).getStatus()).toBe(429);
      }
    });

    it('IP yang berbeda → storage dipanggil dengan key berbeda (per-IP counter)', async () => {
      const storage = createMockStorage(false, 1);
      const guard = await createGuard(storage);

      await guard.canActivate(buildMockContext('192.168.1.1'));
      await guard.canActivate(buildMockContext('192.168.1.2'));

      expect((storage.increment as jest.Mock)).toHaveBeenCalledTimes(2);
      const keys = (storage.increment as jest.Mock).mock.calls.map(
        (call: unknown[]) => call[0] as string,
      );
      // Key berbeda karena IP berbeda
      expect(keys[0]).not.toBe(keys[1]);
    });
  });
});
