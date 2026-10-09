import { Module } from '@nestjs/common';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { PermissionModule } from '../permissions/permissions.module';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { SchedulingAudit } from './scheduling-audit';

@Module({
  imports: [AcademicPeriodModule, PermissionModule],
  controllers: [SchedulingController],
  providers: [SchedulingService, SchedulingAudit],
})
export class SchedulingModule {}
