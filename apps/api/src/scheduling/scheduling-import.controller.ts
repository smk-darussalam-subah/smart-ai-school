import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit, SkipAudit } from '../audit-log/decorators/audit.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { SchedulingService } from './scheduling.service';

@Roles('SUPER_ADMIN')
@Controller('scheduling/imports')
export class SchedulingImportController {
  constructor(private readonly service: SchedulingService) {}
  @RequirePermission('academic.schedule.draft.read')
  @SkipAudit()
  @Post('inspect')
  inspect(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.service.inspectImport(body, user.keycloakId);
  }
  @RequirePermission('academic.schedule.draft.read')
  @SkipAudit()
  @Post('catalog')
  catalog(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.service.importCatalog(body, user.keycloakId);
  }
  @RequirePermission('academic.schedule.draft.read')
  @SkipAudit()
  @Post('preview')
  preview(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.service.previewImport(body, user.keycloakId);
  }
  @RequirePermission('academic.schedule.edit')
  @Audit({ action: 'scheduling.http.IMPORT', resourceType: 'scheduling_version', captureBody: false })
  @Post('commit')
  commit(@Body() body: unknown, @Headers('idempotency-key') key: string, @CurrentUser() user: AuthUser) {
    return this.service.commitImport(body, user.keycloakId, key);
  }
}
