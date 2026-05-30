// =============================================================================
// app.module.ts — Root Module
// =============================================================================

import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { MetricsModule } from './metrics/metrics.module';
import { KeycloakGuard } from './auth/guards/keycloak.guard';

@Module({
  imports: [
    // Rate Limiting — 100 req per menit per IP (sesuai security checklist W3-03)
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 menit dalam ms
        limit: 100,
      },
    ]),

    // Core modules
    PrismaModule,
    AuthModule,
    HealthModule,
    MetricsModule,

    // Domain modules akan ditambahkan di Tahap 2:
    // AcademicModule, StudentModule, PpdbModule, FinanceModule, ...
  ],
  providers: [
    // Throttler aktif global — cek rate limit dulu sebelum auth
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Auth global — semua endpoint protected by default, opt-out via @Public()
    {
      provide: APP_GUARD,
      useClass: KeycloakGuard,
    },
  ],
})
export class AppModule {}
