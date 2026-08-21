import { Module } from '@nestjs/common';
import { SchoolConfigController } from './school-config.controller';
import { SchoolConfigService } from './school-config.service';
import { PermissionModule } from '../permissions/permissions.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';

@Module({
  imports: [PermissionModule, AppointmentsModule, AcademicPeriodModule],  // TF2 cleanup + appointment cutover
  controllers: [SchoolConfigController],
  providers: [SchoolConfigService],
  exports: [SchoolConfigService],
})
export class SchoolConfigModule {}
