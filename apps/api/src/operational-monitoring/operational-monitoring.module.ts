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

@Module({
  imports: [PrismaModule, BellScheduleModule, DisplayDeviceModule],
  controllers: [OperationalMonitoringController, OperationalDisplayController],
  providers: [OperationalMonitoringService, DisplayPlaybackLeaseService],
  exports: [OperationalMonitoringService],
})
export class OperationalMonitoringModule {}
