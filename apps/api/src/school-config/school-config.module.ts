import { Module } from '@nestjs/common';
import { SchoolConfigController } from './school-config.controller';
import { SchoolConfigService } from './school-config.service';
import { PermissionModule } from '../permissions/permissions.module';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [PermissionModule, AppointmentsModule],  // TF2 cleanup + appointment cutover
  controllers: [SchoolConfigController],
  providers: [SchoolConfigService],
  exports: [SchoolConfigService],
})
export class SchoolConfigModule {}
