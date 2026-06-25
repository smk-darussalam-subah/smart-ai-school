// =============================================================================
// PushController — /push (P16 — W3-6)
// Subscribe/unsubscribe push notifications + notification list.
// =============================================================================

import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { PushService } from './push.service';
import { SubscribeSchema, UnsubscribeSchema } from './dto/push.dto';

@Controller('push')
export class PushController {
  constructor(private readonly service: PushService) {}

  @Roles('SISWA', 'ORANG_TUA', 'GURU', 'KEPALA_SEKOLAH', 'SUPER_ADMIN')
  @RequirePermission('lms.read')
  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  subscribe(
    @Body(ZodPipe(SubscribeSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.subscribe(dto as Parameters<typeof this.service.subscribe>[0], user);
  }

  @Roles('SISWA', 'ORANG_TUA', 'GURU', 'KEPALA_SEKOLAH', 'SUPER_ADMIN')
  @RequirePermission('lms.read')
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  unsubscribe(
    @Body(ZodPipe(UnsubscribeSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.unsubscribe(dto as Parameters<typeof this.service.unsubscribe>[0], user);
  }

  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission('lms.read')
  @Get('my-notifications')
  findMyNotifications(@CurrentUser() user: AuthUser) {
    return this.service.findMyNotifications(user);
  }
}
