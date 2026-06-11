// =============================================================================
// AnnouncementsController — Pengumuman Sekolah
//
// RBAC:
//   - read   : semua role terautentikasi (visibilitas difilter di service/query)
//   - manage : SUPER_ADMIN, KEPALA_SEKOLAH (buat/ubah/terbit/arsip/sematkan)
//   - delete : SUPER_ADMIN saja
// Mutasi tercatat otomatis oleh AuditInterceptor global.
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
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  CreateAnnouncementSchema,
  ListAnnouncementsQuerySchema,
  SetPinDto,
  SetPinSchema,
  UpdateAnnouncementDto,
  UpdateAnnouncementSchema,
} from './dto/announcement.dto';

const ALL_ROLES = [
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'TATA_USAHA',
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',
] as const;

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Roles(...ALL_ROLES)
  @RequirePermission('announcement.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListAnnouncementsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  @Roles(...ALL_ROLES)
  @RequirePermission('announcement.read')
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('announcement.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(ZodPipe(CreateAnnouncementSchema)) dto: CreateAnnouncementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('announcement.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateAnnouncementSchema)) dto: UpdateAnnouncementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('announcement.manage')
  @Patch(':id/publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.publish(id, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('announcement.manage')
  @Patch(':id/archive')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.archive(id, user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('announcement.manage')
  @Patch(':id/pin')
  setPin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(SetPinSchema)) dto: SetPinDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setPin(id, dto.isPinned, user);
  }

  @Roles('SUPER_ADMIN')
  @RequirePermission('announcement.delete')
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(id, user);
  }
}
