import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { BellScheduleModule } from '../bell-schedule/bell-schedule.module';
import { PermissionModule } from '../permissions/permissions.module';

@Module({
  imports: [AcademicPeriodModule, BellScheduleModule, PermissionModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
