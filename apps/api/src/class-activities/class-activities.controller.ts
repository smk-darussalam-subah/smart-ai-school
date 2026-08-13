// =============================================================================
// ClassActivitiesController — Kegiatan Kelas (KamilEdu M9)
// =============================================================================

import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Headers, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, StreamableFile,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { FastifyReply } from 'fastify';
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

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KESISWAAN', 'KAPROG')
  @RequirePermission('activity.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListActivitiesQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KESISWAAN', 'KAPROG')
  @RequirePermission('activity.read')
  @Get('options/readable-classes')
  listReadableClasses(@CurrentUser() user: AuthUser) {
    return this.service.listReadableClasses(user);
  }

  @Roles('SUPER_ADMIN', 'GURU', 'WAKA_KESISWAAN')
  @RequirePermission('activity.manage')
  @Get('options/classes')
  listManageableClasses(@CurrentUser() user: AuthUser) {
    return this.service.listManageableClasses(user);
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

  @Roles('SUPER_ADMIN', 'GURU', 'WAKA_KESISWAAN')
  @RequirePermission('activity.manage')
  @Put(':id/media')
  async uploadMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Buffer,
    @Headers('content-type') contentType: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.uploadMedia(id, body, contentType, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KESISWAAN', 'KAPROG')
  @RequirePermission('activity.read')
  @Get(':id/media')
  async getMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const media = await this.service.getMedia(id, user);
    void reply.header('Content-Type', media.contentType);
    void reply.header('Content-Length', String(media.bytes.length));
    void reply.header('Cache-Control', 'private, no-store, max-age=0, no-transform');
    void reply.header('Content-Disposition', 'inline');
    void reply.header('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(media.bytes);
  }

  @Roles('SUPER_ADMIN', 'GURU', 'WAKA_KESISWAAN')
  @RequirePermission('activity.manage')
  @Delete(':id/media')
  removeMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeMedia(id, user);
  }

  @Roles('SUPER_ADMIN', 'GURU', 'WAKA_KESISWAAN')
  @RequirePermission('activity.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateActivitySchema)) dto: UpdateActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Roles('SUPER_ADMIN', 'GURU', 'WAKA_KESISWAAN')
  @RequirePermission('activity.manage')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
