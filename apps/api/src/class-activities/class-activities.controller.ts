// =============================================================================
// ClassActivitiesController — Kegiatan Kelas (KamilEdu M9)
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
import { ClassActivitiesService } from './class-activities.service';
import {
  CreateActivityDto, CreateActivitySchema, ListActivitiesQuerySchema,
  UpdateActivityDto, UpdateActivitySchema,
} from './dto/class-activity.dto';

@Controller('class-activities')
export class ClassActivitiesController {
  constructor(private readonly service: ClassActivitiesService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('activity.read')
  @Get()
  findAll(@Query() rawQuery: unknown) {
    const parsed = ListActivitiesQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data);
  }

  @Roles('GURU')
  @RequirePermission('activity.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(ZodPipe(CreateActivitySchema)) dto: CreateActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user);
  }

  @Roles('SUPER_ADMIN', 'GURU')
  @RequirePermission('activity.read')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateActivitySchema)) dto: UpdateActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Roles('SUPER_ADMIN', 'GURU')
  @RequirePermission('activity.read')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
