import { Module } from '@nestjs/common';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { PermissionModule } from '../permissions/permissions.module';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { SchedulingAudit } from './scheduling-audit';
import { SchedulingImportController } from './scheduling-import.controller';

@Module({
  imports: [AcademicPeriodModule, PermissionModule],
  controllers: [SchedulingController, SchedulingImportController],
  providers: [SchedulingService, SchedulingAudit],
})
export class SchedulingModule {}
