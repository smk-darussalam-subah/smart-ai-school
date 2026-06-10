// =============================================================================
// GradeController — /grades
//
// POST:  [GURU] — input nilai baru
// GET:   [SA, KS, TU, GURU, SISWA, ORANG_TUA] — ownership difilter di service
// PATCH: [SA, GURU] — edit nilai (GURU: hanya own + ≤7 hari)
// =============================================================================

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { GradeService } from './grade.service';
import { CreateGradeSchema, CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeSchema, UpdateGradeDto } from './dto/update-grade.dto';
import { ListGradesQuerySchema } from './dto/list-grades.dto';

@Controller('grades')
export class GradeController {
  constructor(private service: GradeService) {}

  /**
   * POST /grades — Guru input nilai.
   * Ownership + dobel guard UTS/UAS di service layer.
   */
  @Roles('GURU')
  @RequirePermission('academic.grade.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(ZodPipe(CreateGradeSchema)) dto: CreateGradeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user);
  }

  /**
   * GET /grades — Semua role yang punya akses nilai.
   * Ownership difilter di service (GURU=kelas sendiri, SISWA=diri, OT=anak).
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('academic.grade.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListGradesQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  /**
   * PATCH /grades/:id — Edit nilai.
   * SA: tidak ada batasan.
   * GURU: hanya nilai yang dia input + dalam 7 hari kalender.
   */
  @Roles('SUPER_ADMIN', 'GURU')
  @RequirePermission('academic.grade.update')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateGradeSchema)) dto: UpdateGradeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }
}
