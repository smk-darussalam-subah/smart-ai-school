import { Module } from '@nestjs/common';
import { PermissionModule } from '../permissions/permissions.module';
import { AppointmentAutomationGuard } from './appointment-automation.guard';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [PermissionModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentAutomationGuard],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
