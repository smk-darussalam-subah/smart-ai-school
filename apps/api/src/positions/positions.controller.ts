// =============================================================================
// PositionsController — katalog jabatan + penugasan (Struktur Organisasi, 2J-5)
// Akses Wave A: SUPER_ADMIN untuk manajemen; semua stable role untuk my-positions.
// =============================================================================

import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthUser, PRIMARY_ROLES } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { PositionsService } from './positions.service';
import { AssignPositionSchema } from './dto/position.dto';
import type { AssignPositionDto } from './dto/position.dto';

@Controller('positions')
@Roles('SUPER_ADMIN')
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  // Appointment Governance Wave D: catalog is read-only support data for
  // SUPER_ADMIN and active Kepala Sekolah page routing. Legacy mutations below
  // remain fail-closed and SA-gated by service/controller policy.
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
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
  // TF2-P1-SEC-1: Tambah ParseUUIDPipe untuk defense-in-depth. Sebelumnya
  // userId mentah dikirim ke prisma → berisiko 500 pada input non-UUID
  // dan inkonsisten dengan endpoint Users yang sudah pakai ParseUUIDPipe.
  @Roles('SUPER_ADMIN')
  @Get('access-check/:userId')
  accessCheck(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.positions.accessCheck(userId);
  }

  // Appointment governance: compatibility endpoint kept as a no-op. Position
  // codes are DIIS catalog values and must not be synced to Keycloak roles.
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
  // TF2-P1-SEC-2: ParseUUIDPipe remains defense-in-depth. The legacy mutation
  // is fail-closed while Appointment is the authority.
  unassign(@Param('id', ParseUUIDPipe) id: string) {
    return this.positions.unassign(id);
  }
}
