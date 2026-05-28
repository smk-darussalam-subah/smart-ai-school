// =============================================================================
// cors.spec.ts — Tests untuk CORS policy (Item 3)
// W3-03 Security Hardening: only allowed origins receive CORS headers
//
// Security model:
// - Allowed origins → Access-Control-Allow-Origin di-set → browser izinkan request
// - Blocked origins → Access-Control-Allow-Origin TIDAK di-set → browser blokir request
//
// Menggunakan Fastify inject() (built-in) — tidak perlu supertest.
// =============================================================================

import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Controller, Get, Module } from '@nestjs/common';

// ── Minimal test controller & module ─────────────────────────────────────────

@Controller()
class CorsProbeController {
  @Get('probe')
  probe(): string {
    return 'ok';
  }
}

@Module({ controllers: [CorsProbeController] })
class CorsProbeModule {}

// ── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = 'http://localhost:3000';
const BLOCKED_ORIGIN = 'http://evil-site.com';

// ── Test suite ───────────────────────────────────────────────────────────────

describe('CORS Policy — Origin Validation (Item 3)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CorsProbeModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    // enableCors sama persis dengan main.ts
    app.enableCors({
      origin: [ALLOWED_ORIGIN],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('origin yang diizinkan', () => {
    it('request dari origin diizinkan → Access-Control-Allow-Origin = allowed origin', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: '/probe',
        headers: { origin: ALLOWED_ORIGIN },
      });

      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('request dari origin diizinkan dengan credentials → Access-Control-Allow-Credentials = "true"', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: '/probe',
        headers: { origin: ALLOWED_ORIGIN },
      });

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('request tanpa Origin header → tidak ada Access-Control-Allow-Origin (non cross-origin request)', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: '/probe',
        // Tidak ada header origin — ini same-origin atau server-side request
      });

      // Tanpa origin header = bukan cross-origin request, tidak perlu CORS headers
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('origin yang tidak diizinkan', () => {
    it('request dari origin tidak diizinkan → Access-Control-Allow-Origin TIDAK di-set ke evil origin', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: '/probe',
        headers: { origin: BLOCKED_ORIGIN },
      });

      // Access-Control-Allow-Origin tidak boleh di-set ke evil origin.
      // Browser akan memblokir response ini karena origin tidak match.
      // (Catatan: credentials header mungkin masih ada — tidak berbahaya
      //  karena ACAO header-lah yang menjadi gatekeeper utama browser)
      expect(response.headers['access-control-allow-origin']).not.toBe(BLOCKED_ORIGIN);
    });

    it('browser akan memblokir evil origin — tidak ada ACAO header yang mengizinkan', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url: '/probe',
        headers: { origin: BLOCKED_ORIGIN },
      });

      const acao = response.headers['access-control-allow-origin'];
      // ACAO harus undefined atau tidak sama dengan evil origin
      expect(acao === undefined || acao !== BLOCKED_ORIGIN).toBe(true);
    });
  });

  describe('preflight request (OPTIONS)', () => {
    it('OPTIONS dari origin diizinkan → response CORS headers dan status < 300', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'OPTIONS',
        url: '/probe',
        headers: {
          origin: ALLOWED_ORIGIN,
          'access-control-request-method': 'POST',
        },
      });

      expect(response.statusCode).toBeLessThan(300);
      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });
  });
});
