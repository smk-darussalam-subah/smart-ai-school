// =============================================================================
// AnalyticsController — /analytics (Dasbor Eksekutif)
//
// RBAC: HANYA SUPER_ADMIN & KEPALA_SEKOLAH. Tiap endpoint juga di-gate izin
// domain terkait (grade/attendance/finance/teacher) agar konsisten dgn modul lain.
// Semua keluaran AGREGAT tanpa PII.
// =============================================================================

import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { AnalyticsService } from './analytics.service';
import { StudentAnalyticsService } from './analytics.service';
import { AnalyticsQuerySchema } from './dto/analytics-query.dto';
import { StudentAnalyticsQuerySchema } from './dto/analytics-query.dto';

@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly service: AnalyticsService,
    private readonly studentService: StudentAnalyticsService,
  ) {}

  private parse(rawQuery: unknown) {
    const parsed = AnalyticsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return parsed.data;
  }

  private parseStudentQuery(rawQuery: unknown) {
    const parsed = StudentAnalyticsQuerySchema.safeParse(rawQuery);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // W1-3 + W1-4: Student-level analytics (per-student, with ownership).
  // Method-level @Roles overrides class-level — SISWA/ORANG_TUA/GURU/SA/KS/TU.
  // Endpoint ini berbeda dari exec analytics (aggregate, no PII) — ini per-student.
  // ═══════════════════════════════════════════════════════════════════════════

  /** W1-3: Agregasi kehadiran per siswa (hadir/izin/sakit/alpha/total/pct). */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('academic.attendance.read')
  @Get('attendance/stats')
  attendanceStats(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    return this.studentService.attendanceStats(this.parseStudentQuery(rawQuery), user);
  }

  /** W1-4: Analitik nilai per siswa (NA per mapel + status tuntas/remedial). */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('academic.grade.read')
  @Get('grades/student')
  studentGrades(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    return this.studentService.studentGrades(this.parseStudentQuery(rawQuery), user);
  }
}
