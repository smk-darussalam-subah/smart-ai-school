// =============================================================================
// AnalyticsController — /analytics (Dasbor Eksekutif)
//
// RBAC: HANYA SUPER_ADMIN & KEPALA_SEKOLAH. Tiap endpoint juga di-gate izin
// domain terkait (grade/attendance/finance/teacher) agar konsisten dgn modul lain.
// Semua keluaran AGREGAT tanpa PII.
// =============================================================================

import { BadRequestException, Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { AnalyticsService } from './analytics.service';
import { StudentAnalyticsService } from './analytics.service';
import { AnalyticsQuerySchema } from './dto/analytics-query.dto';
import { StudentAnalyticsQuerySchema } from './dto/analytics-query.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { isSiswaOnly, isOrangTuaOnly } from '../common/helpers/role-helpers';

@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly service: AnalyticsService,
    private readonly studentService: StudentAnalyticsService,
    private readonly permissions: PermissionsService,
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

  private async assertDomainReader(user: AuthUser, domain: 'grade' | 'attendance') {
    const required = isSiswaOnly(user) ? `${domain}.own.read` : isOrangTuaOnly(user) ? `${domain}.child.read` : `academic.${domain}.read`;
    const effective = await this.permissions.getEffectivePermissions(user.keycloakId, user.roles);
    if (!effective.has('*') && !effective.has(required)) throw new ForbiddenException(`Permission '${required}' diperlukan untuk konteks ini`);
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
  async teacherCompliance(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const query = this.parse(rawQuery);
    const effective = await this.permissions.getEffectivePermissions(user.keycloakId, user.roles);
    return this.service.teacherCompliance(query, effective.has('*') || effective.has('rpp.read'), effective.has('*') || effective.has('academic.teaching.read'));
  }

  /** T3-02 B7: Rekap audit per guru×kelas×mapel untuk KS/Wakakur. */
  @RequirePermission('academic.grade.read')
  @Get('rekap-audit')
  rekapAudit(@Query() rawQuery: unknown) {
    return this.service.rekapAudit(this.parse(rawQuery));
  }

  /** Period-bound monitoring snapshot; not a live-session claim. */
  @RequirePermission('academic.grade.read')
  @Get('monitoring-kbm')
  async monitoringKbm(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const query = this.parse(rawQuery);
    const effective = await this.permissions.getEffectivePermissions(user.keycloakId, user.roles);
    const can = (permission: string) => effective.has('*') || effective.has(permission);
    return this.service.monitoringKbm(query, new Date(), {
      assignments: can('academic.teaching.read'), attendance: can('academic.attendance.read'),
      journal: can('activity.read'), schedules: can('academic.schedule.read'),
      sessions: can('operational.monitoring.read'), lms: can('lms.read'),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // W1-3 + W1-4: Student-level analytics (per-student, with ownership).
  // Method-level @Roles overrides class-level — SISWA/ORANG_TUA/GURU/SA/KS/TU.
  // Endpoint ini berbeda dari exec analytics (aggregate, no PII) — ini per-student.
  // ═══════════════════════════════════════════════════════════════════════════

  /** W1-3: Agregasi kehadiran per siswa (hadir/izin/sakit/alpha/total/pct). */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission(['academic.attendance.read', 'attendance.own.read', 'attendance.child.read'])
  @Get('attendance/stats')
  async attendanceStats(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    await this.assertDomainReader(user, 'attendance');
    return this.studentService.attendanceStats(this.parseStudentQuery(rawQuery), user);
  }

  /** W1-4: Analitik nilai per siswa (NA per mapel + status tuntas/remedial). */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission(['academic.grade.read', 'grade.own.read', 'grade.child.read'])
  @Get('grades/student')
  async studentGrades(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    await this.assertDomainReader(user, 'grade');
    return this.studentService.studentGrades(this.parseStudentQuery(rawQuery), user);
  }

  /**
   * W2-A-3: GET /analytics/cp-progress — progres ketercapaian per mapel + CP breakdown.
   * Dipakai PembelajaranGuru + CapaianRapor untuk menggantikan MAPEL_PROG/CP_DATA/CP_RAPOR.
   * RBAC: GURU (own classes), SISWA (own class), SA/KS.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU', 'SISWA')
  @RequirePermission(['academic.grade.read', 'grade.own.read'])
  @Get('cp-progress')
  async cpProgress(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    await this.assertDomainReader(user, 'grade');
    return this.service.cpProgress(this.parse(rawQuery), user);
  }
}
