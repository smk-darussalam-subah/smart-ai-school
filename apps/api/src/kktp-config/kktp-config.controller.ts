// =============================================================================
// KktpConfigController — T3-02 (B5): KKTP config CRUD.
// KS/SA only: read list, upsert per-subject, delete (revert to default).
// =============================================================================

import {
  BadRequestException, Body, Controller, Delete, Get,
  Param, Query, Post,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { KktpConfigService } from './kktp-config.service';
import { UpsertKktpSchema, ListKktpQuerySchema } from './dto/kktp-config.dto';

@Controller('kktp-config')
export class KktpConfigController {
  constructor(private readonly service: KktpConfigService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('academic.grade.read')
  @Get()
  findAll(@Query() rawQuery: unknown) {
    const parsed = ListKktpQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('academic.grade.manage')
  @Post()
  upsert(
    @Body(ZodPipe(UpsertKktpSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.upsert(dto as Parameters<typeof this.service.upsert>[0], user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('academic.grade.manage')
  @Delete(':subject/:academicYear/:semester')
  remove(
    @Param('subject') subject: string,
    @Param('academicYear') academicYear: string,
    @Param('semester') semester: string,
  ) {
    return this.service.remove(subject, academicYear, Number(semester));
  }
}
