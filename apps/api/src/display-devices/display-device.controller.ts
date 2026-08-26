import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@smk/auth';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import {
  ActivateDisplayDeviceDto,
  ActivateDisplayDeviceSchema,
  CreateDisplayPairingDto,
  CreateDisplayPairingSchema,
  RotateDisplayCredentialDto,
  RotateDisplayCredentialSchema,
  SetAudibleLeaderSchema,
} from './display-device.dto';
import { DisplayDeviceService } from './display-device.service';

@Controller('display-devices')
export class DisplayDeviceManagementController {
  constructor(private readonly service: DisplayDeviceService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  @RequirePermission('operational.monitoring.read')
  @Get()
  list() {
    return this.service.list();
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('operational.display.manage')
  @Audit({ action: 'displayDevice.createPairing', resourceType: 'display_device', captureBody: false })
  @Post('pairing')
  createPairing(
    @Body(ZodPipe(CreateDisplayPairingSchema)) dto: CreateDisplayPairingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createPairing(dto, user.keycloakId);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('operational.display.manage')
  @Audit({ action: 'displayDevice.revokeAll', resourceType: 'display_device', captureBody: false })
  @Post('revoke-all')
  revokeAll(@CurrentUser() user: AuthUser) {
    return this.service.revokeAll(user.keycloakId);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('operational.display.manage')
  @Audit({ action: 'displayDevice.rotate', resourceType: 'display_device', captureBody: false })
  @Post(':id/rotate')
  rotate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(RotateDisplayCredentialSchema)) dto: RotateDisplayCredentialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.rotate(id, dto, user.keycloakId);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('operational.display.manage')
  @Audit({ action: 'displayDevice.setAudibleLeader', resourceType: 'display_device', captureBody: false })
  @Patch(':id/audible-leader')
  setAudibleLeader(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(SetAudibleLeaderSchema)) dto: { enabled: boolean },
  ) {
    return this.service.setAudibleLeader(id, dto.enabled);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('operational.display.manage')
  @Audit({ action: 'displayDevice.revoke', resourceType: 'display_device', captureBody: false })
  @Delete(':id')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.revoke(id, user.keycloakId);
  }
}

@Public()
@Controller('display')
export class DisplayDeviceActivationController {
  constructor(private readonly service: DisplayDeviceService) {}

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('activate')
  activate(
    @Headers('origin') origin: string | undefined,
    @Body(ZodPipe(ActivateDisplayDeviceSchema)) dto: ActivateDisplayDeviceDto,
  ) {
    this.service.assertTrustedActivationOrigin(origin);
    return this.service.activate(dto.deviceId, dto.pairingCode);
  }
}
