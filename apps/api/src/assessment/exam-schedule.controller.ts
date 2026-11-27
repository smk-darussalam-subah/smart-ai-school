import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ExamCancelSchema, ExamDecision, ExamDecisionSchema, ExamIncidentInput, ExamIncidentSchema, ExamListSchema,
  ExamPlan, ExamPlanSchema, RescheduleExam, RescheduleExamSchema, PublishExamNowSchema, PublishRequestNowSchema, TransferDeviceSchema, type TransferDeviceInput } from './exam-contract';
import { ExamScheduleService } from './exam-schedule.service';
import { programStaffRoles } from './assessment-program-authority';
import { ScheduleRequestSchema, PublishScheduleRequestSchema, ScheduleRequestPackagesQuerySchema, type ScheduleRequest } from './assessment-program-contract';

@Controller('exam-schedule')
export class ExamScheduleController {
  constructor(private readonly exams: ExamScheduleService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'GURU', 'TATA_USAHA', 'SISWA')
  list(@Query() input: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ExamListSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Tanggal ujian atau batas halaman belum valid.');
    return this.exams.list(parsed.data, user);
  }

  @Get('requests')
  @Roles(...programStaffRoles)
  listRequests(@CurrentUser() user: AuthUser) { return this.exams.listRequests(user); }

  @Get('requests/:id/packages')
  @Roles(...programStaffRoles)
  requestPackages(@Param('id', ParseUUIDPipe) id: string, @Query() input: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ScheduleRequestPackagesQuerySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Halaman paket soal tidak valid.');
    return this.exams.requestPackages(id, user, parsed.data.after);
  }

  @Put('requests/:id')
  @Roles(...programStaffRoles)
  saveRequest(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(ScheduleRequestSchema)) input: ScheduleRequest,
    @CurrentUser() user: AuthUser) { return this.exams.saveRequest(id, input, user); }

  @Post('requests/:id/publish')
  @Roles(...programStaffRoles)
  publishRequest(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(PublishScheduleRequestSchema)) input: { revision: number },
    @CurrentUser() user: AuthUser) { return this.exams.publishRequest(id, input.revision, user); }

  @Post('requests/:id/publish-now')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  publishRequestNow(@Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(PublishRequestNowSchema)) body: { revision: number; reason: string }, @CurrentUser() user: AuthUser) {
    return this.exams.publishRequest(id, body.revision, user, body.reason);
  }

  @Get('options')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM', 'GURU')
  options(@CurrentUser() user: AuthUser) {
    return this.exams.authorOptions(user);
  }

  @Post(':id/package')
  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  freeze(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.freezePackage(id, user);
  }

  @Get(':id/details')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'GURU', 'TATA_USAHA', 'SISWA')
  details(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.details(id, user);
  }

  @Put(':id/reschedule')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  reschedule(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(RescheduleExamSchema)) body: RescheduleExam,
    @CurrentUser() user: AuthUser) { return this.exams.reschedule(id, body, user); }

  @Post(':id/close-admission')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  closeAdmission(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(ExamCancelSchema)) body: { reason: string },
    @CurrentUser() user: AuthUser) { return this.exams.closeAdmission(id, body.reason, user); }

  @Get(':id/monitor')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'GURU', 'TATA_USAHA')
  monitor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.monitor(id, user);
  }

  @Get(':id/my-status')
  @Roles('SISWA')
  ownStatus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.ownStatus(id, user);
  }

  @Get(':id/makeup-options')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  makeupOptions(@Param('id', ParseUUIDPipe) id: string) {
    return this.exams.makeupOptions(id);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  plan(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(ExamPlanSchema)) body: ExamPlan, @CurrentUser() user: AuthUser) {
    return this.exams.plan(id, body, user);
  }

  @Post(':id/publish')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.publish(id, user);
  }

  @Post(':id/publish-now')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  publishNow(@Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(PublishExamNowSchema)) body: { version: string; reason: string }, @CurrentUser() user: AuthUser) {
    return this.exams.publish(id, user, undefined, body);
  }

  @Post(':id/incidents')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM', 'GURU', 'TATA_USAHA')
  report(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(ExamIncidentSchema)) body: ExamIncidentInput,
    @CurrentUser() user: AuthUser) {
    return this.exams.recordIncident(id, body, user);
  }

  @Post(':id/device-transfer')
  @Roles('GURU', 'TATA_USAHA')
  transferDevice(@Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(TransferDeviceSchema)) body: TransferDeviceInput, @CurrentUser() user: AuthUser) {
    return this.exams.transferDevice(id, body, user);
  }

  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(ExamCancelSchema)) body: { reason: string },
    @CurrentUser() user: AuthUser) {
    return this.exams.cancel(id, body.reason, user);
  }

  @Post(':id/incidents/:incidentId/decision')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  decide(@Param('id', ParseUUIDPipe) id: string, @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body(ZodPipe(ExamDecisionSchema)) body: ExamDecision, @CurrentUser() user: AuthUser) {
    return this.exams.decide(id, incidentId, body, user);
  }
}
