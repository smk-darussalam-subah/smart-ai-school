// =============================================================================
// GamificationController — /gamification (P15 — W3-3)
// SISWA: own XP + history · GURU/KS/SA: leaderboard + manual award.
// Route ordering (§17.5 #21): dedicated routes before general.
// =============================================================================

import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus,
  Post, Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { GamificationService } from './gamification.service';
import {
  AwardXpSchema, LeaderboardXpSchema,
} from './dto/gamification.dto';

@Controller('gamification')
export class GamificationController {
  constructor(private readonly service: GamificationService) {}

  // ── Dedicated routes (MUST be before ':id' — §17.5 #21) ──────────────────

  @Roles('SISWA')
  @RequirePermission('lms.read')
  @Get('my-xp')
  findMyXp(@CurrentUser() user: AuthUser) {
    return this.service.findMyXp(user);
  }

  @Roles('SISWA')
  @RequirePermission('lms.read')
  @Get('xp-history')
  findXpHistory(@CurrentUser() user: AuthUser) {
    return this.service.findXpHistory(user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get('leaderboard-xp')
  findLeaderboardXp(@Query() rawQuery: unknown) {
    const parsed = LeaderboardXpSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findLeaderboardXp(parsed.data);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.own.manage')
  @Post('award-xp')
  @HttpCode(HttpStatus.CREATED)
  awardXp(
    @Body(ZodPipe(AwardXpSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.awardXp(dto as Parameters<typeof this.service.awardXp>[0], user);
  }
}
