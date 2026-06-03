// =============================================================================
// main.ts — Bootstrap NestJS API
// Smart AI School — SMK Darussalam Subah
// =============================================================================

// HARUS baris pertama — Sentry instrumentation wajib hook sebelum import lain
import './instrument';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { validateEnv } from './config/env.validation';
import { logger } from '@smk/logger';

/**
 * Mendaftarkan security headers via Fastify onSend hook.
 * Fungsional equivalent dari helmet.js untuk Fastify (W3-03 Item 2).
 *
 * @fastify/helmet tidak tersedia sebagai dependensi, jadi headers di-set
 * langsung via hook. Headers ini sesuai dengan helmet v8 defaults.
 */
function registerSecurityHeaders(app: NestFastifyApplication): void {
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
      [
        "default-src 'self'",
        "base-uri 'self'",
        "font-src 'self' https: data:",
        "form-action 'self'",
        "frame-ancestors 'self'",
        "img-src 'self' data:",
        "object-src 'none'",
        "script-src 'self'",
        "script-src-attr 'none'",
        "style-src 'self' https: 'unsafe-inline'",
        'upgrade-insecure-requests',
      ].join('; '),
    );
  });
}

async function bootstrap() {
  // ── Fail-fast env validation (Item 12 — W3-03 Security Hardening) ──────────
  // Jika env var wajib kosong/invalid, process.exit(1) sebelum NestJS start.
  // Ini mencegah API berjalan dalam state broken dan crash saat first request.
  const env = validateEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // ── Security ────────────────────────────────────────────────────────────────
  // Security headers via Fastify onSend hook (helmet-equivalent untuk Fastify)
  registerSecurityHeaders(app);

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ── Global Filters, Interceptors ────────────────────────────────────────────
  // Validation: per-endpoint via @Body(new ZodPipe(schema)) — tidak ada global pipe
  // karena Zod schema harus dideklarasikan per-endpoint. Lihat CLAUDE.md section 5.
  // Urutan: HttpExceptionFilter dulu, lalu PrismaExceptionFilter.
  // NestJS evaluasi filter dari belakang, jadi PrismaExceptionFilter (spesifik)
  // dicek lebih dulu sebelum HttpExceptionFilter (catch-all).
  app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── API Prefix ──────────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    // 'health'  → GET /health (tidak pakai prefix, diakses oleh load balancer & n8n)
    // 'metrics' → GET /metrics (tidak pakai prefix, diakses oleh Prometheus scraper)
    exclude: ['health', 'metrics'],
  });

  const port = env.API_PORT || 3001;
  const host = '0.0.0.0';

  await app.listen(port, host);

  logger.info(`🚀 API running on http://localhost:${port}`, {
    service: 'smk-api',
    env: process.env.NODE_ENV || 'development',
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
