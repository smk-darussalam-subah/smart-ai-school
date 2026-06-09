import {
  BadRequestException,
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsSchema } from './dto/list-audit-logs.dto';
import { SkipAudit } from './decorators/audit.decorator';

@Controller('audit-logs')
@Roles('SUPER_ADMIN')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * GET /api/v1/audit-logs — baca trail audit (SUPER_ADMIN only).
   * @SkipAudit: pembacaan log audit tidak diaudit sendiri (mencegah loop + volume berlebihan).
   */
  @SkipAudit()
  @Get()
  findAll(@Query() rawQuery: unknown) {
    const parsed = ListAuditLogsSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.auditLogService.findAll(parsed.data);
  }
}
