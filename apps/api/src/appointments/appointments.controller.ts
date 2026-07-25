import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentEndSchema,
  AppointmentDecisionSchema,
  AppointmentListQuerySchema,
  AppointmentSuspendSchema,
  AppointmentSupersedeSchema,
  CreateAppointmentSchema,
} from './dto/appointment.dto';
import type {
  AppointmentEndDto,
  AppointmentDecisionDto,
  AppointmentSuspendDto,
  AppointmentSupersedeDto,
  CreateAppointmentDto,
} from './dto/appointment.dto';

@Controller('appointments')
@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@Query() rawQuery: unknown) {
    const parsed = AppointmentListQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.appointments.list(parsed.data);
  }

  @Post()
  createDraft(
    @Body(ZodPipe(CreateAppointmentSchema)) dto: CreateAppointmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.createDraft(dto, actor);
  }

  @Patch(':id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.appointments.submit(id, actor);
  }

  @Patch(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentDecisionSchema)) dto: AppointmentDecisionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.approve(id, dto, actor);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentDecisionSchema)) dto: AppointmentDecisionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.reject(id, dto, actor);
  }

  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.appointments.cancel(id, actor);
  }

  @Patch(':id/suspend')
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentSuspendSchema)) dto: AppointmentSuspendDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.suspend(id, dto, actor);
  }

  @Patch(':id/resume')
  resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.appointments.resume(id, actor);
  }

  @Patch(':id/end')
  end(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentEndSchema)) dto: AppointmentEndDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.end(id, dto, actor);
  }

  @Patch(':id/supersede')
  supersede(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentSupersedeSchema)) dto: AppointmentSupersedeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.supersede(id, dto, actor);
  }
}
