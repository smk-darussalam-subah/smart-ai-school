import { Module } from '@nestjs/common';
import { BellScheduleModule } from '../bell-schedule/bell-schedule.module';
import { DisplayDeviceModule } from '../display-devices/display-device.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  OperationalDisplayController,
  OperationalMonitoringController,
} from './operational-monitoring.controller';
import { DisplayPlaybackLeaseService } from './display-playback-lease.service';
import { OperationalMonitoringService } from './operational-monitoring.service';
import { StaffAttendanceModule } from '../staff-attendance/staff-attendance.module';

@Module({
  imports: [PrismaModule, BellScheduleModule, DisplayDeviceModule, StaffAttendanceModule],
  controllers: [OperationalMonitoringController, OperationalDisplayController],
  providers: [OperationalMonitoringService, DisplayPlaybackLeaseService],
  exports: [OperationalMonitoringService],
})
export class OperationalMonitoringModule {}
