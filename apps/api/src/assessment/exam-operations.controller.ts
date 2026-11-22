import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { z } from 'zod';
import { CohortProctorSchema, ExamAgendaSchema, ExamSlotSchema, ExamSupervisorSchema, RoomIncidentSchema,
  RoomResolutionSchema, type CohortProctorInput, type ExamAgendaInput, type ExamSlotInput } from './exam-contract';
import { ExamOperationsService } from './exam-operations.service';

const staff = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'GURU', 'TATA_USAHA'] as const;
const daySchema = z.string().date();
const staffSearchSchema = z.object({
  q: z.string().trim().max(80).default(''),
  cursor: z.string().uuid().optional(),
}).strict();
function requiredDay(value: unknown) {
  const parsed = daySchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Tanggal ujian tidak valid.');
  return parsed.data;
}

@Controller('exam-schedule/operations')
export class ExamOperationsController {
  constructor(private readonly operations: ExamOperationsService) {}

  @Get('agendas')
  @Roles(...staff)
  agendas(@Query('day') day: unknown, @CurrentUser() user: AuthUser) {
    return this.operations.agendas(requiredDay(day), user);
  }

  @Post('agendas')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  createAgenda(@Body(ZodPipe(ExamAgendaSchema)) input: ExamAgendaInput, @CurrentUser() user: AuthUser) {
    return this.operations.createAgenda(input, user);
  }

  @Get('agendas/:id')
  @Roles(...staff)
  overview(@Param('id', ParseUUIDPipe) id: string, @Query('day') day: unknown,
    @CurrentUser() user: AuthUser) {
    return this.operations.overview(id, requiredDay(day), user);
  }

  @Put('agendas/:id/cohorts')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  assignCohort(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(CohortProctorSchema)) input: CohortProctorInput,
    @CurrentUser() user: AuthUser) {
    return this.operations.assignCohort(id, input, user);
  }

  @Get('staff')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  searchStaff(@Query() query: unknown, @CurrentUser() user: AuthUser) {
    const parsed = staffSearchSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Pencarian petugas tidak valid.');
    return this.operations.searchStaff(parsed.data, user);
  }

  @Get('rosters/:id')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  roster(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.operations.roster(id, user);
  }

  @Post('rooms')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  createSlot(@Body(ZodPipe(ExamSlotSchema)) input: ExamSlotInput, @CurrentUser() user: AuthUser) {
    return this.operations.createSlot(input, user);
  }

  @Get('rooms/:id')
  @Roles(...staff)
  roomDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.operations.roomDetail(id, user);
  }

  @Put('rooms/:id/supervisor')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  replaceSupervisor(@Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(ExamSupervisorSchema)) input: { supervisorId: string }, @CurrentUser() user: AuthUser) {
    return this.operations.replaceSupervisor(id, input.supervisorId, user);
  }

  @Post('rooms/:id/ready')
  @Roles('GURU', 'TATA_USAHA')
  roomReady(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.operations.roomReady(id, user);
  }

  @Post('rooms/:id/incidents')
  @Roles('GURU', 'TATA_USAHA')
  reportRoom(@Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(RoomIncidentSchema)) input: { intentId: string; reason: string }, @CurrentUser() user: AuthUser) {
    return this.operations.reportRoom(id, input, user);
  }

  @Post('rooms/:id/incidents/:incidentId/decision')
  @Roles('SUPER_ADMIN', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.edit')
  resolveRoom(@Param('id', ParseUUIDPipe) id: string, @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body(ZodPipe(RoomResolutionSchema)) input: { decision: 'resume' | 'makeup'; reason: string },
    @CurrentUser() user: AuthUser) {
    return this.operations.resolveRoom(id, incidentId, input, user);
  }
}
