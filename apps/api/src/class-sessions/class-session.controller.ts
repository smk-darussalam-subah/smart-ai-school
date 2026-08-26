import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import {
  ClassSessionReasonActionDto,
  ClassSessionReasonActionSchema,
  ClassSessionTransitionDto,
  ClassSessionTransitionSchema,
  ListClassSessionQuerySchema,
  MaterializeClassSessionsSchema,
  ReassignClassSessionDto,
  ReassignClassSessionSchema,
  RecoverClassSessionDto,
  RecoverClassSessionSchema,
} from './class-session.dto';
import { ClassSessionDueService } from './class-session-due.service';
import { ClassSessionService } from './class-session.service';

@Controller('class-sessions')
export class ClassSessionController {
  constructor(
    private readonly service: ClassSessionService,
    private readonly due: ClassSessionDueService,
  ) {}

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'GURU', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG')
  @RequirePermission('academic.class-session.read')
  @Get()
  list(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListClassSessionQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.list(parsed.data, user);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Audit({ action: 'classSession.materialize', resourceType: 'class_session', captureBody: false })
  @Post('materialize')
  materialize(
    @Body(ZodPipe(MaterializeClassSessionsSchema)) dto: { date: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.materialize(dto.date, user.keycloakId);
  }

  @Roles('SUPER_ADMIN')
  @RequirePermission('operational.monitoring.read')
  @Audit({ action: 'classSession.dueScan', resourceType: 'class_session', captureBody: false })
  @Post('due-scan')
  dueScan() {
    return this.due.runDueScan();
  }

  @Roles('GURU')
  @RequirePermission('academic.class-session.manage')
  @Audit({ action: 'classSession.start', resourceType: 'class_session', captureBody: false })
  @Post(':id/start')
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(ClassSessionTransitionSchema)) dto: ClassSessionTransitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.start(id, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('academic.class-session.manage')
  @Audit({ action: 'classSession.complete', resourceType: 'class_session', captureBody: false })
  @Post(':id/complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(ClassSessionTransitionSchema)) dto: ClassSessionTransitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.complete(id, dto, user);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Audit({ action: 'classSession.cancel', resourceType: 'class_session', captureBody: false })
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(ClassSessionReasonActionSchema)) dto: ClassSessionReasonActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancel(id, dto, user);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Audit({ action: 'classSession.reassign', resourceType: 'class_session', captureBody: false })
  @Post(':id/reassign')
  reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(ReassignClassSessionSchema)) dto: ReassignClassSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reassign(id, dto, user);
  }

  @Roles('SUPER_ADMIN')
  @RequirePermission('academic.schedule.manage')
  @Audit({ action: 'classSession.recover', resourceType: 'class_session', captureBody: false })
  @Post(':id/recover')
  recover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(RecoverClassSessionSchema)) dto: RecoverClassSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.recover(id, dto, user);
  }
}
