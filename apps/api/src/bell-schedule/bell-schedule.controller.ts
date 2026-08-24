import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import {
  CreateBellProfileDto,
  CreateBellProfileSchema,
  ListBellProfileQuerySchema,
  ResolveBellProfileQuerySchema,
  UpdateBellProfileDto,
  UpdateBellProfileSchema,
} from './bell-schedule.dto';
import { BellScheduleService } from './bell-schedule.service';

@Controller('bell-schedules')
export class BellScheduleController {
  constructor(private readonly service: BellScheduleService) {}

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'GURU')
  @RequirePermission('academic.schedule.read')
  @Get()
  list(@Query() rawQuery: unknown) {
    const parsed = ListBellProfileQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.list(parsed.data.scope, parsed.data.includeRevoked);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'GURU')
  @RequirePermission('academic.schedule.read')
  @Get('resolve')
  resolve(@Query() rawQuery: unknown) {
    const parsed = ResolveBellProfileQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.resolveForDate(parsed.data.date, parsed.data.scope);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Audit({ action: 'bellSchedule.create', resourceType: 'bell_schedule', captureBody: false })
  @Post()
  create(
    @Body(ZodPipe(CreateBellProfileSchema)) dto: CreateBellProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user.keycloakId);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Audit({ action: 'bellSchedule.update', resourceType: 'bell_schedule', captureBody: false })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateBellProfileSchema)) dto: UpdateBellProfileDto,
  ) {
    return this.service.update(id, dto);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Audit({ action: 'bellSchedule.revoke', resourceType: 'bell_schedule', captureBody: false })
  @Delete(':id')
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.revoke(id);
  }
}
