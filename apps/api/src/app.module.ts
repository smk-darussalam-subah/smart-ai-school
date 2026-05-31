// =============================================================================
// app.module.ts — Root Module
// =============================================================================

// =============================================================================
// app.module.ts — Root Module
// Guard urutan (per sprint-plan §4): ThrottlerGuard → KeycloakGuard → RolesGuard
// =============================================================================

import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { MetricsModule } from './metrics/metrics.module';
import { StudentModule } from './student/student.module';
import { PpdbModule } from './ppdb/ppdb.module';
import { KeycloakGuard } from './auth/guards/keycloak.guard';
import { RolesGuard } from './auth/guards/roles.guard';

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

    // Domain modules Sprint 1
    StudentModule,
    PpdbModule,
    // AcademicModule (SMA-36), FinanceModule (SMA-41), ...
  ],
  providers: [
    // 1. Throttler aktif global — cek rate limit sebelum auth
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // 2. Auth global — semua endpoint protected by default, opt-out via @Public()
    {
      provide: APP_GUARD,
      useClass: KeycloakGuard,
    },
    // 3. Roles global — cek @Roles() metadata setelah auth berhasil
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
