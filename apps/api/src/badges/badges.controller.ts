// =============================================================================
// BadgesController — /badges (P14 — W3-1)
// KS/SA: create badge definitions · GURU/KS: award badge
// · SISWA: lihat own · ORANG_TUA: lihat child
// Route ordering (§17.5 #21): dedicated routes ('my', 'student/:id', 'award')
// declared BEFORE any ':id' param route.
// =============================================================================

import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { BadgesService } from './badges.service';
import {
  AwardBadgeSchema, CreateBadgeSchema, ListBadgeSchema,
} from './dto/badge.dto';

@Controller('badges')
export class BadgesController {
  constructor(private readonly service: BadgesService) {}

  // ── Dedicated routes (MUST be before ':id' — §17.5 #21) ──────────────────

  @Roles('SISWA')
  @RequirePermission('lms.read')
  @Get('my')
  findMyBadges(@CurrentUser() user: AuthUser) {
    return this.service.findMyBadges(user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.own.manage')
  @Post('award')
  @HttpCode(HttpStatus.CREATED)
  awardBadge(
    @Body(ZodPipe(AwardBadgeSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.awardBadge(dto as Parameters<typeof this.service.awardBadge>[0], user);
  }

  @Roles('ORANG_TUA', 'SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('lms.read')
  @Get('student/:studentId')
  findStudentBadges(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findStudentBadges(studentId, user);
  }

  // ── General routes ────────────────────────────────────────────────────────

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('lms.read')
  @Get()
  findAll(@Query() rawQuery: unknown) {
    const parsed = ListBadgeSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('lms.own.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createBadge(
    @Body(ZodPipe(CreateBadgeSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createBadge(dto as Parameters<typeof this.service.createBadge>[0], user);
  }
}
