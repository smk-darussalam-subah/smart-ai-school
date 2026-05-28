// =============================================================================
// main.ts — Bootstrap NestJS API
// Smart AI School — SMK Darussalam Subah
// =============================================================================

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { logger } from '@smk/logger';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // ── Security ────────────────────────────────────────────────────────────────
  await app.register(helmet as any);

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ── Global Filters, Interceptors ────────────────────────────────────────────
  // Validation: per-endpoint via @Body(new ZodPipe(schema)) — tidak ada global pipe
  // karena Zod schema harus dideklarasikan per-endpoint. Lihat CLAUDE.md section 5.
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── API Prefix ──────────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  const port = process.env.API_PORT || 3001;
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
