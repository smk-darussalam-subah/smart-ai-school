import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BellScheduleModule } from '../bell-schedule/bell-schedule.module';
import { StaffAttendanceController } from './staff-attendance.controller';
import { StaffAttendanceService } from './staff-attendance.service';
import { PermissionModule } from '../permissions/permissions.module';
@Module({
  imports: [PrismaModule, BellScheduleModule, PermissionModule],
  controllers: [StaffAttendanceController],
  providers: [StaffAttendanceService],
  exports: [StaffAttendanceService],
})
export class StaffAttendanceModule {}
