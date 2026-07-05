// =============================================================================
// SubmissionController — /submissions (W2-A-2)
// Rekap tugas siswa dari AssessmentSession + AssessmentResponse untuk dashboard Guru.
// Menggantikan TUGAS_DATA + PENGUMPULAN hardcoded di PenugasanGuru.
// =============================================================================

import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { AssessmentService } from './assessment.service';
import { ListSubmissionsQuerySchema } from './dto/submission.dto';

@Controller('submissions')
export class SubmissionController {
  constructor(private readonly service: AssessmentService) {}

  /**
   * W2-A-2: GET /submissions — list tugas dengan statistik pengumpulan.
   * RBAC: GURU (own assignments), SUPER_ADMIN, KEPALA_SEKOLAH.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get()
  list(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListSubmissionsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.listSubmissions(parsed.data, user);
  }

  /**
   * W2-A-2: GET /submissions/:id/details — detail pengumpulan per siswa.
   * RBAC: GURU (own), SUPER_ADMIN, KEPALA_SEKOLAH.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get(':id/details')
  details(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.submissionDetails(id, user);
  }
}
