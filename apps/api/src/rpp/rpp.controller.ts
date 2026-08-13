// =============================================================================
// RppController — pipeline RPP (KamilEdu M11)
// GURU: author milik assignment · Waka/Kaprog: rekomendasi kurikulum ·
// KS: persetujuan final · SA: read/archive recovery.
// =============================================================================

import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { AuthUser, UserRole } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RppService } from './rpp.service';
import {
  CreateRppDto, CreateRppSchema, ListRppQuerySchema,
  ReviewRppDto, ReviewRppSchema, UpdateRppDto, UpdateRppSchema,
} from './dto/rpp.dto';

@Controller('rpp')
export class RppController {
  constructor(private readonly service: RppService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole, 'GURU')
  @RequirePermission('rpp.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListRppQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole, 'GURU')
  @RequirePermission('rpp.read')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ZodPipe(CreateRppSchema)) dto: CreateRppDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateRppSchema)) dto: UpdateRppDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Patch(':id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.submit(id, user);
  }

  @Roles('KEPALA_SEKOLAH', 'WAKA_KURIKULUM' as UserRole, 'KAPROG' as UserRole)
  @RequirePermission('rpp.read')
  @Patch(':id/review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(ReviewRppSchema)) dto: ReviewRppDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.review(id, dto, user);
  }

  @Roles('SUPER_ADMIN', 'GURU')
  @RequirePermission('rpp.read')
  @Delete(':id')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.archive(id, user);
  }
}
