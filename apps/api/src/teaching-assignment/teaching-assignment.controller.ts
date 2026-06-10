// =============================================================================
// TeachingAssignmentController — /teaching-assignments
// RBAC: SA/KS/TU baca semua; TU/SA bisa tulis; SA bisa hapus.
// Guru: hanya baca assignment sendiri (ownership di service layer).
// =============================================================================

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { TeachingAssignmentService } from './teaching-assignment.service';
import { CreateAssignmentSchema, CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentSchema, UpdateAssignmentDto } from './dto/update-assignment.dto';
import { ListAssignmentsQuerySchema } from './dto/list-assignments.dto';

@Controller('teaching-assignments')
export class TeachingAssignmentController {
  constructor(private service: TeachingAssignmentService) {}

  /**
   * GET /teaching-assignments
   * Guru: filter otomatis ke assignment sendiri (service layer).
   * SA/KS/TU: melihat semua, bisa filter via query.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU')
  @RequirePermission('academic.teaching.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListAssignmentsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  /**
   * GET /teaching-assignments/:id
   * Guru: 403 jika assignment bukan miliknya (service layer).
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU')
  @RequirePermission('academic.teaching.read')
  @Get(':id')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findById(id, user);
  }

  /**
   * POST /teaching-assignments — assign guru ke mapel+kelas.
   * 400 jika teacherId/classId tidak ada.
   * 409 jika kombinasi sudah ada.
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('academic.teaching.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ZodPipe(CreateAssignmentSchema)) dto: CreateAssignmentDto) {
    return this.service.create(dto);
  }

  /**
   * PATCH /teaching-assignments/:id — update subject/hoursPerWeek/academicYear.
   * teacherId/classId tidak bisa diubah via PATCH.
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('academic.teaching.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateAssignmentSchema)) dto: UpdateAssignmentDto,
  ) {
    return this.service.update(id, dto);
  }

  /**
   * DELETE /teaching-assignments/:id — hard delete (record konfigurasi, bukan data).
   */
  @Roles('SUPER_ADMIN')
  @RequirePermission('academic.teaching.manage')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
