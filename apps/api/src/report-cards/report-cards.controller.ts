// =============================================================================
// ReportCardsController — Hub Rapor (KamilEdu M12)
// read: semua role akademik (ownership di service/QUERY) · generate+notes: SA/TU ·
// check/return/publish: SA/KS · distribute: SA/KS/TU
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
import { ReportCardsService } from './report-cards.service';
import {
  GenerateReportsDto, GenerateReportsSchema, ListReportsQuerySchema,
  TransitionDto, TransitionSchema, UpdateNotesDto, UpdateNotesSchema,
} from './dto/report-card.dto';

@Controller('report-cards')
export class ReportCardsController {
  constructor(private readonly service: ReportCardsService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('report.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListReportsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('report.manage')
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  generate(@Body(ZodPipe(GenerateReportsSchema)) dto: GenerateReportsDto) {
    return this.service.generate(dto);
  }

  /**
   * Satu endpoint transisi sesuai kontrak frontend; otorisasi per-aksi di sini:
   * check/return/publish = SA/KS (review) · distribute = SA/KS/TU.
   * RolesGuard level handler memuat union; pemisahan presisi via service?
   * → TIDAK: dicek eksplisit di bawah agar fail-closed per aksi.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  @RequirePermission('report.read')
  @Patch(':id/status')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(TransitionSchema)) dto: TransitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const isReviewer = user.roles.some((r) => r === 'SUPER_ADMIN' || r === 'KEPALA_SEKOLAH');
    if (dto.action !== 'distribute' && !isReviewer) {
      throw new BadRequestException(
        `Aksi '${dto.action}' hanya untuk SUPER_ADMIN/KEPALA_SEKOLAH`,
      );
    }
    return this.service.transition(id, dto, user);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('report.manage')
  @Patch(':id/notes')
  updateNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateNotesSchema)) dto: UpdateNotesDto,
  ) {
    return this.service.updateNotes(id, dto);
  }
}
