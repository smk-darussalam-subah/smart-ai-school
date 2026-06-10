// =============================================================================
// app.module.ts — Root Module
// Guard urutan: ThrottlerGuard → KeycloakGuard → PermissionGuard → RolesGuard
// =============================================================================

import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { PermissionModule } from './permissions/permissions.module';
import { PermissionGuard } from './permissions/permissions.guard';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuditInterceptor } from './audit-log/interceptors/audit.interceptor';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 100 },
      { name: 'aichat', ttl: 60_000, limit: 20 },
    ]),
    EventEmitterModule.forRoot({ ignoreErrors: true }),
    PrismaModule,
    AuthModule,
    HealthModule,
    MetricsModule,
    StudentModule,
    PpdbModule,
    TeachingAssignmentModule,
    GradeModule,
    AttendanceModule,
    ScheduleModule,
    NotificationModule,
    FinanceModule,
    RagModule,
    AiModule,
    AuditLogModule,
    PermissionModule,
    UsersModule,
    SchoolConfigModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: KeycloakGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
