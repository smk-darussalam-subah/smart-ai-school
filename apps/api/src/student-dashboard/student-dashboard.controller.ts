// =============================================================================
// StudentDashboardController — /student-dashboard (P13 — W2-5..W2-8)
// SISWA & ORANG_TUA: akses data sendiri (SISWA) atau anak (ORANG_TUA).
// Endpoints: SPP, assignments, CP progress, leaderboard.
// =============================================================================

import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { StudentDashboardService } from './student-dashboard.service';
import { SharedReadBudget } from '../common/guards/api-throttler.guard';

@Controller('student-dashboard')
export class StudentDashboardController {
  constructor(private readonly service: StudentDashboardService) {}

  @Roles('ORANG_TUA')
  @RequirePermission('student.child.read')
  @SharedReadBudget()
  @Header('Cache-Control', 'private, no-store')
  @Get('parent-changes')
  getParentChanges(@CurrentUser() user: AuthUser, @Query() rawQuery: unknown) {
    if (
      !z
        .object({})
        .strict()
        .safeParse(rawQuery ?? {}).success
    )
      throw new BadRequestException('Parameter pembaruan tidak valid.');
    return this.service.getParentChanges(user);
  }

  @Roles('SISWA')
  @RequirePermission('student.own.read')
  @SharedReadBudget()
  @Get('changes')
  getChanges(@CurrentUser() user: AuthUser) {
    return this.service.getChanges(user);
  }

  /** W2-5: SPP payments for SISWA (own) or ORANG_TUA (children). */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['finance.own.read', 'finance.child.read'])
  @SharedReadBudget()
  @Get('spp')
  getSpp(@CurrentUser() user: AuthUser) {
    return this.service.getSpp(user);
  }

  /** W2-6: Assignments (LMS modules + assessment sessions) for SISWA or ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission('lms.read')
  @SharedReadBudget()
  @Get('assignments')
  getAssignments(@CurrentUser() user: AuthUser) {
    return this.service.getAssignments(user);
  }

  /** W2-7: CP progress (NA per subject) for SISWA or ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['grade.own.read', 'grade.child.read'])
  @SharedReadBudget()
  @Get('cp')
  getCpProgress(@CurrentUser() user: AuthUser) {
    return this.service.getCpProgress(user);
  }

  /** W2-8: Leaderboard (class ranking by average NA) for SISWA or ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['grade.own.read', 'grade.child.read'])
  @SharedReadBudget()
  @Get('leaderboard')
  getLeaderboard(@CurrentUser() user: AuthUser) {
    return this.service.getLeaderboard(user);
  }

  /** T3-02 B4: Guru mapel + kontak untuk SISWA atau ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['student.own.read', 'student.child.read'])
  @Get('teachers')
  getTeachers(@CurrentUser() user: AuthUser, @Query() rawQuery: unknown) {
    return this.service.getTeachers(user, this.studentQuery(rawQuery));
  }

  /** T3-02 B3: Timeline pembelajaran untuk SISWA atau ORANG_TUA. */
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['grade.own.read', 'grade.child.read'])
  @Get('timeline')
  getTimeline(@CurrentUser() user: AuthUser, @Query() rawQuery: unknown) {
    return this.service.getTimeline(user, this.studentQuery(rawQuery));
  }

  private studentQuery(raw: unknown): string | undefined {
    const parsed = z
      .object({ studentId: z.string().uuid().optional() })
      .strict()
      .safeParse(raw ?? {});
    if (!parsed.success) throw new BadRequestException('Pilihan siswa tidak valid.');
    return parsed.data.studentId;
  }
}
