import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';

@Module({
  imports: [AcademicPeriodModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
