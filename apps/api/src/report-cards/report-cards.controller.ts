// =============================================================================
// ReportCardsController — Hub Rapor (KamilEdu M12)
// read: semua role akademik (ownership di service/query) · generate+notes: wali kelas ·
// check/return: Waka Kurikulum · publish: KS · distribute: KS/TU · SA: recovery.
// =============================================================================

import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { AuthUser, UserRole } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { PermissionsService } from '../permissions/permissions.service';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { ReportCardsService } from './report-cards.service';
import {
  GenerateReportsDto, GenerateReportsSchema, ListReportsQuerySchema,
  RecoverReportDto, RecoverReportSchema,
  TransitionDto, TransitionSchema, UpdateNotesDto, UpdateNotesSchema,
} from './dto/report-card.dto';

@Controller('report-cards')
export class ReportCardsController {
  constructor(
    private readonly service: ReportCardsService,
    private readonly permissions: PermissionsService,
  ) {}

  // Static routes must stay before studentId routes.

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole)
  @RequirePermission('report.read')
  @Get('options/classes')
  listReadableClasses(@CurrentUser() user: AuthUser) {
    return this.service.listReadableClasses(user);
  }

  // ── Rapor section endpoints (P23 — dedicated routes before :id) ───────────

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole)
  @RequirePermission('report.read')
  @Get(':studentId/official-sections')
  findOfficialSections(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('year') year: string,
    @Query('semester') semester: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOfficialSections(studentId, year, Number(semester), user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole)
  @RequirePermission('report.read')
  @Get(':studentId/muatan-lokal')
  findMuatanLokal(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('year') year: string,
    @Query('semester') semester: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findMuatanLokal(studentId, year, Number(semester), user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole)
  @RequirePermission('report.read')
  @Get(':studentId/attendance-summary')
  findAttendanceSummary(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('year') year: string,
    @Query('semester') semester: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findAttendanceSummary(studentId, year, Number(semester), user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole)
  @RequirePermission('report.read')
  @Get(':studentId/development-description')
  findDevelopmentDescription(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('year') year: string,
    @Query('semester') semester: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findDevelopmentDescription(studentId, year, Number(semester), user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole)
  @RequirePermission('report.read')
  @Get(':studentId/approval')
  findApproval(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('year') year: string,
    @Query('semester') semester: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findApproval(studentId, year, Number(semester), user);
  }

  // ── General routes ────────────────────────────────────────────────────────

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole)
  @RequirePermission('report.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListReportsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  @Roles('GURU')
  @RequirePermission('report.wali.manage')
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  generate(
    @Body(ZodPipe(GenerateReportsSchema)) dto: GenerateReportsDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Super Admin hanya dapat memakai jalur pemulihan administratif rapor');
    }
    return this.service.generate(dto, user);
  }

  /**
   * Satu endpoint transisi sesuai kontrak frontend; otorisasi per-aksi di sini:
   * check/return = Waka Kurikulum · publish = KS/SA · distribute = KS/TU/SA.
   * Bantuan SA tetap memakai identitas SA asli; recovery berada di endpoint terpisah.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'WAKA_KURIKULUM' as UserRole)
  @RequirePermission('report.read')
  @Patch(':id/status')
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(TransitionSchema)) dto: TransitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const isSuperAdmin = user.roles.includes('SUPER_ADMIN');
    const requiredPermission = dto.action === 'check' || dto.action === 'return'
      ? 'report.review'
      : dto.action === 'publish'
        ? 'report.publish'
        : 'report.distribute';
    if (!await this.permissions.hasPermission(user.keycloakId, user.roles, requiredPermission)) {
      throw new ForbiddenException(`Permission '${requiredPermission}' diperlukan untuk aksi ini`);
    }
    const activePositions = await this.permissions.getActivePositionCodes(user.keycloakId);
    const isCurriculumDeputy = activePositions.has('WAKA_KURIKULUM');
    const isPrincipal = activePositions.has('KEPALA_SEKOLAH');
    const isAdministration = user.roles.includes('TATA_USAHA');
    const allowed = dto.action === 'check' || dto.action === 'return'
      ? isCurriculumDeputy && !isSuperAdmin
      : dto.action === 'publish'
        ? isPrincipal || isSuperAdmin
        : isPrincipal || isAdministration || isSuperAdmin;
    if (!allowed) {
      const owner = dto.action === 'check' || dto.action === 'return'
        ? 'WAKA_KURIKULUM'
        : dto.action === 'publish'
          ? 'KEPALA_SEKOLAH atau bantuan SUPER_ADMIN'
          : 'TATA_USAHA/KEPALA_SEKOLAH atau bantuan SUPER_ADMIN';
      throw new ForbiddenException(`Aksi '${dto.action}' hanya untuk ${owner}`);
    }
    return this.service.transition(id, dto, user);
  }

  @Roles('SUPER_ADMIN')
  @RequirePermission('report.recover')
  @Patch(':id/recovery')
  recover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(RecoverReportSchema)) dto: RecoverReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.recover(id, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('report.wali.manage')
  @Patch(':id/notes')
  updateNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateNotesSchema)) dto: UpdateNotesDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Super Admin hanya dapat memakai jalur pemulihan administratif rapor');
    }
    return this.service.updateNotes(id, dto, user);
  }
}
