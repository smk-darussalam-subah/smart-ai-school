// =============================================================================
// LmsController — modul belajar LMS (2P-1).
// GURU: kelola modul sendiri (lms.own.manage) · SISWA: progres sendiri
// (lms.progress.manage) · semua peran terkait: baca (lms.read).
// =============================================================================

import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { LmsService } from './lms.service';
import {
  CreateLmsModuleDto, CreateLmsModuleSchema, ListLmsModuleQuerySchema,
  UpdateLmsModuleDto, UpdateLmsModuleSchema, UpdateProgressDto, UpdateProgressSchema,
} from './dto/lms.dto';

@Controller('lms/modules')
export class LmsController {
  constructor(private readonly service: LmsService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU', 'SISWA')
  @RequirePermission('lms.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListLmsModuleQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU', 'SISWA')
  @RequirePermission('lms.read')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get(':id/progress')
  getProgress(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.getProgress(id, user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ZodPipe(CreateLmsModuleSchema)) dto: CreateLmsModuleDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateLmsModuleSchema)) dto: UpdateLmsModuleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Patch(':id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.setStatus(id, 'published', user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Patch(':id/unpublish')
  unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.setStatus(id, 'draft', user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Patch(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.setStatus(id, 'archived', user);
  }

  @Roles('SUPER_ADMIN', 'GURU')
  @RequirePermission('lms.own.manage')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @Roles('SISWA')
  @RequirePermission('lms.progress.manage')
  @Patch(':id/progress')
  updateProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateProgressSchema)) dto: UpdateProgressDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateProgress(id, dto, user);
  }
}
