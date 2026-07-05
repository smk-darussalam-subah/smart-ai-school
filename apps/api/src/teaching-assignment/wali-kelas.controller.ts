// =============================================================================
// WaliKelasController — /teachers/me/wali-classes (W2-A-4)
// Mendeteksi kelas tempat guru ini adalah wali kelas (homeroom teacher).
// Dipakai AkademikWorkspace untuk conditional "Rapor Kelas" tab visibility.
// =============================================================================

import { Controller, Get } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { TeachingAssignmentService } from './teaching-assignment.service';

@Controller('teachers')
export class WaliKelasController {
  constructor(private readonly service: TeachingAssignmentService) {}

  /**
   * W2-A-4: GET /teachers/me/wali-classes — kelas tempah guru ini wali kelas.
   * RBAC: GURU (own). Mengembalikan { classes, isWaliKelas }.
   */
  @Roles('GURU')
  @RequirePermission('academic.teaching.read')
  @Get('me/wali-classes')
  waliClasses(@CurrentUser() user: AuthUser) {
    return this.service.findWaliClasses(user);
  }
}
