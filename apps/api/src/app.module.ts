// =============================================================================
// app.module.ts — Root Module
// Guard urutan (per sprint-plan §4): ThrottlerGuard → KeycloakGuard → RolesGuard
// =============================================================================

import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { MetricsModule } from './metrics/metrics.module';
import { StudentModule } from './student/student.module';
import { PpdbModule } from './ppdb/ppdb.module';
import { TeachingAssignmentModule } from './teaching-assignment/teaching-assignment.module';
import { GradeModule } from './grade/grade.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ScheduleModule } from './schedule/schedule.module';
import { NotificationModule } from './notification/notification.module';
import { FinanceModule } from './finance/finance.module';
import { RagModule } from './rag/rag.module';
import { AiModule } from './ai/ai.module';
import { KeycloakGuard } from './auth/guards/keycloak.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { SchoolConfigModule } from './school-config/school-config.module';

@Module({
  imports: [
    // Rate Limiting — 100 req per menit per IP (sesuai security checklist W3-03)
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 menit dalam ms
        limit: 100,
      },
      // Named throttler untuk AI chat — lebih ketat karena setiap request ke Ollama mahal
      {
        name: 'aichat',
        ttl: 60_000,
        limit: 20,
      },
    ]),

    // Event bus in-process — listener dipanggil via @OnEvent(), emit = fire-and-forget
    // Global by default — EventEmitter2 tersedia di semua module tanpa import eksplisit
    // ignoreErrors: true = kegagalan listener tidak crash proses (fail-soft guardrail §5)
    EventEmitterModule.forRoot({ ignoreErrors: true }),

    // Core modules
    PrismaModule,
    AuthModule,
    HealthModule,
    MetricsModule,

    // Domain modules Sprint 1 + 2
    StudentModule,
    PpdbModule,
    TeachingAssignmentModule,
    GradeModule,
    AttendanceModule,
    ScheduleModule,

    // Domain modules Sprint 3
    NotificationModule,
    FinanceModule,
    RagModule,
    AiModule,

    // Tahap 2B-3 — School Profile & Config
    SchoolConfigModule,
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
