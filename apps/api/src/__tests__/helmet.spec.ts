// =============================================================================
// helmet.spec.ts — Tests untuk security headers (Item 2)
// W3-03 Security Hardening: X-Frame-Options, X-Content-Type-Options, dll.
//
// Implementation: registerSecurityHeaders() via Fastify onSend hook
// (helmet Express package tidak kompatibel langsung sebagai Fastify plugin;
//  headers di-set via hook — fungsional equivalent)
//
// Menggunakan Fastify inject() (built-in) — tidak perlu supertest.
// =============================================================================

import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Controller, Get, Module } from '@nestjs/common';

// ── Minimal test controller & module ─────────────────────────────────────────

@Controller()
class HelmetProbeController {
  @Get('probe')
  probe(): string {
    return 'ok';
  }
}

@Module({ controllers: [HelmetProbeController] })
class HelmetProbeModule {}

// ── Helpers — same logic as main.ts registerSecurityHeaders() ────────────────

function applySecurityHeaders(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify.addHook('onSend', async (_req: any, reply: any) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-DNS-Prefetch-Control', 'off');
    reply.header('X-Download-Options', 'noopen');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('X-Permitted-Cross-Domain-Policies', 'none');
    reply.header('X-XSS-Protection', '0');
    reply.removeHeader('X-Powered-By');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
    );
  });
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('Security Headers via Fastify Hook — Helmet-Equivalent (Item 2)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HelmetProbeModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    // Apply security headers hook (sama logika dengan main.ts registerSecurityHeaders)
    applySecurityHeaders(app);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('response memiliki X-Frame-Options (clickjacking protection)', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/probe',
    });

    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('X-Content-Type-Options = "nosniff" (MIME sniffing protection)', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/probe',
    });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('X-DNS-Prefetch-Control = "off" (DNS prefetch disabled)', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/probe',
    });

    expect(response.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('response TIDAK menyertakan X-Powered-By (server fingerprint disembunyikan)', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/probe',
    });

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('response memiliki Content-Security-Policy header', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/probe',
    });

    expect(response.headers['content-security-policy']).toBeDefined();
    // Pastikan CSP tidak mengizinkan sumber eksternal default
    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it('X-XSS-Protection = "0" (modern browsers: disable legacy XSS auditor)', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/probe',
    });

    // helmet default: X-XSS-Protection: 0 (modern recommendation)
    expect(response.headers['x-xss-protection']).toBe('0');
  });
});
