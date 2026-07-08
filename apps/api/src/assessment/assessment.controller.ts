// =============================================================================
// AssessmentController — /assessment/sessions (P12 — W2-9 + F5)
// GURU: CRUD sesi milik sendiri + start/complete · SISWA: submit respons
// · KS/SA: baca semua + lihat hasil. Endpoint results = realtime monitor.
// =============================================================================

import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query, Sse, UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { SseTokenService } from '../auth/sse-token.service';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { AssessmentService } from './assessment.service';
import {
  CreateAssessmentSessionSchema, GradeEssaySchema, ListAssessmentSessionSchema,
  SubmitResponseSchema, UpdateAssessmentSessionSchema,
} from './dto/assessment.dto';

@Controller('assessment/sessions')
export class AssessmentController {
  constructor(
    private readonly service: AssessmentService,
    private readonly sseTokenService: SseTokenService,
  ) {}

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

  // U2 Wave 3: Analisis Hasil — item analysis, score distribution, ketuntasan
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get(':id/analysis')
  getSessionAnalysis(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.getSessionAnalysis(id, user);
  }

  // R-11: SSE realtime monitor — uses short-lived SSE token (not Keycloak JWT).
  // Marked @Public() to bypass KeycloakGuard; auth is handled via SseTokenService.
  // The ?token=xxx query param contains a one-time-use, 5-minute-expiry token.
  @Public()
  @Sse(':id/stream')
  async streamResults(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string,
  ): Promise<Observable<MessageEvent>> {
    if (!token) {
      throw new UnauthorizedException('SSE token tidak ditemukan');
    }

    // R-11: Validate short-lived SSE token — not a full Keycloak JWT.
    // Token is consumed (one-time use) after validation.
    const user = await this.sseTokenService.validateAndConsumeToken(token);

    // Manual role check (since @Public() bypasses RolesGuard)
    const allowedRoles: string[] = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU'];
    if (!user.roles.some((r: string) => allowedRoles.includes(r))) {
      throw new ForbiddenException('Akses ditolak: role tidak mencukupi untuk monitoring SSE');
    }

    return this.service.streamResults(id, user);
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

  // U2 Wave 2: GURU menilai essay dengan rubrik (per-criteria weighted scoring)
  @Roles('GURU', 'KEPALA_SEKOLAH')
  @RequirePermission('lms.own.manage')
  @Patch(':id/responses/:responseId/grade-essay')
  gradeEssayResponse(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('responseId', ParseUUIDPipe) responseId: string,
    @Body(ZodPipe(GradeEssaySchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.gradeEssayResponse(id, responseId, dto as Parameters<typeof this.service.gradeEssayResponse>[2], user);
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
