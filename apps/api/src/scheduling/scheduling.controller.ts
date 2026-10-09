import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit, SkipAudit } from '../audit-log/decorators/audit.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { SchedulingService } from './scheduling.service';

@Roles('SUPER_ADMIN')
@Controller('scheduling/drafts')
export class SchedulingController {
  constructor(private readonly service: SchedulingService) {}

  @RequirePermission('academic.schedule.draft.read')
  @Get()
  list(@Query() query: unknown, @CurrentUser() user: AuthUser) {
    return this.service.list(query, user.keycloakId);
  }
  @RequirePermission('academic.schedule.draft.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user.keycloakId);
  }
  @RequirePermission('academic.schedule.edit')
  @Audit({ action: 'scheduling.http.CREATE', resourceType: 'scheduling_version', captureBody: false })
  @Post()
  create(@Body() body: unknown, @Headers('idempotency-key') key: string, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user.keycloakId, key);
  }
  @RequirePermission('academic.schedule.edit')
  @Audit({ action: 'scheduling.http.RENAME', resourceType: 'scheduling_version', captureBody: false })
  @Patch(':id')
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown,
    @Headers('idempotency-key') key: string, @CurrentUser() user: AuthUser) {
    return this.service.rename(id, body, user.keycloakId, key);
  }
  @RequirePermission('academic.schedule.edit')
  @Audit({ action: 'scheduling.http.REPLACE_SLOTS', resourceType: 'scheduling_version', captureBody: false })
  @Put(':id/slots')
  replace(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown,
    @Headers('idempotency-key') key: string, @CurrentUser() user: AuthUser) {
    return this.service.replace(id, body, user.keycloakId, key);
  }
  @RequirePermission('academic.schedule.draft.read')
  @SkipAudit()
  @Post(':id/validate')
  precheck(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.service.precheck(id, body, user.keycloakId);
  }
  @RequirePermission('academic.schedule.edit')
  @Audit({ action: 'scheduling.http.ARCHIVE', resourceType: 'scheduling_version', captureBody: false })
  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown,
    @Headers('idempotency-key') key: string, @CurrentUser() user: AuthUser) {
    return this.service.archive(id, body, user.keycloakId, key);
  }
}
