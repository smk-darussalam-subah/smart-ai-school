// =============================================================================
// StudentDashboardController — /student-dashboard (P13 — W2-5..W2-8)
// SISWA & ORANG_TUA: akses data sendiri (SISWA) atau anak (ORANG_TUA).
// Endpoints: SPP, assignments, CP progress, leaderboard.
// =============================================================================

import { Controller, Get } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { StudentDashboardService } from './student-dashboard.service';

@Controller('student-dashboard')
export class StudentDashboardController {
  constructor(private readonly service: StudentDashboardService) {}

  /** W2-5: SPP payments for SISWA (own) or ORANG_TUA (children). */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['finance.own.read', 'finance.child.read'])
  @Get('spp')
  getSpp(@CurrentUser() user: AuthUser) {
    return this.service.getSpp(user);
  }

  /** W2-6: Assignments (LMS modules + assessment sessions) for SISWA or ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission('lms.read')
  @Get('assignments')
  getAssignments(@CurrentUser() user: AuthUser) {
    return this.service.getAssignments(user);
  }

  /** W2-7: CP progress (NA per subject) for SISWA or ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['grade.own.read', 'grade.child.read'])
  @Get('cp')
  getCpProgress(@CurrentUser() user: AuthUser) {
    return this.service.getCpProgress(user);
  }

  /** W2-8: Leaderboard (class ranking by average NA) for SISWA or ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['grade.own.read', 'grade.child.read'])
  @Get('leaderboard')
  getLeaderboard(@CurrentUser() user: AuthUser) {
    return this.service.getLeaderboard(user);
  }

  /** T3-02 B4: Guru mapel + kontak untuk SISWA atau ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['student.own.read', 'student.child.read'])
  @Get('teachers')
  getTeachers(@CurrentUser() user: AuthUser) {
    return this.service.getTeachers(user);
  }

  /** T3-02 B3: Timeline pembelajaran untuk SISWA atau ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['grade.own.read', 'grade.child.read'])
  @Get('timeline')
  getTimeline(@CurrentUser() user: AuthUser) {
    return this.service.getTimeline(user);
  }
}
