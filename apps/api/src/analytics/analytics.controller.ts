// =============================================================================
// AnalyticsController — /analytics (Dasbor Eksekutif)
//
// RBAC: HANYA SUPER_ADMIN & KEPALA_SEKOLAH. Tiap endpoint juga di-gate izin
// domain terkait (grade/attendance/finance/teacher) agar konsisten dgn modul lain.
// Semua keluaran AGREGAT tanpa PII.
// =============================================================================

import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQuerySchema } from './dto/analytics-query.dto';

@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  private parse(rawQuery: unknown) {
    const parsed = AnalyticsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return parsed.data;
  }

  /** Distribusi nilai + ketuntasan KKM + korelasi kehadiran↔nilai. */
  @RequirePermission('academic.grade.read')
  @Get('grades')
  grades(@Query() rawQuery: unknown) {
    return this.service.grades(this.parse(rawQuery));
  }

  /** Siswa berisiko (alpha kronis) — agregat per kelas, tanpa PII. */
  @RequirePermission('academic.attendance.read')
  @Get('at-risk')
  atRisk(@Query() rawQuery: unknown) {
    return this.service.atRisk(this.parse(rawQuery));
  }

  /** Aging tunggakan SPP (umur piutang). */
  @RequirePermission('finance.read')
  @Get('finance/aging')
  financeAging(@Query() rawQuery: unknown) {
    return this.service.financeAging(this.parse(rawQuery));
  }

  /** Kepatuhan guru: kehadiran GPS hari ini + RPP approval rate. */
  @RequirePermission('teacher.attendance.read')
  @Get('teacher-compliance')
  teacherCompliance(@Query() rawQuery: unknown) {
    return this.service.teacherCompliance(this.parse(rawQuery));
  }
}
