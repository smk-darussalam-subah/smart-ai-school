// =============================================================================
// AssessmentController — /assessment/sessions (P12 — W2-9 + F5)
// GURU: CRUD sesi milik sendiri + start/complete · SISWA: submit respons
// · KS/SA: baca semua + lihat hasil. Endpoint results = realtime monitor.
// =============================================================================

import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { AssessmentService } from './assessment.service';
import {
  CreateAssessmentSessionSchema, ListAssessmentSessionSchema,
  SubmitResponseSchema, UpdateAssessmentSessionSchema,
} from './dto/assessment.dto';

@Controller('assessment/sessions')
export class AssessmentController {
  constructor(private readonly service: AssessmentService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU', 'SISWA')
  @RequirePermission('lms.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListAssessmentSessionSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU', 'SISWA')
  @RequirePermission('lms.read')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get(':id/results')
  getResults(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.getResults(id, user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(ZodPipe(CreateAssessmentSessionSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto as Parameters<typeof this.service.create>[0], user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateAssessmentSessionSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto as Parameters<typeof this.service.update>[1], user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Patch(':id/start')
  startSession(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.startSession(id, user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Patch(':id/complete')
  completeSession(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.completeSession(id, user);
  }

  // U2 Wave 1: SISWA memulai pengerjaan — mencatat startedAt, return shuffled questions
  @Roles('SISWA')
  @RequirePermission('lms.progress.manage')
  @Post(':id/start-response')
  @HttpCode(HttpStatus.CREATED)
  startResponse(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.startResponse(id, user);
  }

  @Roles('SISWA')
  @RequirePermission('lms.progress.manage')
  @Post(':id/submit')
  @HttpCode(HttpStatus.CREATED)
  submitResponse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(SubmitResponseSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.submitResponse(id, dto as Parameters<typeof this.service.submitResponse>[1], user);
  }
}
