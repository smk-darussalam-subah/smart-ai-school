// =============================================================================
// PositionsController — katalog jabatan + penugasan (Struktur Organisasi, 2J-5)
// Akses: SUPER_ADMIN & KEPALA_SEKOLAH.
// =============================================================================

import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
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
