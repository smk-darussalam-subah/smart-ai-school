import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { PermissionModule } from '../permissions/permissions.module';
import { NotificationModule } from '../notification/notification.module';
import { StudentSessionAttendanceService } from './student-session-attendance.service';
import { StudentSessionAttendanceController } from './student-session-attendance.controller';
import { StudentSessionAttendanceReadService } from './student-session-attendance-read.service';

@Module({
  imports: [AcademicPeriodModule, PermissionModule, NotificationModule],
  controllers: [AttendanceController, StudentSessionAttendanceController],
  providers: [
    AttendanceService,
    StudentSessionAttendanceService,
    StudentSessionAttendanceReadService,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
