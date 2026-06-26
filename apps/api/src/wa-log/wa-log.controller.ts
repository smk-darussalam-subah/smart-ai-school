// =============================================================================
// WaLogController — /wa-log (P15 — W3-4)
// KS/SA: list all · SISWA: own logs · ORANG_TUA: child logs.
// Route ordering (§17.5 #21): dedicated routes ('my', 'student/:id') before general.
// =============================================================================

import {
  BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { WaLogService } from './wa-log.service';
import { ListWaLogSchema } from './dto/wa-log.dto';

@Controller('wa-log')
export class WaLogController {
  constructor(private readonly service: WaLogService) {}

  // ── Dedicated routes (MUST be before ':id' — §17.5 #21) ──────────────────

  @Roles('SISWA')
  @RequirePermission('lms.read')
  @Get('my')
  findMyLogs(@CurrentUser() user: AuthUser) {
    return this.service.findMyLogs(user);
  }

  @Roles('ORANG_TUA', 'SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('lms.read')
  @Get('student/:studentId')
  findStudentLogs(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findStudentLogs(studentId, user);
  }

  // ── General route ──────────────────────────────────────────────────────────

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('lms.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListWaLogSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }
}
