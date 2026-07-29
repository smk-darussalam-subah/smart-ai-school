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
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { AppointmentAutomationGuard } from './appointment-automation.guard';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentCandidateQuerySchema,
  AppointmentEndSchema,
  AppointmentDecisionSchema,
  AppointmentListQuerySchema,
  AppointmentPermissionPreviewQuerySchema,
  AppointmentSuspendSchema,
  AppointmentSupersedeSchema,
  CreateAppointmentSchema,
} from './dto/appointment.dto';
import type {
  AppointmentCandidateQueryDto,
  AppointmentEndDto,
  AppointmentDecisionDto,
  AppointmentPermissionPreviewQueryDto,
  AppointmentSuspendDto,
  AppointmentSupersedeDto,
  CreateAppointmentDto,
} from './dto/appointment.dto';

@Controller('appointments')
@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@Query() rawQuery: unknown, @CurrentUser() actor: AuthUser) {
    const parsed = AppointmentListQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.appointments.list(parsed.data, actor);
  }

  @Get('candidates')
  candidates(@Query() rawQuery: unknown) {
    const parsed = AppointmentCandidateQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.appointments.listEligibleCandidates(parsed.data as AppointmentCandidateQueryDto);
  }

  @Get('position-capabilities')
  positionCapabilities(@CurrentUser() actor: AuthUser) {
    return this.appointments.getPositionCapabilities(actor);
  }

  @Get('positions/:positionId/preview')
  permissionPreview(
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Query() rawQuery: unknown,
  ) {
    const parsed = AppointmentPermissionPreviewQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.appointments.getPositionPreview(
      positionId,
      parsed.data as AppointmentPermissionPreviewQueryDto,
    );
  }

  @Post('activate-due')
  @Public()
  @UseGuards(AppointmentAutomationGuard)
  activateDue() {
    return this.appointments.activateDueAppointments();
  }

  @Post()
  @Audit({ action: 'appointment.createDraft', resourceType: 'appointment', captureBody: false })
  createDraft(
    @Body(ZodPipe(CreateAppointmentSchema)) dto: CreateAppointmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.createDraft(dto, actor);
  }

  @Patch(':id/submit')
  @Audit({ action: 'appointment.submit', resourceType: 'appointment', captureBody: false })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.appointments.submit(id, actor);
  }

  @Patch(':id/approve')
  @Audit({ action: 'appointment.approve', resourceType: 'appointment', captureBody: false })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentDecisionSchema)) dto: AppointmentDecisionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.approve(id, dto, actor);
  }

  @Patch(':id/reject')
  @Audit({ action: 'appointment.reject', resourceType: 'appointment', captureBody: false })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentDecisionSchema)) dto: AppointmentDecisionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.reject(id, dto, actor);
  }

  @Patch(':id/cancel')
  @Audit({ action: 'appointment.cancel', resourceType: 'appointment', captureBody: false })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.appointments.cancel(id, actor);
  }

  @Patch(':id/suspend')
  @Audit({ action: 'appointment.suspend', resourceType: 'appointment', captureBody: false })
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentSuspendSchema)) dto: AppointmentSuspendDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.suspend(id, dto, actor);
  }

  @Patch(':id/resume')
  @Audit({ action: 'appointment.resume', resourceType: 'appointment', captureBody: false })
  resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.appointments.resume(id, actor);
  }

  @Patch(':id/end')
  @Audit({ action: 'appointment.end', resourceType: 'appointment', captureBody: false })
  end(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentEndSchema)) dto: AppointmentEndDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.end(id, dto, actor);
  }

  @Patch(':id/supersede')
  @Audit({ action: 'appointment.supersede', resourceType: 'appointment', captureBody: false })
  supersede(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AppointmentSupersedeSchema)) dto: AppointmentSupersedeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.appointments.supersede(id, dto, actor);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.appointments.getDetail(id, actor);
  }

  /** Riwayat bisnis appointment. Tidak mengekspos outbox/retry payload teknis. */
  @Get(':id/history')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.getHistory(id);
  }
}
