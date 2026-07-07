// =============================================================================
// PositionsController — katalog jabatan + penugasan (Struktur Organisasi, 2J-5)
// Akses: SUPER_ADMIN & KEPALA_SEKOLAH untuk manajemen; semua role untuk my-positions.
// =============================================================================

import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser, PRIMARY_ROLES } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { PositionsService } from './positions.service';
import { AssignPositionSchema } from './dto/position.dto';
import type { AssignPositionDto } from './dto/position.dto';

@Controller('positions')
@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  catalog() {
    return this.positions.getCatalog();
  }

  @Get('assignments')
  assignments(@Query('academicYearId') academicYearId?: string) {
    return this.positions.getAssignments(academicYearId);
  }

  // R-24: Jabatan aktif user yang sedang login — override class-level @Roles
  // agar semua role terautentikasi bisa akses jabatannya sendiri.
  @Roles(...PRIMARY_ROLES)
  @Get('my-positions')
  myPositions(@CurrentUser() user: AuthUser) {
    return this.positions.getMyPositions(user.keycloakId);
  }

  // R-25: Verifikasi effective access user (SA only)
  @Roles('SUPER_ADMIN')
  @Get('access-check/:userId')
  accessCheck(@Param('userId') userId: string) {
    return this.positions.accessCheck(userId);
  }

  // R-23: Seed 13 position codes sebagai Keycloak realm roles (SA only)
  @Roles('SUPER_ADMIN')
  @Post('sync-roles')
  @Audit({ captureBody: false })
  syncRoles() {
    return this.positions.syncKeycloakRoles();
  }

  @Post('assign')
  @Audit({ captureBody: true })
  assign(@Body(ZodPipe(AssignPositionSchema)) dto: AssignPositionDto) {
    return this.positions.assign(dto);
  }

  @Delete('assignments/:id')
  @Audit({ captureBody: false })
  unassign(@Param('id') id: string) {
    return this.positions.unassign(id);
  }
}
