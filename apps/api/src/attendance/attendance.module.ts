import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { PermissionModule } from '../permissions/permissions.module';
import { NotificationModule } from '../notification/notification.module';
import { StudentSessionAttendanceService } from './student-session-attendance.service';
import { StudentSessionAttendanceController } from './student-session-attendance.controller';
import { StudentSessionAttendanceReadService } from './student-session-attendance-read.service';
import { AttendanceRecapController } from './attendance-recap.controller';
import { AttendanceRecapService } from './attendance-recap.service';

@Module({
  imports: [AcademicPeriodModule, PermissionModule, NotificationModule],
  controllers: [
    AttendanceController,
    StudentSessionAttendanceController,
    AttendanceRecapController,
  ],
  providers: [
    AttendanceService,
    StudentSessionAttendanceService,
    StudentSessionAttendanceReadService,
    AttendanceRecapService,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
