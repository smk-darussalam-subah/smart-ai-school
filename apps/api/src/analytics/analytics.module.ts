import { Module } from '@nestjs/common';
import { SchoolConfigModule } from '../school-config/school-config.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { StudentAnalyticsService } from './analytics.service';
import { StaffAttendanceModule } from '../staff-attendance/staff-attendance.module';
import { PermissionModule } from '../permissions/permissions.module';

@Module({
  imports: [SchoolConfigModule, StaffAttendanceModule, PermissionModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, StudentAnalyticsService],
})
export class AnalyticsModule {}
